/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  normalizeScreen,
  normalizeAgeCohort,
  truncateString,
  sanitizeClientContext,
  buildConversationContext,
  formatEmotyContextPrompt,
  MAX_CONVERSATION_MESSAGES,
  MAX_USER_MESSAGE_CHARS,
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_CONVERSATION_CHARS,
  MAX_APP_CONTEXT_CHARS,
  MAX_CURRENT_USER_MESSAGE_CHARS,
  MAX_DYNAMIC_CONTEXT_CHARS,
  MAX_TOTAL_PROMPT_CHARS,
  type EmotyContext,
} from "./emotyContext";
import { validateEmotyResponse } from "./emotyContract";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 2: Context Manager Foundation", () => {
  // =========================================================================
  // 1. UNIT TESTS: NORMALIZATION, SANITIZATION & BOUNDING
  // =========================================================================

  test("CONTEXT-03: Age cohort is normalized correctly", () => {
    expect(normalizeAgeCohort(13)).toBe("13-18");
    expect(normalizeAgeCohort(16)).toBe("13-18");
    expect(normalizeAgeCohort(18)).toBe("13-18");
    expect(normalizeAgeCohort(19)).toBe("19-24");
    expect(normalizeAgeCohort(22)).toBe("19-24");
    expect(normalizeAgeCohort(24)).toBe("19-24");
    // Out-of-cohort or invalid
    expect(normalizeAgeCohort(12)).toBeUndefined();
    expect(normalizeAgeCohort(25)).toBeUndefined();
    expect(normalizeAgeCohort(undefined)).toBeUndefined();
    expect(normalizeAgeCohort(NaN)).toBeUndefined();
    expect(normalizeAgeCohort("20" as any)).toBeUndefined();
  });

  test("CONTEXT-07: Recent conversation is bounded to max 12 messages and max 6000 chars", () => {
    // Generate 20 messages of 100 chars
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}: ${"a".repeat(80)}`,
    }));

    const result = buildConversationContext(messages);
    expect(result.recentMessages.length).toBeLessThanOrEqual(MAX_CONVERSATION_MESSAGES);
    expect(result.recentMessages.length).toBe(12);
    expect(result.totalChars).toBeLessThanOrEqual(MAX_CONVERSATION_CHARS);
  });

  test("CONTEXT-08: Oversized message content is truncated/bounded", () => {
    const longUserMsg = "u".repeat(1000);
    const longAssistantMsg = "a".repeat(1200);

    const result = buildConversationContext([
      { role: "user", content: longUserMsg },
      { role: "assistant", content: longAssistantMsg },
    ]);

    const userMsg = result.recentMessages.find((m) => m.role === "user");
    const assistantMsg = result.recentMessages.find((m) => m.role === "assistant");
    expect(userMsg?.content.length).toBeLessThanOrEqual(MAX_USER_MESSAGE_CHARS);
    expect(assistantMsg?.content.length).toBeLessThanOrEqual(MAX_ASSISTANT_MESSAGE_CHARS);
  });

  test("CONTEXT-09: Invalid screen value is rejected or normalized to unknown", () => {
    expect(normalizeScreen("home")).toBe("home");
    expect(normalizeScreen("companion")).toBe("companion");
    expect(normalizeScreen("emotion_map")).toBe("emotion_map");
    expect(normalizeScreen("reframe")).toBe("reframe");
    expect(normalizeScreen("cbt")).toBe("cbt");
    expect(normalizeScreen("recovery_plan")).toBe("recovery_plan");
    expect(normalizeScreen("counsellor_request")).toBe("counsellor_request");
    expect(normalizeScreen("check_in")).toBe("check_in");

    // Invalid screens normalize to unknown
    expect(normalizeScreen("random_screen")).toBe("unknown");
    expect(normalizeScreen("")).toBe("unknown");
    expect(normalizeScreen(undefined)).toBe("unknown");
    expect(normalizeScreen(null as any)).toBe("unknown");
  });

  test("CONTEXT-10: Arbitrary client context is rejected", () => {
    const maliciousInput = {
      screen: "companion",
      activeActivity: "reframe",
      activeGoal: "Walk 10 minutes",
      // Injected keys that MUST be dropped
      triage: "low",
      risk: "none",
      counsellorNote: "Private clinical note",
      role: "admin",
      phq9Score: 18,
    };

    const sanitized = sanitizeClientContext(maliciousInput);
    expect(sanitized.screen).toBe("companion");
    expect(sanitized.activeActivity).toBe("reframe");
    expect(sanitized.activeGoal).toBe("Walk 10 minutes");

    // Check allowlist enforcement
    expect((sanitized as any).triage).toBeUndefined();
    expect((sanitized as any).risk).toBeUndefined();
    expect((sanitized as any).counsellorNote).toBeUndefined();
    expect((sanitized as any).role).toBeUndefined();
    expect((sanitized as any).phq9Score).toBeUndefined();
  });

  test("CONTEXT-15: Generated Gemini prompt contains controlled context rather than raw database objects", () => {
    const sampleContext: EmotyContext = {
      conversation: {
        recentMessages: [
          { role: "user", content: "I am feeling stressed." },
          { role: "assistant", content: "I hear you. What is causing the stress?" },
        ],
      },
      user: {
        preferredName: "Maya",
        ageCohort: "19-24",
        language: "en",
      },
      app: {
        screen: "companion",
        todayGoal: {
          title: "Take a 5-minute breather",
          status: "in_progress",
        },
        currentEmotion: "anxious",
        recentIntervention: {
          type: "Box Breathing",
          status: "completed",
        },
      },
      safety: {
        state: "normal",
      },
    };

    const { prompt, dynamicContextChars, totalChars } = formatEmotyContextPrompt(
      sampleContext,
      "Can we try breathing?",
      "Base system instructions."
    );

    // Verify clearly delineated sections
    expect(prompt).toContain("[CURRENT APP CONTEXT]");
    expect(prompt).toContain("Screen: companion");
    expect(prompt).toContain("Preferred name: Maya");
    expect(prompt).toContain("Age cohort: 19-24");
    expect(prompt).toContain("Today's goal: Take a 5-minute breather (in_progress)");
    expect(prompt).toContain("Current emotion: anxious");
    expect(prompt).toContain("Recent intervention: Box Breathing (completed)");
    expect(prompt).toContain("Safety state: normal");

    expect(prompt).toContain("[RECENT CONVERSATION]");
    expect(prompt).toContain("User: I am feeling stressed.");
    expect(prompt).toContain("Emoty: I hear you. What is causing the stress?");

    expect(prompt).toContain("[CURRENT USER MESSAGE]");
    expect(prompt).toContain("Can we try breathing?");

    // No raw JSON database dump
    expect(prompt).not.toContain('"_id":');
    expect(prompt).not.toContain('"_creationTime":');

    // Strict budget assertion
    expect(dynamicContextChars).toBeLessThanOrEqual(MAX_DYNAMIC_CONTEXT_CHARS);
    expect(totalChars).toBeLessThanOrEqual(MAX_TOTAL_PROMPT_CHARS);
  });

  // =========================================================================
  // 2. INTEGRATION TESTS: AUTHORITATIVE BACKEND CONTEXT QUERY
  // =========================================================================

  test("CONTEXT-01 & CONTEXT-14: Minimal authenticated context builds successfully with missing optional fields", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_minimal",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_minimal",
        role: "student",
        createdAt: Date.now(),
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "home",
    });

    expect(context).toBeDefined();
    expect(context.app.screen).toBe("home");
    expect(context.safety.state).toBe("normal");
    expect(context.conversation.recentMessages).toHaveLength(0);
    expect(context.user.preferredName).toBeUndefined();
    expect(context.user.ageCohort).toBeUndefined();
    expect(context.app.todayGoal).toBeUndefined();
    expect(context.app.currentEmotion).toBeUndefined();
    expect(context.app.recentIntervention).toBeUndefined();
  });

  test("CONTEXT-02: Preferred name is included when available (alias preferred over full_name)", async () => {
    const t = convexTest(schema, modules);

    const studentWithAlias = t.withIdentity({
      subject: "clerk_student_alias",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_alias",
        full_name: "Alexander Hamilton",
        alias: "Alex",
        age: 20,
        createdAt: Date.now(),
      });
    });

    const context = await studentWithAlias.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    expect(context.user.preferredName).toBe("Alex");
    expect(context.user.ageCohort).toBe("19-24");
  });

  test("CONTEXT-04: Today's goal is included when available from authoritative microGoals", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_goal_test",
      issuer: "https://clerk.emotify.com",
    });

    const todayStr = new Date().toISOString().split("T")[0];

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_goal_test",
        full_name: "Goal Student",
        createdAt: Date.now(),
      });

      await ctx.db.insert("microGoals", {
        userId: "clerk_student_goal_test",
        goalId: "g1",
        goalTitle: "Drink 2L Water",
        goalDescription: "Stay hydrated",
        category: "health",
        difficulty: "easy",
        points: 10,
        completed: false,
        skipped: false,
        date: todayStr,
        createdAt: Date.now(),
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    expect(context.app.todayGoal).toBeDefined();
    expect(context.app.todayGoal?.title).toBe("Drink 2L Water");
    expect(context.app.todayGoal?.status).toBe("not_started");
  });

  test("CONTEXT-05: Current emotion is included from dailyCheckin or latest emotionLog", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_emotion_test",
      issuer: "https://clerk.emotify.com",
    });

    const todayStr = new Date().toISOString().split("T")[0];

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_emotion_test",
        full_name: "Emotion Student",
        createdAt: Date.now(),
      });

      await ctx.db.insert("dailyCheckins", {
        userId: "clerk_student_emotion_test",
        dateStr: todayStr,
        mood: "hopeful",
        createdAt: Date.now(),
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    expect(context.app.currentEmotion).toBe("hopeful");
  });

  test("CONTEXT-06: Recent intervention is included only when authoritative data exists", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_intervention_test",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_intervention_test",
        createdAt: Date.now(),
      });

      await ctx.db.insert("breathingLogs", {
        userId: "clerk_student_intervention_test",
        protocolId: "box_4444",
        protocolName: "Box Breathing 4-4-4-4",
        sourceType: "self_initiated",
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
        durationSeconds: 120,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
        createdAt: Date.now() - 5000,
      });

      // Older JPMR log
      await ctx.db.insert("jpmrLogs", {
        userId: "clerk_student_intervention_test",
        preIntensity: 7,
        postIntensity: 4,
        completed: true,
        createdAt: Date.now() - 100000,
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    expect(context.app.recentIntervention).toBeDefined();
    expect(context.app.recentIntervention?.type).toBe("Box Breathing 4-4-4-4");
    expect(context.app.recentIntervention?.status).toBe("completed");
  });

  test("CONTEXT-11: Raw PHQ-9/GAD-7/PQ-16 data cannot enter the Emoty context", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_clinical_leak_test",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_clinical_leak_test",
        createdAt: Date.now(),
      });

      // Insert high-risk screening attempt
      await ctx.db.insert("screeningAttempts", {
        userId: "clerk_student_clinical_leak_test",
        status: "completed",
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {
          phq9: { "q1": 3, "q2": 3, "q9": 2 },
        },
        results: {
          phq9: { administered: true, score: 24, maxScore: 27, severity: "severe", level: "critical", item9Score: 2, item9Flag: true },
          gad7: { administered: true, score: 18, maxScore: 21, severity: "severe", level: "high" },
          pq16: { administered: true, score: 10, maxScore: 16, severity: "moderate", level: "moderate" },
        },
        triageLevel: "emergency",
        suicideFlag: true,
        psychosisFlag: false,
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    // Check that context contains zero clinical keys or scores
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("phq9");
    expect(serialized).not.toContain("gad7");
    expect(serialized).not.toContain("pq16");
    expect(serialized).not.toContain("item9");
    expect(serialized).not.toContain("suicideFlag");
    expect(serialized).not.toContain("emergency");
  });

  test("CONTEXT-12: Counselor/private clinical information cannot enter the Emoty context", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_counselor_privacy_test",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_counselor_privacy_test",
        createdAt: Date.now(),
      });

      await ctx.db.insert("clinicalTimelines", {
        userId: "clerk_student_counselor_privacy_test",
        eventType: "appointment",
        title: "Confidential Clinical Review",
        description: "Confidential private notes between counselor and student",
        timestamp: Date.now(),
      });

      await ctx.db.insert("counsellorRequests", {
        user_id: "clerk_student_counselor_privacy_test",
        situation_text: "Private crisis disclosure",
        status: "pending",
        timestamp: Date.now(),
      });
    });

    const context = await student.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("Confidential Clinical Review");
    expect(serialized).not.toContain("Confidential private notes");
    expect(serialized).not.toContain("Private crisis disclosure");
  });

  test("CONTEXT-13: Another student's data cannot be retrieved through context construction", async () => {
    const t = convexTest(schema, modules);

    const studentA = t.withIdentity({
      subject: "student_A_id",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      // Student A
      await ctx.db.insert("users", {
        clerkId: "student_A_id",
        full_name: "Alice Smith",
        createdAt: Date.now(),
      });

      // Student B (with goal and emotion)
      await ctx.db.insert("users", {
        clerkId: "student_B_id",
        full_name: "Bob Jones",
        createdAt: Date.now(),
      });

      await ctx.db.insert("microGoals", {
        userId: "student_B_id",
        goalId: "b_goal",
        goalTitle: "Bob's Secret Goal",
        goalDescription: "Secret",
        category: "mental",
        difficulty: "hard",
        points: 50,
        completed: false,
        skipped: false,
        date: new Date().toISOString().split("T")[0],
        createdAt: Date.now(),
      });
    });

    // Student A queries context with malicious clientContext attempting to access student B
    const context = await studentA.query(api.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
      clientContext: {
        userId: "student_B_id",
        targetUserId: "student_B_id",
      } as any,
    });

    expect(context.user.preferredName).toBe("Alice");
    expect(context.app.todayGoal).toBeUndefined(); // Bob's goal is NOT present
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("Bob");
    expect(serialized).not.toContain("student_B_id");
  });

  test("CONTEXT-16: Authenticated generateAIResponse operates with Context Manager and returns valid structured contract", async () => {
    const t = convexTest(schema, modules);

    const student = t.withIdentity({
      subject: "clerk_student_full_e2e",
      issuer: "https://clerk.emotify.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_student_full_e2e",
        full_name: "E2E Student",
        age: 21,
        createdAt: Date.now(),
      });
    });

    const result = (await student.action(api.companion.generateAIResponse, {
      userMessageId: `msg_${Date.now()}`,
      aiMessageId: `ai_${Date.now()}`,
      content: "Hello Emoty, how are you today?",
      screen: "companion",
    })) as any;

    expect(result).toBeDefined();
    const validation = validateEmotyResponse(result);
    expect(validation.success).toBe(true);
    expect(result.mode).toBeDefined();
    expect(result.action.type).toBeDefined();
    expect(result.avatarState).toBeDefined();
  }, 30000);
});
