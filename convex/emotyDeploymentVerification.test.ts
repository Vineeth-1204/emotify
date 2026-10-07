/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { classifyServerSafety } from "./emotySafety";
import { buildStructuredFallbackResponse } from "./emotyFallback";
import { validateEmotyResponse, getSafeStructuredFallback, EMOTY_ACTION_TYPES, EMOTY_AVATAR_STATES } from "./emotyContract";
import { validateAndResolveAction } from "./emotyActionRouter";
import { RATE_LIMIT_CONFIG } from "./emotyRateLimiter";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 11: Production Deployment, Provider Activation & Live Monitoring Verification", () => {
  // =========================================================================
  // 1. PROVIDER RECOGNITION & FALLBACK BEHAVIOR (DEP-01 to DEP-04)
  // =========================================================================

  test("DEP-01: Provider missing key correctly triggers offline fallback with safe telemetry", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_1", role: "student" });

    const response = await student.action(api.companion.generateAIResponse, {
      userMessageId: "msg_dep_1",
      aiMessageId: "ai_dep_1",
      content: "Hello Emoty, how are you today?",
    });

    expect(response).toBeDefined();
    expect(response.mode).toBe("casual");
    expect(response.response).toContain("Emoty");
    expect(EMOTY_AVATAR_STATES).toContain(response.avatarState);
    expect(EMOTY_ACTION_TYPES).toContain(response.action.type);

    // Verify safe telemetry entry
    const telem = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_dep_1"))
        .first();
    });

    expect(telem).toBeDefined();
    expect(telem?.path).toBe("fallback");
    expect(telem?.fallbackReason).toBe("NO_API_KEY");
    expect(telem?.geminiSuccess).toBe(false);
    expect(telem?.geminiCalled).toBe(false);
  });

  test("DEP-02: Multi-turn conversation flows seamlessly through fallback", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_multiturn", role: "student" });

    // Turn 1: Greeting
    const turn1 = await student.action(api.companion.generateAIResponse, {
      userMessageId: "t1_u",
      aiMessageId: "t1_a",
      content: "Hi Emoty",
    });
    expect(turn1.mode).toBe("casual");

    // Turn 2: Emotional disclosure
    const turn2 = await student.action(api.companion.generateAIResponse, {
      userMessageId: "t2_u",
      aiMessageId: "t2_a",
      content: "I feel anxious about my exams tomorrow",
    });
    expect(turn2.mode).toBe("emotional_support");
    expect(turn2.avatarState).toBeDefined();

    // Turn 3: Request for calming activity
    const turn3 = await student.action(api.companion.generateAIResponse, {
      userMessageId: "t3_u",
      aiMessageId: "t3_a",
      content: "Can you help me breathe and calm down?",
    });
    expect(["start_breathing", "none"]).toContain(turn3.action.type);

    // Turn 4: Farewell
    const turn4 = await student.action(api.companion.generateAIResponse, {
      userMessageId: "t4_u",
      aiMessageId: "t4_a",
      content: "bye",
    });
    expect(turn4.mode).toBe("casual");
    expect(turn4.response).toContain("Take care");
  });

  // =========================================================================
  // 2. ACTION ROUTER ENFORCEMENT (DEP-05 to DEP-06)
  // =========================================================================

  test("DEP-03: Action Router validates start_breathing and rejects arbitrary unallowed actions", () => {
    // Valid breathing action in normal state
    const validAction = validateAndResolveAction({ type: "start_breathing" }, "normal");
    expect(validAction.valid).toBe(true);
    if (validAction.valid) {
      expect(validAction.action.type).toBe("start_breathing");
    }

    // Invalid / arbitrary model-generated action
    const invalidAction = validateAndResolveAction({ type: "open_external_malicious_link" as any }, "normal");
    expect(invalidAction.valid).toBe(false);
    if (!invalidAction.valid) {
      expect(invalidAction.fallbackAction.type).toBe("none");
      expect(invalidAction.rejectionReason).toContain("allowlist");
    }
  });

  // =========================================================================
  // 3. RATE LIMITING & CONCURRENCY VERIFICATION (DEP-07 to DEP-10)
  // =========================================================================

  test("DEP-04: In-flight concurrency lock prevents duplicate simultaneous generation", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_concurrency", role: "student" });

    // Acquire lock
    const firstCall = await student.mutation(api.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(firstCall.allowed).toBe(true);

    // Simultaneous second call
    const secondCall = await student.mutation(api.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(secondCall.allowed).toBe(false);
    expect(secondCall.reason).toBe("CONCURRENT_REQUEST");

    // Release lock
    await student.mutation(api.emotyRateLimiter.releaseRateLimit, {});
    const thirdCall = await student.mutation(api.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(thirdCall.allowed).toBe(true);
  });

  test("DEP-05: Rate limits survive conversation clearing", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_clearchat", role: "student" });

    // Seed rate limit counter to 45
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: "student_dep_clearchat",
        burstCount: 2,
        burstWindowStart: Date.now(),
        dailyCount: 45,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
      await ctx.db.insert("aiCompanionLogs", {
        messageId: "seed_msg",
        userId: "student_dep_clearchat",
        role: "user",
        content: "seed",
        createdAt: Date.now(),
      });
    });

    // Clear chat
    await student.mutation(api.companion.clearConversation, {});

    // Rate limit status retains 45 messages (5 daily remaining)
    const status = await student.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(status.dailyRemaining).toBe(5);
  });

  // =========================================================================
  // 4. SAFETY PRECEDENCE OVER RATE LIMIT (DEP-11 to DEP-12)
  // =========================================================================

  test("DEP-06: Safety Gate runs before Rate Limiting - Crisis is NEVER rate-limited", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_safety_precedence", role: "student" });

    // User is completely out of daily quota (50/50 messages used)
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: "student_dep_safety_precedence",
        burstCount: 10,
        burstWindowStart: Date.now(),
        dailyCount: 50,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });

    // Student sends urgent crisis disclosure
    const crisisContract = await student.action(api.companion.generateAIResponse, {
      userMessageId: "usr_urgent_crisis",
      aiMessageId: "ai_urgent_crisis",
      content: "I want to kill myself right now",
    });

    // Crisis contract returned immediately
    expect(crisisContract.mode).toBe("emotional_support");
    expect(crisisContract.response).toContain("14416");
    expect(crisisContract.response).toContain("988");
    expect(crisisContract.action.type).toBe("open_counsellor_request");

    // Counselor alert created
    const alerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", "student_dep_safety_precedence"))
        .collect();
    });
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("suicideRisk");
    expect(alerts[0].status).toBe("pending");
  });

  test("DEP-07: Third-party safety path executes without rate limiting", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_third_party", role: "student" });

    const thirdPartyResponse = await student.action(api.companion.generateAIResponse, {
      userMessageId: "usr_tp",
      aiMessageId: "ai_tp",
      content: "My roommate is talking about ending their life",
    });

    expect(thirdPartyResponse.mode).toBe("guidance");
    expect(thirdPartyResponse.response).toContain("friend");
    expect(thirdPartyResponse.response).toContain("14416");
  });

  // =========================================================================
  // 5. TELEMETRY PRIVACY BOUNDARIES (DEP-13 to DEP-14)
  // =========================================================================

  test("DEP-08: Telemetry stores strictly metadata and excludes all clinical and conversation content", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_dep_telemetry", role: "student" });

    // Send a message with synthetic clinical details
    await student.action(api.companion.generateAIResponse, {
      userMessageId: "msg_sens",
      aiMessageId: "ai_sens",
      content: "I scored 21 on my PHQ-9 depression test and take sertraline",
    });

    const telemRecords = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_dep_telemetry"))
        .collect();
    });

    expect(telemRecords.length).toBe(1);
    const telemString = JSON.stringify(telemRecords[0]).toLowerCase();

    // Verify zero sensitive leak
    expect(telemString.includes("phq")).toBe(false);
    expect(telemString.includes("scored 21")).toBe(false);
    expect(telemString.includes("depression")).toBe(false);
    expect(telemString.includes("sertraline")).toBe(false);
  });

  // =========================================================================
  // 6. AUTHORIZATION ENFORCEMENT (DEP-15)
  // =========================================================================

  test("DEP-09: Unauthenticated calls to companion and telemetry are rejected", async () => {
    const t = convexTest(schema, modules);

    // Unauthenticated generateAIResponse
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "unauth_m",
        aiMessageId: "unauth_a",
        content: "hello",
      })
    ).rejects.toThrow(/Unauthenticated/);

    // Unauthenticated recordTelemetry
    await expect(
      t.mutation(api.emotyTelemetry.recordTelemetry, {
        durationMs: 100,
        path: "gemini",
        mode: "casual",
        actionType: "none",
        avatarState: "calm",
        safetyCategory: "normal",
        geminiCalled: true,
        geminiSuccess: true,
        fallbackUsed: false,
      })
    ).rejects.toThrow(/Unauthenticated/);
  });
});
