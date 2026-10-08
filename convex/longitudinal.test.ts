/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

function makePHQ9Responses(itemValues: number[] = [1, 1, 0, 0, 0, 0, 0, 0, 0]): Record<string, number> {
  const res: Record<string, number> = {};
  itemValues.forEach((val, idx) => {
    res[`phq9_q${idx + 1}`] = val;
  });
  return res;
}

function makeGAD7Responses(itemValues: number[] = [1, 0, 0, 0, 0, 0, 0]): Record<string, number> {
  const res: Record<string, number> = {};
  itemValues.forEach((val, idx) => {
    res[`gad7_q${idx + 1}`] = val;
  });
  return res;
}

function makePQ16Responses(yesCount = 0): Record<string, number> {
  const res: Record<string, number> = {};
  for (let i = 1; i <= 16; i++) {
    res[`pq16_q${i}`] = i <= yesCount ? 1 : 0;
  }
  return res;
}

describe("Priority 5 Step 3: Longitudinal Readiness & Screening Migration Suite", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Admin
    let adminId!: Id<"users">;
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Clinical Admin",
        email: "admin@hospital.org",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student Alpha
    let studentAId!: Id<"users">;
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        email: "alpha@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-ALPHA",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Student Beta
    let studentBId!: Id<"users">;
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        email: "beta@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-BETA",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 4. Counselor
    let counselorId!: Id<"users">;
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Clara",
        email: "clara@hospital.org",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return { t, adminId, studentAId, studentBId, counselorId };
  }

  const mildResponses = {
    phq9: makePHQ9Responses([1, 1, 0, 0, 0, 0, 0, 0, 0]), // Total = 2 (mild)
    gad7: makeGAD7Responses([1, 0, 0, 0, 0, 0, 0]), // Total = 1 (mild)
    pq16: makePQ16Responses(0),
  };

  const moderateResponses = {
    phq9: makePHQ9Responses([2, 2, 1, 1, 1, 0, 0, 0, 0]), // Total = 7 (mild-moderate)
    gad7: makeGAD7Responses([2, 2, 1, 1, 0, 0, 0]), // Total = 6 (mild-moderate)
    pq16: makePQ16Responses(0),
  };

  const escalatedResponses = {
    phq9: makePHQ9Responses([3, 3, 2, 2, 2, 2, 1, 1, 0]), // Total = 16 (severe, jump > 5 from 7)
    gad7: makeGAD7Responses([3, 3, 2, 2, 1, 1, 0]), // Total = 12 (moderate)
    pq16: makePQ16Responses(0),
  };

  test("LONG-01: Repeated screening attempts coexist for same student without mutating historical records", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Submit Attempt 1
    const res1 = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: mildResponses,
      startedAt: Date.now() - 60000,
    });
    expect(res1.attemptId).toBeDefined();

    // Verify Attempt 1 stored
    let attempt1Doc: any;
    await t.run(async (ctx) => {
      attempt1Doc = await ctx.db.get(res1.attemptId);
      expect(attempt1Doc.results.phq9.score).toBe(2);
      expect(attempt1Doc.status).toBe("completed");
    });

    // Submit Attempt 2 later
    const res2 = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: moderateResponses,
      startedAt: Date.now() - 30000,
    });
    expect(res2.attemptId).toBeDefined();
    expect(res2.attemptId).not.toEqual(res1.attemptId);

    // Verify both attempts exist, Attempt 1 is immutable
    await t.run(async (ctx) => {
      const allAttempts = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();

      expect(allAttempts.length).toBe(2);

      const a1 = allAttempts.find((a) => a._id === res1.attemptId);
      const a2 = allAttempts.find((a) => a._id === res2.attemptId);

      expect(a1?.results.phq9.score).toBe(2);
      expect(a1?.completedAt).toBe(attempt1Doc.completedAt); // Immutable timestamp
      expect(a2?.results.phq9.score).toBe(7);
      expect(a2?.completedAt).toBeGreaterThanOrEqual(a1!.completedAt!);
    });
  });

  test("LONG-02: Legacy screenings mirror write is discontinued and readers query authoritative screeningAttempts", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Submit screening attempt
    const res = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: moderateResponses,
      startedAt: Date.now() - 10000,
    });

    // Verify ZERO rows inserted into legacy screenings table
    await t.run(async (ctx) => {
      const legacyRows = await ctx.db.query("screenings").collect();
      expect(legacyRows.length).toBe(0);
    });

    // Verify getLatest returns authoritative data mapped correctly
    const latest = await studentSession.query(api.screening.getLatest, {});
    expect(latest).not.toBeNull();
    expect(latest?.phq9_total).toBe(7);
    expect(latest?.gad7_total).toBe(6);
    expect(latest?.attemptId).toEqual(res.attemptId);

    // Verify getAll returns authoritative data
    const all = await studentSession.query(api.screening.getAll, {});
    expect(all.length).toBe(1);
    expect(all[0].phq9_total).toBe(7);
    expect(all[0].attemptId).toEqual(res.attemptId);
  });

  test("LONG-03: Legacy screenings fallback works seamlessly for unmigrated historical records", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Insert historical legacy screening record directly
    await t.run(async (ctx) => {
      await ctx.db.insert("screenings", {
        userId: studentAId,
        phq9_total: 11,
        gad7_total: 9,
        pq16_total: 1,
        phq9_item9_flag: false,
        phq9_item9_score: 0,
        createdAt: Date.now() - 500000,
      });
    });

    // Query getLatest & getAll
    const latest = await studentSession.query(api.screening.getLatest, {});
    expect(latest).not.toBeNull();
    expect(latest?.phq9_total).toBe(11);
    expect(latest?.gad7_total).toBe(9);

    const all = await studentSession.query(api.screening.getAll, {});
    expect(all.length).toBe(1);
    expect(all[0].phq9_total).toBe(11);
  });

  test("LONG-04: Longitudinal escalation monitoring detects score escalation across screeningAttempts", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const studentSession = t.withIdentity({ subject: studentAId });

    // Attempt 1: Mild (PHQ=2, GAD=1)
    await studentSession.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: mildResponses,
      startedAt: Date.now() - 20000,
    });

    // Attempt 2: Escalated mild-moderate (PHQ=9, jump > 5, no severe alert triggered)
    const escalatedMild = {
      phq9: makePHQ9Responses([3, 2, 2, 1, 1, 0, 0, 0, 0]), // Total = 9 (jump 9 - 2 = 7 > 5)
      gad7: makeGAD7Responses([1, 1, 1, 0, 0, 0, 0]), // Total = 3
      pq16: makePQ16Responses(0),
    };

    const res2 = await studentSession.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: escalatedMild,
      startedAt: Date.now() - 5000,
    });

    // Verify escalation alert created and linked to Attempt 2
    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const escalationAlert = alerts.find((a) => a.attemptId === res2.attemptId);
      expect(escalationAlert).toBeDefined();
      expect(escalationAlert?.type).toBe("escalation");
      expect(escalationAlert?.status).toBe("pending");
    });
  });

  test("LONG-05: Cross-student isolation prevents access to other student's screening records and timeline", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const sessionA = t.withIdentity({ subject: studentAId });
    const sessionB = t.withIdentity({ subject: studentBId });

    // Student A submits screening
    await sessionA.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: mildResponses,
      startedAt: Date.now() - 10000,
    });

    // Student B queries their own screening - should be empty
    const bScreenings = await sessionB.query(api.screening.getAll, {});
    expect(bScreenings.length).toBe(0);

    // Student B attempts to query Student A's clinical timeline - should be rejected
    await expect(
      sessionB.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId })
    ).rejects.toThrow();
  });

  test("LONG-06: Clinical timeline seamlessly aggregates repeated screening attempts with provenance", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const sessionA = t.withIdentity({ subject: studentAId });
    const sessionCounselor = t.withIdentity({ subject: counselorId });

    // Submit Attempt 1
    const res1 = await sessionA.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: mildResponses,
      startedAt: Date.now() - 30000,
    });

    // Submit Attempt 2
    const res2 = await sessionA.mutation(api.screening.submitScreeningAttempt, {
      patientId: "STU-ALPHA",
      responses: moderateResponses,
      startedAt: Date.now() - 10000,
    });

    // Counselor views Student A's timeline
    const timeline = await sessionCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const screeningEvents = timeline.filter((e) => e.eventType === "screening_completed");
    expect(screeningEvents.length).toBe(2);

    const eventAttemptIds = screeningEvents.map((e) => e.provenance?.attemptId);
    expect(eventAttemptIds).toContain(String(res1.attemptId));
    expect(eventAttemptIds).toContain(String(res2.attemptId));
  });

  test("LONG-07: Daily checkin timezone safety supports client-local dateStr and prevents collisions", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const sessionA = t.withIdentity({ subject: studentAId });

    // Submit morning checkin with client-provided local date (e.g. Asia/Kolkata date)
    const clientDate = "2026-09-28";
    const res1 = await sessionA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "great",
      dateStr: clientDate,
    });
    expect(res1.message).toBeUndefined(); // successful

    // Verify stored with client dateStr
    const todayCheckin = await sessionA.query(api.microGoals.getTodayCheckin, {
      dateStr: clientDate,
    });
    expect(todayCheckin).not.toBeNull();
    expect(todayCheckin?.mood).toBe("great");
    expect(todayCheckin?.dateStr).toBe(clientDate);

    // Duplicate checkin for same client date is prevented
    const res2 = await sessionA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "fine",
      dateStr: clientDate,
    });
    expect(res2.success).toBe(false);
    expect(res2.message).toContain("Already checked in today");
  });

  test("LONG-08: Emoty AI chat isolation and exclusion from clinical timeline", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const sessionA = t.withIdentity({ subject: studentAId });
    const sessionCounselor = t.withIdentity({ subject: counselorId });

    // Student A sends a private message to Emoty
    await sessionA.mutation(internal.companion.createMessage, {
      messageId: "msg_priv_123",
      role: "user",
      content: "I felt overwhelmed during exams yesterday.",
    });

    // Verify message stored in aiCompanionLogs
    await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    // Verify NO raw dialogue appears in Student A's clinical timeline
    const timeline = await sessionCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    for (const evt of timeline) {
      expect(evt.title).not.toContain("I felt overwhelmed during exams yesterday.");
      expect(evt.summary).not.toContain("I felt overwhelmed during exams yesterday.");
    }
  });
});
