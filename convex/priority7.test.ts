/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { getLocalDateString, isValidCheckinDateStr, getPreviousDateStr } from "../utils/date";

const modules = import.meta.glob("./**/*.ts");

function makePHQ9Responses(val = 1, item9 = 0): Record<string, number> {
  const res: Record<string, number> = {};
  for (let i = 1; i <= 8; i++) res[`phq9_q${i}`] = val;
  res["phq9_q9"] = item9;
  return res;
}

function makeGAD7Responses(val = 1): Record<string, number> {
  const res: Record<string, number> = {};
  for (let i = 1; i <= 7; i++) res[`gad7_q${i}`] = val;
  return res;
}

function makePQ16Responses(yesCount = 0): Record<string, number> {
  const res: Record<string, number> = {};
  for (let i = 1; i <= 16; i++) {
    res[`pq16_q${i}`] = i <= yesCount ? 1 : 0;
  }
  return res;
}

describe("Priority 7 Implementation: Phases 1–4 Test Suite", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Admin
    let adminId: Id<"users">;
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Admin User",
        email: "admin@hospital.org",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student Alpha
    let studentAId: Id<"users">;
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        clerkId: "clerk_student_a",
        full_name: "Student Alpha",
        email: "alpha@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-A",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Student Beta
    let studentBId: Id<"users">;
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        clerkId: "clerk_student_b",
        full_name: "Student Beta",
        email: "beta@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 4. Counselor Clara
    let counselorId: Id<"users">;
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        clerkId: "clerk_counselor_c",
        full_name: "Counselor Clara",
        email: "clara@hospital.org",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return {
      t,
      adminId: adminId!,
      studentAId: studentAId!,
      studentBId: studentBId!,
      counselorId: counselorId!,
    };
  }

  // =========================================================================
  // PHASE 1: P0 SECURITY
  // =========================================================================

  test("SEC-01: insights.getDailyStats rejects unauthenticated call", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    // Unauthenticated caller
    await expect(
      t.query(api.insights.getDailyStats, { userId: studentAId })
    ).rejects.toThrow();
  });

  test("SEC-02: Student A cannot access Student B stats via getDailyStats", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await expect(
      studentASession.query(api.insights.getDailyStats, { userId: studentBId })
    ).rejects.toThrow();
  });

  test("SEC-03: Student A can query their own stats via getDailyStats", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats).toBeDefined();
    expect(stats.jpmrMinutes).toBe(0);
    expect(stats.completedGoalsCount).toBe(0);
  });

  test("SEC-04: Authorized Counselor and Admin can access student stats via getDailyStats", async () => {
    const { t, counselorId, adminId, studentAId } = await setupTestEnvironment();

    const counselorSession = t.withIdentity({ subject: counselorId });
    const counselorStats = await counselorSession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(counselorStats).toBeDefined();

    const adminSession = t.withIdentity({ subject: adminId });
    const adminStats = await adminSession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(adminStats).toBeDefined();
  });

  test("SEC-05: submitScreeningAttempt rejects unauthenticated call", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: studentAId,
        responses: {
          phq9: makePHQ9Responses(),
          gad7: makeGAD7Responses(),
          pq16: makePQ16Responses(),
        },
      })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("SEC-06: Student A cannot submit screening attempt for Student B (forged userId rejected)", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await expect(
      studentASession.mutation(api.screening.submitScreeningAttempt, {
        userId: studentBId, // Forged userId
        responses: {
          phq9: makePHQ9Responses(),
          gad7: makeGAD7Responses(),
          pq16: makePQ16Responses(),
        },
      })
    ).rejects.toThrow();
  });

  test("SEC-07: Authenticated student can submit their own screening attempt", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    const result = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(),
        gad7: makeGAD7Responses(),
        pq16: makePQ16Responses(),
      },
    });

    expect(result.attemptId).toBeDefined();
    expect(result.attemptType).toBe("baseline");
    const savedAttempt = await t.run(async (ctx) => ctx.db.get(result.attemptId));
    expect(savedAttempt?.status).toBe("completed");
  });

  // =========================================================================
  // PHASE 2: CHECK-IN / EMOTION DOMAIN NORMALIZATION
  // =========================================================================

  test("DATE-01: Shared local date helper formats correctly across timezone boundaries", () => {
    const istBeforeMidnight = new Date("2026-09-28T18:15:00.000Z");
    const dateStr = getLocalDateString(istBeforeMidnight);
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(isValidCheckinDateStr("2026-09-28")).toBe(true);
    expect(isValidCheckinDateStr("2026-13-45")).toBe(false);
    expect(isValidCheckinDateStr("not-a-date")).toBe(false);
    expect(isValidCheckinDateStr("2099-01-01")).toBe(false);
  });

  test("CHECKIN-01: Daily check-in writes to dailyCheckins and does NOT create emotionLogs", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    const result = await studentASession.mutation(api.microGoals.submitMorningCheckin, {
      mood: "great",
      dateStr: "2026-09-28",
    });

    expect(result.success).toBe(true);

    const checkin = await t.run(async (ctx) => {
      return await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q) =>
          q.eq("userId", studentAId).eq("dateStr", "2026-09-28")
        )
        .first();
    });
    expect(checkin).not.toBeNull();
    expect(checkin?.mood).toBe("great");

    const emotionLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("emotionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(emotionLogs.length).toBe(0);
  });

  test("CHECKIN-02: Updating today's check-in updates dailyCheckins without duplicate", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await studentASession.mutation(api.microGoals.submitMorningCheckin, {
      mood: "good",
      dateStr: "2026-09-28",
    });

    const updateResult = await studentASession.mutation(api.microGoals.submitMorningCheckin, {
      mood: "great",
      dateStr: "2026-09-28",
      allowUpdate: true,
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.updated).toBe(true);

    const checkins = await t.run(async (ctx) => {
      return await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q) =>
          q.eq("userId", studentAId).eq("dateStr", "2026-09-28")
        )
        .collect();
    });
    expect(checkins.length).toBe(1);
    expect(checkins[0].mood).toBe("great");
  });

  test("CHECKIN-03: Rejects invalid or future date strings", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await expect(
      studentASession.mutation(api.microGoals.submitMorningCheckin, {
        mood: "good",
        dateStr: "2099-01-01",
      })
    ).rejects.toThrow(/Invalid check-in date/);

    await expect(
      studentASession.mutation(api.microGoals.submitMorningCheckin, {
        mood: "good",
        dateStr: "malformed-date",
      })
    ).rejects.toThrow(/Invalid check-in date/);
  });

  test("EMOTION-01: Episodic emotionLog remains functional as situational event", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    const logId = await studentASession.mutation(api.emotionLogs.create, {
      userId: studentAId,
      emotion: "anxious",
      preIntensity: 7,
      postIntensity: 4,
      bodyRegions: ["chest", "shoulders"],
    });

    expect(logId).toBeDefined();

    const log = await t.run(async (ctx) => {
      return await ctx.db.get(logId);
    });
    expect(log?.emotion).toBe("anxious");
    expect(log?.preIntensity).toBe(7);
  });

  // =========================================================================
  // PHASE 3: SOMATIC TRACKING (EMOTION MAPS)
  // =========================================================================

  test("EMAP-01: emotionMaps enforces intensity between 1 and 10", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Valid intensity
    const mapId = await studentASession.mutation(api.emotionMaps.create, {
      userId: studentAId,
      emotionLabel: "stress",
      selectedRegions: ["neck"],
      bodyRatings: [{ region: "neck", intensity: 6 }],
      averageIntensity: 6,
      suggestedAction: "Neck roll stretch",
    });
    expect(mapId).toBeDefined();

    // Invalid intensity: 0
    await expect(
      studentASession.mutation(api.emotionMaps.create, {
        userId: studentAId,
        emotionLabel: "stress",
        selectedRegions: ["neck"],
        bodyRatings: [{ region: "neck", intensity: 0 }],
        averageIntensity: 5,
        suggestedAction: "Neck roll stretch",
      })
    ).rejects.toThrow(/must be a valid number between 1 and 10/);

    // Invalid intensity: > 10
    await expect(
      studentASession.mutation(api.emotionMaps.create, {
        userId: studentAId,
        emotionLabel: "stress",
        selectedRegions: ["neck"],
        bodyRatings: [{ region: "neck", intensity: 11 }],
        averageIntensity: 5,
        suggestedAction: "Neck roll stretch",
      })
    ).rejects.toThrow(/must be a valid number between 1 and 10/);

    // Empty bodyRatings
    await expect(
      studentASession.mutation(api.emotionMaps.create, {
        userId: studentAId,
        emotionLabel: "stress",
        selectedRegions: [],
        bodyRatings: [],
        averageIntensity: 5,
        suggestedAction: "Neck roll stretch",
      })
    ).rejects.toThrow(/bodyRatings must be a non-empty array/);
  });

  test("EMAP-02: emotionMaps.getRecentLogs enforces student isolation and counselor access", async () => {
    const { t, studentAId, studentBId, counselorId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    const studentBSession = t.withIdentity({ subject: studentBId });
    const counselorSession = t.withIdentity({ subject: counselorId });

    // Student A creates an emotion map
    await studentASession.mutation(api.emotionMaps.create, {
      userId: studentAId,
      emotionLabel: "anxious",
      selectedRegions: ["chest"],
      bodyRatings: [{ region: "chest", intensity: 7 }],
      averageIntensity: 7,
      suggestedAction: "Box breathing",
    });

    // Student A can access own logs
    const ownLogs = await studentASession.query(api.emotionMaps.getRecentLogs, { userId: studentAId });
    expect(ownLogs.length).toBe(1);

    // Student B CANNOT access Student A logs
    await expect(
      studentBSession.query(api.emotionMaps.getRecentLogs, { userId: studentAId })
    ).rejects.toThrow();

    // Counselor CAN access Student A logs
    const counselorLogs = await counselorSession.query(api.emotionMaps.getRecentLogs, { userId: studentAId });
    expect(counselorLogs.length).toBe(1);
    expect(counselorLogs[0].emotionLabel).toBe("anxious");
  });

  test("EMAP-03: emotionMaps appears in monitoring timeline filter, suppressed in default", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Insert emotion map
    await studentASession.mutation(api.emotionMaps.create, {
      userId: studentAId,
      emotionLabel: "tension",
      selectedRegions: ["shoulders"],
      bodyRatings: [{ region: "shoulders", intensity: 8 }],
      averageIntensity: 8,
      suggestedAction: "Shoulder shrugs",
    });

    // Default timeline query: emotionMaps is suppressed
    const defaultTimeline = await studentASession.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    const defaultMapEvents = defaultTimeline.filter((e) => e.eventType === "emotion_map");
    expect(defaultMapEvents.length).toBe(0);

    // Explicit monitoring filter: emotionMaps is included
    const monitoringTimeline = await studentASession.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "monitoring",
    });
    const monitoringMapEvents = monitoringTimeline.filter((e) => e.eventType === "emotion_map");
    expect(monitoringMapEvents.length).toBe(1);
    expect(monitoringMapEvents[0].category).toBe("monitoring");
    expect(monitoringMapEvents[0].metadata?.emotionLabel).toBe("tension");
  });

  // =========================================================================
  // PHASE 4: REASSESSMENT INTEGRITY
  // =========================================================================

  test("REASSESS-01: Deterministic attemptType assignment (baseline vs reassessment)", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Attempt 1: First attempt -> baseline
    const attempt1 = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(0),
        gad7: makeGAD7Responses(0),
        pq16: makePQ16Responses(0),
      },
    });
    expect(attempt1.attemptType).toBe("baseline");

    // Attempt 2: Repeat screening -> reassessment
    const attempt2 = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(1),
      },
    });
    expect(attempt2.attemptType).toBe("reassessment");
  });

  test("REASSESS-02: Force retest triage leads to force_retest attemptType", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Seed baseline
    await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(0),
        gad7: makeGAD7Responses(0),
        pq16: makePQ16Responses(0),
      },
    });

    // Counselor forces retest via triage table
    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentAId,
        level: "force_retest",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
    });

    // Next attempt submitted -> force_retest
    const forcedAttempt = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(2),
        gad7: makeGAD7Responses(2),
        pq16: makePQ16Responses(2),
      },
    });
    expect(forcedAttempt.attemptType).toBe("force_retest");
  });

  test("REASSESS-03: Incomplete attempt does NOT hide latest completed screening", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Completed Attempt 1
    const completedAttempt = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(1),
      },
    });
    expect(completedAttempt.attemptId).toBeDefined();

    // Later In-Progress Attempt 2 inserted
    await t.run(async (ctx) => {
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "in_progress",
        startedAt: Date.now() + 5000,
        instrumentVersions: {
          phq9: "1.0",
          gad7: "1.0",
          pq16: "1.0",
        },
        responses: {},
        results: {
          phq9: { administered: false, score: 0, maxScore: 27, severity: "none", level: "none", item9Score: 0, item9Flag: false },
          gad7: { administered: false, score: 0, maxScore: 21, severity: "none", level: "none" },
          pq16: { administered: false, score: 0, maxScore: 16, severity: "none", level: "none" },
        },
        triageLevel: "green",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    // getLatestAttempt must return the completed attempt, NOT the in-progress one
    const latestAttempt = await studentASession.query(api.screening.getLatestAttempt, {
      userId: studentAId,
    });
    expect(latestAttempt).not.toBeNull();
    expect(latestAttempt?.status).toBe("completed");
    expect(latestAttempt?._id).toBe(completedAttempt.attemptId);

    // getLatest query also returns latest completed screening
    const latestScreening = await studentASession.query(api.screening.getLatest, {
      userId: studentAId,
    });
    expect(latestScreening).not.toBeNull();
    expect((latestScreening as any)?.status).toBe("completed");
    expect(latestScreening?.attemptId).toBe(String(completedAttempt.attemptId));
  });

  test("REASSESS-04: Historical screening records and safety alerts remain intact", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Screening 1 (high depression, item 9 = 0)
    await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(3, 0),
        gad7: makeGAD7Responses(3),
        pq16: makePQ16Responses(3),
      },
    });

    // Record an alert
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "score_spike",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Screening 2 (lower depression)
    await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    // Verify both attempts exist separately in DB
    const attempts = await t.run(async (ctx) => {
      return await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(attempts.length).toBe(2);

    // Verify alert is NOT automatically resolved
    const alert = await t.run(async (ctx) => {
      return await ctx.db.get(alertId!);
    });
    expect(alert?.status).toBe("pending");
  });

  // =========================================================================
  // PHASE 5 STEP 1A: CLINICAL ALERT ACKNOWLEDGMENT AUTHORIZATION
  // =========================================================================

  test("ALERT-AUTH-01: Unauthenticated caller attempts acknowledgeAlert -> rejected", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.alerts.acknowledgeAlert, { alertId: alertId! })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("ALERT-AUTH-02: Student A attempts to acknowledge Student A's clinical alert -> rejected", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await expect(
      studentASession.mutation(api.alerts.acknowledgeAlert, { alertId: alertId! })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  test("ALERT-AUTH-03: Student A attempts to acknowledge Student B's clinical alert -> rejected", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentBId,
        type: "psychosisRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await expect(
      studentASession.mutation(api.alerts.acknowledgeAlert, { alertId: alertId! })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  test("ALERT-AUTH-04: Counsellor acknowledges Student A's alert -> allowed", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await counselorSession.mutation(api.alerts.acknowledgeAlert, { alertId: alertId! });

    const updatedAlert = await t.run(async (ctx) => {
      return await ctx.db.get(alertId!);
    });
    expect(updatedAlert?.status).toBe("acknowledged");
    expect(updatedAlert?.acknowledgedAt).toBeDefined();
  });

  test("ALERT-AUTH-05: Admin acknowledges Student A's alert -> allowed", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();
    const adminSession = t.withIdentity({ subject: adminId });
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await adminSession.mutation(api.alerts.acknowledgeAlert, { alertId: alertId! });

    const updatedAlert = await t.run(async (ctx) => {
      return await ctx.db.get(alertId!);
    });
    expect(updatedAlert?.status).toBe("acknowledged");
    expect(updatedAlert?.acknowledgedAt).toBeDefined();
  });

  test("ALERT-AUTH-06: Existing alert provenance remains unchanged after counselor/admin acknowledgment", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });
    const studentASession = t.withIdentity({ subject: studentAId });

    // Submit a screening attempt that generates an alert
    const attemptResult = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 2), // item 9 = 2 -> triggers suicideRisk alert
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });
    expect(attemptResult.triageLevel).toBe("suicide_flag");

    // Retrieve generated alert
    const alerts = await t.run(async (ctx) => {
      return await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(alerts.length).toBeGreaterThan(0);
    const alert = alerts[0];
    const originalAttemptId = alert.attemptId;
    const originalTriageId = alert.triageId;
    const originalCreatedAt = alert.createdAt;
    const originalType = alert.type;
    const originalUserId = alert.userId;

    expect(originalAttemptId).toBeDefined();
    expect(originalTriageId).toBeDefined();

    // Counselor acknowledges alert
    await counselorSession.mutation(api.alerts.acknowledgeAlert, { alertId: alert._id });

    // Verify provenance fields are 100% preserved
    const acknowledgedAlert = await t.run(async (ctx) => {
      return await ctx.db.get(alert._id);
    });
    expect(acknowledgedAlert?.status).toBe("acknowledged");
    expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
    expect(acknowledgedAlert?.attemptId).toBe(originalAttemptId);
    expect(acknowledgedAlert?.triageId).toBe(originalTriageId);
    expect(acknowledgedAlert?.createdAt).toBe(originalCreatedAt);
    expect(acknowledgedAlert?.type).toBe(originalType);
    expect(acknowledgedAlert?.userId).toBe(originalUserId);
  });

  // =========================================================================
  // PHASE 5 STEP 2B: ACTIVE SAFETY ALERT VISIBILITY (ALERT-VIS-01 to 08)
  // =========================================================================

  test("ALERT-VIS-01: Patient has zero pending alerts -> alerts.getPending returns empty array", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending).toEqual([]);
  });

  test("ALERT-VIS-02: Patient has one pending alert -> alerts.getPending returns 1 pending alert", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending.length).toBe(1);
    expect(pending[0]._id).toBe(alertId!);
    expect(pending[0].type).toBe("suicideRisk");
    expect(pending[0].status).toBe("pending");
  });

  test("ALERT-VIS-03: Patient has multiple pending alerts -> returned without duplication", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    let alert1Id: Id<"alerts">;
    let alert2Id: Id<"alerts">;
    await t.run(async (ctx) => {
      alert1Id = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now() - 5000,
      });
      alert2Id = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "psychosisRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending.length).toBe(2);
    const ids = pending.map((a: any) => a._id);
    expect(ids).toContain(alert1Id!);
    expect(ids).toContain(alert2Id!);
    expect(new Set(ids).size).toBe(2);
  });

  test("ALERT-VIS-04: Patient has only resolved alerts -> alerts.getPending returns empty array", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    await t.run(async (ctx) => {
      await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "resolved",
        createdAt: Date.now() - 10000,
        acknowledgedAt: Date.now() - 5000,
      });
    });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending).toEqual([]);
  });

  test("ALERT-VIS-05: Patient has historical severe screening but no pending alert -> no alert returned", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    const counselorSession = t.withIdentity({ subject: counselorId });

    // Submit severe screening (without item 9)
    await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(3, 0), // score = 24 (severe), item9 = 0
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    // Resolve any alerts generated
    await t.run(async (ctx) => {
      const allAlerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
      for (const a of allAlerts) {
        await ctx.db.patch(a._id, { status: "resolved" });
      }
    });

    // Query pending alerts
    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending).toEqual([]);
  });

  test("ALERT-VIS-06: Counselor views authorized student -> pending alerts are visible", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    await t.run(async (ctx) => {
      await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "escalation",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending.length).toBe(1);
    expect(pending[0].type).toBe("escalation");
  });

  test("ALERT-VIS-07: Unauthorized student attempts to access another student's pending alerts -> rejected", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("alerts", {
        userId: studentBId,
        type: "suicideRisk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    await expect(
      studentASession.query(api.alerts.getPending, { userId: studentBId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  test("ALERT-VIS-08: Alert provenance remains unchanged (attemptId, triageId, createdAt, type)", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    const counselorSession = t.withIdentity({ subject: counselorId });

    // Screening generating suicide alert
    const attemptResult = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 1), // item 9 = 1 -> suicide alert
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    const pending = await counselorSession.query(api.alerts.getPending, { userId: studentAId });
    expect(pending.length).toBeGreaterThan(0);
    const alert = pending[0];

    expect(alert.attemptId).toBe(attemptResult.attemptId);
    expect(alert.triageId).toBe(attemptResult.triageId);
    expect(alert.createdAt).toBeDefined();
    expect(alert.type).toBe("suicide");
    expect(alert.status).toBe("pending");
  });

  // =========================================================================
  // STEP 3A: TELEMETRY QUERY NORMALIZATION (INSIGHT-3A-01 to INSIGHT-3A-12)
  // =========================================================================

  test("INSIGHT-3A-01: Daily check-in records are returned from dailyCheckins", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "good",
        createdAt: 1727400000000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: 1727486400000,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.dailyCheckins).toBeDefined();
    expect(stats.dailyCheckins.length).toBe(2);
    expect(stats.dailyCheckins.map((c: any) => c.mood)).toContain("good");
    expect(stats.dailyCheckins.map((c: any) => c.mood)).toContain("calm");
  });

  test("INSIGHT-3A-02: totalCheckins equals dailyCheckins count for the intended period", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-26",
        mood: "calm",
        createdAt: 1727313600000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "good",
        createdAt: 1727400000000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "low",
        createdAt: 1727486400000,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.totalCheckins).toBe(3);
    expect(stats.dailyCheckins.length).toBe(3);
  });

  test("INSIGHT-3A-03: emotionLogs are NOT used as the source of daily check-in count", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 2 daily check-ins
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "good",
        createdAt: 1727400000000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: 1727486400000,
      });

      // 5 episodic emotionLogs
      for (let i = 1; i <= 5; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentAId,
          emotion: "anxious",
          bodyRegions: ["chest"],
          preIntensity: 7,
          postIntensity: 4,
          createdAt: 1727400000000 + i * 1000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    // totalCheckins must equal 2 (from dailyCheckins), NOT 5 (from emotionLogs) and NOT 7 (merged count)
    expect(stats.totalCheckins).toBe(2);
    expect(stats.episodicEmotionLogs.length).toBe(5);
  });

  test("INSIGHT-3A-04: 7-day daily mood history uses dailyCheckins", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Insert 9 daily checkins across consecutive calendar dates
    await t.run(async (ctx) => {
      const dates = [
        "2026-09-19",
        "2026-09-20",
        "2026-09-21",
        "2026-09-22",
        "2026-09-23",
        "2026-09-24",
        "2026-09-25",
        "2026-09-26",
        "2026-09-27",
      ];
      for (let i = 0; i < dates.length; i++) {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: dates[i],
          mood: i % 2 === 0 ? "good" : "calm",
          createdAt: 1726700000000 + i * 86400000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    // recentDailyMood is bounded to 7 days
    expect(stats.recentDailyMood).toBeDefined();
    expect(stats.recentDailyMood.length).toBe(7);
    expect(stats.recentDailyMood[0].dateStr).toBe("2026-09-21");
    expect(stats.recentDailyMood[6].dateStr).toBe("2026-09-27");
    // Compatibility emotionLogs also bounded to 7 daily checkins
    expect(stats.emotionLogs.length).toBe(7);
    expect(stats.emotionLogs[6].preIntensity).toBeGreaterThan(0);
  });

  test("INSIGHT-3A-05: dailyCheckin local dateStr semantics work across midnight boundaries", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Checkin created late at night (23:45 local) and early morning (00:30 local)
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "calm",
        createdAt: 1727461500000, // 23:45
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "good",
        createdAt: 1727464200000, // 00:30 next day
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.totalCheckins).toBe(2);
    const dateStrings = stats.dailyCheckins.map((c: any) => c.dateStr);
    expect(dateStrings).toContain("2026-09-27");
    expect(dateStrings).toContain("2026-09-28");
  });

  test("INSIGHT-3A-06: completed screening attempts remain included", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(1),
      },
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect((stats as any).screenings).toBeUndefined();
    expect((stats as any).triages).toBeUndefined();

    const screenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(screenings.length).toBe(1);
    expect((screenings[0] as any).status).toBe("completed");
    expect(screenings[0].phq9_total).toBeDefined();
    expect(screenings[0].gad7_total).toBeDefined();
    expect(screenings[0].pq16_total).toBeDefined();
  });

  test("INSIGHT-3A-07: incomplete/abandoned screening attempts remain excluded", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // Completed attempt
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: 1727400000000,
        completedAt: 1727400300000,
        attemptType: "baseline",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 5, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 4, maxScore: 21, severity: "normal", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      // In-progress attempt
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "in_progress",
        startedAt: 1727486400000,
        attemptType: "reassessment",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 0, maxScore: 27, severity: "normal", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 0, maxScore: 21, severity: "normal", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      // Abandoned attempt
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "abandoned",
        startedAt: 1727480000000,
        attemptType: "reassessment",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 0, maxScore: 27, severity: "normal", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 0, maxScore: 21, severity: "normal", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect((stats as any).screenings).toBeUndefined();

    const screenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(screenings.length).toBe(1);
    expect((screenings[0] as any).status).toBe("completed");
  });

  test("INSIGHT-3A-08: existing WSAS/ReQoL/Item9 fields are preserved when already stored", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: 1727400000000,
        completedAt: 1727400300000,
        attemptType: "baseline",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0", wsas: "1.0", reqol10: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 14, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 2, item9Flag: true },
          gad7: { administered: true, score: 11, maxScore: 21, severity: "moderate", level: "moderate" },
          pq16: { administered: true, score: 3, maxScore: 16, severity: "normal", level: "low" },
          wsas: { administered: true, score: 22, maxScore: 40, severity: "significant", level: "moderate" },
          reqol10: { administered: true, score: 28, maxScore: 50, severity: "good", level: "low" },
        },
        triageLevel: "moderate",
        suicideFlag: true,
        psychosisFlag: false,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect((stats as any).screenings).toBeUndefined();

    const screenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(screenings.length).toBe(1);
    const s = screenings[0];
    expect(s.phq9_total).toBe(14);
    expect(s.gad7_total).toBe(11);
    expect(s.pq16_total).toBe(3);
    expect(s.wsas_total).toBe(22);
    expect(s.reqol10_total).toBe(28);
    expect(s.phq9_item9_score).toBe(2);
    expect(s.phq9_item9_flag).toBe(true);
  });

  test("INSIGHT-3A-09: unauthenticated Insights access remains denied", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    await expect(
      t.query(api.insights.getDailyStats, { userId: studentAId })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("INSIGHT-3A-10: cross-student Insights access remains denied", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await expect(
      studentASession.query(api.insights.getDailyStats, { userId: studentBId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  test("INSIGHT-3A-11: counselor/admin authorized access remains functional", async () => {
    const { t, counselorId, adminId, studentAId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });
    const adminSession = t.withIdentity({ subject: adminId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "good",
        createdAt: Date.now(),
      });
    });

    const counselorStats = await counselorSession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(counselorStats).toBeDefined();
    expect(counselorStats.totalCheckins).toBe(1);
    expect(counselorStats.dailyCheckins[0].mood).toBe("good");

    const adminStats = await adminSession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(adminStats).toBeDefined();
    expect(adminStats.totalCheckins).toBe(1);
  });

  test("INSIGHT-3A-12: historical clinical records are not silently deleted or overwritten", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    let legacyScreeningId: any;
    let checkinId: any;
    let goalId: any;

    await t.run(async (ctx) => {
      legacyScreeningId = await ctx.db.insert("screenings", {
        userId: studentAId,
        phq9_total: 8,
        gad7_total: 6,
        pq16_total: 1,
        phq9_item9_flag: false,
        phq9_item9_score: 0,
        createdAt: 1720000000000,
      });

      checkinId = await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-07-01",
        mood: "calm",
        createdAt: 1720000000000,
      });

      goalId = await ctx.db.insert("microGoals", {
        userId: studentAId,
        goalId: "walk_10m",
        goalTitle: "Walk for 10 minutes",
        goalDescription: "Take a gentle walk",
        category: "wellness",
        difficulty: "easy",
        points: 10,
        completed: true,
        skipped: false,
        createdAt: 1720000000000,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect((stats as any).screenings).toBeUndefined();
    expect(stats.totalCheckins).toBe(1);
    expect(stats.totalCalmPoints).toBe(10);

    const screenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(screenings.length).toBe(1);
    expect(screenings[0]._id).toBe(legacyScreeningId);

    // Verify raw database records are completely intact
    await t.run(async (ctx) => {
      const scr = await ctx.db.get(legacyScreeningId);
      expect(scr).not.toBeNull();
      const chk = await ctx.db.get(checkinId);
      expect(chk).not.toBeNull();
      const g = await ctx.db.get(goalId);
      expect(g).not.toBeNull();
    });
  });

  test("INSIGHT-3A-13: Lifetime aggregates and clinical history are not truncated by arbitrary record limits", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 1. Insert 105 microGoals (>100 previously capped)
      for (let i = 1; i <= 105; i++) {
        await ctx.db.insert("microGoals", {
          userId: studentAId,
          goalId: `goal_${i}`,
          goalTitle: `Goal ${i}`,
          goalDescription: `Description ${i}`,
          category: "wellness",
          difficulty: "easy",
          points: 10,
          completed: true,
          skipped: false,
          createdAt: 1720000000000 + i * 1000,
        });
      }

      // 2. Insert 55 jpmrLogs (>50 previously capped)
      for (let i = 1; i <= 55; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 8,
          postIntensity: 4,
          durationSeconds: 120, // 2 minutes each
          createdAt: 1720000000000 + i * 1000,
        });
      }

      // 3. Insert 55 reframeLogs (>50 previously capped)
      for (let i = 1; i <= 55; i++) {
        await ctx.db.insert("reframeLogs", {
          userId: studentAId,
          situation_text: `Situation ${i}`,
          thought_original: `Thought ${i}`,
          thinking_trap_choice: "catastrophizing",
          guided_answers: ["answer"],
          reframe_text: `Reframe ${i}`,
          pre_reframe_intensity: 7,
          post_reframe_intensity: 3,
          improvement_percentage: 57,
          saved_reframe_flag: false,
          createdAt: 1720000000000 + i * 1000,
        });
      }

      // 4. Insert 55 completed screeningAttempts (>50 previously capped)
      for (let i = 1; i <= 55; i++) {
        await ctx.db.insert("screeningAttempts", {
          userId: studentAId,
          status: "completed",
          startedAt: 1720000000000 + i * 60000,
          completedAt: 1720000000000 + i * 60000 + 30000,
          attemptType: i === 1 ? "baseline" : "reassessment",
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: {},
          results: {
            phq9: { administered: true, score: 5, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
            gad7: { administered: true, score: 4, maxScore: 21, severity: "normal", level: "mild" },
            pq16: { administered: true, score: 1, maxScore: 16, severity: "normal", level: "low" },
          },
          triageLevel: "mild",
          suicideFlag: false,
          psychosisFlag: false,
        });
      }

      // 5. Insert 55 triages (>50 previously capped)
      for (let i = 1; i <= 55; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "mild",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: 1720000000000 + i * 60000,
        });
      }

      // 6. Insert 35 daily checkins across 35 distinct days (>30 previously capped)
      for (let i = 1; i <= 35; i++) {
        const dayStr = i < 10 ? `0${i}` : `${i}`;
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: `2026-08-${dayStr}`,
          mood: "good",
          createdAt: 1722470400000 + i * 86400000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });

    // Lifetime metrics must NOT be truncated
    expect(stats.totalCalmPoints).toBe(105 * 10); // 1050 points
    expect(stats.completedGoalsCount).toBe(105);
    expect(stats.microGoals.length).toBe(105);

    expect(stats.jpmrMinutes).toBe(55 * 2); // 110 minutes
    expect(stats.jpmrLogs.length).toBe(55);
    expect(stats.avgJpmrDrop).toBe("4.0");

    expect(stats.reframesCount).toBe(55);
    expect(stats.reframes.length).toBe(55);
    expect(stats.avgReframeDrop).toBe("4.0");

    // Clinical screening history for CSV export / counselor review must NOT be in student insights payload (data minimization)
    expect((stats as any).screenings).toBeUndefined();
    expect((stats as any).triages).toBeUndefined();

    const allScreenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(allScreenings.length).toBe(55);

    // Lifetime total checkins must NOT be truncated
    expect(stats.totalCheckins).toBe(35);
    expect(stats.dailyCheckins.length).toBe(35);

    // 7-day mood window remains correctly bounded to 7 records
    expect(stats.recentDailyMood.length).toBe(7);
    expect(stats.emotionLogs.length).toBe(7);
  });

  test("INSIGHT-3B-01: Student Insights payload provides recentDailyMood for mood trend", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-25",
        mood: "calm",
        createdAt: 1727222400000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-26",
        mood: "good",
        createdAt: 1727308800000,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.recentDailyMood).toBeDefined();
    expect(stats.recentDailyMood.length).toBe(2);
    // Ascending chronological order
    expect(stats.recentDailyMood[0].dateStr).toBe("2026-09-25");
    expect(stats.recentDailyMood[0].mood).toBe("calm");
    expect(stats.recentDailyMood[0].intensity).toBe(6); // calm -> 6
    expect(stats.recentDailyMood[1].dateStr).toBe("2026-09-26");
    expect(stats.recentDailyMood[1].mood).toBe("good");
    expect(stats.recentDailyMood[1].intensity).toBe(8); // good -> 8
  });

  test("INSIGHT-3B-02: Student Insights check-in count uses totalCheckins", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      const dates = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"];
      for (let i = 0; i < dates.length; i++) {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: dates[i],
          mood: "good",
          createdAt: 1726790400000 + i * 86400000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.totalCheckins).toBe(4);
    expect(stats.dailyCheckins.length).toBe(4);
  });

  test("INSIGHT-3B-03: Student Insights does not derive daily check-ins from episodic emotionLogs", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 1 daily check-in
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: 1727481600000,
      });

      // 10 episodic emotion logs
      for (let i = 1; i <= 10; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentAId,
          emotion: "stressed",
          bodyRegions: ["shoulders"],
          preIntensity: 8,
          postIntensity: 4,
          createdAt: 1727481600000 + i * 1000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    // Must be exactly 1 from dailyCheckins, never 10 from emotionLogs or 11 from combination
    expect(stats.totalCheckins).toBe(1);
    expect(stats.recentDailyMood.length).toBe(1);
    expect(stats.episodicEmotionLogs.length).toBe(10);
  });

  test("INSIGHT-3B-04: 7-day trend correctly handles fewer than 7 daily check-ins", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Case A: 0 checkins
    const emptyStats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(emptyStats.recentDailyMood.length).toBe(0);

    // Case B: 1 checkin
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "good",
        createdAt: 1727395200000,
      });
    });
    const singleStats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(singleStats.recentDailyMood.length).toBe(1);
    expect(singleStats.recentDailyMood[0].intensity).toBe(8); // good -> 8

    // Case C: 3 checkins
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: 1727481600000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-29",
        mood: "low",
        createdAt: 1727568000000,
      });
    });
    const threeStats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(threeStats.recentDailyMood.length).toBe(3);
    expect(threeStats.recentDailyMood.map((m: any) => m.intensity)).toEqual([8, 6, 4]); // good=8, calm=6, low=4
  });

  test("INSIGHT-3B-05: Lifetime engagement metrics remain lifetime values", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 12 microGoals (each 15 points, 8 completed)
      for (let i = 1; i <= 12; i++) {
        await ctx.db.insert("microGoals", {
          userId: studentAId,
          goalId: `g_${i}`,
          goalTitle: `Goal ${i}`,
          goalDescription: `Desc ${i}`,
          category: "wellness",
          difficulty: "easy",
          points: 15,
          completed: i <= 8,
          skipped: false,
          createdAt: 1720000000000 + i * 1000,
        });
      }

      // 6 JPMR logs (5 min each = 300s, pre 8, post 4)
      for (let i = 1; i <= 6; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          preIntensity: 8,
          postIntensity: 4,
          durationSeconds: 300,
          createdAt: 1720000000000 + i * 1000,
        });
      }

      // 4 reframe logs (pre 7, post 2)
      for (let i = 1; i <= 4; i++) {
        await ctx.db.insert("reframeLogs", {
          userId: studentAId,
          situation_text: `Sit ${i}`,
          thought_original: `Thought ${i}`,
          thinking_trap_choice: "catastrophizing",
          guided_answers: ["ans"],
          reframe_text: `Reframe ${i}`,
          pre_reframe_intensity: 7,
          post_reframe_intensity: 2,
          improvement_percentage: 71,
          saved_reframe_flag: false,
          createdAt: 1720000000000 + i * 1000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.totalCalmPoints).toBe(8 * 15); // 120 points (completed goals only)
    expect(stats.completedGoalsCount).toBe(8);
    expect(stats.jpmrMinutes).toBe(6 * 5); // 30 minutes
    expect(stats.avgJpmrDrop).toBe("4.0");
    expect(stats.reframesCount).toBe(4);
    expect(stats.avgReframeDrop).toBe("5.0");
  });

  test("INSIGHT-3B-06: Completed screening history remains correctly represented", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 2 completed attempts
      for (let i = 1; i <= 2; i++) {
        await ctx.db.insert("screeningAttempts", {
          userId: studentAId,
          status: "completed",
          startedAt: 1727400000000 + i * 60000,
          completedAt: 1727400000000 + i * 60000 + 30000,
          attemptType: i === 1 ? "baseline" : "reassessment",
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: {},
          results: {
            phq9: { administered: true, score: 6, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
            gad7: { administered: true, score: 5, maxScore: 21, severity: "mild", level: "mild" },
            pq16: { administered: true, score: 2, maxScore: 16, severity: "normal", level: "low" },
          },
          triageLevel: "mild",
          suicideFlag: false,
          psychosisFlag: false,
        });
      }

      // 1 in_progress attempt
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "in_progress",
        startedAt: 1727500000000,
        attemptType: "reassessment",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 0, maxScore: 27, severity: "normal", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 0, maxScore: 21, severity: "normal", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      // 1 abandoned attempt
      await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "abandoned",
        startedAt: 1727600000000,
        attemptType: "reassessment",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 0, maxScore: 27, severity: "normal", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 0, maxScore: 21, severity: "normal", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect((stats as any).screenings).toBeUndefined();

    const screenings = await studentASession.query(api.screening.getAll, { userId: studentAId });
    expect(screenings.length).toBe(2);
    expect(screenings.every((s: any) => s.status === "completed")).toBe(true);
    expect(screenings[0].phq9_total).toBe(6);
    expect(screenings[0].gad7_total).toBe(5);
  });

  test("INSIGHT-3B-07: Empty-state behavior does not create misleading activity", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    const stats = await studentASession.query(api.insights.getDailyStats, { userId: studentAId });
    expect(stats.totalCheckins).toBe(0);
    expect(stats.recentDailyMood.length).toBe(0);
    expect(stats.totalCalmPoints).toBe(0);
    expect(stats.completedGoalsCount).toBe(0);
    expect(stats.jpmrMinutes).toBe(0);
    expect(stats.reframesCount).toBe(0);
    expect((stats as any).screenings).toBeUndefined();
    expect((stats as any).triages).toBeUndefined();
  });

  test("INSIGHT-3B-08: Student cannot access another student's Insights data", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await expect(
      studentASession.query(api.insights.getDailyStats, { userId: studentBId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // =========================================================================
  // Priority 7 Phase 5 Step 3C — Timezone & Local Calendar Tests (TZ-01 to TZ-07)
  // =========================================================================

  test("TZ-01: Local date before UTC midnight does not roll to the next calendar day incorrectly", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Scenario: Student is in US Pacific (UTC-8, e.g. 18:00 local time on 2026-09-27)
    // In UTC, it is already 02:00 on 2026-09-28.
    // The student's local dateStr is "2026-09-27".
    const localDateStr = "2026-09-27";

    // Submit checkin with local dateStr
    await studentASession.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: localDateStr,
    });

    // Verify dailyCheckin is stored under local calendar date "2026-09-27", NOT "2026-09-28"
    const checkin = await studentASession.query(api.microGoals.getTodayCheckin, {
      dateStr: localDateStr,
    });
    expect(checkin).not.toBeNull();
    expect(checkin?.dateStr).toBe(localDateStr);
    expect(checkin?.mood).toBe("calm");

    // Querying for UTC date "2026-09-28" should return null because student has not checked in for the 28th
    const futureUtcCheckin = await studentASession.query(api.microGoals.getTodayCheckin, {
      dateStr: "2026-09-28",
    });
    expect(futureUtcCheckin).toBeNull();
  });

  test("TZ-02: Local date after UTC midnight does not incorrectly remain on the previous calendar day", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Scenario: Student is in Tokyo (UTC+9, e.g. 01:00 local time on 2026-09-28)
    // In UTC, it is still 16:00 on 2026-09-27.
    // The student's local dateStr is "2026-09-28".
    const localDateStr = "2026-09-28";

    await studentASession.mutation(api.microGoals.submitMorningCheckin, {
      mood: "energized",
      dateStr: localDateStr,
    });

    const checkin = await studentASession.query(api.microGoals.getTodayCheckin, {
      dateStr: localDateStr,
    });
    expect(checkin).not.toBeNull();
    expect(checkin?.dateStr).toBe("2026-09-28");
    expect(checkin?.mood).toBe("energized");

    // The previous UTC calendar day does NOT receive this checkin
    const prevUtcCheckin = await studentASession.query(api.microGoals.getTodayCheckin, {
      dateStr: "2026-09-27",
    });
    expect(prevUtcCheckin).toBeNull();
  });

  test("TZ-03: dailyCheckins.dateStr remains authoritative without UTC mutation", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Insert direct daily check-in with explicit local dateStr
    const explicitDateStr = "2026-05-15";
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: explicitDateStr,
        mood: "peaceful",
        createdAt: 1747353600000, // arbitrary epoch timestamp
      });
    });

    // Query via getTodayCheckin
    const checkin = await studentASession.query(api.microGoals.getTodayCheckin, {
      dateStr: explicitDateStr,
    });
    expect(checkin).not.toBeNull();
    expect(checkin?.dateStr).toBe(explicitDateStr);
    expect(checkin?.mood).toBe("peaceful");

    // Verify it is retrieved in insights getDailyStats
    const stats = await studentASession.query(api.insights.getDailyStats, {
      userId: studentAId,
    });
    expect(stats.totalCheckins).toBe(1);
    expect(stats.recentDailyMood[0].dateStr).toBe(explicitDateStr);
    expect(stats.recentDailyMood[0].mood).toBe("peaceful");
  });

  test("TZ-04: Micro-goal streak/date logic uses calendar semantics via dateStr and getPreviousDateStr", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Seed existing streak completed on 2026-09-26
    await t.run(async (ctx) => {
      await ctx.db.insert("streaks", {
        userId: studentAId,
        currentStreak: 5,
        longestStreak: 10,
        lastCompletionDate: "2026-09-26",
        freezeCount: 1,
        streakFrozenToday: false,
      });
    });

    // On 2026-09-27 (the very next day), streak should still be 5
    const streakNextDay = await studentASession.query(api.microGoals.getStreak, {
      userId: studentAId,
      dateStr: "2026-09-27",
    });
    expect(streakNextDay.currentStreak).toBe(5);

    // On 2026-09-29 (2 days skipped without freeze), streak is broken -> 0
    const streakBroken = await studentASession.query(api.microGoals.getStreak, {
      userId: studentAId,
      dateStr: "2026-09-29",
    });
    expect(streakBroken.currentStreak).toBe(0);

    // Helper math: getPreviousDateStr across month boundaries
    expect(getPreviousDateStr("2026-10-01")).toBe("2026-09-30");
    expect(getPreviousDateStr("2026-03-01")).toBe("2026-02-28"); // non-leap year
    expect(getPreviousDateStr("2024-03-01")).toBe("2024-02-29"); // leap year
    expect(getPreviousDateStr("2026-01-01")).toBe("2025-12-31"); // year boundary
  });

  test("TZ-05: Wellness energy-hour calculation uses timezoneOffsetMinutes instead of UTC", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Student alpha creates emotion logs at 02:30 UTC
    // 02:30 UTC in UTC is night/early morning (hour 2)
    // But in IST (UTC+5:30, offset = -330 minutes), 02:30 UTC is 08:00 local time (morning!)
    const utcTimestamp = new Date("2026-09-28T02:30:00Z").getTime();

    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentAId,
          emotion: "joy",
          bodyRegions: [],
          intensity: 4,
          createdAt: utcTimestamp + i * 1000,
        });
      }
    });

    // Update profile passing timezoneOffsetMinutes: -330 (IST)
    await studentASession.mutation(api.wellness.updateProfile, {
      timezoneOffsetMinutes: -330,
    });

    const profile = await studentASession.query(api.wellness.getProfile, {});
    // Because local time was 08:00 (morning: hours 5-11), energy_pattern should be "Morning person"
    expect(profile?.energy_pattern).toBe("Morning person");

    // Conversely, if evaluated with UTC (offset 0), hour is 2 (night), resulting in "Evening person"
    await studentASession.mutation(api.wellness.updateProfile, {
      timezoneOffsetMinutes: 0,
    });
    const profileUtc = await studentASession.query(api.wellness.getProfile, {});
    expect(profileUtc?.energy_pattern).toBe("Evening person");
  });

  test("TZ-06: Existing Step 3A date deduplication and stats semantics remain intact", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      // 3 distinct check-in dates
      const dates = ["2026-09-25", "2026-09-26", "2026-09-27"];
      for (let i = 0; i < dates.length; i++) {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: dates[i],
          mood: i === 0 ? "calm" : i === 1 ? "anxious" : "great",
          createdAt: 1727200000000 + i * 86400000,
        });
      }
    });

    const stats = await studentASession.query(api.insights.getDailyStats, {
      userId: studentAId,
    });
    expect(stats.totalCheckins).toBe(3);
    expect(stats.recentDailyMood.length).toBe(3);
    expect(stats.recentDailyMood.map((d: any) => d.dateStr)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  test("TZ-07: Weekday label parsing from dateStr does not shift across timezones", () => {
    // Helper replicating app/(auth)/(tabs)/insights.tsx weekday derivation
    function getWeekdayLabel(dateStr: string): string {
      const [year, month, day] = dateStr.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString("en-US", { weekday: "short" });
    }

    // Explicit calendar dates tested
    expect(getWeekdayLabel("2026-09-27")).toBe("Sun");
    expect(getWeekdayLabel("2026-09-28")).toBe("Mon");
    expect(getWeekdayLabel("2026-09-29")).toBe("Tue");
    expect(getWeekdayLabel("2026-09-30")).toBe("Wed");
    expect(getWeekdayLabel("2026-10-01")).toBe("Thu");
    expect(getWeekdayLabel("2026-10-02")).toBe("Fri");
    expect(getWeekdayLabel("2026-10-03")).toBe("Sat");
  });

  // =========================================================================
  // Priority 7 Phase 5 Step 3D — Counselor Daily Check-In Visibility Tests
  // (COUNSELOR-CHECKIN-01 to COUNSELOR-CHECKIN-11)
  // =========================================================================

  test("COUNSELOR-CHECKIN-01: Counselor retrieves authorized student's recent check-ins", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    // Seed daily check-ins for Student A
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-27",
        mood: "calm",
        createdAt: 1727400000000,
      });
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "good",
        createdAt: 1727486400000,
      });
    });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
      lookbackDays: 14,
    });

    expect(result).toBeDefined();
    expect(result.studentId).toBe(studentAId);
    expect(result.totalCheckins).toBe(2);
    expect(result.lookbackDays).toBe(14);
    expect(result.checkins.length).toBe(2);
    expect(result.checkins[0].dateStr).toBe("2026-09-27");
    expect(result.checkins[0].mood).toBe("calm");
    expect(result.checkins[1].dateStr).toBe("2026-09-28");
    expect(result.checkins[1].mood).toBe("good");
  });

  test("COUNSELOR-CHECKIN-02: Admin retrieves student's recent check-ins", async () => {
    const { t, studentAId, adminId } = await setupTestEnvironment();
    const adminSession = t.withIdentity({ subject: adminId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "peaceful",
        createdAt: 1727486400000,
      });
    });

    const result = await adminSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
    });

    expect(result.totalCheckins).toBe(1);
    expect(result.checkins[0].mood).toBe("peaceful");
  });

  test("COUNSELOR-CHECKIN-03: Student attempts cross-student access and is rejected", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });

    // Student attempting to call counselor endpoint on another student
    await expect(
      studentASession.query(api.insights.getCounselorStudentDailyCheckins, {
        userId: studentBId,
      })
    ).rejects.toThrow(/Counselor or Admin access required/);

    // Student attempting to call counselor endpoint on themselves is also rejected
    // (must use standard student insights query)
    await expect(
      studentASession.query(api.insights.getCounselorStudentDailyCheckins, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  test("COUNSELOR-CHECKIN-04: Unauthenticated caller is rejected", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    await expect(
      t.query(api.insights.getCounselorStudentDailyCheckins, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Login required/);
  });

  test("COUNSELOR-CHECKIN-05: Canonical and legacy identity records are resolved and deduplicated by dateStr", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    await t.run(async (ctx) => {
      // Entry 1 under canonical users._id
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-25",
        mood: "calm",
        createdAt: 1727200000000,
      });
      // Entry 2 under legacy clerkId
      await ctx.db.insert("dailyCheckins", {
        userId: "clerk_student_a",
        dateStr: "2026-09-26",
        mood: "good",
        createdAt: 1727300000000,
      });
      // Entry 3: Duplicate for 2026-09-26 under canonical ID (e.g. re-checkin)
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-26",
        mood: "energized",
        createdAt: 1727305000000,
      });
    });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
    });

    // Should deduplicate 2026-09-26 to latest entry (energized) and return 2 distinct dates
    expect(result.totalCheckins).toBe(2);
    expect(result.checkins.length).toBe(2);
    expect(result.checkins.map((c: any) => c.dateStr)).toEqual(["2026-09-25", "2026-09-26"]);
    expect(result.checkins[1].mood).toBe("energized");
  });

  test("COUNSELOR-CHECKIN-06: Local dateStr remains unchanged across UTC midnight boundaries", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    // In UTC, this timestamp is 02:00 on 2026-09-28.
    // The student checked in at local date "2026-09-27".
    const explicitDateStr = "2026-09-27";
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: explicitDateStr,
        mood: "peaceful",
        createdAt: new Date("2026-09-28T02:00:00Z").getTime(),
      });
    });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
    });

    expect(result.checkins[0].dateStr).toBe(explicitDateStr);
  });

  test("COUNSELOR-CHECKIN-07: dailyCheckins and emotionLogs remain distinct", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    await t.run(async (ctx) => {
      // 1 daily check-in
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: Date.now(),
      });
      // 5 episodic emotion logs
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentAId,
          emotion: "anxious",
          bodyRegions: [],
          createdAt: Date.now() + i * 1000,
        });
      }
    });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
    });

    // Checkin telemetry must contain ONLY the 1 dailyCheckin, never emotionLogs
    expect(result.totalCheckins).toBe(1);
    expect(result.checkins.length).toBe(1);
    expect(result.checkins[0].mood).toBe("calm");
  });

  test("COUNSELOR-CHECKIN-08: No check-ins produces a clean empty state", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
    });

    expect(result.totalCheckins).toBe(0);
    expect(result.checkins).toEqual([]);
    expect(result.lookbackDays).toBe(14);
  });

  test("COUNSELOR-CHECKIN-09: Daily check-in retrieval does not modify triages or alerts", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    let triageId: Id<"triages">;
    let alertId: Id<"alerts">;

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "low",
        createdAt: Date.now(),
      });
      triageId = await ctx.db.insert("triages", {
        userId: studentAId,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "baseline_severe",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Query multiple times
    await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, { userId: studentAId });
    await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, { userId: studentAId });

    // Verify triages and alerts are completely untouched
    await t.run(async (ctx) => {
      const triage = await ctx.db.get(triageId);
      const alert = await ctx.db.get(alertId);
      expect(triage?.level).toBe("mild");
      expect(alert?.status).toBe("pending");
      const allTriages = await ctx.db.query("triages").collect();
      const allAlerts = await ctx.db.query("alerts").collect();
      expect(allTriages.length).toBe(1);
      expect(allAlerts.length).toBe(1);
    });
  });

  test("COUNSELOR-CHECKIN-10: 14-day UI window does not delete or alter older historical records", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    // Insert 25 daily check-ins
    await t.run(async (ctx) => {
      for (let i = 1; i <= 25; i++) {
        const dayStr = String(i).padStart(2, "0");
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: `2026-08-${dayStr}`,
          mood: "good",
          createdAt: 1725148800000 + i * 86400000,
        });
      }
    });

    const result = await counselorSession.query(api.insights.getCounselorStudentDailyCheckins, {
      userId: studentAId,
      lookbackDays: 14,
    });

    // Lifetime total must reflect all 25 checkins
    expect(result.totalCheckins).toBe(25);
    // UI review slice must be bounded to 14
    expect(result.checkins.length).toBe(14);

    // Database must still have all 25 rows intact
    await t.run(async (ctx) => {
      const allInDb = await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId", (q: any) => q.eq("userId", studentAId))
        .collect();
      expect(allInDb.length).toBe(25);
    });
  });

  test("COUNSELOR-CHECKIN-11: Existing Clinical Timeline Monitoring behavior remains unchanged", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const counselorSession = t.withIdentity({ subject: counselorId });

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckins", {
        userId: studentAId,
        dateStr: "2026-09-28",
        mood: "calm",
        createdAt: 1727500000000,
      });
    });

    // Under default timeline view (no category filter), daily check-ins are excluded
    const defaultTimeline = await counselorSession.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    expect(defaultTimeline.some((e: any) => e.eventType === "daily_mood_checkin")).toBe(false);

    // Under monitoring filter, daily check-ins appear
    const monitoringTimeline = await counselorSession.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "monitoring",
    });
    const checkinEvent = monitoringTimeline.find((e: any) => e.eventType === "daily_mood_checkin");
    expect(checkinEvent).toBeDefined();
    expect(checkinEvent?.title).toBe("Daily Mood: calm");
    expect(checkinEvent?.category).toBe("monitoring");
  });

  // =========================================================================
  // STEP 5A: FOLLOW-UP PROVENANCE & DEAD-CODE CLEANUP (FOLLOWUP-PROV-01 to 08)
  // =========================================================================

  test("FOLLOWUP-PROV-01: New screening-generated follow-up stores correct attemptId", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Submit screening attempt
    const attempt = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0), // 8 (mild)
        gad7: makeGAD7Responses(1), // 7 (mild)
        pq16: makePQ16Responses(0),
      },
    });

    // Schedule follow-up with attemptId and triageId
    const followUpId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: attempt.triageLevel,
      attemptId: attempt.attemptId,
      triageId: attempt.triageId,
    });

    await t.run(async (ctx) => {
      const followUp = await ctx.db.get(followUpId);
      expect(followUp).not.toBeNull();
      expect(followUp?.attemptId).toBe(attempt.attemptId);
      expect(followUp?.sourceType).toBe("screening");
    });
  });

  test("FOLLOWUP-PROV-02: New screening-generated follow-up stores correct triageId", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    const attempt = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    const followUpId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: attempt.triageLevel,
      attemptId: attempt.attemptId,
      triageId: attempt.triageId,
    });

    await t.run(async (ctx) => {
      const followUp = await ctx.db.get(followUpId);
      expect(followUp).not.toBeNull();
      expect(followUp?.triageId).toBe(attempt.triageId);
    });
  });

  test("FOLLOWUP-PROV-03: attemptId and triageId point to the correct originating records", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    const attempt = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(2, 0), // 16 (severe)
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    const followUpId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: attempt.triageLevel,
      attemptId: attempt.attemptId,
      triageId: attempt.triageId,
    });

    await t.run(async (ctx) => {
      const followUp = await ctx.db.get(followUpId);
      const attemptDoc = await ctx.db.get(followUp!.attemptId!);
      const triageDoc = await ctx.db.get(followUp!.triageId!);

      expect(attemptDoc).not.toBeNull();
      expect(triageDoc).not.toBeNull();
      expect(attemptDoc?._id).toBe(attempt.attemptId);
      expect(triageDoc?._id).toBe(attempt.triageId);
      // Cross-link verification: attempt and triage link each other
      expect(attemptDoc?.triageId).toBe(triageDoc?._id);
      expect(triageDoc?.attemptId).toBe(attemptDoc?._id);
    });
  });

  test("FOLLOWUP-PROV-04: Historical followUps without provenance remain readable", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    let legacyFollowUpId: Id<"followUps">;
    await t.run(async (ctx) => {
      legacyFollowUpId = await ctx.db.insert("followUps", {
        userId: studentAId,
        type: "screening_review",
        dueDate: Date.now() + 14 * 86400000,
        completed: false,
        createdAt: Date.now() - 3600000,
        // no attemptId, triageId, or sourceType
      });
    });

    const pending = await studentSession.query(api.followUps.getPending, { userId: studentAId });
    expect(pending.length).toBe(1);
    expect(pending[0]._id).toBe(legacyFollowUpId!);
    expect(pending[0].attemptId).toBeUndefined();
    expect(pending[0].triageId).toBeUndefined();
  });

  test("FOLLOWUP-PROV-05: Manual/independent follow-up does not receive fabricated provenance", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Independent scheduleFollowUp call without attemptId or triageId
    const followUpId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: "moderate",
    });

    await t.run(async (ctx) => {
      const followUp = await ctx.db.get(followUpId);
      expect(followUp).not.toBeNull();
      expect(followUp?.attemptId).toBeUndefined();
      expect(followUp?.triageId).toBeUndefined();
      expect(followUp?.sourceType).toBe("counselor");
    });
  });

  test("FOLLOWUP-PROV-06: Existing follow-up dueDate behavior remains unchanged", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    const before = Date.now();

    // Mild: 30 days
    const mildId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: "mild",
    });

    // Moderate: 7 days
    const modId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: "moderate",
    });

    // Severe: 2 days
    const sevId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: "severe",
    });

    // Default: 14 days
    const defId = await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: "unknown_level",
    });

    const after = Date.now();

    await t.run(async (ctx) => {
      const mild = await ctx.db.get(mildId);
      const mod = await ctx.db.get(modId);
      const sev = await ctx.db.get(sevId);
      const def = await ctx.db.get(defId);

      const msDay = 86400000;
      expect(mild!.dueDate).toBeGreaterThanOrEqual(before + 30 * msDay);
      expect(mild!.dueDate).toBeLessThanOrEqual(after + 30 * msDay);

      expect(mod!.dueDate).toBeGreaterThanOrEqual(before + 7 * msDay);
      expect(mod!.dueDate).toBeLessThanOrEqual(after + 7 * msDay);

      expect(sev!.dueDate).toBeGreaterThanOrEqual(before + 2 * msDay);
      expect(sev!.dueDate).toBeLessThanOrEqual(after + 2 * msDay);

      expect(def!.dueDate).toBeGreaterThanOrEqual(before + 14 * msDay);
      expect(def!.dueDate).toBeLessThanOrEqual(after + 14 * msDay);
    });
  });

  test("FOLLOWUP-PROV-07: Unauthorized users cannot use the change to access another student's records", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentASession = t.withIdentity({ subject: studentAId });
    const studentBSession = t.withIdentity({ subject: studentBId });

    // Student A submits a screening attempt
    const attemptA = await studentASession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    // Student B attempts to schedule follow-up passing Student A's attemptId
    await expect(
      studentBSession.mutation(api.followUps.scheduleFollowUp, {
        userId: studentBId,
        level: "mild",
        attemptId: attemptA.attemptId,
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B attempts to query Student A's pending follow-ups
    await expect(
      studentBSession.query(api.followUps.getPending, { userId: studentAId })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("FOLLOWUP-PROV-08: No triage or alert behavior changes as a result of provenance persistence", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Submit a high-risk attempt (PHQ item 9 = 2)
    const attempt = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 2),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    expect(attempt.suicideFlag).toBe(true);

    // Count triages and alerts before scheduleFollowUp
    let triagesBefore = 0;
    let alertsBefore = 0;
    await t.run(async (ctx) => {
      triagesBefore = (await ctx.db.query("triages").collect()).length;
      alertsBefore = (await ctx.db.query("alerts").collect()).length;
    });

    // Schedule follow-up with provenance
    await studentSession.mutation(api.followUps.scheduleFollowUp, {
      userId: studentAId,
      level: attempt.triageLevel,
      attemptId: attempt.attemptId,
      triageId: attempt.triageId,
    });

    // Verify triages and alerts count and contents are 100% unchanged
    await t.run(async (ctx) => {
      const triagesAfter = (await ctx.db.query("triages").collect()).length;
      const alertsAfter = (await ctx.db.query("alerts").collect()).length;

      expect(triagesAfter).toBe(triagesBefore);
      expect(alertsAfter).toBe(alertsBefore);

      const alert = await ctx.db
        .query("alerts")
        .withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt.attemptId))
        .first();
      expect(alert?.status).toBe("pending");
      expect(alert?.type).toBe("suicide");
    });
  });

  // =========================================================================
  // STEP 5B: WELLNESS PROFILE CLINICAL DECOUPLING (WELLNESS-5B-01 to 08)
  // =========================================================================

  test("WELLNESS-5B-01: wellnessProfiles no longer derives personality traits from PHQ-9", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Insert a severe PHQ-9 attempt (score 24 > 15)
    await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(3, 0), // 24 (severe)
        gad7: makeGAD7Responses(0),
        pq16: makePQ16Responses(0),
      },
    });

    // Update profile
    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });

    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });
    expect(profile).not.toBeNull();
    // Prior behavior added "Needs gentle support" when phq9 > 15. This MUST NOT be present.
    expect(profile?.personality_traits).not.toContain("Needs gentle support");
  });

  test("WELLNESS-5B-02: wellnessProfiles no longer derives personality traits from GAD-7", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Insert a severe GAD-7 attempt (score 21 > 10)
    await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(0, 0),
        gad7: makeGAD7Responses(3), // 21 (severe)
        pq16: makePQ16Responses(0),
      },
    });

    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });

    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });
    expect(profile).not.toBeNull();
    // Prior behavior added "Sensitive to stress" when gad7 > 10. This MUST NOT be present.
    expect(profile?.personality_traits).not.toContain("Sensitive to stress");
  });

  test("WELLNESS-5B-03: wellnessProfiles no longer derives wellness goals from PHQ/GAD scores", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Insert severe PHQ-9 (24) and GAD-7 (21)
    await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(3, 0),
        gad7: makeGAD7Responses(3),
        pq16: makePQ16Responses(0),
      },
    });

    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });

    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });
    expect(profile).not.toBeNull();
    // Prior behavior added "Gentle recovery" (PHQ > 10) and "Improve mood" (PHQ > 5)
    expect(profile?.wellness_goals).not.toContain("Gentle recovery");
    expect(profile?.wellness_goals).not.toContain("Improve mood");
  });

  test("WELLNESS-5B-04: Non-clinical wellness data remains available where safely supported", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Add 4 JPMR logs and 4 completed microGoals
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          completed: true,
          preIntensity: 7,
          postIntensity: 3,
          durationSeconds: 600,
          createdAt: Date.now() - i * 3600000,
        });
        await ctx.db.insert("microGoals", {
          userId: studentAId,
          goalId: `goal_${i}`,
          goalTitle: `Goal ${i}`,
          goalDescription: "Habit goal",
          category: "routine",
          difficulty: "easy",
          points: 10,
          completed: true,
          skipped: false,
          createdAt: Date.now() - i * 3600000,
        });
      }
    });

    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });

    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });
    expect(profile).not.toBeNull();
    // Non-clinical positive behavioral indicators are supported:
    expect(profile?.personality_traits).toContain("Values relaxation");
    expect(profile?.personality_traits).toContain("Consistent and improving");
    expect(profile?.wellness_goals).toContain("Maintain daily momentum");
  });

  test("WELLNESS-5B-05: Student authorization remains enforced", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const studentBSession = t.withIdentity({ subject: studentBId });

    // Student B attempts to query Student A's wellness profile -> DENIED
    await expect(
      studentBSession.query(api.wellness.getProfile, { userId: studentAId })
    ).rejects.toThrow(/Unauthorized/);

    // Student B attempts to mutate Student A's wellness profile -> DENIED
    await expect(
      studentBSession.mutation(api.wellness.updateProfile, { userId: studentAId })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("WELLNESS-5B-06: Existing historical wellnessProfile records remain readable", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    const pastTimestamp = Date.now() - 86400000;
    await t.run(async (ctx) => {
      await ctx.db.insert("wellnessProfiles", {
        userId: studentAId,
        personality_traits: ["Historical Explorer"],
        mood_pattern: "Historical Stable",
        wellness_goals: ["Historical Goal"],
        energy_pattern: "Historical Morning",
        last_updated: pastTimestamp,
      });
    });

    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });
    expect(profile).not.toBeNull();
    expect(profile?.personality_traits).toEqual(["Historical Explorer"]);
    expect(profile?.mood_pattern).toBe("Historical Stable");
    expect(profile?.wellness_goals).toEqual(["Historical Goal"]);
    expect(profile?.last_updated).toBe(pastTimestamp);
  });

  test("WELLNESS-5B-07: No screening/triage/alert records are modified by updateProfile", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Submit screening attempt
    const attempt = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(1, 0),
        gad7: makeGAD7Responses(1),
        pq16: makePQ16Responses(0),
      },
    });

    // Capture counts before updateProfile
    let attemptsBefore = 0;
    let triagesBefore = 0;
    let alertsBefore = 0;
    await t.run(async (ctx) => {
      attemptsBefore = (await ctx.db.query("screeningAttempts").collect()).length;
      triagesBefore = (await ctx.db.query("triages").collect()).length;
      alertsBefore = (await ctx.db.query("alerts").collect()).length;
    });

    // Run updateProfile multiple times
    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });
    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });

    // Verify clinical tables are completely untouched
    await t.run(async (ctx) => {
      const attemptsAfter = (await ctx.db.query("screeningAttempts").collect()).length;
      const triagesAfter = (await ctx.db.query("triages").collect()).length;
      const alertsAfter = (await ctx.db.query("alerts").collect()).length;

      expect(attemptsAfter).toBe(attemptsBefore);
      expect(triagesAfter).toBe(triagesBefore);
      expect(alertsAfter).toBe(alertsBefore);

      const attemptDoc = await ctx.db.get(attempt.attemptId);
      expect(attemptDoc?.triageLevel).toBe(attempt.triageLevel);
    });
  });

  test("WELLNESS-5B-08: No Priority 8 intervention/recommendation logic is introduced", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    await studentSession.mutation(api.wellness.updateProfile, { userId: studentAId });
    const profile = await studentSession.query(api.wellness.getProfile, { userId: studentAId });

    expect(profile).not.toBeNull();
    // Ensure only the established schema fields are returned without Priority 8 fields
    const keys = Object.keys(profile!);
    expect(keys).toContain("userId");
    expect(keys).toContain("personality_traits");
    expect(keys).toContain("mood_pattern");
    expect(keys).toContain("wellness_goals");
    expect(keys).toContain("energy_pattern");
    expect(keys).toContain("last_updated");

    // Strictly no recommendation / machine-learning triage fields
    expect(profile).not.toHaveProperty("recommendations");
    expect(profile).not.toHaveProperty("careLevelRecommendation");
    expect(profile).not.toHaveProperty("prescribedModules");
  });
});


