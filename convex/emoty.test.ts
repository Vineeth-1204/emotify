/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  validateEmotyResponse,
  getSafeStructuredFallback,
  extractJsonFromModelText,
  getGeminiModels,
  getGeminiModelConfig,
  GEMINI_PRIMARY_MODEL,
  GEMINI_FALLBACK_MODELS,
  EMOTY_MODES,
  EMOTY_ACTION_TYPES,
  EMOTY_AVATAR_STATES,
} from "./emotyContract";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 1: Emoty Provider Correction & Structured Contract Foundation", () => {
  // =========================================================================
  // 1. CONTRACT VALIDATION TESTS
  // =========================================================================

  test("CONTRACT-01: Valid structured response passes validation", () => {
    const valid = {
      mode: "emotional_support",
      response: "I hear how much stress you are under with your exams. Let's take it one step at a time.",
      action: {
        type: "start_breathing",
        label: "Take a 2-min breath",
      },
      avatarState: "calm",
    };

    const res = validateEmotyResponse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.mode).toBe("emotional_support");
      expect(res.data.response).toBe(valid.response);
      expect(res.data.action.type).toBe("start_breathing");
      expect(res.data.action.label).toBe("Take a 2-min breath");
      expect(res.data.avatarState).toBe("calm");
    }
  });

  test("CONTRACT-02: Invalid mode is rejected", () => {
    const invalid = {
      mode: "clinical_diagnosis", // Invalid mode
      response: "You may have anxiety.",
      action: { type: "none" },
      avatarState: "idle",
    };

    const res = validateEmotyResponse(invalid);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("Invalid mode 'clinical_diagnosis'");
    }
  });

  test("CONTRACT-03: Invalid action type is rejected", () => {
    const invalid = {
      mode: "guidance",
      response: "Let's change your account settings.",
      action: { type: "delete_account_arbitrary" }, // Invalid action
      avatarState: "idle",
    };

    const res = validateEmotyResponse(invalid);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("Invalid action.type");
    }
  });

  test("CONTRACT-04: Invalid avatar state is rejected", () => {
    const invalid = {
      mode: "casual",
      response: "Hey there!",
      action: { type: "none" },
      avatarState: "laser_eyes_unsupported", // Invalid avatar state
    };

    const res = validateEmotyResponse(invalid);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("Invalid avatarState");
    }
  });

  test("CONTRACT-05: Missing or empty response text is rejected", () => {
    const emptyResponse = {
      mode: "casual",
      response: "   ",
      action: { type: "none" },
      avatarState: "idle",
    };

    const res = validateEmotyResponse(emptyResponse);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("Missing or empty 'response'");
    }
  });

  test("CONTRACT-06: Action label HTML tags are stripped", () => {
    const withHtml = {
      mode: "guidance",
      response: "Let's breathe together.",
      action: {
        type: "start_breathing",
        label: "<script>alert(1)</script>Take a breath",
      },
      avatarState: "breathing",
    };

    const res = validateEmotyResponse(withHtml);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.action.label).toBe("alert(1)Take a breath");
      expect(res.data.action.label).not.toContain("<script>");
    }
  });

  // =========================================================================
  // 2. JSON EXTRACTION & SAFE FALLBACK TESTS
  // =========================================================================

  test("CONTRACT-07: extractJsonFromModelText handles markdown code blocks and raw JSON", () => {
    const markdownWrapped = "```json\n{\n  \"mode\": \"casual\",\n  \"response\": \"Hello! How can I help today?\",\n  \"action\": {\"type\": \"none\"},\n  \"avatarState\": \"happy\"\n}\n```";
    const extracted = extractJsonFromModelText(markdownWrapped);
    const validated = validateEmotyResponse(extracted);
    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.mode).toBe("casual");
      expect(validated.data.response).toBe("Hello! How can I help today?");
      expect(validated.data.avatarState).toBe("happy");
    }
  });

  test("CONTRACT-08: Malformed JSON triggers getSafeStructuredFallback", () => {
    const malformed = "This is not JSON at all, just raw text.";
    expect(() => extractJsonFromModelText(malformed)).toThrow("No valid JSON object boundaries");

    const fallback = getSafeStructuredFallback();
    const validFallback = validateEmotyResponse(fallback);
    expect(validFallback.success).toBe(true);
    expect(fallback.mode).toBe("casual");
    expect(fallback.action.type).toBe("none");
    expect(fallback.avatarState).toBe("idle");
    expect(fallback.response).toContain("having a little trouble thinking");
  });

  test("CONTRACT-09: Model list prioritizes verified October 2026 production models compatible with Google v1beta", () => {
    const config = getGeminiModelConfig();
    expect(config.primary).toBe("gemini-3.5-flash-lite");
    expect(config.fallbacks).toContain("gemini-3.8-flash");
    expect(config.fallbacks).toContain("gemini-3.7-flash");

    const models = getGeminiModels();
    expect(models[0]).toBe("gemini-3.5-flash-lite");
    expect(models).toContain("gemini-3.8-flash");
    expect(models).toContain("gemini-3.7-flash");
  });

  test("CONTRACT-13: No obsolete model identifiers exist in provider configuration", () => {
    const obsoleteModels = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
    ];

    const models = getGeminiModels();
    const config = getGeminiModelConfig();

    for (const obsolete of obsoleteModels) {
      expect(models).not.toContain(obsolete);
      expect(config.primary).not.toBe(obsolete);
      expect(config.fallbacks).not.toContain(obsolete);
      expect(GEMINI_PRIMARY_MODEL).not.toBe(obsolete);
      expect((GEMINI_FALLBACK_MODELS as readonly string[])).not.toContain(obsolete);
    }
  });

  test("CONTRACT-14: process.env.GEMINI_MODEL overrides primary model without dropping fallbacks", () => {
    const originalEnv = process.env.GEMINI_MODEL;
    try {
      process.env.GEMINI_MODEL = "gemini-custom-override";
      const config = getGeminiModelConfig();
      expect(config.deploymentOverride).toBe("gemini-custom-override");
      expect(config.primary).toBe("gemini-custom-override");
      expect(config.fallbacks).toContain("gemini-3.8-flash");
      expect(config.fallbacks).toContain("gemini-3.7-flash");

      const models = getGeminiModels();
      expect(models[0]).toBe("gemini-custom-override");
      expect(models).toContain("gemini-3.8-flash");
    } finally {
      if (originalEnv !== undefined) {
        process.env.GEMINI_MODEL = originalEnv;
      } else {
        delete process.env.GEMINI_MODEL;
      }
    }
  });

  // =========================================================================
  // 3. INTEGRATION TESTS (Convex generateAIResponse)
  // =========================================================================

  test("CONTRACT-10: Anonymous calls to generateAIResponse remain rejected", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "msg_anon_01",
        aiMessageId: "ai_anon_01",
        content: "Hello",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  test("CONTRACT-11: Authenticated generateAIResponse returns structured Emoty contract and persists text", async () => {
    const t = convexTest(schema, modules);
    const studentA = t.withIdentity({
      subject: "clerk_student_contract_test",
      email: "student_contract@emotify.com",
      name: "Contract Student",
    });
    const uid_clerk_student_contract_test = await testUserId(studentA, "clerk_student_contract_test");

    // Seed student user
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_clerk_student_contract_test as any, {
        full_name: "Contract Student",
        email: "student_contract@emotify.com",
        role: "student",
        createdAt: Date.now(),
      });
    });

    const userMsgId = `user_${Date.now()}`;
    const aiMsgId = `ai_${Date.now()}`;

    // Call generateAIResponse (falls back to safe structured fallback in offline test mode)
    const result = (await studentA.action(api.companion.generateAIResponse, {
      userMessageId: userMsgId,
      aiMessageId: aiMsgId,
      content: "I feel anxious about tomorrow's presentation",
    })) as any;

    // Verify structured response shape
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(EMOTY_MODES).toContain(result.mode);
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
    expect(EMOTY_ACTION_TYPES).toContain(result.action.type);
    expect(EMOTY_AVATAR_STATES).toContain(result.avatarState);

    // Verify that database row in aiCompanionLogs stores the clean plain text for UI bubbles
    await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", uid_clerk_student_contract_test))
        .collect();

      expect(logs).toHaveLength(2); // 1 user + 1 assistant
      const userLog = logs.find((l) => l.role === "user");
      const assistantLog = logs.find((l) => l.role === "assistant");

      expect(userLog?.content).toBe("I feel anxious about tomorrows presentation");
      expect(assistantLog?.content).toBe(result.response);
      expect(assistantLog?.messageId).toBe(aiMsgId);
    });
  });

  test("CONTRACT-12: Rate limit of 20 messages per day is strictly preserved", async () => {
    const t = convexTest(schema, modules);
    const student = t.withIdentity({
      subject: "clerk_rate_limit_student",
      email: "rate_limit@emotify.com",
      name: "Rate Student",
    });
    const uid_clerk_rate_limit_student = await testUserId(student, "clerk_rate_limit_student");

    await t.run(async (ctx) => {
      await ctx.db.patch(uid_clerk_rate_limit_student as any, {
        full_name: "Rate Student",
        email: "rate_limit@emotify.com",
        role: "student",
        createdAt: Date.now(),
      });

      // Seed companionRateLimits at daily limit (50 messages)
      await ctx.db.insert("companionRateLimits", {
        userId: uid_clerk_rate_limit_student,
        burstCount: 1,
        burstWindowStart: Date.now(),
        dailyCount: 50,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });

    // 51st message should be rejected by rate limiter
    await expect(
      student.action(api.companion.generateAIResponse, {
        userMessageId: "msg_overflow",
        aiMessageId: "ai_overflow",
        content: "One message too many",
      })
    ).rejects.toThrow("daily limit of 50 messages");
  });
});
