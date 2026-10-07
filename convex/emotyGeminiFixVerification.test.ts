/// <reference types="vite/client" />
import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  buildStructuredFallbackResponse,
} from "./emotyFallback";
import {
  classifyServerSafety,
  getControlledCrisisResponse,
} from "./emotySafety";
import {
  validateEmotyResponse,
  getSafeStructuredFallback,
  extractJsonFromModelText,
  getGeminiModels,
  getGeminiModelConfig,
  type EmotyResponseContract,
} from "./emotyContract";
import { buildModularEmotyPrompt } from "./emotyIntent";
import { validateAndResolveAction } from "./emotyActionRouter";

const modules = import.meta.glob("./**/*.ts");

describe("Emoty AI Companion: Gemini Integration & Contextual Fallback Verification", () => {
  // =========================================================================
  // 1. FINAL ACCEPTANCE CRITERIA: DISTINCT CONTEXTUAL TOPICS
  // =========================================================================

  test("ACCEPTANCE-01: 'I\\'m overwhelmed with college.' addresses college pressure specifically", () => {
    const dummyContext: any = {
      conversation: { recentMessages: [] },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
    };

    const res = buildStructuredFallbackResponse({
      userMessage: "I'm overwhelmed with college.",
      context: dummyContext,
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response.toLowerCase()).toContain("college");
    expect(res.response).not.toContain("your caring AI companion");
    expect(res.response).not.toContain("Feel free to share anything");
    expect(res.action.type).toBe("none");
  });

  test("ACCEPTANCE-02: 'My roommate and I had a huge argument.' addresses roommate conflict", () => {
    const dummyContext: any = {
      conversation: { recentMessages: [] },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
    };

    const res = buildStructuredFallbackResponse({
      userMessage: "My roommate and I had a huge argument.",
      context: dummyContext,
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response.toLowerCase()).toContain("roommate");
    expect(res.response).not.toContain("your caring AI companion");
    expect(res.action.type).toBe("none");
  });

  test("ACCEPTANCE-03: 'I can\\'t focus when studying.' addresses study focus blocks", () => {
    const dummyContext: any = {
      conversation: { recentMessages: [] },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
    };

    const res = buildStructuredFallbackResponse({
      userMessage: "I can't focus when studying.",
      context: dummyContext,
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response.toLowerCase()).toContain("focus");
    expect(res.response).not.toContain("your caring AI companion");
    expect(res.action.type).toBe("none");
  });

  test("ACCEPTANCE-04: 'I feel like everything is pointless.' follows safety architecture", () => {
    // 1. Safety Gate classification
    const safety = classifyServerSafety("I feel like everything is pointless.");
    expect(safety.state).toBe("elevated");
    expect(safety.category).toBe("elevated");

    const dummyContext: any = {
      conversation: { recentMessages: [] },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "elevated" },
    };

    // 2. Structured fallback adheres to elevated safety response
    const res = buildStructuredFallbackResponse({
      userMessage: "I feel like everything is pointless.",
      context: dummyContext,
      safetyState: "elevated",
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response).toContain("everything seems pointless");
    expect(res.action.type).toBe("open_counsellor_request");
    expect(res.avatarState).toBe("supportive");
  });

  test("ACCEPTANCE-05: Multi-turn connects academic stress to sleep disruption", () => {
    const conversationWithMidterms: any = {
      conversation: {
        recentMessages: [
          { role: "user", content: "Midterms are next week and I'm behind." },
          { role: "assistant", content: "Midterms can put so much pressure on you." },
        ],
      },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
    };

    const res = buildStructuredFallbackResponse({
      userMessage: "I'm also having trouble sleeping.",
      context: conversationWithMidterms,
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response.toLowerCase()).toMatch(/midterm|academic|study/);
    expect(res.response.toLowerCase()).toContain("sleep");
    expect(res.response).not.toContain("your caring AI companion");
  });

  // =========================================================================
  // 2. GOAL 16 REQUIREMENTS A THROUGH R
  // =========================================================================

  test("REQ-A & REQ-B & REQ-C: Multi-turn prompt carries prior conversation & different topics", () => {
    const multiTurnContext: any = {
      conversation: {
        recentMessages: [
          { role: "user", content: "Midterms are next week." },
          { role: "assistant", content: "Take it one step at a time." },
        ],
      },
      user: { preferredName: "Jordan" },
      app: { screen: "companion" },
      safety: { state: "normal" },
      companion: { name: "Emoty" },
    };

    const promptData = buildModularEmotyPrompt({
      context: multiTurnContext,
      currentUserMessage: "Now my roommate is playing loud music.",
    });

    expect(promptData.prompt).toContain("User: Midterms are next week.");
    expect(promptData.prompt).toContain("Emoty: Take it one step at a time.");
    expect(promptData.prompt).toContain("Now my roommate is playing loud music.");
    expect(promptData.prompt).toContain("Roommate & Interpersonal Conflict");
  });

  test("REQ-D: No repeated generic introductions in multi-turn", () => {
    const multiTurnContext: any = {
      conversation: {
        recentMessages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi Alex! I'm Emoty, your AI companion." },
        ],
      },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
      companion: { name: "Emoty" },
    };

    // User sends follow-up greeting
    const res = buildStructuredFallbackResponse({
      userMessage: "Hey again",
      context: multiTurnContext,
    });

    expect(res.response).not.toContain("I'm Emoty, your caring AI companion");
    expect(res.response).toContain("What's on your mind?");
  });

  test("REQ-E & REQ-I: Model response contract validation and graceful salvage", () => {
    // Exact valid contract
    const validJson = {
      mode: "emotional_support",
      response: "It sounds like you have a lot on your plate.",
      action: { type: "none" },
      avatarState: "supportive",
    };
    const val = validateEmotyResponse(validJson);
    expect(val.success).toBe(true);

    // Minor formatting variations (string action)
    const jsonWithStringAction = {
      mode: "emotional_support",
      response: "Take a slow breath.",
      action: "start_breathing",
      avatarState: "calm",
    };
    // Extract JSON from markdown
    const rawMarkdown = "```json\n" + JSON.stringify(validJson) + "\n```";
    const extracted = extractJsonFromModelText(rawMarkdown);
    expect(extracted).toEqual(validJson);
  });

  test("REQ-F: Missing API key uses structured fallback without crashing", async () => {
    const t = convexTest(schema, modules);
    const authedCtx = t.withIdentity({
      subject: "student_test_no_key",
      role: "student",
    });

    const res = await authedCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_nokey_user",
      aiMessageId: "msg_nokey_ai",
      content: "I'm overwhelmed with college.",
      screen: "companion",
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response.toLowerCase()).toContain("college");
    expect(res.action.type).toBe("none");

    // Telemetry recorded with NO_API_KEY
    const telemetry = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_test_no_key"))
        .first();
    });

    expect(telemetry).not.toBeNull();
    expect(telemetry?.path).toBe("fallback");
    expect(telemetry?.fallbackReason).toBe("NO_API_KEY");
    expect(telemetry?.geminiCalled).toBe(false);
  });

  test("REQ-K & REQ-L: Crisis message bypasses rate limit (Safety Gate > Rate Limit)", async () => {
    const t = convexTest(schema, modules);

    // Exhaust daily rate limit (50 requests)
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: "student_crisis_priority",
        burstWindowStart: Date.now(),
        burstCount: 10,
        dailyWindowStart: Date.now(),
        dailyCount: 50,
        inFlight: false,
      });
    });

    const authedCtx = t.withIdentity({
      subject: "student_crisis_priority",
      role: "student",
    });

    // Send crisis message despite rate limit exhausted
    const res = await authedCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_crisis_user",
      aiMessageId: "msg_crisis_ai",
      content: "I want to kill myself, I can't take it anymore.",
      screen: "companion",
    });

    expect(res.mode).toBe("emotional_support");
    expect(res.response).toContain("14416");
    expect(res.response).toContain("988");
    expect(res.action.type).toBe("open_counsellor_request");

    // Telemetry shows path: crisis
    const telemetry = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_crisis_priority"))
        .first();
    });

    expect(telemetry?.path).toBe("crisis");
    expect(telemetry?.geminiCalled).toBe(false);

    // Counselor alert exists
    const alert = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", "student_crisis_priority"))
        .first();
    });
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("suicideRisk");
  });

  test("REQ-M: Concurrency lock prevents parallel simultaneous generation", async () => {
    const t = convexTest(schema, modules);

    // Simulate active in-flight request
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: "student_concurrency_test",
        burstWindowStart: Date.now(),
        burstCount: 1,
        dailyWindowStart: Date.now(),
        dailyCount: 1,
        inFlight: true,
        inFlightSince: Date.now(),
      });
    });

    const authedCtx = t.withIdentity({
      subject: "student_concurrency_test",
      role: "student",
    });

    // Subsequent call must throw rate limit error
    await expect(
      authedCtx.action(api.companion.generateAIResponse, {
        userMessageId: "msg_concurrent_user",
        aiMessageId: "msg_concurrent_ai",
        content: "Second message while first is processing.",
      })
    ).rejects.toThrow(/Please wait/);
  });

  test("REQ-O: Clear Chat preserves rate-limit state", async () => {
    const t = convexTest(schema, modules);
    const authedCtx = t.withIdentity({
      subject: "student_clear_chat_persistence",
      role: "student",
    });

    // Seed messages and rate limit
    await t.run(async (ctx) => {
      await ctx.db.insert("aiCompanionLogs", {
        userId: "student_clear_chat_persistence",
        messageId: "m1",
        role: "user",
        content: "Hello",
        createdAt: Date.now(),
      });
      await ctx.db.insert("companionRateLimits", {
        userId: "student_clear_chat_persistence",
        burstWindowStart: Date.now(),
        burstCount: 5,
        dailyWindowStart: Date.now(),
        dailyCount: 25,
        inFlight: false,
      });
    });

    // Clear history
    await authedCtx.mutation(api.companion.clearConversation, {});

    // Chat logs deleted
    const logs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_clear_chat_persistence"))
        .collect();
    });
    expect(logs.length).toBe(0);

    // Rate limit preserved
    const rateLimit = await t.run(async (ctx) => {
      return await ctx.db
        .query("companionRateLimits")
        .withIndex("by_userId", (q) => q.eq("userId", "student_clear_chat_persistence"))
        .first();
    });
    expect(rateLimit?.dailyCount).toBe(25);
    expect(rateLimit?.burstCount).toBe(5);
  });

  test("REQ-P: Action allowlist enforces valid action types", () => {
    const valid = validateAndResolveAction({ type: "start_breathing", label: "Breathe" }, "normal");
    expect(valid.valid).toBe(true);
    if (valid.valid) {
      expect(valid.action.type).toBe("start_breathing");
    }

    const invalid = validateAndResolveAction({ type: "arbitrary_unallowed_action" as any }, "normal");
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.fallbackAction.type).toBe("none");
    }
  });

  test("REQ-Q: Telemetry excludes clinical scores and private conversation text", async () => {
    const t = convexTest(schema, modules);
    const authedCtx = t.withIdentity({
      subject: "student_telem_privacy_check",
      role: "student",
    });

    // Sensitive message mentioning PHQ-9 and medication
    await authedCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_priv_user",
      aiMessageId: "msg_priv_ai",
      content: "I took the PHQ-9 and scored 21. My doctor prescribed sertraline.",
    });

    const telemetry = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiTelemetryLogs")
        .withIndex("by_userId", (q) => q.eq("userId", "student_telem_privacy_check"))
        .first();
    });

    expect(telemetry).not.toBeNull();
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("PHQ-9");
    expect(serialized).not.toContain("scored 21");
    expect(serialized).not.toContain("sertraline");
  });

  test("REQ-R: Unauthenticated requests to companion and telemetry are rejected", async () => {
    const t = convexTest(schema, modules);

    // Anonymous call to generateAIResponse
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "m_anon",
        aiMessageId: "ai_anon",
        content: "Hello",
      })
    ).rejects.toThrow();

    // Anonymous call to recordTelemetry
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
    ).rejects.toThrow();
  });
});
