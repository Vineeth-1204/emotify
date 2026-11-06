/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  ROUTINE_HABIT_CATALOG,
  ALL_ROUTINE_TEMPLATES,
  selectDailyRoutineGoalsDeterministically,
} from "../common/interventions";
import { PRIMARY_EMOTIONS } from "../common/emotionTaxonomy";
import { determineIntervention } from "../common/emotionRouting";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 4 — Emoty-Led MicroGoals & Contextual Reinforcement", () => {
  async function setupPhase4TestEnvironment() {
    const t = convexTest(schema, modules);

    let studentId = "";
    let otherStudentId = "";

    await t.run(async (ctx) => {
      studentId = await ctx.db.insert("users", {
        full_name: "Phase 4 Student",
        mobile_number: "9876543210",
        role: "patient",
        status: "active",
        patientId: "PAT-P4-01",
        xp: 100,
        level: 2,
        coins: 20,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      otherStudentId = await ctx.db.insert("users", {
        full_name: "Other Student",
        mobile_number: "9876543211",
        role: "patient",
        status: "active",
        patientId: "PAT-P4-02",
        xp: 50,
        level: 1,
        coins: 10,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const studentSession = t.withIdentity({
      name: "Phase 4 Student",
      subject: studentId,
      tokenIdentifier: `test|${studentId}`,
    });

    const otherSession = t.withIdentity({
      name: "Other Student",
      subject: otherStudentId,
      tokenIdentifier: `test|${otherStudentId}`,
    });

    return { t, studentId, otherStudentId, studentSession, otherSession };
  }

  // 1. Emoty can present an existing MicroGoal
  test("1. Emoty can present an appropriate MicroGoal", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();
    const suggested = await studentSession.query(api.microGoals.getEmotySuggestedGoal, {
      dateStr: "2026-10-03",
    });

    expect(suggested).not.toBeNull();
    expect(suggested!.goalTitle).toBeDefined();
    expect(suggested!.goalTitle.length).toBeGreaterThan(0);
    expect(suggested!.goalDescription).toBeDefined();
    expect(["suggested", "active"]).toContain(suggested!.status);
  });

  // 2. Goal comes from existing canonical MicroGoal engine
  test("2. Goal comes from existing canonical MicroGoal catalog & engine", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();
    const suggested = await studentSession.query(api.microGoals.getEmotySuggestedGoal, {
      dateStr: "2026-10-03",
    });

    const matchingTemplate = ALL_ROUTINE_TEMPLATES.find((t) => t.id === suggested!.goalId);
    expect(matchingTemplate).toBeDefined();
    expect(matchingTemplate!.title).toBe(suggested!.goalTitle);
    expect(matchingTemplate!.category).toBe(suggested!.category);
  });

  // 3. No duplicate goal assignment is created
  test("3. No duplicate goal assignment is created when accepting multiple times", async () => {
    const { studentSession, t, studentId } = await setupPhase4TestEnvironment();

    const accept1 = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });
    expect(accept1.id).toBeDefined();

    const accept2 = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      goalId: accept1.goalId,
      dateStr: "2026-10-03",
    });
    expect(accept2.id).toBe(accept1.id);

    // Verify DB count
    const goals = await t.run(async (ctx) => {
      return await ctx.db
        .query("microGoals")
        .withIndex("by_userId", (q) => q.eq("userId", studentId))
        .collect();
    });
    const todayGoals = goals.filter((g) => g.date === "2026-10-03");
    // Only standard 5 daily goals were inserted, no double insertion
    expect(todayGoals.length).toBeLessThanOrEqual(5);
  });

  // 4. User can accept the goal
  test("4. User can accept the goal and obtain persisted goal record", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();
    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    expect(accepted.id).toBeDefined();
    expect(accepted.goalTitle).toBeDefined();
    expect(accepted.points).toBeGreaterThan(0);
  });

  // 5. User can decline/defer without penalty
  test("5. User can decline/defer without penalty (score unchanged)", async () => {
    const { studentSession, studentId, t } = await setupPhase4TestEnvironment();

    const initialUser = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    const initialXp = initialUser?.xp || 0;
    const initialCoins = initialUser?.coins || 0;

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    const skipRes = await studentSession.mutation(api.microGoals.skipEmotyGoal, {
      id: accepted.id,
    });
    expect(skipRes.success).toBe(true);
    expect(skipRes.message).toBe("No problem. We can try something else later.");

    // Verify score unchanged
    const afterUser = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    expect(afterUser?.xp).toBe(initialXp);
    expect(afterUser?.coins).toBe(initialCoins);

    // Goal marked skipped
    const goalDoc = await t.run(async (ctx) => ctx.db.get(accepted.id as Id<"microGoals">));
    expect(goalDoc?.skipped).toBe(true);
    expect(goalDoc?.completed).toBe(false);
  });

  // 6. Opening a goal does not mark it complete
  test("6. Opening or viewing a goal does not mark it complete", async () => {
    const { studentSession, t } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    // Student queries the goal
    const queried = await studentSession.query(api.microGoals.getEmotySuggestedGoal, {
      dateStr: "2026-10-03",
    });
    expect(queried?.completed).toBe(false);

    const doc = await t.run(async (ctx) => ctx.db.get(accepted.id as Id<"microGoals">));
    expect(doc?.completed).toBe(false);
  });

  // 7. Genuine completion marks it complete
  test("7. Genuine completion marks it complete with feelingAfter recorded", async () => {
    const { studentSession, t } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    const compRes = await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "better",
      dateStr: "2026-10-03",
    });
    expect(compRes.success).toBe(true);

    const doc = await t.run(async (ctx) => ctx.db.get(accepted.id as Id<"microGoals">));
    expect(doc?.completed).toBe(true);
    expect(doc?.completedAt).toBeDefined();
    expect(doc?.feelingAfter).toBe("better");
  });

  // 8. Completion is idempotent
  test("8. Completion is idempotent — repeated completions do not award extra XP", async () => {
    const { studentSession, studentId, t } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    const res1 = await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "same",
      dateStr: "2026-10-03",
    });
    expect(res1.success).toBe(true);

    const userAfterFirst = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    const xpAfterFirst = userAfterFirst?.xp || 0;

    // Second completion call on same goal
    const res2 = await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "better",
      dateStr: "2026-10-03",
    });
    expect(res2.success).toBe(false);

    const userAfterSecond = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    expect(userAfterSecond?.xp).toBe(xpAfterFirst);
  });

  // 9. XP is awarded according to existing rules
  test("9. XP and Coins are awarded according to existing rules (+10 XP / +10 Coins)", async () => {
    const { studentSession, studentId, t } = await setupPhase4TestEnvironment();

    const userBefore = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    const xpBefore = userBefore?.xp || 0;
    const coinsBefore = userBefore?.coins || 0;

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "better",
      dateStr: "2026-10-03",
    });

    const userAfter = await t.run(async (ctx) => ctx.db.get(studentId as Id<"users">));
    expect(userAfter?.xp).toBe(xpBefore + 10);
    expect(userAfter?.coins).toBe(coinsBefore + 10);
  });

  // 10. Calm Points include the completed goal
  test("10. Calm Points include the completed goal in student insights", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();

    const insightsBefore = await studentSession.query(api.insights.getDailyStats, {});
    const calmPointsBefore = insightsBefore.totalCalmPoints;

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "better",
      dateStr: "2026-10-03",
    });

    const insightsAfter = await studentSession.query(api.insights.getDailyStats, {});
    expect(insightsAfter.totalCalmPoints).toBe(calmPointsBefore + (accepted.points || 10));
  });

  // 11. Incomplete goal does not contribute to Calm Points
  test("11. Incomplete goal does not contribute to Calm Points", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();

    const insightsBefore = await studentSession.query(api.insights.getDailyStats, {});
    const calmPointsBefore = insightsBefore.totalCalmPoints;

    // Accept but do NOT complete
    await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    const insightsAfter = await studentSession.query(api.insights.getDailyStats, {});
    expect(insightsAfter.totalCalmPoints).toBe(calmPointsBefore);
  });

  // 12. Skipped goal does not contribute to Calm Points
  test("12. Skipped goal does not contribute to Calm Points", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();

    const insightsBefore = await studentSession.query(api.insights.getDailyStats, {});
    const calmPointsBefore = insightsBefore.totalCalmPoints;

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    await studentSession.mutation(api.microGoals.skipEmotyGoal, {
      id: accepted.id,
    });

    const insightsAfter = await studentSession.query(api.insights.getDailyStats, {});
    expect(insightsAfter.totalCalmPoints).toBe(calmPointsBefore);
  });

  // 13. Post-goal Emoty state appears after genuine completion
  test("13. Post-goal Emoty state reflects completion status", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "better",
      dateStr: "2026-10-03",
    });

    const postState = await studentSession.query(api.microGoals.getEmotySuggestedGoal, {
      dateStr: "2026-10-03",
    });

    expect(postState).not.toBeNull();
    // Either all completed or next uncompleted goal is active
    expect(["active", "all_completed"]).toContain(postState!.status);
  });

  // 14. Post-goal response does not create clinical data
  test("14. Post-goal response does not create clinical screening or triage records", async () => {
    const { studentSession, t } = await setupPhase4TestEnvironment();

    const initialScreenings = await t.run(async (ctx) => ctx.db.query("screenings").collect());
    const initialTriages = await t.run(async (ctx) => ctx.db.query("triages").collect());

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    await studentSession.mutation(api.microGoals.completeGoalWithFeeling, {
      id: accepted.id,
      feelingAfter: "harder",
      dateStr: "2026-10-03",
    });

    const postScreenings = await t.run(async (ctx) => ctx.db.query("screenings").collect());
    const postTriages = await t.run(async (ctx) => ctx.db.query("triages").collect());

    expect(postScreenings.length).toBe(initialScreenings.length);
    expect(postTriages.length).toBe(initialTriages.length);
  });

  // 15. Existing MicroGoal authorization remains intact
  test("15. Existing MicroGoal authorization allows student to access own goals", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    const todayGoals = await studentSession.query(api.microGoals.getTodayGoals, {
      dateStr: "2026-10-03",
    });
    expect(todayGoals.some((g: any) => g._id === accepted.id)).toBe(true);
  });

  // 16. Cross-user access is rejected
  test("16. Cross-user access is strictly rejected with Unauthorized", async () => {
    const { studentSession, otherSession } = await setupPhase4TestEnvironment();

    const accepted = await studentSession.mutation(api.microGoals.acceptEmotyGoal, {
      dateStr: "2026-10-03",
    });

    // Other user attempts to complete student's goal
    await expect(
      otherSession.mutation(api.microGoals.completeGoalWithFeeling, {
        id: accepted.id,
        feelingAfter: "better",
        dateStr: "2026-10-03",
      })
    ).rejects.toThrow("Unauthorized");

    // Other user attempts to skip student's goal
    await expect(
      otherSession.mutation(api.microGoals.skipEmotyGoal, {
        id: accepted.id,
      })
    ).rejects.toThrow("Unauthorized");
  });

  // 17. Existing deterministic cooldown remains intact
  test("17. Existing deterministic cooldown logic remains intact", () => {
    const selection = selectDailyRoutineGoalsDeterministically({
      userId: "test-user-cooldown",
      dateStr: "2026-10-03",
      cooldownDays: 7,
      assignedHistory: [
        { goalId: "water", createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, date: "2026-10-01" },
      ],
    });

    expect(selection.selectedSmall).toBeDefined();
    expect(selection.selectedSmall.length).toBe(2);
    // Cooldown filtered out water
    expect(selection.selectedSmall.some((g) => g.id === "water")).toBe(false);
  });

  // 18. Existing goal catalog remains intact
  test("18. Existing goal catalog tiers and counts remain intact", () => {
    expect(ROUTINE_HABIT_CATALOG.small.length).toBeGreaterThanOrEqual(5);
    expect(ROUTINE_HABIT_CATALOG.medium.length).toBeGreaterThanOrEqual(4);
    expect(ROUTINE_HABIT_CATALOG.large.length).toBeGreaterThanOrEqual(4);
    expect(ROUTINE_HABIT_CATALOG.challenge.length).toBeGreaterThanOrEqual(3);
  });

  // 19. No PHQ/GAD/PQ/triage dependency exists
  test("19. Goal recommendation contains zero clinical score dependencies", () => {
    const resA = selectDailyRoutineGoalsDeterministically({
      userId: "user-clean",
      dateStr: "2026-10-03",
    });
    // Signature requires only userId and dateStr; no clinical scores accepted or used
    expect(resA.allSelected.length).toBe(5);
  });

  // 20. Phase 3 emotion → intervention flow remains intact
  test("20. Phase 3 deterministic intervention routing remains intact", () => {
    const route = determineIntervention("Sad", 5);
    expect(route).toBeDefined();
    expect(route.interventionType).toBe("reframe");
    expect(route.targetRoute).toBe("/(auth)/tools/reframe");
  });

  // 21. Phase 3 post-intervention check remains intact
  test("21. Phase 3 post-intensity recording remains intact", async () => {
    const { studentSession, studentId, t } = await setupPhase4TestEnvironment();

    let logId: any;
    await t.run(async (ctx) => {
      logId = await ctx.db.insert("emotionLogs", {
        userId: studentId,
        emotion: "Sad",
        intensity: 7,
        bodyRegions: ["Chest"],
        selectedEmotions: ["Sad"],
        createdAt: Date.now(),
      });
    });

    const res = await studentSession.mutation(api.emotionLogs.recordPostIntensity, {
      logId: logId,
      postIntensity: 4,
    });
    expect(res).toBeDefined();

    const doc = await t.run(async (ctx) => ctx.db.get(logId as Id<"emotionLogs">));
    expect(doc?.postIntensity).toBe(4);
  });

  // 22. Phase 3A emotion hierarchy remains intact
  test("22. Phase 3A 4 primary emotions and descriptions remain intact", () => {
    expect(PRIMARY_EMOTIONS.length).toBe(4);
    const ids = PRIMARY_EMOTIONS.map((e) => e.id);
    expect(ids).toEqual(["happy", "sad", "angry", "calm"]);
  });

  // 23. Insights remains fixed
  test("23. Insights query executes cleanly and returns all metrics without crash", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();
    const insights = await studentSession.query(api.insights.getDailyStats, {});

    expect(insights).toBeDefined();
    expect(insights.recentDailyMood).toBeDefined();
    expect(insights.totalCalmPoints).toBeDefined();
    expect(insights.mindfulRelaxation).toBeDefined();
  });

  // 24. Verify no fabricated social-proof number is displayed
  test("24. Goal object contains no fabricated social-proof number", async () => {
    const { studentSession } = await setupPhase4TestEnvironment();
    const suggested = await studentSession.query(api.microGoals.getEmotySuggestedGoal, {
      dateStr: "2026-10-03",
    });

    expect((suggested as any)?.socialProofCount).toBeUndefined();
    expect((suggested as any)?.usersCount).toBeUndefined();
  });
});
