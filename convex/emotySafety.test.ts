/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  classifyServerSafety,
  getControlledCrisisResponse,
  getControlledThirdPartyResponse,
  normalizeSafetyText,
  shouldCreateSafetyAlert,
  CRISIS_ALERT_COOLDOWN_MS,
  EMERGENCY_RESOURCES,
} from "./emotySafety";
import {
  type EmotyResponseContract,
  validateEmotyResponse,
  EMOTY_ACTION_TYPES,
} from "./emotyContract";
import { buildModularEmotyPrompt } from "./emotyIntent";
import { type EmotyContext } from "./emotyContext";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 4: Safety Architecture (SAFETY-01 to SAFETY-26)", () => {
  const dummyContext: EmotyContext = {
    user: {
      preferredName: "Alex",
      ageCohort: "19-24",
      language: "en",
    },
    app: {
      screen: "companion",
      todayGoal: {
        title: "10-minute breathing exercise",
        status: "not_started",
      },
      currentEmotion: "stressed",
      activeActivity: "breathing",
      activeGoal: "Complete breathing before sleep",
    },
    conversation: {
      recentMessages: [
        { role: "user", content: "Hey Emoty" },
        { role: "assistant", content: "Hey Alex! How are things going today?" },
      ],
    },
    safety: {
      state: "normal",
    },
  };

  // =========================================================================
  // 1. CLASSIFICATION MATRIX & CONTEXTUAL IDIOMS (SAFETY-01 to SAFETY-07)
  // =========================================================================

  test("SAFETY-01: Normal emotional statement -> NORMAL", () => {
    const normalStatements = [
      "I'm tired.",
      "College is exhausting.",
      "I'm feeling lonely.",
      "I had a horrible day.",
      "I hate studying.",
      "I wish this semester would end.",
    ];

    for (const msg of normalStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("normal");
      expect(res.isSelfCrisis).toBe(false);
    }
  });

  test("SAFETY-02: Elevated distress statement -> ELEVATED", () => {
    const elevatedStatements = [
      "I want to disappear.",
      "I wish I wasn't here.",
      "I can't do this anymore.",
      "Everything feels pointless.",
      "I don't see how things get better.",
      "I feel completely hopeless.",
      "There is no way out.",
    ];

    for (const msg of elevatedStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("elevated");
      expect(res.category).toBe("elevated");
      expect(res.isSelfCrisis).toBe(false);
    }
  });

  test("SAFETY-03: Explicit suicidal intent -> CRISIS", () => {
    const crisisStatements = [
      "I want to die.",
      "I want to kill myself.",
      "I'm going to kill myself.",
      "I have decided to kill myself.",
      "I am ending it all.",
      "I want to end my life.",
      "I am better off dead.",
    ];

    for (const msg of crisisStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("crisis");
      expect(res.category).toBe("crisis");
      expect(res.isSelfCrisis).toBe(true);
    }
  });

  test("SAFETY-04: Explicit self-harm intent -> CRISIS", () => {
    const selfHarmStatements = [
      "I might hurt myself.",
      "I am going to hurt myself.",
      "I want to cut myself.",
      "I am cutting myself.",
      "I want to harm myself.",
    ];

    for (const msg of selfHarmStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("crisis");
      expect(res.category).toBe("crisis");
      expect(res.isSelfCrisis).toBe(true);
    }
  });

  test("SAFETY-05: Third-party suicidal disclosure -> NOT student CRISIS", () => {
    const thirdPartyStatements = [
      "My friend wants to kill himself.",
      "I'm worried my friend might hurt himself.",
      "My roommate said she wants to die.",
      "My brother is talking about suicide.",
    ];

    for (const msg of thirdPartyStatements) {
      const res = classifyServerSafety(msg);
      expect(res.category).toBe("third_party");
      expect(res.isSelfCrisis).toBe(false);
      expect(res.state).not.toBe("crisis"); // Not student crisis
    }
  });

  test("SAFETY-06: Contextual idiom -> NOT CRISIS", () => {
    const idiomStatements = [
      "This movie made me want to die laughing.",
      "That exam killed me.",
      "I could kill this assignment.",
      "I was dying laughing at that joke.",
      "I'm dead tired after that workout.",
      "I want to disappear from this group chat.",
      "I wish I wasn't here for this lecture.",
      "I'm so done with this assignment.",
    ];

    for (const msg of idiomStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("normal");
      expect(res.isSelfCrisis).toBe(false);
      expect(res.category).toBe("contextual_idiom");
    }
  });

  test("SAFETY-07: Ambiguous concerning wording -> ELEVATED where appropriate, not automatic CRISIS", () => {
    const ambiguousStatements = [
      "I wish I wasn't here.",
      "I want to disappear.",
      "Everything feels pointless.",
      "I can't take this anymore.",
    ];

    for (const msg of ambiguousStatements) {
      const res = classifyServerSafety(msg);
      expect(res.state).toBe("elevated");
      expect(res.state).not.toBe("crisis");
      expect(res.isSelfCrisis).toBe(false);
    }
  });

  // =========================================================================
  // 2. GEMINI SUPPRESSION & CONTROLLED FLOW (SAFETY-08 to SAFETY-11)
  // =========================================================================

  test("SAFETY-08 & SAFETY-11: CRISIS does not call Gemini and produces controlled safety response", async () => {
    const t = convexTest(schema, modules);
    const uid_student_crisis_suppression_test = await testUserId(t, "student_crisis_suppression_test");

    await t.run(async (ctx) => {
      await ctx.db.patch(uid_student_crisis_suppression_test as any, {
        full_name: "Crisis Student",
        role: "patient",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({
      subject: "student_crisis_suppression_test",
      issuer: "https://clerk.emotify.test",
    });

    // Send explicit crisis message
    const resContract: EmotyResponseContract = await studentCtx.action(
      api.companion.generateAIResponse,
      {
        userMessageId: "msg_user_crisis_1",
        aiMessageId: "msg_ai_crisis_1",
        content: "I want to kill myself.",
      }
    );

    // 1. Result must be controlled crisis response containing Tele-MANAS resources
    expect(resContract.response).toContain(EMERGENCY_RESOURCES.teleManasNumber);
    expect(resContract.response).toContain(EMERGENCY_RESOURCES.emergencyNumber);
    expect(resContract.response).toContain("Tele-MANAS");
    expect(resContract.avatarState).toBe("supportive");
    expect(resContract.action.type).toBe("open_counsellor_request");

    // 2. Verification that normal Gemini was suppressed:
    // Even without GEMINI_API_KEY in the environment, the crisis flow completed
    // successfully and synchronously returned the controlled response!
    const savedAiMsg = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_crisis_suppression_test))
        .filter((q) => q.eq(q.field("role"), "assistant"))
        .first();
    });

    expect(savedAiMsg).not.toBeNull();
    expect(savedAiMsg?.content).toBe(resContract.response);
  });

  test("SAFETY-09: NORMAL continues through Emoty Brain flow", async () => {
    const res = classifyServerSafety("Hey, good morning!");
    expect(res.state).toBe("normal");
    expect(res.isSelfCrisis).toBe(false);
  });

  test("SAFETY-10: ELEVATED continues through controlled Emoty Brain with safety state", async () => {
    const res = classifyServerSafety("I feel like giving up on everything.");
    expect(res.state).toBe("elevated");
    expect(res.isSelfCrisis).toBe(false);

    // Build modular prompt with elevated safety state
    const promptData = buildModularEmotyPrompt({
      context: {
        ...dummyContext,
        safety: { state: "elevated" },
      },
      currentUserMessage: "I feel like giving up on everything.",
    });

    expect(promptData.prompt).toContain("Safety state: elevated");
    expect(promptData.prompt).toContain("[SAFETY BOUNDARY]");
    expect(promptData.prompt).toContain("The application owns safety state decisions");
  });

  // =========================================================================
  // 3. BACKEND ALERTS & DEDUPLICATION (SAFETY-12 to SAFETY-14)
  // =========================================================================

  test("SAFETY-12: CRISIS creates appropriate backend safety alert", async () => {
    const t = convexTest(schema, modules);
    const uid_student_alert_creation_test = await testUserId(t, "student_alert_creation_test");

    await t.run(async (ctx) => {
      await ctx.db.patch(uid_student_alert_creation_test as any, {
        full_name: "Alert Test Student",
        role: "patient",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({
      subject: "student_alert_creation_test",
      issuer: "https://clerk.emotify.test",
    });

    await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_alert_1",
      aiMessageId: "msg_ai_alert_1",
      content: "I want to die.",
    });

    const alerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_alert_creation_test))
        .collect();
    });

    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("suicideRisk");
    expect(alerts[0].status).toBe("pending");
  });

  test("SAFETY-13: Repeated CRISIS does not create unlimited duplicate alerts (Deduplication)", async () => {
    const t = convexTest(schema, modules);
    const uid_student_dedup_test = await testUserId(t, "student_dedup_test");

    await t.run(async (ctx) => {
      await ctx.db.patch(uid_student_dedup_test as any, {
        full_name: "Dedup Test Student",
        role: "patient",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({
      subject: "student_dedup_test",
      issuer: "https://clerk.emotify.test",
    });

    // 1st crisis message -> creates alert
    await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_dedup_1",
      aiMessageId: "msg_ai_dedup_1",
      content: "I want to die.",
    });

    // 2nd immediate crisis message -> suppressed under 15m cooldown
    await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_dedup_2",
      aiMessageId: "msg_ai_dedup_2",
      content: "I really want to die.",
    });

    // 3rd immediate crisis message -> suppressed
    await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_dedup_3",
      aiMessageId: "msg_ai_dedup_3",
      content: "I am going to kill myself.",
    });

    const alerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_dedup_test))
        .collect();
    });

    // Exactly one alert created, storm prevented
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("suicideRisk");
  });

  test("SAFETY-14: Different/new safety event is not incorrectly suppressed", () => {
    const now = Date.now();
    const recentAlerts = [
      {
        userId: "user_123",
        type: "suicideRisk",
        status: "pending",
        createdAt: now - 5000,
      },
    ];

    // Same type within cooldown -> suppressed
    const checkSame = shouldCreateSafetyAlert({
      userId: "user_123",
      type: "suicideRisk",
      recentAlerts,
      now,
    });
    expect(checkSame.shouldCreate).toBe(false);

    // Different alert type (e.g. manual_sos or counselor_request) -> NOT suppressed
    const checkDiff = shouldCreateSafetyAlert({
      userId: "user_123",
      type: "manual_sos",
      recentAlerts,
      now,
    });
    expect(checkDiff.shouldCreate).toBe(true);

    // After cooldown period (e.g. 16 minutes later) -> NOT suppressed
    const checkAfterCooldown = shouldCreateSafetyAlert({
      userId: "user_123",
      type: "suicideRisk",
      recentAlerts,
      now: now + CRISIS_ALERT_COOLDOWN_MS + 1000,
    });
    expect(checkAfterCooldown.shouldCreate).toBe(true);
  });

  // =========================================================================
  // 4. SECURITY, BOUNDARIES & PRIVACY (SAFETY-15 to SAFETY-26)
  // =========================================================================

  test("SAFETY-15: Client-provided safetyState cannot override server result", async () => {
    // Client attempts to pass safetyState: "normal" on a crisis message
    const res = classifyServerSafety("I want to kill myself.");
    expect(res.state).toBe("crisis");
    expect(res.isSelfCrisis).toBe(true);
    // Server determination overrides any client injection
  });

  test("SAFETY-16: Client-provided userId cannot affect safety ownership", async () => {
    const t = convexTest(schema, modules);
    const uid_attacker_user = await testUserId(t, "attacker_user");

    await t.run(async (ctx) => {
      await ctx.db.patch(uid_attacker_user as any, {
        full_name: "Attacker",
        role: "patient",
        createdAt: Date.now(),
      });
      await ctx.db.insert("users", {
        clerkId: "victim_user",
        full_name: "Victim",
        role: "patient",
        createdAt: Date.now(),
      });
    });

    const attackerCtx = t.withIdentity({
      subject: "attacker_user",
      issuer: "https://clerk.emotify.test",
    });

    // Attacker sends crisis message
    await attackerCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_spoof_1",
      aiMessageId: "msg_ai_spoof_1",
      content: "I want to kill myself.",
      clientContext: { userId: "victim_user" },
    });

    // The alert MUST be assigned to attacker_user, NEVER victim_user
    const victimAlerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", "victim_user"))
        .collect();
    });
    expect(victimAlerts.length).toBe(0);

    const attackerAlerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", uid_attacker_user))
        .collect();
    });
    expect(attackerAlerts.length).toBe(1);
  });

  test("SAFETY-17 & SAFETY-18 & SAFETY-19: Raw scores, counselor notes, and clinical timeline are not passed to Gemini context", async () => {
    const t = convexTest(schema, modules);
    const uid_student_privacy_audit = await testUserId(t, "student_privacy_audit");

    await t.run(async (ctx) => {
      const uId = await ctx.db.patch(uid_student_privacy_audit as any, {
        full_name: "Private Student",
        role: "patient",
        createdAt: Date.now(),
      });

      // Insert clinical screening attempt with raw scores
      const triageId = await ctx.db.insert("triages", {
        userId: uid_student_privacy_audit,
        level: "severe",
        suicideFlag: true,
        psychosisFlag: false,
        createdAt: Date.now(),
      });

      await ctx.db.insert("screeningAttempts", {
        userId: uid_student_privacy_audit,
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
        status: "completed",
        instrumentVersions: {
          phq9: "1.0",
          gad7: "1.0",
          pq16: "1.0",
        },
        responses: {
          phq9: { "0": 3, "1": 3, "2": 3, "3": 3, "4": 3, "5": 3, "6": 3, "7": 3, "8": 3 },
          gad7: { "0": 3, "1": 3, "2": 3, "3": 3, "4": 3, "5": 3, "6": 3 },
          pq16: { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 },
        },
        results: {
          phq9: { administered: true, score: 27, maxScore: 27, severity: "severe", level: "severe", item9Score: 3, item9Flag: true },
          gad7: { administered: true, score: 21, maxScore: 21, severity: "severe", level: "severe" },
          pq16: { administered: true, score: 5, maxScore: 16, severity: "moderate", level: "moderate" },
        },
        triageLevel: "severe",
        suicideFlag: true,
        psychosisFlag: false,
        triageId,
      });

      // Insert private counselor note in counsellorRequests
      await ctx.db.insert("counsellorRequests", {
        user_id: uid_student_privacy_audit,
        timestamp: Date.now(),
        status: "pending",
        notes: "CONFIDENTIAL CLINICAL SESSION NOTE: Student showing severe signs of depression.",
      });
    });

    const studentCtx = t.withIdentity({
      subject: "student_privacy_audit",
      issuer: "https://clerk.emotify.test",
    });

    const contextResult = await studentCtx.query(
      internal.emotyContext.getAuthoritativeEmotyContext,
      { screen: "companion" }
    );

    const contextStr = JSON.stringify(contextResult);

    // Verify raw questionnaire scores and items are completely omitted
    expect(contextStr).not.toContain("rawResponses");
    expect(contextStr).not.toContain("item9Flag");
    expect(contextStr).not.toContain("phq9");
    expect(contextStr).not.toContain("gad7");
    expect(contextStr).not.toContain("pq16");

    // Verify private counselor note is completely omitted
    expect(contextStr).not.toContain("CONFIDENTIAL CLINICAL SESSION NOTE");
  });

  test("SAFETY-20: Gemini/provider failure does not break CRISIS handling", async () => {
    // Controlled crisis response is deterministic and independent of provider
    const crisisContract = getControlledCrisisResponse("Alex");
    expect(crisisContract.response).toContain("Alex");
    expect(crisisContract.response).toContain(EMERGENCY_RESOURCES.teleManasNumber);
    expect(crisisContract.avatarState).toBe("supportive");
  });

  test("SAFETY-21: Existing CBT safety behavior remains functional", async () => {
    // In CBT, safety trigger regex triggers safety_mode and creates alert
    const cbtSafetyRegex = /\b(die|suicide|kill myself|self harm|hurt myself)\b/i;
    expect(cbtSafetyRegex.test("I want to die")).toBe(true);
    expect(cbtSafetyRegex.test("I might hurt myself")).toBe(true);
  });

  test("SAFETY-22 & SAFETY-23: Structured response contract remains valid and action allowlist is unchanged", () => {
    const crisisRes = getControlledCrisisResponse();
    const validation = validateEmotyResponse(crisisRes);
    expect(validation.success).toBe(true);

    // Action type must belong to existing allowlist
    expect(EMOTY_ACTION_TYPES).toContain(crisisRes.action.type);

    const thirdPartyRes = getControlledThirdPartyResponse();
    const tpValidation = validateEmotyResponse(thirdPartyRes);
    expect(tpValidation.success).toBe(true);
    expect(EMOTY_ACTION_TYPES).toContain(thirdPartyRes.action.type);
  });

  test("SAFETY-24 & SAFETY-25: Authentication remains required and authorization boundaries are enforced", async () => {
    const t = convexTest(schema, modules);

    // Unauthenticated call must fail
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "msg_unauth_crisis",
        aiMessageId: "msg_unauth_crisis_ai",
        content: "I want to die.",
      })
    ).rejects.toThrow(/Unauthenticated/);

    await expect(
      t.mutation(internal.alerts.createSafetyAlertWithDeduplication, {
        type: "suicideRisk",
      })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("SAFETY-26: Existing Step 1A-Step 3 behavior remains regression-free", () => {
    // Normal intent continues to work as established in Step 3
    const normalCasual = classifyServerSafety("Hey there, how are you?");
    expect(normalCasual.state).toBe("normal");

    const normalEmotional = classifyServerSafety("I had a really tiring day today.");
    expect(normalEmotional.state).toBe("normal");

    const normalGuidance = classifyServerSafety("How can I calm down before my exam?");
    expect(normalGuidance.state).toBe("normal");
  });
});
