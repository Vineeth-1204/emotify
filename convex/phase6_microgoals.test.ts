/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  selectDailyMicroGoals,
  SYMPTOM_DEFINITIONS,
  MICROGOALS_CATALOGUE,
  mapAnchorToGroup,
} from "../common/symptomMicroGoals";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 6: Symptom-Based MicroGoal Engine", () => {
  // 1. Pure Symptom Mapping and Threshold Tests
  describe("Domain & Mapping Rules", () => {
    test("P6-01: Exactly 20 symptom categories defined with authoritative keys and thresholds", () => {
      const keys = Object.keys(SYMPTOM_DEFINITIONS);
      expect(keys).toHaveLength(20);
      expect(keys).toContain("low_interest");
      expect(keys).toContain("low_mood");
      expect(keys).toContain("sleep_difficulties");
      expect(keys).toContain("fatigue");
      expect(keys).toContain("appetite_changes");
      expect(keys).toContain("low_self_esteem");
      expect(keys).toContain("concentration_difficulties");
      expect(keys).toContain("restlessness_slowed");
      expect(keys).toContain("self_harm");
      expect(keys).toContain("nervousness");
      expect(keys).toContain("uncontrollable_worry");
      expect(keys).toContain("excessive_worry");
      expect(keys).toContain("trouble_relaxing");
      expect(keys).toContain("restlessness");
      expect(keys).toContain("irritability");
      expect(keys).toContain("fear");
      expect(keys).toContain("loneliness");
      expect(keys).toContain("academic_stress");
      expect(keys).toContain("burnout");
      expect(keys).toContain("hopelessness");
    });

    test("P6-02: All 4 intensity anchors map deterministically to Light/Some vs Intense/Overwhelming", () => {
      expect(mapAnchorToGroup("A little")).toBe("light_some");
      expect(mapAnchorToGroup("Some")).toBe("light_some");
      expect(mapAnchorToGroup("A lot")).toBe("intense_overwhelming");
      expect(mapAnchorToGroup("Overwhelming")).toBe("intense_overwhelming");

      // Numeric scale
      expect(mapAnchorToGroup(1)).toBe("light_some");
      expect(mapAnchorToGroup(2)).toBe("light_some");
      expect(mapAnchorToGroup(6)).toBe("intense_overwhelming");
      expect(mapAnchorToGroup(8)).toBe("intense_overwhelming");
    });

    test("P6-03: Slot model generates exactly 3 slots: Must Do, Feel Better, Grow Stronger", () => {
      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [{ key: "nervousness", score: 3 }],
        todaySeverityAnchor: "Some",
        history: [],
      });

      expect(res.safetyOverride).toBe(false);
      expect(res.selectedGoals).toHaveLength(3);
      expect(res.selectedGoals[0].slot).toBe("must_do");
      expect(res.selectedGoals[0].slotLabel).toBe("✅ Must Do");
      expect(res.selectedGoals[1].slot).toBe("feel_better");
      expect(res.selectedGoals[1].slotLabel).toBe("🌿 Feel Better");
      expect(res.selectedGoals[2].slot).toBe("grow_stronger");
      expect(res.selectedGoals[2].slotLabel).toBe("📚 Grow Stronger");
    });

    test("P6-04: Must Do is always chosen from universal PA physical reset", () => {
      for (let i = 0; i < 5; i++) {
        const res = selectDailyMicroGoals({
          studentId: "student_1",
          symptoms: [{ key: "concentration_difficulties", score: 3 }],
          todaySeverityAnchor: "Overwhelming",
          history: [],
          daySeed: i,
        });
        const mustDo = res.selectedGoals[0].goal;
        expect(["PA01", "PA02", "PA03", "PA04", "PA05"]).toContain(mustDo.id);
      }
    });

    test("P6-05: Single symptom vs multiple eligible symptoms selects primary and secondary categories", () => {
      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [
          { key: "nervousness", score: 3 },
          { key: "concentration_difficulties", score: 2 },
        ],
        todaySeverityAnchor: "Some",
        history: [],
      });

      expect(res.selectedGoals[1].symptomKey).toBe("nervousness");
      expect(res.selectedGoals[2].symptomKey).toBe("concentration_difficulties");
    });

    test("P6-06: Fair rotation when more than two symptoms are eligible", () => {
      const symptoms = [
        { key: "nervousness", score: 3 },
        { key: "concentration_difficulties", score: 3 },
        { key: "sleep_difficulties", score: 3 },
      ];

      const resDay0 = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms,
        todaySeverityAnchor: "Some",
        history: [],
        daySeed: 0,
      });

      const resDay1 = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms,
        todaySeverityAnchor: "Some",
        history: [],
        daySeed: 1,
      });

      // Different primary symptom chosen on rotation
      expect(resDay0.selectedGoals[1].symptomKey).not.toBe(resDay1.selectedGoals[1].symptomKey);
    });

    test("P6-07: Cooldown excludes goals shown in the preceding 3 days", () => {
      const now = Date.now();
      const history = [
        { goalId: "AN07", createdAt: now - 86400000, completed: true, skipped: false }, // yesterday
        { goalId: "AN08", createdAt: now - 2 * 86400000, completed: true, skipped: false }, // 2 days ago
      ];

      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [{ key: "nervousness", score: 3 }],
        todaySeverityAnchor: "Some", // pool is AN07, AN08, AN04
        history,
        explorationRate: 0,
      });

      // AN07 and AN08 were in last 2 days; remaining should be AN04
      expect(res.selectedGoals[1].goal.id).toBe("AN04");
    });

    test("P6-08: Cooldown resets if all eligible goals in pool are on cooldown", () => {
      const now = Date.now();
      const history = [
        { goalId: "AN07", createdAt: now - 86400000, completed: true, skipped: false },
        { goalId: "AN08", createdAt: now - 86400000, completed: true, skipped: false },
        { goalId: "AN04", createdAt: now - 86400000, completed: true, skipped: false },
      ];

      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [{ key: "nervousness", score: 3 }],
        todaySeverityAnchor: "Some",
        history,
        explorationRate: 0,
      });

      // When all are on cooldown, cooldown resets and one is still picked
      expect(["AN07", "AN08", "AN04"]).toContain(res.selectedGoals[1].goal.id);
    });

    test("P6-09: Effectiveness formula average(pre - post) ranks highest performers", () => {
      const now = Date.now();
      const oldTime = now - 5 * 86400000; // beyond cooldown
      const history = [
        // AN07 gave drop of 4 (pre 7, post 3)
        { goalId: "AN07", createdAt: oldTime, completed: true, skipped: false, preIntensity: 7, postIntensity: 3 },
        // AN04 gave drop of 1 (pre 5, post 4)
        { goalId: "AN04", createdAt: oldTime, completed: true, skipped: false, preIntensity: 5, postIntensity: 4 },
      ];

      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [{ key: "nervousness", score: 3 }],
        todaySeverityAnchor: "Some",
        history,
        explorationRate: 0,
      });

      // Higher drop goal AN07 is picked
      expect(res.selectedGoals[1].goal.id).toBe("AN07");
    });

    test("P6-10: Skipped goals are never included in effectiveness calculations", () => {
      const now = Date.now();
      const oldTime = now - 5 * 86400000;
      const history = [
        // Skipped goal with fabricated low numbers should be ignored
        { goalId: "AN07", createdAt: oldTime, completed: false, skipped: true, preIntensity: 8, postIntensity: 8 },
        // Completed goal with drop of 2
        { goalId: "AN04", createdAt: oldTime, completed: true, skipped: false, preIntensity: 6, postIntensity: 4 },
      ];

      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [{ key: "nervousness", score: 3 }],
        todaySeverityAnchor: "Some",
        history,
        explorationRate: 0,
      });

      // AN04 is the only completed one
      expect(res.selectedGoals[1].goal.id).toBe("AN04");
    });

    test("P6-11: Safety override when PHQ-9 Q9 (self_harm) > 0 blocks standard pool", () => {
      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [
          { key: "nervousness", score: 3 },
          { key: "self_harm", score: 1 },
        ],
        todaySeverityAnchor: "A lot",
        history: [],
      });

      expect(res.safetyOverride).toBe(true);
      expect(res.selectedGoals).toHaveLength(0);
      expect(res.dialogueMessage).toContain("Thank you for telling me");
    });

    test("P6-12: Hopelessness triggers silent alert flag", () => {
      const res = selectDailyMicroGoals({
        studentId: "student_1",
        symptoms: [
          { key: "hopelessness", score: 2 },
        ],
        todaySeverityAnchor: "Some",
        history: [],
      });

      expect(res.safetyOverride).toBe(false);
      expect(res.hopelessnessAlertTriggered).toBe(true);
      expect(res.selectedGoals).toHaveLength(3);
    });
  });

  // 2. Convex Backend Integration & Persistence Tests
  describe("Convex Backend Mutations & Queries", () => {
    test("P6-13: generateSymptomMicroGoals enforces server-side daily limit of 3 goals", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p6_limit_01",
        email: "p6_limit@emotify.com",
        name: "Limit Student",
      });
      const uid = await testUserId(t, "student_p6_limit_01");

      const run1 = await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "Some",
      });

      expect(run1.safetyOverride).toBe(false);
      expect(run1.goals).toHaveLength(3);

      // Repeated invocation on same day does NOT exceed 3 goals
      const run2 = await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "Some",
      });

      expect(run2.alreadyGenerated).toBe(true);
      expect(run2.goals).toHaveLength(3);

      const todayQuery = await t.query(api.microGoals.getTodaySymptomGoals, {
        userId: uid,
        dateStr: "2026-10-21",
      });
      expect(todayQuery.goals).toHaveLength(3);
    });

    test("P6-14: Complete goal awards +1 Calm Point and records intensity delta idempotently", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p6_reward_01",
        email: "p6_reward@emotify.com",
        name: "Reward Student",
      });
      const uid = await testUserId(t, "student_p6_reward_01");

      const generated = await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "A lot",
      });
      const targetGoal = generated.goals[0]!;

      // Complete goal with postIntensity = 3 (preIntensity is 6 for "A lot")
      const comp1 = await t.mutation(api.microGoals.completeSymptomGoal, {
        id: targetGoal._id,
        feelingAfter: "Much better and calmer",
        postIntensity: 3,
      });

      expect(comp1.success).toBe(true);
      expect(comp1.calmPointsAwarded).toBe(1);
      expect(comp1.intensityDrop).toBe(3);
      expect(comp1.reinforcementMessage).toBeDefined();

      // Idempotency: completing again returns alreadyCompleted and 0 new points
      const comp2 = await t.mutation(api.microGoals.completeSymptomGoal, {
        id: targetGoal._id,
        feelingAfter: "Repeated tap",
        postIntensity: 3,
      });

      expect(comp2.alreadyCompleted).toBe(true);
      expect(comp2.calmPointsAwarded).toBe(0);
    });

    test("P6-15: Penalty-free skip marks goal skipped without awarding points", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p6_skip_01",
        email: "p6_skip@emotify.com",
        name: "Skip Student",
      });
      const uid = await testUserId(t, "student_p6_skip_01");

      const generated = await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "Some",
      });
      const targetGoal = generated.goals[0]!;

      const skipRes = await t.mutation(api.microGoals.skipSymptomGoal, {
        id: targetGoal._id,
      });

      expect(skipRes.success).toBe(true);
      expect(skipRes.nudgeMessage).toBeDefined();

      // Check DB record
      await t.run(async (ctx) => {
        const goal = await ctx.db.get(targetGoal._id);
        expect(goal?.skipped).toBe(true);
        expect(goal?.completed).toBe(false);
      });
    });

    test("P6-16: Hopelessness flags silent alert in alerts table", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p6_hope_01",
        email: "p6_hope@emotify.com",
        name: "Hope Student",
      });
      const uid = await testUserId(t, "student_p6_hope_01");

      // Seed emotion log indicating hopelessness
      await t.run(async (ctx) => {
        await ctx.db.insert("emotionLogs", {
          userId: uid,
          emotion: "hopelessness",
          strongestEmotion: "hopelessness",
          bodyRegions: ["Chest"],
          preIntensity: 6,
          createdAt: Date.now(),
        });
      });

      await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "A lot",
      });

      // Verify silent alert was inserted into alerts table
      await t.run(async (ctx) => {
        const alerts = await ctx.db
          .query("alerts")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .collect();
        const silentAlert = alerts.find((a) => a.type === "hopelessness");
        expect(silentAlert).toBeDefined();
        expect(silentAlert?.status).toBe("pending");
      });
    });

    test("P6-17: Weekly summary computes metrics and handles empty state gracefully", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p6_summary_01",
        email: "p6_summary@emotify.com",
        name: "Summary Student",
      });
      const uid = await testUserId(t, "student_p6_summary_01");

      // 1. Empty state for new student
      const emptySummary = await t.query(api.microGoals.getSymptomWeeklySummary, { userId: uid });
      expect(emptySummary.goalsAssigned).toBe(0);
      expect(emptySummary.goalsCompleted).toBe(0);
      expect(emptySummary.calmPointsEarned).toBe(0);
      expect(emptySummary.reflectionMessage).toContain("No pressure");

      // 2. Generate and complete 1 goal
      const gen = await t.mutation(api.microGoals.generateSymptomMicroGoals, {
        userId: uid,
        dateStr: "2026-10-21",
        intensityAnchor: "Some",
      });
      await t.mutation(api.microGoals.completeSymptomGoal, {
        id: gen.goals[0]!._id,
        feelingAfter: "Relaxed",
        postIntensity: 2, // pre is 4, drop is 2
      });

      const updatedSummary = await t.query(api.microGoals.getSymptomWeeklySummary, { userId: uid });
      expect(updatedSummary.goalsAssigned).toBe(3);
      expect(updatedSummary.goalsCompleted).toBe(1);
      expect(updatedSummary.calmPointsEarned).toBe(1);
      expect(updatedSummary.avgIntensityDrop).toBe(2);
      expect(updatedSummary.reflectionMessage).toContain("earned 1 Calm Points");
    });
  });
});
