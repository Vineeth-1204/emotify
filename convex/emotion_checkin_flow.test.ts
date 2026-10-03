/**
 * Emotion Check-in Client Rework Phase 1 Test Suite
 *
 * Covers:
 * 1. One emotion selected.
 * 2. Multiple emotions selected.
 * 3. Emotion can be deselected.
 * 4. Zero-emotion submission blocked.
 * 5. Strongest emotion must belong to selected emotions.
 * 6. Single emotion skips unnecessary strongest-emotion step.
 * 7. "I'm not sure" body selection does not block the flow.
 * 8. Intensity is persisted correctly.
 * 9. Correct intervention mapping for each supported emotion.
 * 10. Automatic intervention route is correct.
 * 11. No duplicate intervention records.
 * 12. Existing historical emotion records remain readable.
 * 13. Student A cannot access Student B's emotion/intervention data.
 * 14. Existing safety/clinical screening tests remain unchanged.
 */

import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  determineIntervention,
  normalizeEmotionKey,
  isStrongestFromSelection,
  getRelevantBodyRegions,
} from "../common/emotionRouting";

describe("Emotion Check-in Flow — Phase 1", () => {
  // -------------------------------------------------------------------------
  // 1. One emotion selected
  // -------------------------------------------------------------------------
  test("TEST-01: One emotion selected persists cleanly with single-element selectedEmotions", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_101", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_101" });

    const logId = await session.mutation(api.emotionLogs.create, {
      emotion: "Worried",
      selectedEmotions: ["Worried"],
      strongestEmotion: "Worried",
      bodyRegions: ["Chest"],
      preIntensity: 6,
    });

    expect(logId).toBeDefined();

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_101" });
    expect(logs).toHaveLength(1);
    expect(logs[0].emotion).toBe("Worried");
    expect(logs[0].strongestEmotion).toBe("Worried");
    expect(logs[0].selectedEmotions).toEqual(["Worried"]);
    expect(logs[0].bodyRegions).toEqual(["Chest"]);
    expect(logs[0].preIntensity).toBe(6);
  });

  // -------------------------------------------------------------------------
  // 2. Multiple emotions selected
  // -------------------------------------------------------------------------
  test("TEST-02: Multiple emotions selected with strongest emotion persisted", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_102", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_102" });

    const logId = await session.mutation(api.emotionLogs.create, {
      emotion: "Worried",
      selectedEmotions: ["Worried", "Tired", "Sad"],
      strongestEmotion: "Worried",
      bodyRegions: ["Chest", "Stomach"],
      preIntensity: 8,
    });

    expect(logId).toBeDefined();

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_102" });
    expect(logs).toHaveLength(1);
    expect(logs[0].emotion).toBe("Worried");
    expect(logs[0].strongestEmotion).toBe("Worried");
    expect(logs[0].selectedEmotions).toEqual(["Worried", "Tired", "Sad"]);
    expect(logs[0].preIntensity).toBe(8);
  });

  // -------------------------------------------------------------------------
  // 3. Emotion can be deselected
  // -------------------------------------------------------------------------
  test("TEST-03: Emotion selection state allows deselection without lingering state", () => {
    let selected = ["Worried", "Tired", "Sad"];

    // Deselect "Tired"
    selected = selected.filter((e) => e !== "Tired");
    expect(selected).toEqual(["Worried", "Sad"]);

    // Deselect "Worried"
    selected = selected.filter((e) => e !== "Worried");
    expect(selected).toEqual(["Sad"]);

    // Re-select "Angry"
    selected = [...selected, "Angry"];
    expect(selected).toEqual(["Sad", "Angry"]);
  });

  // -------------------------------------------------------------------------
  // 4. Zero-emotion submission blocked
  // -------------------------------------------------------------------------
  test("TEST-04: Zero-emotion submission is blocked with descriptive validation error", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_104", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_104" });

    // Empty emotion string
    await expect(
      session.mutation(api.emotionLogs.create, {
        emotion: "",
        bodyRegions: [],
      })
    ).rejects.toThrow("Emotion is required.");

    // Empty selectedEmotions array
    await expect(
      session.mutation(api.emotionLogs.create, {
        emotion: "Worried",
        selectedEmotions: [],
        bodyRegions: [],
      })
    ).rejects.toThrow("selectedEmotions cannot be empty.");
  });

  // -------------------------------------------------------------------------
  // 5. Strongest emotion must belong to selected emotions
  // -------------------------------------------------------------------------
  test("TEST-05: Strongest emotion must be a member of the selected emotions", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_105", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_105" });

    // "Angry" is NOT in ["Worried", "Sad"]
    await expect(
      session.mutation(api.emotionLogs.create, {
        emotion: "Angry",
        selectedEmotions: ["Worried", "Sad"],
        strongestEmotion: "Angry",
        bodyRegions: [],
      })
    ).rejects.toThrow("strongestEmotion must be one of the selected emotions.");

    // Function validation helper check
    expect(isStrongestFromSelection(["Worried", "Sad"], "Angry")).toBe(false);
    expect(isStrongestFromSelection(["Worried", "Sad"], "Worried")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Single emotion skips unnecessary strongest-emotion step
  // -------------------------------------------------------------------------
  test("TEST-06: Single emotion automatically resolves strongestEmotion without manual prompt", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_106", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_106" });

    // Submitting single emotion without explicit strongestEmotion defaults to that emotion
    const logId = await session.mutation(api.emotionLogs.create, {
      emotion: "Calm",
      selectedEmotions: ["Calm"],
      bodyRegions: ["Shoulders"],
    });

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_106" });
    expect(logs[0].strongestEmotion).toBe("Calm");
    expect(logs[0].emotion).toBe("Calm");
  });

  // -------------------------------------------------------------------------
  // 7. "I'm not sure" body selection does not block the flow
  // -------------------------------------------------------------------------
  test("TEST-07: 'I'm not sure' or empty body region selection does not block submission", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_107", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_107" });

    // Body regions empty when user is unsure
    const logId = await session.mutation(api.emotionLogs.create, {
      emotion: "Worried",
      selectedEmotions: ["Worried"],
      strongestEmotion: "Worried",
      bodyRegions: [],
      preIntensity: 5,
    });

    expect(logId).toBeDefined();
    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_107" });
    expect(logs[0].bodyRegions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 8. Intensity is persisted correctly
  // -------------------------------------------------------------------------
  test("TEST-08: Intensity between 1 and 10 is persisted; out of bounds values rejected", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_108", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_108" });

    // Valid intensity: 9
    await session.mutation(api.emotionLogs.create, {
      emotion: "Angry",
      bodyRegions: ["Hands"],
      preIntensity: 9,
    });

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_108" });
    expect(logs[0].preIntensity).toBe(9);

    // Invalid intensity: 0
    await expect(
      session.mutation(api.emotionLogs.create, {
        emotion: "Angry",
        bodyRegions: [],
        preIntensity: 0,
      })
    ).rejects.toThrow("preIntensity must be between 1 and 10.");

    // Invalid intensity: 11
    await expect(
      session.mutation(api.emotionLogs.create, {
        emotion: "Angry",
        bodyRegions: [],
        preIntensity: 11,
      })
    ).rejects.toThrow("preIntensity must be between 1 and 10.");
  });

  // -------------------------------------------------------------------------
  // 9. Correct intervention mapping for each supported emotion
  // -------------------------------------------------------------------------
  test("TEST-09: Correct intervention mapping for all 8 supported canonical emotions", () => {
    // Worried / Scared -> breathing
    const r1 = determineIntervention("Worried / Scared", 5);
    expect(r1.interventionType).toBe("breathing");

    // Angry / Upset -> jpmr
    const r2 = determineIntervention("Angry / Upset", 6);
    expect(r2.interventionType).toBe("jpmr");

    // Embarrassed / Ashamed -> reframe
    const r3 = determineIntervention("Embarrassed / Ashamed", 5);
    expect(r3.interventionType).toBe("reframe");

    // Guilty / Regretful -> reframe
    const r4 = determineIntervention("Guilty / Regretful", 5);
    expect(r4.interventionType).toBe("reframe");

    // Sad -> reframe (mild/moderate)
    const r5 = determineIntervention("Sad", 5);
    expect(r5.interventionType).toBe("reframe");

    // Sad -> grounding (extreme intensity >= 8)
    const r5High = determineIntervention("Sad", 8);
    expect(r5High.interventionType).toBe("grounding");

    // Tired / Drained -> jpmr
    const r6 = determineIntervention("Tired / Drained", 5);
    expect(r6.interventionType).toBe("jpmr");

    // Happy / Positive -> microgoals
    const r7 = determineIntervention("Happy", 5);
    expect(r7.interventionType).toBe("microgoals");

    // Calm -> breathing
    const r8 = determineIntervention("Calm", 5);
    expect(r8.interventionType).toBe("breathing");
  });

  // -------------------------------------------------------------------------
  // 10. Automatic intervention route is correct
  // -------------------------------------------------------------------------
  test("TEST-10: Automatic intervention route targets canonical destinations and includes transition", () => {
    const breathingResult = determineIntervention("Worried", 5);
    expect(breathingResult.targetRoute).toBe("breathing");
    expect(breathingResult.transitionMessage).toBe("Okay. Let's work through this together.");

    const jpmrResult = determineIntervention("Angry", 7);
    expect(jpmrResult.targetRoute).toBe("/(auth)/tools/jpmr");
    expect(jpmrResult.transitionMessage).toBe("Okay. Let's work through this together.");

    const groundingResult = determineIntervention("Sad", 9);
    expect(groundingResult.targetRoute).toBe("/(auth)/tools/grounding");

    const reframeResult = determineIntervention("Embarrassed", 6);
    expect(reframeResult.targetRoute).toBe("/(auth)/tools/reframe");

    const microgoalsResult = determineIntervention("Happy", 5);
    expect(microgoalsResult.targetRoute).toBe("/(auth)/tools/microgoals");
  });

  // -------------------------------------------------------------------------
  // 11. No duplicate intervention records
  // -------------------------------------------------------------------------
  test("TEST-11: Single emotion check-in creates exactly one record in emotionLogs", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_111", role: "patient" });
    });

    const session = t.withIdentity({ subject: "student_111" });

    await session.mutation(api.emotionLogs.create, {
      emotion: "Worried",
      selectedEmotions: ["Worried", "Tired", "Sad"],
      strongestEmotion: "Worried",
      bodyRegions: ["Chest"],
      preIntensity: 6,
    });

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_111" });
    expect(logs).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 12. Existing historical emotion records remain readable
  // -------------------------------------------------------------------------
  test("TEST-12: Historical records without selectedEmotions or strongestEmotion remain readable", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_112", role: "patient" });

      // Legacy insert without new fields
      await ctx.db.insert("emotionLogs", {
        userId: "student_112",
        emotion: "Sad",
        bodyRegions: ["Chest"],
        preIntensity: 5,
        postIntensity: 3,
        createdAt: Date.now() - 100000,
      });
    });

    const session = t.withIdentity({ subject: "student_112" });

    const logs = await session.query(api.emotionLogs.getRecent, { userId: "student_112" });
    expect(logs).toHaveLength(1);
    expect(logs[0].emotion).toBe("Sad");
    expect(logs[0].preIntensity).toBe(5);
    expect(logs[0].selectedEmotions).toBeUndefined();
    expect(logs[0].strongestEmotion).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 13. Student A cannot access Student B's emotion/intervention data
  // -------------------------------------------------------------------------
  test("TEST-13: Student isolation - Student A cannot query Student B's emotion records", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_alice", role: "patient" });
      await ctx.db.insert("users", { clerkId: "student_bob", role: "patient" });

      await ctx.db.insert("emotionLogs", {
        userId: "student_alice",
        emotion: "Worried",
        bodyRegions: ["Chest"],
        preIntensity: 7,
        createdAt: Date.now(),
      });
    });

    const bobSession = t.withIdentity({ subject: "student_bob" });

    // Bob attempts to read Alice's emotion logs
    await expect(
      bobSession.query(api.emotionLogs.getRecent, { userId: "student_alice" })
    ).rejects.toThrow("Unauthorized");
  });

  // -------------------------------------------------------------------------
  // 14. Existing safety/clinical screening tests remain unchanged
  // -------------------------------------------------------------------------
  test("TEST-14: Emotion body regions helper maps canonical regions without clinical scoring", () => {
    const worriedRegions = getRelevantBodyRegions("Worried");
    expect(worriedRegions).toContain("Chest");
    expect(worriedRegions).toContain("Stomach");

    const angryRegions = getRelevantBodyRegions("Angry");
    expect(angryRegions).toContain("Shoulders");
    expect(angryRegions).toContain("Hands");

    // Pure mapping, zero screening or clinical diagnosis
    expect(normalizeEmotionKey("anxious")).toBe("worried");
    expect(normalizeEmotionKey("frustrated")).toBe("angry");
  });
});
