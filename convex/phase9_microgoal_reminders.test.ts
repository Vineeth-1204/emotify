/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MICROGOAL_REMINDER_COPY } from "../common/routinesCatalogue";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 9: MicroGoal Reminders, Rewards and Weekly Reinforcement", () => {
  describe("60-Minute Reminders Lifecycle", () => {
    test("P9-01: MicroGoal reminder copy and authoritative content", () => {
      expect(MICROGOAL_REMINDER_COPY.sixtyMinuteNudges).toContain(
        "It's okay — try now for just 2 minutes. Small steps count."
      );
      expect(MICROGOAL_REMINDER_COPY.endOfDaySoftClose).toContain(
        "tomorrow's a fresh start. 🌱"
      );
      expect(MICROGOAL_REMINDER_COPY.notificationTitle).toBe(
        "Emoty • Small steps count"
      );
    });

    test("P9-02: Goal does not receive reminder before 60 minutes have elapsed", async () => {
      const t = convexTest(schema, modules);
      const nowMs = 1700000000000;

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "MicroGoal Student 1",
          email: "mg1@school.edu",
          role: "patient",
          status: "active",
          createdAt: nowMs - 100000,
          notificationPreferences: {
            microGoalReminderEnabled: true,
            engagementEnabled: true,
            timezone: "UTC",
            quietHoursStart: 23,
            quietHoursEnd: 6,
          },
        });
      });

      // Goal created 45 minutes ago
      await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA01",
          goalTitle: "Drink a warm cup of water",
          goalDescription: "Take small sips of warm water",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: nowMs - 45 * 60 * 1000,
        });
      });

      // Run evaluator at nowMs (12:00 UTC)
      const res = await t.mutation(
        internal.routines.evaluateMicroGoalReminders,
        { nowMs }
      );
      expect(res.evaluatedCount).toBe(0);
      expect(res.sentCount).toBe(0);
    });

    test("P9-03: Incomplete goal receives reminder at >= 60 minutes with deduplication", async () => {
      const t = convexTest(schema, modules);
      const nowMs = new Date("2026-10-21T12:00:00Z").getTime();

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "MicroGoal Student 2",
          email: "mg2@school.edu",
          role: "patient",
          status: "active",
          createdAt: nowMs - 200000,
          notificationPreferences: {
            microGoalReminderEnabled: true,
            engagementEnabled: true,
            timezone: "UTC",
            quietHoursStart: 23,
            quietHoursEnd: 6,
          },
        });
      });

      // Goal created 65 minutes ago
      const goalDocId = await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA02",
          goalTitle: "Step outside for 2 minutes",
          goalDescription: "Look at the sky and notice the fresh air",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: nowMs - 65 * 60 * 1000,
        });
      });

      // Run evaluator at nowMs
      const res1 = await t.mutation(
        internal.routines.evaluateMicroGoalReminders,
        { nowMs }
      );
      expect(res1.evaluatedCount).toBe(1);
      expect(res1.sentCount).toBe(1);

      // Verify goal reminder status was updated
      const updatedGoal = await t.run(async (ctx) => {
        return await ctx.db.get(goalDocId);
      });
      expect(updatedGoal?.reminderStatus).toBe("nudged_60m");
      expect(updatedGoal?.nudgeSentAt).toBe(nowMs);

      // Verify notification was created with privacy-preserving copy
      const notifications = await t.run(async (ctx) => {
        return await ctx.db
          .query("notifications")
          .withIndex("by_recipientId", (q) => q.eq("recipientId", studentId))
          .collect();
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Emoty • Small steps count");
      expect(notifications[0].message).toContain("try now for just 2 minutes");
      expect(notifications[0].dedupeKey).toBe(`microgoal_60m:${goalDocId}`);

      // Second evaluator run is completely idempotent (no duplicate notification)
      const res2 = await t.mutation(
        internal.routines.evaluateMicroGoalReminders,
        { nowMs: nowMs + 10 * 60 * 1000 }
      );
      expect(res2.sentCount).toBe(0);
    });

    test("P9-04: Completed and skipped goals do NOT receive reminder", async () => {
      const t = convexTest(schema, modules);
      const nowMs = new Date("2026-10-21T12:00:00Z").getTime();

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "MicroGoal Student 3",
          email: "mg3@school.edu",
          role: "patient",
          status: "active",
          createdAt: nowMs - 200000,
          notificationPreferences: {
            microGoalReminderEnabled: true,
            engagementEnabled: true,
            timezone: "UTC",
          },
        });
      });

      // 1 Completed goal (>60m)
      await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA01",
          goalTitle: "Completed Goal",
          goalDescription: "Already finished",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: true,
          skipped: false,
          createdAt: nowMs - 70 * 60 * 1000,
        });
      });

      // 1 Skipped goal (>60m)
      await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA02",
          goalTitle: "Skipped Goal",
          goalDescription: "Already skipped",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: true,
          createdAt: nowMs - 75 * 60 * 1000,
        });
      });

      const res = await t.mutation(
        internal.routines.evaluateMicroGoalReminders,
        { nowMs }
      );
      expect(res.evaluatedCount).toBe(0);
      expect(res.sentCount).toBe(0);
    });

    test("P9-05: Quiet hours suppress microgoal reminders", async () => {
      const t = convexTest(schema, modules);
      // 23:30 UTC is inside quiet hours (22:00 - 07:00)
      const quietNowMs = new Date("2026-10-21T23:30:00Z").getTime();

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "MicroGoal Student 4",
          email: "mg4@school.edu",
          role: "patient",
          status: "active",
          createdAt: quietNowMs - 200000,
          notificationPreferences: {
            microGoalReminderEnabled: true,
            engagementEnabled: true,
            timezone: "UTC",
            quietHoursStart: 22,
            quietHoursEnd: 7,
          },
        });
      });

      await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA03",
          goalTitle: "Late Night Goal",
          goalDescription: "Goal near midnight",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: quietNowMs - 65 * 60 * 1000,
        });
      });

      const res = await t.mutation(
        internal.routines.evaluateMicroGoalReminders,
        { nowMs: quietNowMs }
      );
      expect(res.sentCount).toBe(0);
      expect(res.skippedCount).toBe(1);
    });
  });

  describe("Reward Consistency and Server-Side Idempotency", () => {
    test("P9-06: Completing a MicroGoal awards +1 Calm Point idempotently", async () => {
      const t = convexTest(schema, modules);
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Reward Student",
          email: "reward@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const goalDocId = await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA04",
          goalTitle: "Take a sip of water",
          goalDescription: "Hydrate yourself gently",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });

      // First completion
      const completeRes1 = await asStudent.mutation(api.microGoals.completeSymptomGoal, {
        id: goalDocId,
        feelingAfter: "great",
      });
      expect(completeRes1.success).toBe(true);
      expect(completeRes1.calmPointsAwarded).toBe(1);

      // Verify Calm Points in user stats
      const statsAfterFirst = await asStudent.query(
        api.microGoals.getGamificationStats,
        {}
      );
      expect(statsAfterFirst?.coins).toBe(1);

      // Attempt duplicate completion on same goal
      const completeRes2 = await asStudent.mutation(api.microGoals.completeSymptomGoal, {
        id: goalDocId,
        feelingAfter: "great",
      });
      expect(completeRes2.success).toBe(true);
      expect(completeRes2.alreadyCompleted).toBe(true);
      expect(completeRes2.calmPointsAwarded).toBe(0); // Idempotent: 0 additional points

      // Balance remains strictly 1
      const statsAfterSecond = await asStudent.query(
        api.microGoals.getGamificationStats,
        {}
      );
      expect(statsAfterSecond?.coins).toBe(1);
    });

    test("P9-07: Skipping a goal is penalty-free and awards 0 points", async () => {
      const t = convexTest(schema, modules);
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Skip Student",
          email: "skip@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const goalDocId = await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA05",
          goalTitle: "Goal to skip",
          goalDescription: "Optional activity",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });

      const skipRes = await asStudent.mutation(api.microGoals.skipSymptomGoal, {
        id: goalDocId,
      });
      expect(skipRes.success).toBe(true);

      const stats = await asStudent.query(
        api.microGoals.getGamificationStats,
        {}
      );
      expect(stats?.coins).toBe(0); // No points, no negative deduction
    });

    test("P9-08: Student cannot complete another student's goal (authorization boundary)", async () => {
      const t = convexTest(schema, modules);
      const studentA = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Student A",
          email: "a@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const studentB = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Student B",
          email: "b@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const goalOfA = await t.run(async (ctx) => {
        return await ctx.db.insert("microGoals", {
          userId: studentA,
          goalId: "PA01",
          goalTitle: "A's Private Goal",
          goalDescription: "Private task",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const asStudentB = t.withIdentity({ subject: studentB });

      // Student B attempts to complete Student A's goal
      await expect(
        asStudentB.mutation(api.microGoals.completeSymptomGoal, {
          id: goalOfA,
          feelingAfter: "good",
        })
      ).rejects.toThrow();
    });
  });

  describe("Weekly Summary and Modelling", () => {
    test("P9-09: Weekly summary handles empty history gracefully", async () => {
      const t = convexTest(schema, modules);
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "New Student",
          email: "new@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });
      const summary = await asStudent.query(
        api.microGoals.getSymptomWeeklySummary,
        { userId: studentId }
      );

      expect(summary.goalsAssigned).toBe(0);
      expect(summary.goalsCompleted).toBe(0);
      expect(summary.goalsSkipped).toBe(0);
      expect(summary.calmPointsEarned).toBe(0);
      expect(summary.avgIntensityDrop).toBe(0);
      expect(summary.modelingMessage).toBeDefined();
    });

    test("P9-10: Weekly summary computes authoritative intensity drop trends", async () => {
      const t = convexTest(schema, modules);
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Active Student",
          email: "active@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      // Insert 2 completed goals with pre and post intensity ratings
      await t.run(async (ctx) => {
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA01",
          goalTitle: "Goal 1 with pre/post",
          goalDescription: "Test goal 1",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: true,
          skipped: false,
          preIntensity: 7,
          postIntensity: 4,
          intensityDrop: 3, // Drop of 3
          createdAt: Date.now() - 24 * 60 * 60 * 1000,
          completedAt: Date.now() - 23 * 60 * 60 * 1000,
        });

        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "PA02",
          goalTitle: "Goal 2 with pre/post",
          goalDescription: "Test goal 2",
          category: "PA",
          difficulty: "easy",
          points: 1,
          completed: true,
          skipped: false,
          preIntensity: 6,
          postIntensity: 4,
          intensityDrop: 2, // Drop of 2
          createdAt: Date.now() - 12 * 60 * 60 * 1000,
          completedAt: Date.now() - 11 * 60 * 60 * 1000,
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });
      const summary = await asStudent.query(
        api.microGoals.getSymptomWeeklySummary,
        { userId: studentId }
      );

      expect(summary.goalsAssigned).toBe(2);
      expect(summary.goalsCompleted).toBe(2);
      expect(summary.calmPointsEarned).toBe(2);
      expect(summary.avgIntensityDrop).toBe(2.5); // (3 + 2) / 2 = 2.5
    });
  });
});
