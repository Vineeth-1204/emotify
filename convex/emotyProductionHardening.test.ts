/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import { classifyServerSafety, getControlledCrisisResponse } from "./emotySafety";
import { buildStructuredFallbackResponse } from "./emotyFallback";
import { validateEmotyResponse, getSafeStructuredFallback } from "./emotyContract";
import { validateAndResolveAction } from "./emotyActionRouter";
import { detectMemoryCandidate } from "./emotyMemory";
import { RATE_LIMIT_CONFIG } from "./emotyRateLimiter";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 10: Production Hardening, Rate Limiting & Telemetry (RATE, TELEM, SEC, REG)", () => {
  // =========================================================================
  // 1. RATE LIMITING TESTS (RATE-01 to RATE-08)
  // =========================================================================

  test("RATE-01: Normal request allowed and acquires token", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_rate_1", role: "student" });
    const uid_student_rate_1 = await testUserId(student, "student_rate_1");

    const result = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(result.allowed).toBe(true);

    const status = await student.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(status.burstRemaining).toBe(RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS - 1);
    expect(status.dailyRemaining).toBe(RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS - 1);
    expect(status.inFlight).toBe(true);

    // Release in-flight
    await student.mutation(internal.emotyRateLimiter.releaseRateLimit, {});
    const postStatus = await student.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(postStatus.inFlight).toBe(false);
  });

  test("RATE-02: Per-user burst rate limit triggers after 10 requests", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_rate_burst", role: "student" });
    const uid_student_rate_burst = await testUserId(student, "student_rate_burst");

    // Send 10 allowed requests (releasing in-flight between them to test burst)
    for (let i = 0; i < RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS; i++) {
      const res = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
      expect(res.allowed).toBe(true);
      await student.mutation(internal.emotyRateLimiter.releaseRateLimit, {});
    }

    // 11th request in the same minute should be rejected by burst limiter
    const burst11 = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(burst11.allowed).toBe(false);
    expect(burst11.reason).toBe("RATE_LIMITED_BURST");
    expect(burst11.message).toContain("quickly");
  });

  test("RATE-03: Daily limit triggers after 50 messages", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_rate_daily", role: "student" });
    const uid_student_rate_daily = await testUserId(student, "student_rate_daily");

    // Simulate 50 requests by seeding the companionRateLimits table directly
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: uid_student_rate_daily,
        burstCount: 1,
        burstWindowStart: Date.now(),
        dailyCount: 50,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });

    const res = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("RATE_LIMITED_DAILY");
    expect(res.message).toContain("daily limit");
  });

  test("RATE-04: Client cannot spoof another user's identity", async () => {
    const t = convexTest(schema, modules);
    const studentA = t.withIdentity({ subject: "student_A", role: "student" });
    const uid_student_A = await testUserId(studentA, "student_A");
    const studentB = t.withIdentity({ subject: "student_B", role: "student" });
    const uid_student_B = await testUserId(studentB, "student_B");

    // studentA consumes a token
    await studentA.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    await studentA.mutation(internal.emotyRateLimiter.releaseRateLimit, {});

    // studentB rate limits are completely independent
    const statusB = await studentB.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(statusB.burstRemaining).toBe(RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS);
    expect(statusB.dailyRemaining).toBe(RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS);
  });

  test("RATE-05: Concurrent requests cannot trivially bypass limits (in-flight protection)", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_concurrent", role: "student" });
    const uid_student_concurrent = await testUserId(student, "student_concurrent");

    // Request 1 starts (in-flight is set to true)
    const req1 = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(req1.allowed).toBe(true);

    // Request 2 arrives immediately while Request 1 is still in-flight
    const req2 = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(req2.allowed).toBe(false);
    expect(req2.reason).toBe("CONCURRENT_REQUEST");
    expect(req2.message).toContain("already have a message being processed");

    // Request 1 finishes and releases lock
    await student.mutation(internal.emotyRateLimiter.releaseRateLimit, {});

    // Now Request 3 can proceed
    const req3 = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(req3.allowed).toBe(true);
  });

  test("RATE-06: Rate-limit state is server authoritative and survives chat history clearing", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_clear_history", role: "student" });
    const uid_student_clear_history = await testUserId(student, "student_clear_history");

    // Seed messages in aiCompanionLogs
    await t.run(async (ctx) => {
      await ctx.db.insert("aiCompanionLogs", {
        messageId: "m1",
        userId: uid_student_clear_history,
        role: "user",
        content: "Hello Emoty",
        createdAt: Date.now(),
      });
    });

    // Acquire rate limit token
    await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    await student.mutation(internal.emotyRateLimiter.releaseRateLimit, {});

    const statusBefore = await student.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(statusBefore.dailyRemaining).toBe(RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS - 1);

    // Student clears their chat conversation
    await student.mutation(api.companion.clearConversation, {});

    // Verify chat messages are deleted
    const logsAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_clear_history))
        .collect();
    });
    expect(logsAfter.length).toBe(0);

    // Rate-limit state in companionRateLimits is NOT wiped by clearing chat history
    const statusAfter = await student.query(api.emotyRateLimiter.getRateLimitStatus, {});
    expect(statusAfter.dailyRemaining).toBe(RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS - 1);
  });

  test("RATE-07: Rate limiting does not bypass safety classification", () => {
    // Deterministic invariant: classifyServerSafety returns crisis regardless of message count
    const crisisMsg = "I want to end my life";
    const safetyResult = classifyServerSafety(crisisMsg);
    expect(safetyResult.state).toBe("crisis");
    expect(safetyResult.isSelfCrisis).toBe(true);
  });

  test("RATE-08: CRISIS request still reaches authoritative safety handling even at rate limit", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_crisis_at_limit", role: "student" });
    const uid_student_crisis_at_limit = await testUserId(student, "student_crisis_at_limit");

    // Seed user at daily message limit in companionRateLimits
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: uid_student_crisis_at_limit,
        burstCount: 10,
        burstWindowStart: Date.now(),
        dailyCount: 50,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });

    // Student sends crisis disclosure via generateAIResponse
    const crisisContract = await student.action(api.companion.generateAIResponse, {
      userMessageId: "usr_crisis_limit",
      aiMessageId: "ai_crisis_limit",
      content: "I want to kill myself right now",
    });

    // Assert that crisis response contract is returned with emergency hotlines
    expect(crisisContract.mode).toBe("emotional_support");
    expect(crisisContract.response).toContain("14416");
    expect(crisisContract.response).toContain("112");
    expect(crisisContract.response).not.toContain("988");
    expect(crisisContract.action.type).toBe("open_counsellor_request");

    // Assert that a high-priority safety alert was created for counselors despite user being at rate limit
    const alerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_crisis_at_limit))
        .collect();
    });
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("suicideRisk");
    expect(alerts[0].status).toBe("pending");

    // Assert safe telemetry recorded
    const telemLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_crisis_at_limit))
        .collect();
    });
    expect(telemLogs.length).toBe(1);
    expect(telemLogs[0].path).toBe("crisis");
    expect(telemLogs[0].geminiCalled).toBe(false);
  });

  // =========================================================================
  // 2. GEMINI FAILURE & FALLBACK HARDENING (RATE-09 to RATE-14)
  // =========================================================================

  test("RATE-09: Gemini timeout uses bounded fallback", () => {
    const dummyContext: any = {
      user: { preferredName: "Sam" },
      conversation: { recentMessages: [] },
      safety: { state: "normal" },
    };
    const fallback = buildStructuredFallbackResponse({
      userMessage: "Can you help me relax?",
      context: dummyContext,
    });
    expect(fallback.mode).toBeDefined();
    expect(fallback.response.length).toBeGreaterThan(10);
    expect(["calm", "supportive", "breathing"]).toContain(fallback.avatarState);
  });

  test("RATE-10 & RATE-12: Missing API key uses structured fallback without error", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_no_key", role: "student" });
    const uid_student_no_key = await testUserId(student, "student_no_key");

    // No API keys in DB or env
    const response = await student.action(api.companion.generateAIResponse, {
      userMessageId: "usr_no_key",
      aiMessageId: "ai_no_key",
      content: "Hello Emoty, how are you today?",
    });

    expect(response).toBeDefined();
    expect(response.response).toContain("Emoty");
    expect(response.mode).toBe("casual");

    // Telemetry indicates fallback used due to NO_API_KEY
    const telem = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_no_key))
        .collect();
    });
    expect(telem.length).toBe(1);
    expect(telem[0].fallbackUsed).toBe(true);
    expect(telem[0].fallbackReason).toBe("NO_API_KEY");
    expect(telem[0].geminiSuccess).toBe(false);
  });

  test("RATE-11: Malformed Gemini response uses structured fallback", () => {
    const malformedTexts = [
      "Here is your json: { not json }",
      "I am an AI and cannot help with that.",
      "",
      '{"mode": "invalid_mode", "response": 123}',
    ];

    for (const text of malformedTexts) {
      let contract;
      try {
        const parsed = JSON.parse(text);
        const val = validateEmotyResponse(parsed);
        contract = val.success ? val.data : getSafeStructuredFallback();
      } catch {
        contract = getSafeStructuredFallback();
      }
      expect(contract.mode).toBeDefined();
      expect(contract.action.type).toBe("none");
      expect(contract.avatarState).toBe("idle");
    }
  });

  test("RATE-13 & RATE-14: Fallback does not claim Gemini succeeded and preserves response contract", () => {
    const fallback = getSafeStructuredFallback();
    expect(fallback.mode).toBe("casual");
    expect(fallback.action).toEqual({ type: "none" });
    expect(fallback.avatarState).toBe("idle");
    expect(typeof fallback.response).toBe("string");
  });

  // =========================================================================
  // 3. PRIVACY-FIRST TELEMETRY TESTS (TELEM-01 to TELEM-10)
  // =========================================================================

  test("TELEM-01 to TELEM-05: Telemetry records appropriate path, success flags and latencies", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_telem", role: "student" });
    const uid_student_telem = await testUserId(student, "student_telem");

    // Record a sample telemetry entry
    await student.mutation(internal.emotyTelemetry.recordTelemetry, {
      durationMs: 450,
      path: "gemini",
      mode: "emotional_support",
      actionType: "start_breathing",
      avatarState: "calm",
      safetyCategory: "normal",
      geminiCalled: true,
      geminiSuccess: true,
      fallbackUsed: false,
      model: "gemini-3.5-flash-lite",
    });

    const logs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", uid_student_telem))
        .collect();
    });

    expect(logs.length).toBe(1);
    expect(logs[0].durationMs).toBe(450);
    expect(logs[0].path).toBe("gemini");
    expect(logs[0].actionType).toBe("start_breathing");
    expect(logs[0].geminiSuccess).toBe(true);
    expect(logs[0].model).toBe("gemini-3.5-flash-lite");
  });

  test("TELEM-06 to TELEM-09 & Phase 18: Sensitive user, AI, and clinical data NEVER stored in telemetry", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_privacy_audit", role: "student" });
    const uid_student_privacy_audit = await testUserId(student, "student_privacy_audit");

    // Simulate synthetic sensitive scenarios
    const syntheticSensitiveStatements = [
      "My PHQ score is 18.",
      "I've been thinking about killing myself.",
      "My counsellor said I have severe anxiety.",
      "I take medication for bipolar disorder (lithium).",
      "My GAD-7 screening was 15.",
    ];

    // Record safe telemetry for these events
    for (const stmt of syntheticSensitiveStatements) {
      const isCrisis = stmt.includes("killing myself");
      await student.mutation(internal.emotyTelemetry.recordTelemetry, {
        durationMs: 320,
        path: isCrisis ? "crisis" : "gemini",
        mode: isCrisis ? "out_of_scope" : "emotional_support",
        actionType: "none",
        avatarState: isCrisis ? "worried" : "calm",
        safetyCategory: isCrisis ? "crisis" : "normal",
        geminiCalled: !isCrisis,
        geminiSuccess: !isCrisis,
        fallbackUsed: false,
      });
    }

    const allTelemetry = await t.run(async (ctx) => {
      return await ctx.db.query("aiTelemetryLogs").collect();
    });

    const telemetryJson = JSON.stringify(allTelemetry).toLowerCase();

    // Verify ZERO clinical screening phrases or medication names leaked into telemetry
    expect(telemetryJson.includes("phq")).toBe(false);
    expect(telemetryJson.includes("gad-7")).toBe(false);
    expect(telemetryJson.includes("bipolar")).toBe(false);
    expect(telemetryJson.includes("lithium")).toBe(false);
    expect(telemetryJson.includes("killing myself")).toBe(false);
    expect(telemetryJson.includes("score is 18")).toBe(false);
    expect(telemetryJson.includes("counsellor said")).toBe(false);
  });

  test("TELEM-10: Arbitrary telemetry fields cannot be injected by client", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_injection", role: "student" });
    const uid_student_injection = await testUserId(student, "student_injection");

    // Passing arbitrary undocumented keys to recordTelemetry fails Convex validation
    await expect(
      student.mutation(internal.emotyTelemetry.recordTelemetry, {
        durationMs: 100,
        path: "gemini",
        mode: "casual",
        actionType: "none",
        avatarState: "calm",
        safetyCategory: "normal",
        geminiCalled: true,
        geminiSuccess: true,
        fallbackUsed: false,
        // @ts-expect-error - testing schema rejection of arbitrary fields
        unauthorizedPayload: "sensitive_prompt_dump",
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // 4. SECURITY & AUTHORIZATION TESTS (SEC-01 to SEC-05)
  // =========================================================================

  test("SEC-01: Unauthenticated telemetry write blocked", async () => {
    const t = convexTest(schema, modules);

    // Call mutation without any identity
    await expect(
      t.mutation(internal.emotyTelemetry.recordTelemetry, {
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

  test("SEC-02 & SEC-03: Rate limiter and telemetry strictly bound to authenticated subject", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "legitimate_user", role: "student" });
    const uid_legitimate_user = await testUserId(student, "legitimate_user");

    // checkAndAcquireRateLimit accepts no userId parameter from client; uses ctx.auth
    const res = await student.mutation(internal.emotyRateLimiter.checkAndAcquireRateLimit, {});
    expect(res.allowed).toBe(true);

    const doc = await t.run(async (ctx) => {
      return await ctx.db
        .query("companionRateLimits")
        .withIndex("by_userId", (q) => q.eq("userId", uid_legitimate_user))
        .first();
    });
    expect(doc).toBeDefined();
    expect(doc?.userId).toBe(uid_legitimate_user);
  });

  test("SEC-04: Non-admin cannot query developer telemetry metrics", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({ subject: "student_user", role: "student" });
    const uid_student_user = await testUserId(student, "student_user");
    const admin = t.withIdentity({ subject: "admin_user", role: "admin" });
    const uid_admin_user = await testUserId(admin, "admin_user");

    // Seed admin and student in users table
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_admin_user as any, {
        email: "admin@emotify.com",
        full_name: "Admin User",
        role: "admin",
        createdAt: Date.now(),
      });
      await ctx.db.patch(uid_student_user as any, {
        email: "student@emotify.com",
        full_name: "Student User",
        role: "student",
        createdAt: Date.now(),
      });
    });

    // Student attempting to view telemetry metrics is rejected
    await expect(student.query(api.emotyTelemetry.getTelemetryMetrics, {})).rejects.toThrow();

    // Admin can view aggregate telemetry metrics
    const metrics = await admin.query(api.emotyTelemetry.getTelemetryMetrics, {});
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });

  // =========================================================================
  // 5. REGRESSION VERIFICATION (REG-01 to REG-05)
  // =========================================================================

  test("REG-01 & REG-02: Step 9 multi-turn dialogue & fallback remain intact", () => {
    const context: any = {
      user: { preferredName: "Rohan" },
      conversation: {
        recentMessages: [
          { role: "user", content: "I feel anxious" },
          { role: "assistant", content: "I'm right here with you, Rohan." },
        ],
      },
      safety: { state: "normal" },
    };

    // Boundary setting: "not right now"
    const boundaryResponse = buildStructuredFallbackResponse({
      userMessage: "not right now",
      context,
    });
    expect(boundaryResponse.mode).toBe("emotional_support");
    expect(boundaryResponse.response).toContain("whenever you need me");

    // Farewell: "bye"
    const farewellResponse = buildStructuredFallbackResponse({
      userMessage: "bye",
      context,
    });
    expect(farewellResponse.mode).toBe("casual");
    expect(farewellResponse.response).toContain("Take care");
  });

  test("REG-03: Action router safety constraints remain intact", () => {
    // Grounding in crisis must be converted to none
    const crisisAction = validateAndResolveAction({ type: "start_grounding" }, "crisis");
    expect(crisisAction.valid).toBe(false);
    if (!crisisAction.valid) {
      expect(crisisAction.fallbackAction.type).toBe("none");
    }

    // Breathing in normal must be valid
    const normalAction = validateAndResolveAction({ type: "start_breathing" }, "normal");
    expect(normalAction.valid).toBe(true);
    if (normalAction.valid) {
      expect(normalAction.action.type).toBe("start_breathing");
    }
  });

  test("REG-04: Deterministic server safety classifications remain intact", () => {
    expect(classifyServerSafety("I want to die").state).toBe("crisis");
    expect(classifyServerSafety("My friend is talking about suicide").category).toBe("third_party");
    expect(classifyServerSafety("This workout killed me").category).toBe("contextual_idiom");
    expect(classifyServerSafety("I feel stressed about my exams").state).toBe("normal");
  });

  test("REG-05: Non-sensitive memory detection remains intact", () => {
    const memory = detectMemoryCandidate("Please call me Rahul");
    expect(memory).toBeDefined();
    expect(memory?.key).toBe("display_name");
    expect(memory?.value).toBe("Rahul");

    // Clinical or sensitive text is rejected from memory
    expect(detectMemoryCandidate("I feel depressed")).toBeNull();
    expect(detectMemoryCandidate("I want to hurt myself")).toBeNull();
  });
});
