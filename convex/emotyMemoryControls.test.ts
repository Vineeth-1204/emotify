/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  USER_FACING_PREFERENCE_CATEGORIES,
  getBoundedUserMemoriesForContext,
  MAX_MEMORY_ITEMS_FOR_CONTEXT,
  MAX_MEMORY_TOTAL_CONTEXT_CHARS,
} from "./emotyMemory";
import { formatEmotyContextPrompt } from "./emotyContext";
import { classifyServerSafety, getControlledCrisisResponse } from "./emotySafety";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 8: User Memory & Preference Controls (PREF-01 to PREF-16)", () => {
  // =========================================================================
  // 1. AUTHENTICATED RETRIEVAL & ACTIVE FILTERING (PREF-01 to PREF-04)
  // =========================================================================

  test("PREF-01: Authenticated user can retrieve own preferences", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_01";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_01");

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
      source: "user_stated",
    });

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
      source: "user_stated",
    });

    const prefs = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(prefs).toHaveLength(2);
    expect(prefs.some((p) => p.category === "communication_preference" && p.value === "concise")).toBe(true);
    expect(prefs.some((p) => p.category === "support_preference" && p.value === "breathing_exercises")).toBe(true);
  });

  test("PREF-02: User sees only active preferences", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_02";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_02");

    const id1 = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
      source: "user_stated",
    });

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "routine_preference",
      key: "goal_timing",
      value: "morning",
      source: "user_stated",
    });

    // Deactivate the first preference
    await asStudent.mutation(api.emotyMemory.deactivateUserMemory, { memoryId: id1 });

    const activePrefs = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(activePrefs).toHaveLength(1);
    expect(activePrefs[0].category).toBe("routine_preference");
    expect(activePrefs[0].value).toBe("morning");
  });

  test("PREF-03: User can deactivate one preference", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_03";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_03");

    const memId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "goal_preference",
      key: "goal_scale",
      value: "small_achievable_steps",
      source: "user_stated",
    });

    const result = await asStudent.mutation(api.emotyMemory.deactivateUserMemory, { memoryId: memId });
    expect(result.success).toBe(true);

    const activePrefs = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(activePrefs).toHaveLength(0);

    // Verify row still exists in DB but with active: false
    const rawRecord = await t.run(async (ctx) => ctx.db.get(memId));
    expect(rawRecord).not.toBeNull();
    expect(rawRecord?.active).toBe(false);
  });

  test("PREF-04: Deactivated preference disappears from active context", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_04";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_04");

    const memId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "grounding_exercises",
      source: "user_stated",
    });

    // Before deactivation: present in context
    const contextBefore = await t.run(async (ctx) =>
      getBoundedUserMemoriesForContext(ctx, userId)
    );
    expect(contextBefore.preferences).toHaveLength(1);
    expect(contextBefore.preferences[0].value).toBe("grounding_exercises");

    // Deactivate
    await asStudent.mutation(api.emotyMemory.deactivateUserMemory, { memoryId: memId });

    // After deactivation: absent from context
    const contextAfter = await t.run(async (ctx) =>
      getBoundedUserMemoriesForContext(ctx, userId)
    );
    expect(contextAfter.preferences).toHaveLength(0);
  });

  // =========================================================================
  // 2. CLEAR ALL & CLINICAL ISOLATION (PREF-05 to PREF-08)
  // =========================================================================

  test("PREF-05: User can clear all Emoty preferences", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_05";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_05");

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "chosen_name",
      key: "display_name",
      value: "Alex",
    });

    const beforeClear = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(beforeClear).toHaveLength(3);

    const clearRes = await asStudent.mutation(api.emotyMemory.clearAllUserMemories, {});
    expect(clearRes.clearedCount).toBe(3);

    const afterClear = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(afterClear).toHaveLength(0);
  });

  test("PREF-06: Clear-all does not affect clinical tables (triages & alerts)", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_06";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_06");

    // Seed clinical records
    const triageId = await t.run(async (ctx) => {
      return ctx.db.insert("triages", {
        userId,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
    });

    const alertId = await t.run(async (ctx) => {
      return ctx.db.insert("alerts", {
        userId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Seed preference
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    // Clear preferences
    await asStudent.mutation(api.emotyMemory.clearAllUserMemories, {});

    // Preferences are cleared
    const prefs = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(prefs).toHaveLength(0);

    // Clinical tables are 100% untouched
    const triageRecord = await t.run(async (ctx) => ctx.db.get(triageId));
    expect(triageRecord).not.toBeNull();
    expect(triageRecord?.level).toBe("mild");

    const alertRecord = await t.run(async (ctx) => ctx.db.get(alertId));
    expect(alertRecord).not.toBeNull();
    expect(alertRecord?.status).toBe("pending");
  });

  test("PREF-07: Clear-all does not affect screening data", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_07";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_07");

    // Seed screening attempt in screenings table
    const screeningId = await t.run(async (ctx) => {
      return ctx.db.insert("screenings", {
        userId,
        phq9_total: 6,
        gad7_total: 4,
        pq16_total: 2,
        phq9_item9_flag: false,
        phq9_item9_score: 0,
        createdAt: Date.now(),
      });
    });

    // Seed preference
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "routine_preference",
      key: "goal_timing",
      value: "evening",
    });

    // Clear preferences
    await asStudent.mutation(api.emotyMemory.clearAllUserMemories, {});

    // Screening attempt remains completely untouched
    const screening = await t.run(async (ctx) => ctx.db.get(screeningId));
    expect(screening).not.toBeNull();
    expect(screening?.phq9_total).toBe(6);
  });

  test("PREF-08: Clear-all does not affect counselor data", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_08";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_08");

    // Seed counselor request
    const counselorRequestId = await t.run(async (ctx) => {
      return ctx.db.insert("counsellorRequests", {
        user_id: userId,
        status: "pending",
        sourceType: "self_initiated",
        timestamp: Date.now(),
      });
    });

    // Seed preference
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "goal_preference",
      key: "goal_scale",
      value: "structured_milestones",
    });

    // Clear preferences
    await asStudent.mutation(api.emotyMemory.clearAllUserMemories, {});

    // Counselor request is 100% preserved
    const req = await t.run(async (ctx) => ctx.db.get(counselorRequestId));
    expect(req).not.toBeNull();
    expect(req?.status).toBe("pending");
  });

  // =========================================================================
  // 3. AUTHORIZATION & CROSS-USER ISOLATION (PREF-09 to PREF-10)
  // =========================================================================

  test("PREF-09: Cross-user preference access is rejected", async () => {
    const t = convexTest(schema, modules);
    let userA = "student_pref_09_A";
    let userB = "student_pref_09_B";

    const asUserA = t.withIdentity({ subject: userA });
    userA = await testUserId(asUserA, "student_pref_09_A");
    const asUserB = t.withIdentity({ subject: userB });
    userB = await testUserId(asUserB, "student_pref_09_B");

    const memIdA = await asUserA.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    // User B cannot see User A's preferences
    const userBPrefs = await asUserB.query(api.emotyMemory.listUserPreferences, {});
    expect(userBPrefs).toHaveLength(0);

    // User B cannot deactivate User A's preference
    await expect(
      asUserB.mutation(api.emotyMemory.deactivateUserMemory, { memoryId: memIdA })
    ).rejects.toThrow("Forbidden: Cannot modify another user's memory");

    // User B cannot delete User A's preference
    await expect(
      asUserB.mutation(api.emotyMemory.deleteUserMemory, { memoryId: memIdA })
    ).rejects.toThrow("Forbidden: Cannot delete another user's memory");
  });

  test("PREF-10: Unauthenticated access is rejected", async () => {
    const t = convexTest(schema, modules);

    // Anonymous query returns empty array
    const anonPrefs = await t.query(api.emotyMemory.listUserPreferences, {});
    expect(anonPrefs).toEqual([]);

    // Anonymous mutation throws
    await expect(
      t.mutation(api.emotyMemory.recordUserPreference, {
        category: "communication_preference",
        key: "response_length",
        value: "concise",
      })
    ).rejects.toThrow("Unauthenticated");

    await expect(
      t.mutation(api.emotyMemory.clearAllUserMemories, {})
    ).rejects.toThrow("Unauthenticated");
  });

  // =========================================================================
  // 4. CATEGORY ALLOWLIST & SANITIZATION (PREF-11 to PREF-13)
  // =========================================================================

  test("PREF-11: Only frozen memory categories are exposed", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_11";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_11");

    // Verify allowed categories allowlist
    expect(USER_FACING_PREFERENCE_CATEGORIES).toEqual([
      "communication_preference",
      "support_preference",
      "routine_preference",
      "goal_preference",
      "chosen_name",
    ]);

    // Insert preference + conversation summary directly into DB
    await t.run(async (ctx) => {
      await ctx.db.insert("emotyMemories", {
        userId,
        category: "communication_preference",
        key: "response_length",
        value: "concise",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("emotyMemories", {
        userId,
        category: "conversation_summary",
        key: "recent_topic",
        value: "Discussion about semester project",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // listUserPreferences must EXCLUDE conversation_summary
    const exposed = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(exposed).toHaveLength(1);
    expect(exposed[0].category).toBe("communication_preference");
    expect(exposed.some((p) => p.category === "conversation_summary")).toBe(false);
  });

  test("PREF-12: Arbitrary category/key cannot be created from UI", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_12";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_12");

    // Arbitrary category rejected
    await expect(
      asStudent.mutation(api.emotyMemory.recordUserPreference, {
        category: "arbitrary_custom_category",
        key: "arbitrary_key",
        value: "some_value",
      })
    ).rejects.toThrow("Memory Rejected");

    // Clinical category rejected
    await expect(
      asStudent.mutation(api.emotyMemory.recordUserPreference, {
        category: "diagnosis",
        key: "condition",
        value: "depression",
      })
    ).rejects.toThrow("Memory Rejected");

    // Disallowed key for allowed category rejected
    await expect(
      asStudent.mutation(api.emotyMemory.recordUserPreference, {
        category: "communication_preference",
        key: "unauthorized_key",
        value: "concise",
      })
    ).rejects.toThrow("Memory Rejected");
  });

  test("PREF-13: Updating a preference uses the existing deduplication behavior", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_13";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_13");

    // Initial preference
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    const prefs1 = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    expect(prefs1).toHaveLength(1);
    expect(prefs1[0].value).toBe("concise");

    // User updates preference to detailed
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "detailed",
    });

    const prefs2 = await asStudent.query(api.emotyMemory.listUserPreferences, {});
    // Deduplication ensures count is still 1 and value is updated in place
    expect(prefs2).toHaveLength(1);
    expect(prefs2[0].value).toBe("detailed");
  });

  // =========================================================================
  // 5. CONTEXT MANAGER SYNC & BUDGET BOUNDS (PREF-14 to PREF-16)
  // =========================================================================

  test("PREF-14: Removed preference is no longer injected into Context Manager", async () => {
    const t = convexTest(schema, modules);
    let userId = "student_pref_14";
    const asStudent = t.withIdentity({ subject: userId });
    userId = await testUserId(asStudent, "student_pref_14");

    const memId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    // Check prompt format before removal
    const ctxBefore = await asStudent.query(internal.emotyContext.getAuthoritativeEmotyContext, {});
    const promptBefore = formatEmotyContextPrompt(ctxBefore, "Hello", "Base instructions");
    expect(promptBefore.prompt).toContain("response_length): concise");
    expect(ctxBefore.memory?.preferences.some((p) => p.key === "response_length" && p.value === "concise")).toBe(true);

    // Delete preference
    await asStudent.mutation(api.emotyMemory.deleteUserMemory, { memoryId: memId });

    // Check prompt format after removal
    const ctxAfter = await asStudent.query(internal.emotyContext.getAuthoritativeEmotyContext, {});
    const promptAfter = formatEmotyContextPrompt(ctxAfter, "Hello", "Base instructions");
    expect(promptAfter.prompt).not.toContain("response_length): concise");
    expect(ctxAfter.memory?.preferences?.some((p) => p.key === "response_length") || false).toBe(false);
  });

  test("PREF-15: Memory context remains capped at 5 items / 500 characters", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_pref_15";

    // Insert 8 distinct preferences directly in DB
    await t.run(async (ctx) => {
      const keys = [
        { cat: "communication_preference", key: "response_length", val: "concise" },
        { cat: "communication_preference", key: "communication_tone", val: "casual" },
        { cat: "support_preference", key: "exercise_preference", val: "breathing_exercises" },
        { cat: "support_preference", key: "guidance_type", val: "listening_mode" },
        { cat: "routine_preference", key: "goal_timing", val: "morning" },
        { cat: "routine_preference", key: "checkin_time", val: "evening" },
        { cat: "goal_preference", key: "goal_scale", val: "small_achievable_steps" },
        { cat: "chosen_name", key: "display_name", val: "Alex" },
      ];
      for (const item of keys) {
        await ctx.db.insert("emotyMemories", {
          userId,
          category: item.cat as any,
          key: item.key,
          value: item.val,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const bounded = await t.run(async (ctx) =>
      getBoundedUserMemoriesForContext(ctx, userId)
    );

    expect(bounded.preferences.length).toBeLessThanOrEqual(MAX_MEMORY_ITEMS_FOR_CONTEXT);
    expect(bounded.preferences.length).toBe(5);
    expect(bounded.totalChars).toBeLessThanOrEqual(MAX_MEMORY_TOTAL_CONTEXT_CHARS);
  });

  test("PREF-16: CRISIS behavior remains unchanged and suppresses Gemini", async () => {
    const crisisInput = "I want to kill myself tonight, please help me end it";
    const classification = classifyServerSafety(crisisInput);

    expect(classification.state).toBe("crisis");
    expect(classification.isSelfCrisis).toBe(true);

    const safetyResponse = getControlledCrisisResponse();
    expect(safetyResponse.mode).toBe("emotional_support");
    expect(safetyResponse.avatarState).toBe("supportive");
    expect(safetyResponse.action?.type).toBe("open_counsellor_request");
    expect(safetyResponse.response).toContain("Tele-MANAS");
  });
});
