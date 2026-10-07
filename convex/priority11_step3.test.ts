/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";
import * as fs from "fs";
import * as path from "path";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 3: Core Metric Correctness, Labeling & Data Minimization", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentId = "";
    let counselorId = "";

    await t.run(async (ctx) => {
      studentId = await ctx.db.insert("users", {
        full_name: "P11 Test Student",
        mobile_number: "9876543201",
        role: "patient",
        status: "active",
        patientId: "PAT-P11-01",
        xp: 150,
        level: 2,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "P11 Counselor",
        mobile_number: "9876543202",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return { t, studentId, counselorId };
  }

  // =========================================================================
  // 1. CALM POINTS CORRECTNESS
  // =========================================================================
  describe("Calm Points Accounting", () => {
    test("CP-01: Calm Points sums completed micro-goals only when all are completed", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      await t.run(async (ctx) => {
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_1",
          goalTitle: "Hydrate",
          goalDescription: "Drink a glass of water",
          category: "wellness",
          difficulty: "easy",
          points: 10,
          completed: true,
          skipped: false,
          createdAt: Date.now(),
        });
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_2",
          goalTitle: "Short Walk",
          goalDescription: "Walk around the corridor",
          category: "wellness",
          difficulty: "medium",
          points: 20,
          completed: true,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });
      expect(stats.totalCalmPoints).toBe(30);
      expect(stats.completedGoalsCount).toBe(2);
    });

    test("CP-02: Calm Points excludes incomplete goals and skipped goals in a mixed goal set", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      await t.run(async (ctx) => {
        // Completed goal: 25 points -> MUST be counted
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_completed",
          goalTitle: "Deep Breathing",
          goalDescription: "Practice breathing exercises",
          category: "wellness",
          difficulty: "medium",
          points: 25,
          completed: true,
          skipped: false,
          createdAt: Date.now(),
        });

        // Incomplete goal: 50 points -> MUST NOT be counted
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_incomplete",
          goalTitle: "Run 5k",
          goalDescription: "Go for an evening jog",
          category: "wellness",
          difficulty: "hard",
          points: 50,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });

        // Skipped goal: 15 points -> MUST NOT be counted
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_skipped",
          goalTitle: "Journaling",
          goalDescription: "Write down 3 things",
          category: "wellness",
          difficulty: "easy",
          points: 15,
          completed: false,
          skipped: true,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });
      expect(stats.totalCalmPoints).toBe(25);
      expect(stats.completedGoalsCount).toBe(1);
    });

    test("CP-03: Calm Points returns 0 when all goals are incomplete", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      await t.run(async (ctx) => {
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_inc1",
          goalTitle: "Read 10 pages",
          goalDescription: "Read book chapter",
          category: "wellness",
          difficulty: "medium",
          points: 30,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_inc2",
          goalTitle: "Sleep early",
          goalDescription: "Sleep before midnight",
          category: "wellness",
          difficulty: "easy",
          points: 20,
          completed: false,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });
      expect(stats.totalCalmPoints).toBe(0);
      expect(stats.completedGoalsCount).toBe(0);
    });

    test("CP-04: Calm Points handles zero-point and empty goal sets cleanly", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      // Empty state
      const emptyStats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });
      expect(emptyStats.totalCalmPoints).toBe(0);
      expect(emptyStats.completedGoalsCount).toBe(0);

      // Completed 0-point goal
      await t.run(async (ctx) => {
        await ctx.db.insert("microGoals", {
          userId: studentId,
          goalId: "goal_zero",
          goalTitle: "Check In",
          goalDescription: "Daily emotion checkin",
          category: "wellness",
          difficulty: "easy",
          points: 0,
          completed: true,
          skipped: false,
          createdAt: Date.now(),
        });
      });

      const zeroStats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });
      expect(zeroStats.totalCalmPoints).toBe(0);
      expect(zeroStats.completedGoalsCount).toBe(1);
    });
  });

  // =========================================================================
  // 2. DATA MINIMIZATION IN STUDENT INSIGHTS
  // =========================================================================
  describe("Student Insights Data Minimization", () => {
    test("DM-01: getDailyStats does NOT expose clinical screening arrays to student", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      // Insert completed screening attempt
      await t.run(async (ctx) => {
        await ctx.db.insert("screeningAttempts", {
          userId: studentId,
          status: "completed",
          startedAt: Date.now() - 60000,
          completedAt: Date.now(),
          attemptType: "baseline",
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: {},
          results: {
            phq9: { administered: true, score: 10, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 1, item9Flag: true },
            gad7: { administered: true, score: 8, maxScore: 21, severity: "mild", level: "mild" },
            pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
          },
          triageLevel: "moderate",
          suicideFlag: false,
          psychosisFlag: false,
        });

        // Also insert legacy screening
        await ctx.db.insert("screenings", {
          userId: studentId,
          phq9_total: 10,
          gad7_total: 8,
          pq16_total: 0,
          phq9_item9_flag: true,
          phq9_item9_score: 1,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });

      // Privacy verification: clinical arrays MUST NOT be exposed in student insights payload
      expect((stats as any).screenings).toBeUndefined();
      expect((stats as any).screeningAttempts).toBeUndefined();
    });

    test("DM-02: getDailyStats does NOT expose clinical triage arrays or alerts", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      await t.run(async (ctx) => {
        await ctx.db.insert("triages", {
          userId: studentId,
          level: "moderate",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: Date.now(),
        });

        await ctx.db.insert("alerts", {
          userId: studentId,
          type: "suicideRisk",
          status: "pending",
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });

      // Privacy verification: triages and alerts MUST NOT be exposed in student insights payload
      expect((stats as any).triages).toBeUndefined();
      expect((stats as any).alerts).toBeUndefined();
    });

    test("DM-03: getDailyStats preserves all required student behavioral telemetry", async () => {
      const { t, studentId } = await setupTestEnvironment();
      const studentSession = t.withIdentity({ subject: studentId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentId,
          dateStr: "2026-09-30",
          mood: "happy",
          createdAt: Date.now(),
        });
        await ctx.db.insert("jpmrLogs", {
          userId: studentId,
          preIntensity: 7,
          postIntensity: 3,
          durationSeconds: 600,
          createdAt: Date.now(),
        });
        await ctx.db.insert("reframeLogs", {
          userId: studentId,
          situation_text: "Exam tomorrow",
          thought_original: "I will fail",
          thinking_trap_choice: "catastrophizing",
          guided_answers: ["I studied"],
          reframe_text: "I am prepared",
          pre_reframe_intensity: 8,
          post_reframe_intensity: 3,
          improvement_percentage: 62,
          saved_reframe_flag: true,
          createdAt: Date.now(),
        });
      });

      const stats = await studentSession.query(api.insights.getDailyStats, { userId: studentId });

      // Required behavioral fields must remain functional
      expect(stats.totalCheckins).toBe(1);
      expect(stats.dailyCheckins.length).toBe(1);
      expect(stats.recentDailyMood.length).toBe(1);
      expect(stats.jpmrMinutes).toBe(10);
      expect(stats.avgJpmrDrop).toBe("4.0");
      expect(stats.reframesCount).toBe(1);
      expect(stats.avgReframeDrop).toBe("5.0");
    });
  });

  // =========================================================================
  // 3. SYNTHETIC DAU/WAU ELIMINATION
  // =========================================================================
  describe("Institutional Analytics & Telemetry Integrity", () => {
    test("DAU-01: getEnterpriseAnalytics does NOT calculate or return synthetic DAU/WAU", async () => {
      const { t, counselorId } = await setupTestEnvironment();
      const counselorSession = t.withIdentity({ subject: counselorId });

      const analytics = await counselorSession.query(api.dashboard.getEnterpriseAnalytics);
      expect(analytics).not.toBeNull();

      // Synthetic multipliers MUST NOT be returned
      expect((analytics as any).dau).toBeUndefined();
      expect((analytics as any).wau).toBeUndefined();
      expect((analytics as any).mau).toBeUndefined();

      // True patient count MUST be present
      expect(analytics!.totalPatients).toBe(1);
    });

    test("DAU-02: getEnterpriseAnalytics returns accurate institutional mean screening scores", async () => {
      const { t, counselorId, studentId } = await setupTestEnvironment();
      const counselorSession = t.withIdentity({ subject: counselorId });

      // Add two completed screening attempts with known scores
      await t.run(async (ctx) => {
        await ctx.db.insert("screeningAttempts", {
          userId: studentId,
          status: "completed",
          startedAt: Date.now() - 100000,
          completedAt: Date.now() - 90000,
          attemptType: "baseline",
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: {},
          results: {
            phq9: { administered: true, score: 12, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 0, item9Flag: false },
            gad7: { administered: true, score: 8, maxScore: 21, severity: "mild", level: "mild" },
            pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
          },
          triageLevel: "moderate",
          suicideFlag: false,
          psychosisFlag: false,
        });

        await ctx.db.insert("screeningAttempts", {
          userId: studentId,
          status: "completed",
          startedAt: Date.now() - 50000,
          completedAt: Date.now() - 40000,
          attemptType: "reassessment",
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: {},
          results: {
            phq9: { administered: true, score: 6, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
            gad7: { administered: true, score: 4, maxScore: 21, severity: "normal", level: "mild" },
            pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
          },
          triageLevel: "mild",
          suicideFlag: false,
          psychosisFlag: false,
        });
      });

      const analytics = await counselorSession.query(api.dashboard.getEnterpriseAnalytics);
      expect(analytics).not.toBeNull();
      // Mean PHQ: (12 + 6) / 2 = 9.0
      expect(analytics!.avgPhqScore).toBe("9.0");
      // Mean GAD: (8 + 4) / 2 = 6.0
      expect(analytics!.avgGadScore).toBe("6.0");
    });
  });

  // =========================================================================
  // 4. CLINICAL & PRODUCT TERMINOLOGY GUARDRAILS
  // =========================================================================
  describe("Terminology Guardrail Regression Checks", () => {
    test("LABEL-01: Analytics page does NOT contain prohibited clinical reduction claims", () => {
      const analyticsPath = path.resolve(__dirname, "../dashboard/src/pages/Analytics.tsx");
      const content = fs.readFileSync(analyticsPath, "utf-8");

      // Prohibited terminology checks
      expect(content).not.toContain("Avg PHQ-9 Improvement");
      expect(content).not.toContain("Avg GAD-7 Improvement");
      expect(content).not.toContain("Longitudinal depression reduction");
      expect(content).not.toContain("Longitudinal anxiety reduction");
      expect(content).not.toContain("Active Users (DAU / WAU / MAU)");

      // Approved terminology checks
      expect(content).toContain("Institutional Mean PHQ-9 (Depression Screening)");
      expect(content).toContain("Institutional Mean GAD-7 (Anxiety Screening)");
      expect(content).toContain("Enrolled Students");
      expect(content).toContain("Cross-sectional cohort mean");
    });

    test("LABEL-02: PatientDetail page does NOT use Recovery terminology for session tension", () => {
      const patientDetailPath = path.resolve(__dirname, "../dashboard/src/pages/PatientDetail.tsx");
      const content = fs.readFileSync(patientDetailPath, "utf-8");

      // Prohibited CBT terminology
      expect(content).not.toContain("Recovery Progress Chart");
      expect(content).not.toContain("Recovery Plans Created");

      // Approved session-level terminology
      expect(content).toContain("Acute Session Tension Delta (Pre vs Post Exercise)");
      expect(content).toContain("Action Plans Created");
    });
  });
});
