/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { parseLocalDateNoon, getSevenDayLocalWindow } from "../utils/date";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 4: Mood Visualization, Mindful Relaxation Telemetry & Timezone", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    let studentBId = "";
    let counselorId = "";

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student A",
        mobile_number: "9876543211",
        role: "patient",
        status: "active",
        patientId: "PAT-P11-A",
        xp: 100,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student B",
        mobile_number: "9876543212",
        role: "patient",
        status: "active",
        patientId: "PAT-P11-B",
        xp: 100,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor",
        mobile_number: "9876543213",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, studentAId, studentBId, counselorId };
  }

  // =========================================================================
  // 1. MOOD VISUALIZATION & STRICT 7-CALENDAR-DAY WINDOW
  // =========================================================================
  describe("Mood Categorical Visualization & 7-Day Window", () => {
    test("P11-MOOD-01: recentDailyMood contains categorical mood values and no numeric intensity field", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-10-02",
          mood: "good",
          createdAt: Date.now(),
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood).toBeDefined();
      expect(stats.recentDailyMood.length).toBe(7);

      const checkedInEntry = stats.recentDailyMood.find((d) => d.hasCheckin);
      expect(checkedInEntry).toBeDefined();
      expect(checkedInEntry?.mood).toBe("good");
      // Assert NO numeric intensity field exists on any entry
      for (const entry of stats.recentDailyMood) {
        expect((entry as any).intensity).toBeUndefined();
      }
    });

    test("P11-MOOD-02: A sparse history does NOT produce a seven-record window; result represents seven calendar dates", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Sparse check-ins spanning weeks/months (e.g. Sep 1, Sep 12, Sep 28)
      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-01",
          mood: "low",
          createdAt: 1000,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-12",
          mood: "calm",
          createdAt: 2000,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-28",
          mood: "good",
          createdAt: 3000,
        });
      });

      // Query with reference date Sep 28
      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-09-28",
      });

      // Window must be exactly 7 calendar dates: Sep 22 through Sep 28
      expect(stats.recentDailyMood.length).toBe(7);
      expect(stats.recentDailyMood[0].dateStr).toBe("2026-09-22");
      expect(stats.recentDailyMood[6].dateStr).toBe("2026-09-28");

      // Older check-ins outside the 7-day window (Sep 1, Sep 12) must NOT be included in recentDailyMood
      const includedDates = stats.recentDailyMood.map((d) => d.dateStr);
      expect(includedDates).not.toContain("2026-09-01");
      expect(includedDates).not.toContain("2026-09-12");
      expect(includedDates).toContain("2026-09-28");
    });

    test("P11-MOOD-03: Missing days are represented as hasCheckin: false, mood: null", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-10-02",
          mood: "calm",
          createdAt: Date.now(),
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      const missingEntries = stats.recentDailyMood.filter((d) => !d.hasCheckin);
      expect(missingEntries.length).toBe(6);
      for (const entry of missingEntries) {
        expect(entry.hasCheckin).toBe(false);
        expect(entry.mood).toBeNull();
        expect(entry.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      const activeEntry = stats.recentDailyMood.find((d) => d.hasCheckin);
      expect(activeEntry?.hasCheckin).toBe(true);
      expect(activeEntry?.mood).toBe("calm");
      expect(activeEntry?.dateStr).toBe("2026-10-02");
    });

    test("P11-MOOD-04: No numeric mood interpolation is performed", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Check in on day 1 (Sep 24) and day 7 (Sep 30)
      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-24",
          mood: "good",
          createdAt: 100,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-30",
          mood: "heavy",
          createdAt: 200,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-09-30",
      });

      // Intermediate days (Sep 25, 26, 27, 28, 29) must NOT be given interpolated values or synthetic numbers
      const intermediateDays = stats.recentDailyMood.slice(1, 6);
      expect(intermediateDays.length).toBe(5);
      for (const day of intermediateDays) {
        expect(day.hasCheckin).toBe(false);
        expect(day.mood).toBeNull();
        expect((day as any).intensity).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 2. BREATHING TELEMETRY
  // =========================================================================
  describe("Breathing Telemetry Integration", () => {
    test("P11-TELEMETRY-01: Completed breathing sessions count toward mindful relaxation", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "self_initiated",
          startedAt: 1000,
          completedAt: 1240,
          durationSeconds: 240, // 4 mins
          cyclesCompleted: 4,
          targetCycles: 4,
          status: "completed",
          createdAt: 1240,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(1);
      expect(stats.mindfulRelaxation.breakdown.breathing.minutes).toBe(4);
    });

    test("P11-TELEMETRY-02: Abandoned breathing sessions do not count", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "calming_434",
          protocolName: "Calming Breath",
          sourceType: "self_initiated",
          startedAt: 1000,
          durationSeconds: 60,
          cyclesCompleted: 1,
          targetCycles: 4,
          status: "abandoned",
          createdAt: 1060,
        });
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "self_initiated",
          startedAt: 2000,
          completedAt: 2180,
          durationSeconds: 180, // 3 mins
          cyclesCompleted: 3,
          targetCycles: 3,
          status: "completed",
          createdAt: 2180,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      // Only the completed session counts
      expect(stats.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(1);
      expect(stats.mindfulRelaxation.breakdown.breathing.minutes).toBe(3);
    });

    test("P11-TELEMETRY-03: Breathing duration aggregation is correct", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // Session 1: 300s = 5m
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "routine",
          startedAt: 1000,
          completedAt: 1300,
          durationSeconds: 300,
          cyclesCompleted: 5,
          targetCycles: 5,
          status: "completed",
          createdAt: 1300,
        });
        // Session 2: 420s = 7m
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "relaxing_478",
          protocolName: "4-7-8 Breathing",
          sourceType: "self_initiated",
          startedAt: 2000,
          completedAt: 2420,
          durationSeconds: 420,
          cyclesCompleted: 4,
          targetCycles: 4,
          status: "completed",
          createdAt: 2420,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(2);
      expect(stats.mindfulRelaxation.breakdown.breathing.minutes).toBe(12); // (300+420)/60 = 12m
    });
  });

  // =========================================================================
  // 3. GROUNDING TELEMETRY
  // =========================================================================
  describe("Grounding Telemetry Integration", () => {
    test("P11-TELEMETRY-04: Completed grounding sessions count toward mindful relaxation", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Sensory Grounding",
          sourceType: "self_initiated",
          startedAt: 1000,
          completedAt: 1300,
          durationSeconds: 300, // 5 mins
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 1300,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(1);
      expect(stats.mindfulRelaxation.breakdown.grounding.minutes).toBe(5);
    });

    test("P11-TELEMETRY-05: Abandoned or partial grounding sessions do not count", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // Abandoned
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "self_initiated",
          startedAt: 1000,
          durationSeconds: 120,
          stepsCompleted: 2,
          totalSteps: 5,
          status: "abandoned",
          createdAt: 1120,
        });
        // Incomplete steps (3/5) marked completed falsely
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "self_initiated",
          startedAt: 2000,
          completedAt: 2180,
          durationSeconds: 180,
          stepsCompleted: 3,
          totalSteps: 5,
          status: "completed",
          createdAt: 2180,
        });
        // Truly completed (5/5)
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "self_initiated",
          startedAt: 3000,
          completedAt: 3360,
          durationSeconds: 360, // 6 mins
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 3360,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      // Only the truly completed 5/5 session counts
      expect(stats.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(1);
      expect(stats.mindfulRelaxation.breakdown.grounding.minutes).toBe(6);
    });

    test("P11-TELEMETRY-06: Grounding duration aggregation is correct", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "cbt_support",
          startedAt: 1000,
          completedAt: 1240,
          durationSeconds: 240, // 4 mins
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 1240,
        });
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "micro_goal",
          startedAt: 2000,
          completedAt: 2360,
          durationSeconds: 360, // 6 mins
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 2360,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(2);
      expect(stats.mindfulRelaxation.breakdown.grounding.minutes).toBe(10); // (240+360)/60 = 10m
    });
  });

  // =========================================================================
  // 4. MINDFUL RELAXATION COMBINED AGGREGATION
  // =========================================================================
  describe("Mindful Relaxation Combined Aggregation", () => {
    test("P11-RELAX-01: JPMR + breathing + grounding minutes are combined correctly", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // JPMR: 600s = 10m
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 7,
          postIntensity: 4,
          durationSeconds: 600,
          createdAt: 1000,
        });
        // Breathing: 300s = 5m
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "self_initiated",
          startedAt: 2000,
          completedAt: 2300,
          durationSeconds: 300,
          cyclesCompleted: 4,
          targetCycles: 4,
          status: "completed",
          createdAt: 2300,
        });
        // Grounding: 480s = 8m
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "5-4-3-2-1 Grounding",
          sourceType: "self_initiated",
          startedAt: 3000,
          completedAt: 3480,
          durationSeconds: 480,
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 3480,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      // JPMR: 10m, Breathing: 5m, Grounding: 8m -> Total: 23m
      expect(stats.jpmrMinutes).toBe(10);
      expect(stats.mindfulRelaxation.breakdown.jpmr.minutes).toBe(10);
      expect(stats.mindfulRelaxation.breakdown.breathing.minutes).toBe(5);
      expect(stats.mindfulRelaxation.breakdown.grounding.minutes).toBe(8);
      expect(stats.mindfulRelaxation.totalMinutes).toBe(23);
    });

    test("P11-RELAX-02: JPMR + breathing + grounding session counts are combined correctly", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // 2 JPMR sessions
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 6,
          postIntensity: 3,
          durationSeconds: 300,
          createdAt: 100,
        });
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 8,
          postIntensity: 5,
          durationSeconds: 300,
          createdAt: 200,
        });
        // 1 Breathing session
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "routine",
          startedAt: 1000,
          completedAt: 1200,
          durationSeconds: 200,
          cyclesCompleted: 4,
          targetCycles: 4,
          status: "completed",
          createdAt: 1200,
        });
        // 2 Grounding sessions
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "Grounding 1",
          sourceType: "self_initiated",
          startedAt: 2000,
          completedAt: 2180,
          durationSeconds: 180,
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 2180,
        });
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "Grounding 2",
          sourceType: "self_initiated",
          startedAt: 3000,
          completedAt: 3180,
          durationSeconds: 180,
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 3180,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.breakdown.jpmr.sessionsCompleted).toBe(2);
      expect(stats.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(1);
      expect(stats.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(2);
      expect(stats.mindfulRelaxation.totalSessions).toBe(5);
    });

    test("P11-RELAX-03: No double-counting occurs across intervention types", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // Exactly 1 of each
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 5,
          postIntensity: 2,
          durationSeconds: 300, // 5m
          createdAt: 100,
        });
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "self_initiated",
          startedAt: 200,
          completedAt: 440,
          durationSeconds: 240, // 4m
          cyclesCompleted: 4,
          targetCycles: 4,
          status: "completed",
          createdAt: 440,
        });
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "Grounding",
          sourceType: "self_initiated",
          startedAt: 500,
          completedAt: 860,
          durationSeconds: 360, // 6m
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 860,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      const breakdownSum =
        stats.mindfulRelaxation.breakdown.jpmr.minutes +
        stats.mindfulRelaxation.breakdown.breathing.minutes +
        stats.mindfulRelaxation.breakdown.grounding.minutes;

      expect(stats.mindfulRelaxation.totalMinutes).toBe(breakdownSum);
      expect(stats.mindfulRelaxation.totalMinutes).toBe(15);
      expect(stats.mindfulRelaxation.totalSessions).toBe(3);
    });
  });

  // =========================================================================
  // 5. AUTHORIZATION & TENANT ISOLATION
  // =========================================================================
  describe("Authorization & Cross-Student Privacy", () => {
    test("P11-AUTH-01: A student cannot obtain another student's breathing/grounding telemetry through Student Insights", async () => {
      const { t, studentAId, studentBId } = await setupTestEnvironment();
      const sessionB = t.withIdentity({ subject: studentBId });

      // Student A has telemetry
      await t.run(async (ctx) => {
        await ctx.db.insert("breathingLogs", {
          userId: studentAId,
          protocolId: "box_4444",
          protocolName: "Box Breathing",
          sourceType: "self_initiated",
          startedAt: 100,
          completedAt: 400,
          durationSeconds: 300,
          cyclesCompleted: 5,
          targetCycles: 5,
          status: "completed",
          createdAt: 400,
        });
        await ctx.db.insert("groundingLogs", {
          userId: studentAId,
          protocolId: "sensory_54321",
          protocolName: "Sensory Grounding",
          sourceType: "self_initiated",
          startedAt: 500,
          completedAt: 800,
          durationSeconds: 300,
          stepsCompleted: 5,
          totalSteps: 5,
          status: "completed",
          createdAt: 800,
        });
      });

      // Student B queries Student A's insights -> MUST BE REJECTED
      await expect(
        sessionB.query(api.insights.getDailyStats, { userId: studentAId })
      ).rejects.toThrow();

      // Student B queries own insights -> must show 0 minutes, not Student A's
      const statsB = await sessionB.query(api.insights.getDailyStats, { userId: studentBId });
      expect(statsB.mindfulRelaxation.totalMinutes).toBe(0);
      expect(statsB.mindfulRelaxation.totalSessions).toBe(0);
      expect(statsB.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(0);
      expect(statsB.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(0);
    });
  });

  // =========================================================================
  // 6. TIMEZONE & LOCAL CALENDAR
  // =========================================================================
  describe("Timezone & Calendar Boundary Hardening", () => {
    test("P11-TIMEZONE-01: Local YYYY-MM-DD is interpreted without UTC day shift", () => {
      const parsed = parseLocalDateNoon("2026-10-02");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(9); // 0-indexed October
      expect(parsed.getDate()).toBe(2);
      expect(parsed.getHours()).toBe(12); // Anchored at local noon
    });

    test("P11-TIMEZONE-02: Seven calendar dates remain correct across month boundaries", () => {
      const dates = getSevenDayLocalWindow("2026-10-03");
      expect(dates.length).toBe(7);
      expect(dates).toEqual([
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
      ]);
    });

    test("P11-TIMEZONE-03: Seven calendar dates remain correct across year boundaries", () => {
      const dates = getSevenDayLocalWindow("2026-01-03");
      expect(dates.length).toBe(7);
      expect(dates).toEqual([
        "2025-12-28",
        "2025-12-29",
        "2025-12-30",
        "2025-12-31",
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
      ]);
    });
  });

  // =========================================================================
  // 7. EDGE CASE COVERAGE
  // =========================================================================
  describe("Edge Case Invariants", () => {
    test("EDGE-01: Empty telemetry returns 0 totals and clean zero breakdowns", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      const stats = await session.query(api.insights.getDailyStats, { userId: studentAId });

      expect(stats.mindfulRelaxation.totalMinutes).toBe(0);
      expect(stats.mindfulRelaxation.totalSessions).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.breathing.sessionsCompleted).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.breathing.minutes).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.grounding.sessionsCompleted).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.grounding.minutes).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.jpmr.sessionsCompleted).toBe(0);
      expect(stats.mindfulRelaxation.breakdown.jpmr.minutes).toBe(0);
    });

    test("EDGE-02: Empty mood history returns empty array when no reference date provided, or 7 empty slots when referenceDate is provided", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // No checkins and no referenceDate passed -> returns []
      const statsNoRef = await session.query(api.insights.getDailyStats, { userId: studentAId });
      expect(statsNoRef.recentDailyMood).toEqual([]);

      // No checkins but referenceDate passed from client -> returns 7 empty slots
      const statsWithRef = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });
      expect(statsWithRef.recentDailyMood.length).toBe(7);
      expect(statsWithRef.recentDailyMood.every((d) => !d.hasCheckin && d.mood === null)).toBe(true);
    });

    test("EDGE-03: One check-in yields strict 7-day calendar window with exactly one active day", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-10-02",
          mood: "happy",
          createdAt: Date.now(),
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood.length).toBe(7);
      expect(stats.recentDailyMood.filter((d) => d.hasCheckin).length).toBe(1);
      expect(stats.recentDailyMood[6].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[6].mood).toBe("happy");
      expect(stats.recentDailyMood[6].dateStr).toBe("2026-10-02");
    });

    test("EDGE-04: All seven days checked in yields 7 active slots with no empty slots", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      const dates = getSevenDayLocalWindow("2026-10-07");

      await t.run(async (ctx) => {
        const moods = ["good", "calm", "good", "calm", "low", "good", "calm"];
        for (let i = 0; i < dates.length; i++) {
          await ctx.db.insert("dailyCheckins", {
            userId: studentAId,
            dateStr: dates[i],
            mood: moods[i],
            createdAt: i * 1000,
          });
        }
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-07",
      });

      expect(stats.recentDailyMood.length).toBe(7);
      expect(stats.recentDailyMood.every((d) => d.hasCheckin && d.mood !== null)).toBe(true);
      expect(stats.recentDailyMood.map((d) => d.dateStr)).toEqual(dates);
    });
  });
});
