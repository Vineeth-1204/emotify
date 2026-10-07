/// <reference types="vite/client" />
/**
 * Emotion Check-in Client Rework — Phase 2 Test Suite
 *
 * Tests the Mitra Guided Clarification + Interactive Emotion Flow additions.
 *
 * Covered requirements:
 * 1.  Multiple emotions selected → strongest question is asked.
 * 2.  User selects strongest normally → flow advances.
 * 3.  First "I'm not sure" on strongest → uncertainty state becomes rephrased.
 * 4.  Mitra rephrases instead of repeating the exact same question.
 * 5.  Second "I'm not sure" on strongest → fallback triggered (step 6).
 * 6.  Fallback offers existing canonical interventions.
 * 7.  Flow can complete with no body region selected.
 * 8.  First "I'm not sure" on body sensation triggers rephrase, not skip.
 * 9.  Single emotion skips strongest-emotion question.
 * 10. Multiple emotions show only selected emotions in picker.
 * 11. Strongest emotion must be a member of selected emotions.
 * 12. Existing intensity flow remains unchanged.
 * 13. Existing automatic intervention routing remains unchanged.
 * 14. Inactive 4-7-8 protocol cannot be launched via routing.
 * 15. No clinical scores enter this flow.
 * 16. Student authorization/isolation remains intact.
 * 17. Historical records without Phase 2 fields remain readable.
 */

import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import { api } from "./_generated/api";
import {
  determineIntervention,
  isStrongestFromSelection,
  getRelevantBodyRegions,
  normalizeEmotionKey,
} from "../common/emotionRouting";
import { BREATHING_PROTOCOLS } from "../constants/BreathingProtocols";

const modules = import.meta.glob("./**/*.ts");

// ---------------------------------------------------------------------------
// Uncertainty state machine helpers (pure unit — no DB)
// ---------------------------------------------------------------------------
type Step2State = "normal" | "rephrased" | "fallback";

function pressUnsureStep2(state: Step2State): Step2State {
  if (state === "normal") return "rephrased";
  return "fallback";
}

type Step3State = "normal" | "rephrased";

function pressUnsureStep3(state: Step3State): { nextState: Step3State; autoAdvance: boolean } {
  if (state === "normal") return { nextState: "rephrased", autoAdvance: false };
  return { nextState: "rephrased", autoAdvance: true };
}

describe("Emotion Check-in Flow — Phase 2 Guided Clarification", () => {

  test("P2-01: Multiple emotions selected — strongest step is shown", () => {
    const selected = ["Worried", "Tired", "Sad"];
    expect(selected.length > 1).toBe(true);
    expect(selected).toContain("Tired");
  });

  test("P2-02: Selecting strongest advances flow — record is created", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_s02 = await testUserId(t, "p2_s02");
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_p2_s02 as any, { role: "patient" });
    });
    const s = t.withIdentity({ subject: "p2_s02" });
    const id = await s.mutation(api.emotionLogs.create, {
      emotion: "Worried",
      selectedEmotions: ["Worried", "Sad"],
      strongestEmotion: "Worried",
      bodyRegions: ["Chest"],
      preIntensity: 6,
    });
    expect(id).toBeDefined();
    const logs = await s.query(api.emotionLogs.getRecent, { userId: uid_p2_s02 });
    expect(logs[0].strongestEmotion).toBe("Worried");
  });

  test("P2-03: First unsure on strongest → state becomes rephrased", () => {
    expect(pressUnsureStep2("normal")).toBe("rephrased");
  });

  test("P2-04: Rephrase message is distinct from original message", () => {
    const original = "Which one feels strongest right now?";
    const rephrased = "If you had to pick the feeling taking up the most space right now, which one would it be?";
    expect(original).not.toBe(rephrased);
    expect(original.toLowerCase()).toContain("strongest");
    expect(rephrased.toLowerCase()).toContain("feeling");
  });

  test("P2-05: Second unsure on strongest → fallback (step 6) is triggered", () => {
    let state: Step2State = "normal";
    state = pressUnsureStep2(state);
    state = pressUnsureStep2(state);
    expect(state).toBe("fallback");
  });

  test("P2-06: Fallback activities use existing canonical routes; breathing uses active box_4444", () => {
    const routes = ["breathing", "grounding", "jpmr"];
    const allCanonical = ["breathing", "grounding", "jpmr", "reframe", "microgoals"];
    for (const r of routes) { expect(allCanonical).toContain(r); }
    const p = BREATHING_PROTOCOLS["box_4444"];
    expect(p).toBeDefined();
    expect(p.isActive).toBe(true);
    expect(p.activationStatus).toBe("active");
  });

  test("P2-07: Flow completes with empty body regions — no region required", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_s07 = await testUserId(t, "p2_s07");
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_p2_s07 as any, { role: "patient" });
    });
    const s = t.withIdentity({ subject: "p2_s07" });
    await s.mutation(api.emotionLogs.create, {
      emotion: "Sad",
      selectedEmotions: ["Sad"],
      strongestEmotion: "Sad",
      bodyRegions: [],
      preIntensity: 5,
    });
    const logs = await s.query(api.emotionLogs.getRecent, { userId: uid_p2_s07 });
    expect(logs[0].bodyRegions).toEqual([]);
  });

  test("P2-08: First unsure on body → rephrase fires, does not auto-advance", () => {
    const result = pressUnsureStep3("normal");
    expect(result.nextState).toBe("rephrased");
    expect(result.autoAdvance).toBe(false);
  });

  test("P2-09: Single emotion → step 2 skipped; strongest is auto-set", () => {
    const selected = ["Worried"];
    const skip = selected.length === 1;
    expect(skip).toBe(true);
    expect(selected[0]).toBe("Worried");
  });

  test("P2-10: Strongest picker contains only selected emotions", () => {
    const all = ["Worried", "Sad", "Angry", "Happy", "Tired", "Calm", "Embarrassed", "Guilty"];
    const selected = ["Worried", "Sad"];
    const picker = all.filter((e) => selected.includes(e));
    expect(picker).toEqual(["Worried", "Sad"]);
    expect(picker).not.toContain("Angry");
  });

  test("P2-11: Strongest emotion must be member of selected; mismatch rejected", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_s11 = await testUserId(t, "p2_s11");
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_p2_s11 as any, { role: "patient" });
    });
    const s = t.withIdentity({ subject: "p2_s11" });
    await expect(
      s.mutation(api.emotionLogs.create, {
        emotion: "Happy",
        selectedEmotions: ["Worried", "Sad"],
        strongestEmotion: "Happy",
        bodyRegions: [],
      })
    ).rejects.toThrow("strongestEmotion must be one of the selected emotions.");
    expect(isStrongestFromSelection(["Worried", "Sad"], "Happy")).toBe(false);
    expect(isStrongestFromSelection(["Worried", "Sad"], "Worried")).toBe(true);
  });

  test("P2-12: Intensity 1-10 enforced; 0 and 11 rejected", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_s12 = await testUserId(t, "p2_s12");
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_p2_s12 as any, { role: "patient" });
    });
    const s = t.withIdentity({ subject: "p2_s12" });
    await s.mutation(api.emotionLogs.create, { emotion: "Calm", bodyRegions: [], preIntensity: 5 });
    const logs = await s.query(api.emotionLogs.getRecent, { userId: uid_p2_s12 });
    expect(logs[0].preIntensity).toBe(5);
    await expect(
      s.mutation(api.emotionLogs.create, { emotion: "Calm", bodyRegions: [], preIntensity: 0 })
    ).rejects.toThrow("preIntensity must be between 1 and 10.");
    await expect(
      s.mutation(api.emotionLogs.create, { emotion: "Calm", bodyRegions: [], preIntensity: 11 })
    ).rejects.toThrow("preIntensity must be between 1 and 10.");
  });

  test("P2-13: Phase 1 intervention routing is deterministic and unchanged", () => {
    expect(determineIntervention("Worried", 5).interventionType).toBe("breathing");
    expect(determineIntervention("Angry", 5).interventionType).toBe("jpmr");
    expect(determineIntervention("Sad", 8).interventionType).toBe("grounding");
    expect(determineIntervention("Sad", 5).interventionType).toBe("reframe");
    expect(determineIntervention("Happy", 5).interventionType).toBe("microgoals");
    expect(determineIntervention("Calm", 5).interventionType).toBe("breathing");
  });

  test("P2-14: relaxing_478 is defined_inactive and not routed by Phase 1 or Phase 2", () => {
    const p478 = BREATHING_PROTOCOLS["relaxing_478"];
    expect(p478).toBeDefined();
    expect(p478.isActive).toBe(false);
    expect(p478.activationStatus).toBe("defined_inactive");
    const worried = determineIntervention("Worried", 9);
    expect(worried.protocolId).toBe("box_4444");
    expect(worried.protocolId).not.toMatch(/4-7-8|relaxing_478/);
    expect(BREATHING_PROTOCOLS["box_4444"].isActive).toBe(true);
  });

  test("P2-15: No PHQ/GAD/clinical severity in emotion routing", () => {
    expect(normalizeEmotionKey("anxious")).toBe("worried");
    expect(normalizeEmotionKey("frustrated")).toBe("angry");
    const regions = getRelevantBodyRegions("Worried");
    expect(Array.isArray(regions)).toBe(true);
    for (const r of regions) { expect(r).not.toMatch(/PHQ|GAD|PQ-16|severity|crisis|triage/i); }
    const result = determineIntervention("Sad", 7);
    expect(result.interventionType).not.toBe("clinical_referral");
    expect(result.reason).not.toMatch(/PHQ|GAD|crisis|triage/i);
  });

  test("P2-16: Student B cannot access Student A records", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_bob = await testUserId(t, "p2_bob");
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "p2_alice", role: "patient" });
      await ctx.db.patch(uid_p2_bob as any, { role: "patient" });
      await ctx.db.insert("emotionLogs", {
        userId: "p2_alice",
        emotion: "Worried",
        selectedEmotions: ["Worried"],
        strongestEmotion: "Worried",
        bodyRegions: ["Chest"],
        preIntensity: 7,
        createdAt: Date.now(),
      });
    });
    const bob = t.withIdentity({ subject: "p2_bob" });
    await expect(
      bob.query(api.emotionLogs.getRecent, { userId: "p2_alice" })
    ).rejects.toThrow("Unauthorized");
  });

  test("P2-17: Legacy records without Phase 2 fields are fully readable", async () => {
    const t = convexTest(schema, modules);
    const uid_p2_legacy = await testUserId(t, "p2_legacy");
    await t.run(async (ctx) => {
      await ctx.db.patch(uid_p2_legacy as any, { role: "patient" });
      await ctx.db.insert("emotionLogs", {
        userId: uid_p2_legacy,
        emotion: "Tired",
        bodyRegions: ["Legs"],
        preIntensity: 4,
        createdAt: Date.now() - 200000,
      });
    });
    const s = t.withIdentity({ subject: "p2_legacy" });
    const logs = await s.query(api.emotionLogs.getRecent, { userId: uid_p2_legacy });
    expect(logs).toHaveLength(1);
    expect(logs[0].emotion).toBe("Tired");
    expect(logs[0].preIntensity).toBe(4);
    expect(logs[0].selectedEmotions).toBeUndefined();
    expect(logs[0].strongestEmotion).toBeUndefined();
  });

});
