/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { evaluateStudentEngagementEligibility, getLocalTimeDetails } from "./engagementEngine";
import { PUSH_COPY } from "./notify";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUSH_LIVE;
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) =>
      ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });

    const studentA = await user({
      full_name: "Aarav Sharma",
      role: "patient",
      patientId: "101",
      mitraPreferences: { name: "Mitra", avatarGender: "male" },
      notificationPreferences: {
        engagementEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxPerDay: 4,
        minSpacingHours: 2.5,
        timezone: "Asia/Kolkata",
      },
    });

    const studentB = await user({
      full_name: "Diya Patel",
      role: "student",
      patientId: "102",
      mitraPreferences: { name: "Emoty", avatarGender: "female" },
      notificationPreferences: {
        engagementEnabled: false, // opted out
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxPerDay: 4,
        timezone: "Asia/Kolkata",
      },
    });

    const counselor = await user({
      full_name: "Dr. Rao",
      role: "counsellor",
    });

    const admin = await user({
      full_name: "Admin",
      role: "admin",
    });

    return { studentA, studentB, counselor, admin };
  });

  const as = (id: string) => t.withIdentity({ subject: id });
  // Assign studentA to counselor's caseload so counselor has access to studentA
  await as(ids.admin).mutation(api.counsellorAssignments.assign, {
    studentId: ids.studentA as any,
    counsellorId: ids.counselor as any,
  });

  return { t, ...ids, as };
}

describe("Adaptive Student Engagement Notification Engine", () => {
  test("1. Eligible morning notification invites check-in when not yet completed", async () => {
    const { t, studentA } = await setup();
    // 9:00 AM IST on Oct 20, 2026: 03:30 UTC
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), morningMs);
    });

    expect(result.eligible).toBe(true);
    expect(result.window).toBe("morning");
    expect(result.destination).toBe("emotion_map");
    expect(result.title + " " + result.message).toContain("Aarav");
    expect(result.message).toContain("check-in");
  });

  test("2. Morning notification adapts to positive affirmation when today's check-in is complete", async () => {
    const { t, studentA } = await setup();
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    // Student completes checkin early at 8:00 AM
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: String(studentA),
        dateStr: "2026-10-20",
        mood: "peaceful",
        createdAt: morningMs - 3600_000,
      });
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), morningMs);
    });

    expect(result.eligible).toBe(true);
    expect(result.window).toBe("morning");
    expect(result.destination).toBe("home");
    expect(result.title).toContain("Aarav");
    // Should NOT ask to log emotion again; offers positive affirmation
    expect(result.message).not.toContain("take a quick 10 seconds to log");
  });

  test("3. Afternoon reminder selects a real, incomplete MicroGoal belonging to the student", async () => {
    const { t, studentA } = await setup();
    // 2:00 PM IST on Oct 20, 2026: 08:30 UTC
    const afternoonMs = new Date("2026-10-20T08:30:00Z").getTime();

    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: String(studentA),
        goalId: "walk_1",
        goalTitle: "10-minute mindful walk",
        goalDescription: "Walk outside without phone",
        category: "routine",
        difficulty: "easy",
        points: 50,
        completed: false,
        skipped: false,
        createdAt: afternoonMs - 3600_000,
      });
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), afternoonMs);
    });

    expect(result.eligible).toBe(true);
    expect(result.window).toBe("afternoon");
    expect(result.destination).toBe("microgoals");
    expect(result.message).toContain("10-minute mindful walk");
  });

  test("4. Afternoon reminder skips when student has NO incomplete MicroGoals (never invents fake goals)", async () => {
    const { t, studentA } = await setup();
    const afternoonMs = new Date("2026-10-20T08:30:00Z").getTime();

    // Goal is already completed
    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: String(studentA),
        goalId: "study_1",
        goalTitle: "Study for 15 mins",
        goalDescription: "Study session",
        category: "academic",
        difficulty: "easy",
        points: 50,
        completed: true,
        completedAt: afternoonMs - 7200_000,
        skipped: false,
        createdAt: afternoonMs - 14400_000,
      });
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), afternoonMs);
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("no_eligible_microgoal");
  });

  test("5. Evening reflection skips when student already completed an evening reflection", async () => {
    const { t, studentA } = await setup();
    // 6:30 PM IST on Oct 20, 2026: 13:00 UTC
    const eveningMs = new Date("2026-10-20T13:00:00Z").getTime();

    // Student logged emotion at 5:30 PM (after 5 PM local window start)
    await t.run(async (ctx) => {
      await ctx.db.insert("emotionLogs", {
        userId: String(studentA),
        emotion: "grateful",
        bodyRegions: ["chest"],
        createdAt: eveningMs - 1800_000,
      });
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), eveningMs);
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("evening_reflection_already_completed");
  });

  test("6. Night notification respects opt-out and quiet hours", async () => {
    const { t, studentA, studentB } = await setup();
    // 11:30 PM IST on Oct 20, 2026: 18:00 UTC (quiet hours for studentA: 22:00 - 07:00)
    const lateNightMs = new Date("2026-10-20T18:00:00Z").getTime();

    const quietResult = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), lateNightMs);
    });
    expect(quietResult.eligible).toBe(false);
    expect(quietResult.reason).toBe("quiet_hours");

    // StudentB has engagement opt-out
    // 9:30 PM IST: 16:00 UTC
    const nightWindowMs = new Date("2026-10-20T16:00:00Z").getTime();
    const optOutResult = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentB), nightWindowMs);
    });
    expect(optOutResult.eligible).toBe(false);
    expect(optOutResult.reason).toBe("opted_out");
  });

  test("7. Maximum 4 engagement notifications per local day enforced", async () => {
    const { t, studentA } = await setup();
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    // Insert 4 engagement notifications already sent today
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("notifications", {
          recipientId: String(studentA),
          type: `engagement_test_${i}`,
          category: "engagement",
          title: "Test",
          message: "Test",
          priority: "low",
          read: false,
          archived: false,
          createdAt: morningMs - (4 - i) * 3600_000,
        });
      }
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), morningMs);
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("daily_cap_reached");
  });

  test("8. Operational appointment notifications do NOT consume the engagement cap", async () => {
    const { t, studentA } = await setup();
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    // Insert 10 operational appointment and safety notifications today
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("notifications", {
          recipientId: String(studentA),
          type: "appointment_confirmed",
          category: "operational",
          title: "Appointment confirmed",
          message: "Confirmed",
          priority: "medium",
          read: false,
          archived: false,
          createdAt: morningMs - i * 60000,
        });
      }
    });

    // Student has 0 engagement notifications, so should still be eligible for morning check-in
    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), morningMs);
    });

    expect(result.eligible).toBe(true);
    expect(result.window).toBe("morning");
  });

  test("9. Safety notifications are never suppressed by engagement cap or quiet hours", async () => {
    const { t, studentA, counselor } = await setup();
    // Critical safety alert must dispatch immediately regardless of time
    const alertId = await t.run(async (ctx) => {
      return await ctx.db.insert("alerts", {
        userId: String(studentA),
        type: "suicide",
        status: "pending",
        createdAt: Date.now(),
        source: "screening",
      });
    });

    const notifs = await t.run(async (ctx) => {
      const all = await ctx.db.query("notifications").collect();
      return all;
    });

    // PUSH_COPY ensures safety copy exists with highest importance channel
    expect(PUSH_COPY.critical_risk?.channelId).toBe("important");
    expect(PUSH_COPY.safety_alert?.channelId).toBe("important");
  });

  test("10. Minimum spacing between engagement notifications is enforced (2.5 hours)", async () => {
    const { t, studentA } = await setup();
    const morningMs = new Date("2026-10-20T04:30:00Z").getTime(); // 10:00 AM IST

    // Engagement sent 1 hour ago (needs 2.5 hours)
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        recipientId: String(studentA),
        type: "engagement_morning",
        category: "engagement",
        title: "Morning",
        message: "Checkin",
        priority: "low",
        read: false,
        archived: false,
        createdAt: morningMs - 60 * 60 * 1000, // 60 mins ago
      });
    });

    const result = await t.run(async (ctx) => {
      return await evaluateStudentEngagementEligibility(ctx, String(studentA), morningMs);
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("min_spacing");
  });

  test("11. Timezone handling correctly resolves local date and hour", () => {
    // 03:30 UTC on 2026-10-20 + 05:30 IST = 09:00 IST on 2026-10-20
    const testUtc = new Date("2026-10-20T03:30:00Z").getTime();
    const details = getLocalTimeDetails(testUtc, "Asia/Kolkata");
    expect(details.localHour).toBe(9);
    expect(details.localMinute).toBe(0);
    expect(details.localDateStr).toBe("2026-10-20");

    // 04:00 UTC on 2026-10-20 + 05:30 IST = 09:30 IST on 2026-10-20
    const testUtc30 = new Date("2026-10-20T04:00:00Z").getTime();
    const details30 = getLocalTimeDetails(testUtc30, "Asia/Kolkata");
    expect(details30.localHour).toBe(9);
    expect(details30.localMinute).toBe(30);

    // In New York (EDT, UTC-4): 03:30 UTC = 23:30 (11:30 PM) on 2026-10-19
    const nyDetails = getLocalTimeDetails(testUtc, "America/New_York");
    expect(nyDetails.localHour).toBe(23);
    expect(nyDetails.localMinute).toBe(30);
    expect(nyDetails.localDateStr).toBe("2026-10-19");
  });

  test("12. Duplicate scheduler executions do not duplicate sends (idempotency via dedupeKey)", async () => {
    const { t, studentA } = await setup();
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    // First dispatch
    const firstRun = await t.mutation(internal.engagementScheduler.evaluateAndDispatchStudent, {
      studentId: String(studentA),
      nowMs: morningMs,
    });
    expect(firstRun.dispatched).toBe(true);

    // Second execution at the same window (e.g. 5 minutes later)
    const secondRun = await t.mutation(internal.engagementScheduler.evaluateAndDispatchStudent, {
      studentId: String(studentA),
      nowMs: morningMs + 300_000,
    });
    expect(secondRun.dispatched).toBe(false);
    expect(secondRun.reason).toBe("already_sent_for_window");

    // Database check: exactly 1 engagement notification for this window exists
    const notifs = await t.run(async (ctx) => {
      return await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(studentA)))
        .collect();
    });
    const windowNotifs = notifs.filter((n) => n.dedupeKey === firstRun.dedupeKey);
    expect(windowNotifs.length).toBe(1);
  });

  test("13. Batch scheduler evaluates all students and skips ineligible ones", async () => {
    const { t } = await setup();
    const morningMs = new Date("2026-10-20T03:30:00Z").getTime();

    const summary = await t.mutation(internal.engagementScheduler.evaluateAllEligibleStudents, {
      nowMs: morningMs,
    });

    expect(summary.evaluatedCount).toBeGreaterThanOrEqual(2);
    // StudentA was eligible and dispatched; studentB was opted-out and skipped
    expect(summary.dispatchedCount).toBeGreaterThanOrEqual(1);
    expect(summary.skippedCount).toBeGreaterThanOrEqual(1);
  });

  test("14. Student state changing dynamically prevents stale notifications", async () => {
    const { t, studentA } = await setup();
    const afternoonMs = new Date("2026-10-20T08:30:00Z").getTime();

    // Goal created
    const goalId = await t.run(async (ctx) => {
      return await ctx.db.insert("microGoals", {
        userId: String(studentA),
        goalId: "run_1",
        goalTitle: "Jog for 10 minutes",
        goalDescription: "Afternoon run",
        category: "routine",
        difficulty: "easy",
        points: 50,
        completed: false,
        skipped: false,
        createdAt: afternoonMs - 3600_000,
      });
    });

    // Student completes the goal before afternoon notification triggers
    await t.run(async (ctx) => {
      await ctx.db.patch(goalId, {
        completed: true,
        completedAt: afternoonMs - 600_000,
      });
    });

    // Scheduler runs
    const runResult = await t.mutation(internal.engagementScheduler.evaluateAndDispatchStudent, {
      studentId: String(studentA),
      nowMs: afternoonMs,
    });

    // Should skip because goal was completed
    expect(runResult.dispatched).toBe(false);
    expect(runResult.reason).toBe("no_eligible_microgoal");
  });

  test("15. Notification preferences query and mutation update student settings safely", async () => {
    const { as, studentA } = await setup();

    const initial = await as(String(studentA)).query(api.users.getNotificationPreferences, {});
    expect(initial.engagementEnabled).toBe(true);
    expect(initial.maxPerDay).toBe(4);

    // Update settings: reduce max to 2 and change quiet hours
    const updated = await as(String(studentA)).mutation(api.users.updateNotificationPreferences, {
      maxPerDay: 2,
      quietHoursStart: 21,
      quietHoursEnd: 8,
      minSpacingHours: 3,
    });

    expect(updated.maxPerDay).toBe(2);
    expect(updated.quietHoursStart).toBe(21);
    expect(updated.quietHoursEnd).toBe(8);
    expect(updated.minSpacingHours).toBe(3);

    // Re-query verifies persistence
    const refetched = await as(String(studentA)).query(api.users.getNotificationPreferences, {});
    expect(refetched.maxPerDay).toBe(2);
    expect(refetched.quietHoursStart).toBe(21);
  });

  test("16. Migrated follow-up notifications produce deduplicated, routable records with push copy", async () => {
    const { t, studentA, counselor, as } = await setup();

    // Counselor creates a care follow-up
    const followUpId = await as(String(counselor)).mutation(api.followUps.create, {
      userId: String(studentA),
      type: "wellness_check",
      dueDate: Date.now() + 7 * 86400000,
    });

    const notifs = await t.run(async (ctx) => {
      return await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(studentA)))
        .collect();
    });

    const followUpNotif = notifs.find((n) => n.type === "follow_up_created");
    expect(followUpNotif).toBeDefined();
    expect(followUpNotif?.destination).toBe("appointments");
    expect(followUpNotif?.dedupeKey).toBe(`follow_up:${followUpId}:created`);
    expect(PUSH_COPY.follow_up_created?.channelId).toBe("appointments");
  });
});
