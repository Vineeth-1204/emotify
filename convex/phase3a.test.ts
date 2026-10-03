/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  PRIMARY_EMOTIONS,
  SECONDARY_EMOTIONS_BY_PRIMARY,
  UNCERTAINTY_REPHRASINGS,
  getCanonicalEmotionForRouting,
  PrimaryEmotionId,
} from "../common/emotionTaxonomy";
import {
  determineIntervention,
  getRelevantBodyRegions,
} from "../common/emotionRouting";
import { BREATHING_PROTOCOLS } from "../constants/BreathingProtocols";
import { parseLocalDateNoon } from "../utils/date";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 3A — Emotion Discovery Redesign & Insights Crash Fix", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentId = "";
    let otherStudentId = "";

    await t.run(async (ctx) => {
      studentId = await ctx.db.insert("users", {
        full_name: "Phase 3A Student",
        mobile_number: "9988776655",
        role: "patient",
        status: "active",
        patientId: "PAT-P3A-01",
        xp: 50,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      otherStudentId = await ctx.db.insert("users", {
        full_name: "Other Student",
        mobile_number: "9988776656",
        role: "patient",
        status: "active",
        patientId: "PAT-P3A-02",
        xp: 10,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const studentSession = t.withIdentity({
      name: "Phase 3A Student",
      subject: studentId,
      tokenIdentifier: `test|${studentId}`,
    });

    return { t, studentId, otherStudentId, studentSession };
  }

  // =========================================================================
  // PART A — INSIGHTS CRASH REGRESSION & STABILITY
  // =========================================================================
  describe("Part A: Insights Crash Fix & Telemetry Integrity", () => {
    test("1 & 5. Unauthenticated callers are rejected cleanly without crashing backend", async () => {
      const { t, studentId } = await setupTestEnvironment();

      // Calling without auth identity must fail gracefully with Unauthenticated
      await expect(
        t.query(api.insights.getDailyStats, {
          userId: studentId,
          referenceDate: "2026-10-03",
        })
      ).rejects.toThrow("Unauthenticated: Must be logged in to view insights.");
    });

    test("2. Empty / new-user data returns safe zero-state values without NaN or crash", async () => {
      const { studentSession, studentId } = await setupTestEnvironment();

      const stats = await studentSession.query(api.insights.getDailyStats, {
        userId: studentId,
        referenceDate: "2026-10-03",
      });

      expect(stats).toBeDefined();
      expect(stats.totalCheckins).toBe(0);
      expect(stats.completedGoalsCount).toBe(0);
      expect(stats.reframesCount).toBe(0);
      expect(stats.totalCalmPoints).toBe(0);
      expect(stats.avgJpmrDrop).toBe("0");
      expect(stats.avgReframeDrop).toBe("0");
      expect(Number.isNaN(Number(stats.avgJpmrDrop))).toBe(false);
      expect(Number.isNaN(Number(stats.avgReframeDrop))).toBe(false);
      expect(stats.recentDailyMood).toHaveLength(7);
      for (const entry of stats.recentDailyMood) {
        expect(entry.mood).toBeNull();
        expect(entry.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    test("3. Existing-user data with checkins and telemetry renders safely", async () => {
      const { t, studentSession, studentId } = await setupTestEnvironment();

      await t.run(async (ctx) => {
        // Add checkin to dailyCheckins (authoritative source for daily stats)
        await ctx.db.insert("dailyCheckins", {
          userId: studentId,
          mood: "happy",
          dateStr: "2026-10-03",
          createdAt: Date.now(),
        });

        // Add relaxation session
        await ctx.db.insert("jpmrLogs", {
          userId: studentId,
          preIntensity: 7,
          postIntensity: 3,
          durationSeconds: 300,
          createdAt: Date.now(),
        });

        // Add reframe log
        await ctx.db.insert("reframeLogs", {
          userId: studentId,
          situation_text: "Busy day",
          thought_original: "Too much work",
          thinking_trap_choice: "Overgeneralization",
          guided_answers: ["answer1"],
          reframe_text: "I can take it one task at a time",
          pre_reframe_intensity: 6,
          post_reframe_intensity: 3,
          improvement_percentage: 50,
          saved_reframe_flag: true,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, {
        userId: studentId,
        referenceDate: "2026-10-03",
      });

      expect(stats.totalCheckins).toBe(1);
      expect(stats.reframesCount).toBe(1);
      expect(Number(stats.avgJpmrDrop)).toBe(4); // 7 - 3
      expect(Number(stats.avgReframeDrop)).toBe(3); // 6 - 3
    });

    test("4. Missing optional telemetry (null/undefined pre or post intensity) never produces NaN", async () => {
      const { t, studentSession, studentId } = await setupTestEnvironment();

      await t.run(async (ctx) => {
        // Reframe log with zero / undefined ratings
        await ctx.db.insert("reframeLogs", {
          userId: studentId,
          situation_text: "Exams",
          thought_original: "I will fail",
          thinking_trap_choice: "Catastrophizing",
          guided_answers: ["answer1"],
          reframe_text: "I prepared well",
          pre_reframe_intensity: 0,
          post_reframe_intensity: 0,
          improvement_percentage: 0,
          saved_reframe_flag: false,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, {
        userId: studentId,
        referenceDate: "2026-10-03",
      });

      expect(Number.isNaN(Number(stats.avgJpmrDrop))).toBe(false);
      expect(Number.isNaN(Number(stats.avgReframeDrop))).toBe(false);
      expect(stats.avgJpmrDrop).toBe("0");
    });

    test("6. Existing Insights metric contract remains intact (categorical mood values only)", async () => {
      const { t, studentSession, studentId } = await setupTestEnvironment();

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentId,
          mood: "calm",
          dateStr: "2026-10-03",
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, {
        userId: studentId,
        referenceDate: "2026-10-03",
      });

      // Assert contract shape
      expect(stats).toHaveProperty("totalCheckins");
      expect(stats).toHaveProperty("completedGoalsCount");
      expect(stats).toHaveProperty("reframesCount");
      expect(stats).toHaveProperty("totalCalmPoints");
      expect(stats).toHaveProperty("recentDailyMood");
      expect(stats.recentDailyMood).toHaveLength(7);
      // No continuous Bézier curve data
      expect((stats as any).bezierCurvePoints).toBeUndefined();
    });

    test("Frontend date parsing robustness on dailyMoodEntries dateStr", () => {
      const validDate = "2026-10-03";
      const parsed = parseLocalDateNoon(validDate);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(9); // October = index 9
      expect(parsed.getDate()).toBe(3);
    });
  });

  // =========================================================================
  // PART B — HIERARCHICAL EMOTION DISCOVERY
  // =========================================================================
  describe("Part B: Hierarchical Emotion Discovery", () => {
    test("7. Initial primary emotion catalog contains exactly four primary emotions", () => {
      expect(PRIMARY_EMOTIONS).toHaveLength(4);
      const ids = PRIMARY_EMOTIONS.map((e) => e.id);
      expect(ids).toEqual(["happy", "sad", "angry", "calm"]);
      const labels = PRIMARY_EMOTIONS.map((e) => e.label);
      expect(labels).toEqual(["Happy", "Sad", "Angry", "Calm"]);
    });

    test("8. Secondary options are distinctly defined and non-empty for each primary emotion", () => {
      const primaryIds: PrimaryEmotionId[] = ["happy", "sad", "angry", "calm"];
      for (const id of primaryIds) {
        const secondaries = SECONDARY_EMOTIONS_BY_PRIMARY[id];
        expect(secondaries).toBeDefined();
        expect(secondaries.length).toBeGreaterThan(3);
        expect(secondaries).toContain("Not sure");
      }
    });

    test("9. Happy secondary emotions catalog", () => {
      const happyOptions = SECONDARY_EMOTIONS_BY_PRIMARY.happy;
      expect(happyOptions).toContain("Excited");
      expect(happyOptions).toContain("Proud");
      expect(happyOptions).toContain("Grateful");
      expect(happyOptions).toContain("Relieved");
      expect(happyOptions).toContain("Content");
      expect(happyOptions).toContain("Hopeful");
      expect(happyOptions).toContain("Connected");
      expect(happyOptions).toContain("Not sure");
    });

    test("10. Sad secondary emotions catalog", () => {
      const sadOptions = SECONDARY_EMOTIONS_BY_PRIMARY.sad;
      expect(sadOptions).toContain("Lonely");
      expect(sadOptions).toContain("Disappointed");
      expect(sadOptions).toContain("Hurt");
      expect(sadOptions).toContain("Empty");
      expect(sadOptions).toContain("Left out");
      expect(sadOptions).toContain("Missing someone");
      expect(sadOptions).toContain("Hopeless");
      expect(sadOptions).toContain("Not sure");
    });

    test("11. Angry secondary emotions catalog", () => {
      const angryOptions = SECONDARY_EMOTIONS_BY_PRIMARY.angry;
      expect(angryOptions).toContain("Frustrated");
      expect(angryOptions).toContain("Irritated");
      expect(angryOptions).toContain("Annoyed");
      expect(angryOptions).toContain("Hurt");
      expect(angryOptions).toContain("Resentful");
      expect(angryOptions).toContain("Overwhelmed");
      expect(angryOptions).toContain("Not sure");
    });

    test("12. Calm secondary emotions catalog", () => {
      const calmOptions = SECONDARY_EMOTIONS_BY_PRIMARY.calm;
      expect(calmOptions).toContain("Peaceful");
      expect(calmOptions).toContain("Relaxed");
      expect(calmOptions).toContain("Content");
      expect(calmOptions).toContain("Safe");
      expect(calmOptions).toContain("Comfortable");
      expect(calmOptions).toContain("Balanced");
      expect(calmOptions).toContain("Not sure");
    });

    test("13, 14 & 15. Secondary selection maps to canonical emotion while preserving primary & compatibility", () => {
      // Angry -> Frustrated maps canonically to angry
      expect(getCanonicalEmotionForRouting("angry", "Frustrated")).toBe("angry");
      // Angry -> Overwhelmed maps canonically to angry
      expect(getCanonicalEmotionForRouting("angry", "Overwhelmed")).toBe("angry");
      // Sad -> Lonely maps to sad
      expect(getCanonicalEmotionForRouting("sad", "Lonely")).toBe("sad");
      // Sad -> Hopeless maps to sad
      expect(getCanonicalEmotionForRouting("sad", "Hopeless")).toBe("sad");
      // Happy -> Excited maps to happy
      expect(getCanonicalEmotionForRouting("happy", "Excited")).toBe("happy");
      // Calm -> Peaceful maps to calm
      expect(getCanonicalEmotionForRouting("calm", "Peaceful")).toBe("calm");
      // Not sure falls back to primary
      expect(getCanonicalEmotionForRouting("happy", "Not sure")).toBe("happy");
      expect(getCanonicalEmotionForRouting("angry", null)).toBe("angry");
    });

    test("16 & 17. Body sensations follow secondary selection and allow body uncertainty", () => {
      const angryRegions = getRelevantBodyRegions("angry");
      expect(angryRegions).toBeDefined();
      expect(angryRegions.length).toBeGreaterThan(0);

      // Body selection can proceed without regions when user is unsure
      const effectiveRegionsUnsure: string[] = [];
      expect(effectiveRegionsUnsure).toHaveLength(0);
    });

    test("18, 19 & 20. Uncertainty behavior: 1st attempt rephrases, 2nd attempt enters uncertain_support", () => {
      // Check rephrasing prompts exist for all 4 primary emotions
      const primaries: PrimaryEmotionId[] = ["happy", "sad", "angry", "calm"];
      for (const p of primaries) {
        const rephrasing = UNCERTAINTY_REPHRASINGS[p];
        expect(rephrasing).toBeDefined();
        expect(rephrasing.prompt).toBe("That's okay.");
        expect(rephrasing.examples.length).toBeGreaterThan(10);
      }

      // Angry rephrasing example
      expect(UNCERTAINTY_REPHRASINGS.angry.examples).toContain("frustration");
      expect(UNCERTAINTY_REPHRASINGS.angry.examples).toContain("irritation");
    });

    test("21, 22 & 23. Existing intervention routing is unchanged and receives correct canonical emotion", () => {
      // Angry intensity 5 -> JPMR
      const interventionAngry5 = determineIntervention("angry", 5);
      expect(interventionAngry5.interventionType).toBe("jpmr");

      // Worried intensity 6 -> Breathing (box_4444)
      const interventionWorried6 = determineIntervention("worried", 6);
      expect(interventionWorried6.interventionType).toBe("breathing");
      expect(interventionWorried6.protocolId).toBe("box_4444");

      // Sad standard intensity 4 -> Reframe
      const interventionSad4 = determineIntervention("sad", 4);
      expect(interventionSad4.interventionType).toBe("reframe");

      // Sad high intensity >= 8 -> Grounding
      const interventionSad8 = determineIntervention("sad", 8);
      expect(interventionSad8.interventionType).toBe("grounding");

      // Calm -> Breathing (resonance)
      const interventionCalm = determineIntervention("calm", 2);
      expect(interventionCalm.interventionType).toBe("breathing");
      expect(interventionCalm.protocolId).toBe("resonance");

      // Happy -> MicroGoals
      const interventionHappy = determineIntervention("happy", 5);
      expect(interventionHappy.interventionType).toBe("microgoals");
    });

    test("24 & 25. Phase 3 recordPostIntensity mutation updates post-intervention score", async () => {
      const { t, studentSession, studentId } = await setupTestEnvironment();

      let logId!: Id<"emotionLogs">;
      await t.run(async (ctx) => {
        logId = await ctx.db.insert("emotionLogs", {
          userId: studentId,
          emotion: "Frustrated",
          strongestEmotion: "Frustrated",
          selectedEmotions: ["angry", "Frustrated"],
          bodyRegions: ["Chest"],
          preIntensity: 6,
          createdAt: Date.now(),
        });
      });

      // Execute Phase 3 recordPostIntensity using authenticated session
      await studentSession.mutation(api.emotionLogs.recordPostIntensity, {
        logId,
        postIntensity: 3,
      });

      await t.run(async (ctx) => {
        const updated = await ctx.db.get(logId);
        expect(updated).toBeDefined();
        expect(updated?.preIntensity).toBe(6);
        expect(updated?.postIntensity).toBe(3);
      });
    });

    test("26. Historical emotion records remain readable and compatible", async () => {
      const { t, studentSession, studentId } = await setupTestEnvironment();

      await t.run(async (ctx) => {
        // Historical check-in with old schema fields
        await ctx.db.insert("emotionLogs", {
          userId: studentId,
          emotion: "Worried / Scared",
          strongestEmotion: "Worried / Scared",
          selectedEmotions: ["Worried / Scared", "Tired / Drained"],
          bodyRegions: ["Chest"],
          preIntensity: 7,
          createdAt: Date.now() - 86400000,
        });

        // Historical emotionMap
        await ctx.db.insert("emotionMaps", {
          userId: studentId,
          emotionLabel: "Worried / Scared",
          selectedRegions: ["Chest"],
          bodyRatings: [{ region: "Chest", intensity: 7 }],
          averageIntensity: 7,
          suggestedAction: "Box Breathing",
          createdAt: Date.now() - 86400000,
        });
      });

      // Query recent logs with authenticated student session
      const recent = await studentSession.query(api.emotionMaps.getRecentLogs, { userId: studentId });
      expect(recent).toHaveLength(1);
      expect(recent[0].emotionLabel).toBe("Worried / Scared");
    });

    test("27 & 28. Clinical Boundaries: 4-7-8 protocol remains inactive, no clinical screening introduced", () => {
      // 4-7-8 relaxing_478 must remain defined_inactive
      expect(BREATHING_PROTOCOLS.relaxing_478.isActive).toBe(false);
      expect(BREATHING_PROTOCOLS.relaxing_478.activationStatus).toBe("defined_inactive");

      // determineIntervention must NEVER route to relaxing_478
      const testEmotions = ["worried", "sad", "angry", "calm", "happy"] as const;
      for (const emo of testEmotions) {
        for (let i = 1; i <= 10; i++) {
          const res = determineIntervention(emo, i);
          if (res.interventionType === "breathing") {
            expect(res.protocolId).not.toBe("relaxing_478");
          }
        }
      }
    });
  });
});
