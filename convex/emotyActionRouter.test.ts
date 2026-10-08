/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  ACTION_ROUTE_MAP,
  validateAndResolveAction,
  resolveActionNavigation,
  type AppRoute,
} from "./emotyActionRouter";
import {
  EMOTY_ACTION_TYPES,
  type EmotyActionType,
  type EmotyAction,
} from "./emotyContract";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 5: Action Router Architecture (ACTION-01 to ACTION-29)", () => {
  // =========================================================================
  // 1. ALLOWLIST ROUTE RESOLUTION (ACTION-01 to ACTION-11)
  // =========================================================================

  test("ACTION-01: 'none' performs no action", () => {
    const result = validateAndResolveAction({ type: "none" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.action.type).toBe("none");
      expect(result.resolved.route).toBeNull();
      expect(result.resolved.kind).toBe("none");
    }
    const nav = resolveActionNavigation({ type: "none" }, "normal");
    expect(nav).toBeNull();
  });

  test("ACTION-02: 'open_emotion_map' resolves to existing Emotion Map flow", () => {
    const result = validateAndResolveAction({ type: "open_emotion_map" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/emotion-map");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "open_emotion_map" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/emotion-map");
  });

  test("ACTION-03: 'show_today_goal' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "show_today_goal" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/emoty-goal");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "show_today_goal" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/emoty-goal");
  });

  test("ACTION-04: 'start_today_goal' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_today_goal" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/emoty-goal");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_today_goal" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/emoty-goal");
  });

  test("ACTION-05: 'start_breathing' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_breathing" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/breathing");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_breathing" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/breathing");
  });

  test("ACTION-06: 'start_grounding' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_grounding" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/grounding");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_grounding" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/grounding");
  });

  test("ACTION-07: 'start_jpmr' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_jpmr" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/jpmr");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_jpmr" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/jpmr");
  });

  test("ACTION-08: 'start_reframe' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_reframe" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/reframe");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_reframe" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/reframe");
  });

  test("ACTION-09: 'start_cbt' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "start_cbt" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/reframe");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "start_cbt" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/reframe");
  });

  test("ACTION-10: 'open_counsellor_request' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "open_counsellor_request" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/appointments");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "open_counsellor_request" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/tools/appointments");
  });

  test("ACTION-11: 'show_check_in' resolves correctly", () => {
    const result = validateAndResolveAction({ type: "show_check_in" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/(tabs)");
      expect(result.resolved.kind).toBe("navigation");
    }
    const nav = resolveActionNavigation({ type: "show_check_in" }, "normal");
    expect(nav?.pathname).toBe("/(auth)/(tabs)");
  });

  // =========================================================================
  // 2. SECURITY GATING & FAIL-CLOSED CHECKS (ACTION-12 to ACTION-16)
  // =========================================================================

  test("ACTION-12: Unknown action type is rejected", () => {
    const invalidTypes = ["start_hypnosis", "open_camera", "admin_panel", "logout", "execute_query"];
    for (const badType of invalidTypes) {
      const result = validateAndResolveAction({ type: badType }, "normal");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
        expect(result.rejectionReason).toContain("not in the approved allowlist");
      }
      expect(resolveActionNavigation({ type: badType as any }, "normal")).toBeNull();
    }
  });

  test("ACTION-13: Arbitrary route cannot be executed", () => {
    const payload = {
      type: "navigate",
      route: "/admin",
    };
    const result = validateAndResolveAction(payload, "normal");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
    expect(resolveActionNavigation(payload as any, "normal")).toBeNull();
  });

  test("ACTION-14: Arbitrary function name cannot be executed", () => {
    const payload = {
      type: "execute",
      function: "deleteUser",
    };
    const result = validateAndResolveAction(payload, "normal");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
    expect(resolveActionNavigation(payload as any, "normal")).toBeNull();
  });

  test("ACTION-15: Arbitrary action parameters are rejected safely", () => {
    const payload = {
      type: "start_breathing",
      maliciousParam: "DROP TABLE users;",
      extraData: 1337,
    };
    const result = validateAndResolveAction(payload, "normal");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
      expect(result.rejectionReason).toContain("Arbitrary action parameters rejected");
    }
    expect(resolveActionNavigation(payload as any, "normal")).toBeNull();
  });

  test("ACTION-16: Client-provided userId cannot influence execution ownership", () => {
    const payload = {
      type: "start_cbt",
      userId: "spoofed_target_user_999",
    };
    const result = validateAndResolveAction(payload, "normal");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
      expect(result.rejectionReason).toContain("Arbitrary action parameters rejected: userId");
    }
    expect(resolveActionNavigation(payload as any, "normal")).toBeNull();
  });

  // =========================================================================
  // 3. SAFETY STATE ENFORCEMENT (ACTION-17 to ACTION-20)
  // =========================================================================

  test("ACTION-17: CRISIS cannot execute arbitrary Gemini wellness actions", () => {
    const wellnessActions: EmotyActionType[] = [
      "start_breathing",
      "start_grounding",
      "start_jpmr",
      "start_reframe",
      "start_cbt",
      "open_emotion_map",
      "show_today_goal",
      "start_today_goal",
      "show_check_in",
    ];

    for (const actionType of wellnessActions) {
      const result = validateAndResolveAction({ type: actionType }, "crisis");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
        expect(result.rejectionReason).toContain("blocked during CRISIS safety state");
      }
      expect(resolveActionNavigation({ type: actionType }, "crisis")).toBeNull();
    }
  });

  test("ACTION-18: CRISIS controlled response remains compatible with Step 4", () => {
    // In crisis, open_counsellor_request is specifically permitted
    const result = validateAndResolveAction({ type: "open_counsellor_request" }, "crisis");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved.route).toBe("/(auth)/tools/appointments");
    }
    const nav = resolveActionNavigation({ type: "open_counsellor_request" }, "crisis");
    expect(nav?.pathname).toBe("/(auth)/tools/appointments");

    // 'none' is also permitted in crisis
    const noneResult = validateAndResolveAction({ type: "none" }, "crisis");
    expect(noneResult.valid).toBe(true);
  });

  test("ACTION-19: ELEVATED action behavior respects safety constraints", () => {
    // In elevated, somatic grounding/breathing/counselor is allowed
    const permittedInElevated: EmotyActionType[] = [
      "start_breathing",
      "start_grounding",
      "start_jpmr",
      "open_counsellor_request",
    ];

    for (const actionType of permittedInElevated) {
      const result = validateAndResolveAction({ type: actionType }, "elevated");
      expect(result.valid).toBe(true);
      expect(resolveActionNavigation({ type: actionType }, "elevated")).not.toBeNull();
    }

    // But arbitrary injection in elevated is still rejected
    const badResult = validateAndResolveAction({ type: "start_breathing", hack: true }, "elevated");
    expect(badResult.valid).toBe(false);
    if (!badResult.valid) {
      expect(badResult.fallbackAction.type).toBe("none");
    }
  });

  test("ACTION-20: 'none' does not force an intervention", () => {
    const result = validateAndResolveAction({ type: "none" }, "normal");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.action.type).toBe("none");
      expect(result.resolved.route).toBeNull();
    }
    const target = resolveActionNavigation({ type: "none" });
    expect(target).toBeNull();
  });

  // =========================================================================
  // 4. MALFORMED PAYLOADS & DEFENSIVE HANDLING (ACTION-21 to ACTION-23)
  // =========================================================================

  test("ACTION-21: Missing action falls back safely", () => {
    const malformedInputs = [undefined, null, {}, { type: null }, { type: "" }];
    for (const input of malformedInputs) {
      const result = validateAndResolveAction(input, "normal");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
        expect(result.resolved.route).toBeNull();
      }
    }
  });

  test("ACTION-22: Invalid structured response cannot reach execution", () => {
    const nonObjects = [42, "start_breathing", true, [1, 2, 3], () => {}];
    for (const nonObj of nonObjects) {
      const result = validateAndResolveAction(nonObj, "normal");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
      }
    }
  });

  test("ACTION-23: Missing route/handler does not crash the conversation", () => {
    // Simulating an unrecognized action type not in ACTION_ROUTE_MAP
    const result = validateAndResolveAction({ type: "non_existent_flow" }, "normal");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
    expect(resolveActionNavigation({ type: "non_existent_flow" as any })).toBeNull();
  });

  // =========================================================================
  // 5. DOMAIN-SPECIFIC PROTECTION RULES (ACTION-24 to ACTION-28)
  // =========================================================================

  test("ACTION-24: Counsellor request only opens the existing request flow", () => {
    // Cannot inject appointment details or counselor IDs
    const result = validateAndResolveAction({
      type: "open_counsellor_request",
      counsellorId: "dr_smith",
      dateTime: "2026-10-05T10:00:00Z",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }

    // Pure action resolves solely to static appointment route
    const validResult = validateAndResolveAction({ type: "open_counsellor_request" });
    expect(validResult.valid).toBe(true);
    if (validResult.valid) {
      expect(validResult.resolved.route).toBe("/(auth)/tools/appointments");
    }
  });

  test("ACTION-25: CBT action cannot modify CBT session state directly", () => {
    const result = validateAndResolveAction({
      type: "start_cbt",
      sessionId: "session_abc_123",
      step: 3,
      score: 10,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
  });

  test("ACTION-26: Reframe action cannot inject arbitrary reframe content", () => {
    const result = validateAndResolveAction({
      type: "start_reframe",
      content: "Override reframe instructions here",
      step: "negative_thought",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
  });

  test("ACTION-27: Goal actions cannot fabricate goal IDs", () => {
    const resultShow = validateAndResolveAction({
      type: "show_today_goal",
      goalId: "fake_goal_999",
      completed: true,
    });
    expect(resultShow.valid).toBe(false);
    if (!resultShow.valid) {
      expect(resultShow.fallbackAction.type).toBe("none");
    }

    const resultStart = validateAndResolveAction({
      type: "start_today_goal",
      goalId: "fake_goal_888",
    });
    expect(resultStart.valid).toBe(false);
    if (!resultStart.valid) {
      expect(resultStart.fallbackAction.type).toBe("none");
    }
  });

  test("ACTION-28: Check-in action cannot fabricate check-in IDs", () => {
    const result = validateAndResolveAction({
      type: "show_check_in",
      checkInId: "checkin_xyz",
      moodScore: 5,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallbackAction.type).toBe("none");
    }
  });

  // =========================================================================
  // 6. SECTION 19 SPECIFIC SECURITY EXPLOIT PAYLOADS
  // =========================================================================

  describe("Section 19: Malicious AI payload injection checks", () => {
    test("Payload 1: { action: { type: 'navigate', route: '/admin' } } fails closed", () => {
      const result = validateAndResolveAction({
        type: "navigate",
        route: "/admin",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
      }
      expect(resolveActionNavigation({ type: "navigate", route: "/admin" } as any)).toBeNull();
    });

    test("Payload 2: { action: { type: 'execute', function: 'deleteUser' } } fails closed", () => {
      const result = validateAndResolveAction({
        type: "execute",
        function: "deleteUser",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
      }
      expect(resolveActionNavigation({ type: "execute", function: "deleteUser" } as any)).toBeNull();
    });

    test("Payload 3: { action: { type: 'start_cbt', sessionId: 'someone-elses-session' } } fails closed", () => {
      const result = validateAndResolveAction({
        type: "start_cbt",
        sessionId: "someone-elses-session",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
      }
      expect(resolveActionNavigation({ type: "start_cbt", sessionId: "someone-elses-session" } as any)).toBeNull();
    });

    test("Payload 4: { action: { type: 'open_counsellor_request', counsellorId: 'attacker-controlled-id' } } fails closed", () => {
      const result = validateAndResolveAction({
        type: "open_counsellor_request",
        counsellorId: "attacker-controlled-id",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.fallbackAction.type).toBe("none");
      }
      expect(resolveActionNavigation({ type: "open_counsellor_request", counsellorId: "attacker-controlled-id" } as any)).toBeNull();
    });
  });

  // =========================================================================
  // 7. INTEGRATION TESTS (ACTION-29: Convex generateAIResponse)
  // =========================================================================

  test("ACTION-29: Integration test - generateAIResponse respects Action Router boundaries", async () => {
    const t = convexTest(schema, modules);

    // Setup authenticated student user
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "student_action_router_1",
        full_name: "Devin",
        email: "devin@college.edu",
        role: "student",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({ subject: "student_action_router_1" });

    // 1. Normal prompt - action is validated and returned
    const normalRes = await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_action_1",
      aiMessageId: "msg_ai_action_1",
      content: "Hello Emoty, how are you today?",
    });

    expect(normalRes).toBeDefined();
    expect(normalRes.action).toBeDefined();
    expect(EMOTY_ACTION_TYPES).toContain(normalRes.action.type);

    // 2. Self-crisis prompt - must return open_counsellor_request (controlled crisis contract)
    const crisisRes = await studentCtx.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_action_2",
      aiMessageId: "msg_ai_action_2",
      content: "I want to kill myself tonight",
    });

    expect(crisisRes).toBeDefined();
    expect(crisisRes.action.type).toBe("open_counsellor_request");

    // 3. Unauthenticated call must fail
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "msg_user_action_3",
        aiMessageId: "msg_ai_action_3",
        content: "Hello",
      })
    ).rejects.toThrow("Unauthenticated");
  });
});
