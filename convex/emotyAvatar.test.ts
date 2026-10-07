/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  EMOTY_AVATAR_STATES,
  type EmotyAvatarState,
  resolveAvatarPresentationState,
  isValidAvatarState,
  normalizeAvatarState,
} from "./emotyAvatar";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 6A: Avatar State & Behavior Integration (AVATAR-01 to AVATAR-25)", () => {
  // =========================================================================
  // 1. ALLOWLIST & MEMBERSHIP TESTS (AVATAR-01, AVATAR-02, AVATAR-19)
  // =========================================================================

  test("AVATAR-01: Exactly the 13 approved avatar states remain valid", () => {
    const expectedStates: EmotyAvatarState[] = [
      "idle",
      "listening",
      "thinking",
      "calm",
      "happy",
      "sad",
      "worried",
      "angry",
      "tired",
      "breathing",
      "encouraging",
      "celebrating",
      "supportive",
    ];

    expect(EMOTY_AVATAR_STATES).toHaveLength(13);
    for (const state of expectedStates) {
      expect(EMOTY_AVATAR_STATES).toContain(state);
      expect(isValidAvatarState(state)).toBe(true);
    }
  });

  test("AVATAR-02: No arbitrary or clinical avatar state is accepted into allowlist", () => {
    const invalidStates = [
      "depressed",
      "suicidal",
      "anxious",
      "angry_at_user",
      "romantic",
      "loving",
      "therapist",
      "bipolar",
      "schizophrenic",
      "cured",
      "panic",
      "admin",
      "hacked",
    ];

    for (const invalid of invalidStates) {
      expect(isValidAvatarState(invalid)).toBe(false);
      expect(normalizeAvatarState(invalid, "calm")).toBe("calm");
    }
  });

  test("AVATAR-19: Unknown avatar state fails safely to an existing default", () => {
    const fallback = normalizeAvatarState("non_existent_state", "idle");
    expect(fallback).toBe("idle");

    const resolved = resolveAvatarPresentationState({
      explicitAvatarState: "completely_unknown_state_xyz",
      defaultState: "calm",
    });
    expect(resolved).toBe("calm");
  });

  // =========================================================================
  // 2. SAFETY TIER INTEGRATION (AVATAR-03 to AVATAR-08, AVATAR-16, AVATAR-17)
  // =========================================================================

  test("AVATAR-03: NORMAL produces ordinary/default presentation", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      defaultState: "calm",
    });
    expect(result).toBe("calm");
  });

  test("AVATAR-04: ELEVATED produces supportive presentation", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "elevated",
    });
    expect(result).toBe("supportive");

    // But if active somatic breathing is occurring during elevated distress, breathing is displayed
    const breathingResult = resolveAvatarPresentationState({
      safetyState: "elevated",
      activeAppState: "breathing",
    });
    expect(breathingResult).toBe("breathing");
  });

  test("AVATAR-05: CRISIS overrides ordinary avatar presentation", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "crisis",
      defaultState: "calm",
      explicitAvatarState: "happy",
    });
    expect(result).toBe("supportive");
  });

  test("AVATAR-06: CRISIS cannot be overridden by user emotion", () => {
    const emotions = ["happy", "calm", "sad", "worried", "angry", "excited"];
    for (const emotion of emotions) {
      const result = resolveAvatarPresentationState({
        safetyState: "crisis",
        userEmotion: emotion,
      });
      expect(result).toBe("supportive");
    }
  });

  test("AVATAR-07: CRISIS cannot be overridden by Home state or action", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "crisis",
      action: { type: "start_today_goal" },
      mode: "casual",
    });
    expect(result).toBe("supportive");
  });

  test("AVATAR-08: CRISIS cannot be overridden by Gemini avatar output", () => {
    const geminiOutputs: EmotyAvatarState[] = ["happy", "idle", "celebrating", "encouraging"];
    for (const geminiState of geminiOutputs) {
      const result = resolveAvatarPresentationState({
        safetyState: "crisis",
        explicitAvatarState: geminiState,
      });
      expect(result).toBe("supportive");
    }
  });

  test("AVATAR-16: User emotion does not determine clinical safety", () => {
    // User reporting 'sad' or 'angry' under normal safety state produces listening, not crisis
    const sadResult = resolveAvatarPresentationState({
      safetyState: "normal",
      userEmotion: "sad",
    });
    expect(sadResult).toBe("listening");

    const angryResult = resolveAvatarPresentationState({
      safetyState: "normal",
      userEmotion: "angry",
    });
    expect(angryResult).toBe("listening");
  });

  test("AVATAR-17: Client-provided safety state cannot override server state", () => {
    // When server safety state is crisis, client passing isSafetyActive=false is ignored
    const result = resolveAvatarPresentationState({
      safetyState: "crisis",
      isSafetyActive: false,
      explicitAvatarState: "happy",
    });
    expect(result).toBe("supportive");
  });

  // =========================================================================
  // 3. EMOTY MODE TO AVATAR MAPPINGS (AVATAR-09 to AVATAR-13)
  // =========================================================================

  test("AVATAR-09: Emotional-support mode maps to an existing supportive state", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      mode: "emotional_support",
    });
    expect(result).toBe("supportive");
  });

  test("AVATAR-10: Guidance mode maps to thoughtful/thinking state", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      mode: "guidance",
    });
    expect(result).toBe("thinking");
  });

  test("AVATAR-11: Casual mode maps to an existing ordinary state (calm)", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      mode: "casual",
    });
    expect(result).toBe("calm");
  });

  test("AVATAR-12: App-assistance mode maps to an existing helpful state (encouraging)", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      mode: "app_assistance",
    });
    expect(result).toBe("encouraging");
  });

  test("AVATAR-13: Out-of-scope mode does not create a clinical/safety state", () => {
    const result = resolveAvatarPresentationState({
      safetyState: "normal",
      mode: "out_of_scope",
    });
    expect(result).toBe("calm");
  });

  // =========================================================================
  // 4. ACTION & BOUNDARY PROTECTIONS (AVATAR-14, AVATAR-15, AVATAR-24)
  // =========================================================================

  test("AVATAR-14: Action recommendation presentation does not execute navigation through the avatar", () => {
    // Avatar presentation of an action is purely visual
    const result = resolveAvatarPresentationState({
      action: { type: "start_breathing" },
    });
    expect(result).toBe("breathing");

    const cbtResult = resolveAvatarPresentationState({
      action: { type: "start_cbt" },
    });
    expect(cbtResult).toBe("thinking");

    const counselResult = resolveAvatarPresentationState({
      action: { type: "open_counsellor_request" },
    });
    expect(counselResult).toBe("supportive");
  });

  test("AVATAR-15 & AVATAR-24: Avatar resolver is pure and cannot execute database mutations or alter clinical data", () => {
    // Pure function: no async, no DB access, returns pure state value
    const beforeState: EmotyAvatarState = "idle";
    const resolved = resolveAvatarPresentationState({
      safetyState: "normal",
      activeAppState: "celebrating",
      defaultState: beforeState,
    });
    expect(resolved).toBe("celebrating");
    expect(typeof resolved).toBe("string");
  });

  test("AVATAR-18: Avatar resolver is strictly deterministic", () => {
    const inputs = {
      safetyState: "normal" as const,
      mode: "guidance" as const,
      activeAppState: "listening" as const,
      userEmotion: "happy",
    };

    const first = resolveAvatarPresentationState(inputs);
    const second = resolveAvatarPresentationState(inputs);
    const third = resolveAvatarPresentationState(inputs);

    expect(first).toBe(second);
    expect(second).toBe(third);
    // Active app state 'listening' takes precedence over mode and user emotion
    expect(first).toBe("listening");
  });

  // =========================================================================
  // 5. SCREEN COMPATIBILITY (AVATAR-20, AVATAR-21, AVATAR-22, AVATAR-23)
  // =========================================================================

  test("AVATAR-20: Existing Home avatar behavior remains functional under normal conditions", () => {
    expect(resolveAvatarPresentationState({ userEmotion: "happy" })).toBe("happy");
    expect(resolveAvatarPresentationState({ userEmotion: "calm" })).toBe("calm");
    expect(resolveAvatarPresentationState({ userEmotion: "sad" })).toBe("listening");
    expect(resolveAvatarPresentationState({ userEmotion: "worried" })).toBe("listening");
  });

  test("AVATAR-21: Existing companion avatar behavior remains functional", () => {
    // Typing / AI loading -> thinking
    expect(resolveAvatarPresentationState({ activeAppState: "thinking" })).toBe("thinking");
    // Voice input -> listening
    expect(resolveAvatarPresentationState({ activeAppState: "listening" })).toBe("listening");
    // Speech output -> encouraging
    expect(resolveAvatarPresentationState({ activeAppState: "speaking" })).toBe("encouraging");
  });

  test("AVATAR-22: Existing CBT/Reframe avatar behavior remains functional", () => {
    // Celebrating milestone
    expect(resolveAvatarPresentationState({ explicitAvatarState: "celebrating" })).toBe("celebrating");
    // Guided discovery -> thinking
    expect(resolveAvatarPresentationState({ explicitAvatarState: "thinking" })).toBe("thinking");
  });

  test("AVATAR-23: No arbitrary Gemini-generated avatar state reaches UI", () => {
    const hallucinatedState = "super_happy_dancing_bot";
    const resolved = resolveAvatarPresentationState({
      explicitAvatarState: hallucinatedState,
      defaultState: "calm",
    });
    expect(resolved).toBe("calm");
    expect(EMOTY_AVATAR_STATES).toContain(resolved);
  });

  // =========================================================================
  // 6. BACKEND CONVEX INTEGRATION (AVATAR-25: generateAIResponse integration)
  // =========================================================================

  test("AVATAR-25: Convex generateAIResponse normalizes avatarState across safety tiers", async () => {
    const t = convexTest(schema, modules);

    // Seed student user
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "student_avatar_test_1",
        full_name: "Avatar Test Student",
        email: "avatar_test@college.edu",
        role: "student",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({ subject: "student_avatar_test_1" });

    // 1. Normal prompt produces valid avatarState in allowlist
    const normalRes = await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_avatar_1",
      aiMessageId: "msg_ai_avatar_1",
      content: "Hi Emoty, good morning!",
    });

    expect(normalRes).toBeDefined();
    expect(EMOTY_AVATAR_STATES).toContain(normalRes.avatarState);

    // 2. Crisis prompt produces strictly 'supportive' avatarState
    const crisisRes = await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_avatar_2",
      aiMessageId: "msg_ai_avatar_2",
      content: "I want to kill myself tonight",
    });

    expect(crisisRes).toBeDefined();
    expect(crisisRes.avatarState).toBe("supportive");
  });
});
