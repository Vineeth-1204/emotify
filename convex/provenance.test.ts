/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeAnswers(count: number, score: number = 0) {
  const ans: Record<string, number> = {};
  for (let i = 1; i <= count; i++) {
    ans[String(i)] = score;
  }
  return ans;
}

describe("Priority 4 Step 4: Clinical Event Provenance (PROV-01 to PROV-07)", () => {
  async function setupProvenanceEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Student A
    let studentAId = "";
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9811111111",
        role: "patient",
        status: "active",
        patientId: "STU-A",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student B
    let studentBId = "";
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9822222222",
        role: "patient",
        status: "active",
        patientId: "STU-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Counselor Clara
    let counselorId = "";
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Clara",
        mobile_number: "9833333333",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, studentAId, studentBId, counselorId };
  }

  // PROV-01: Screening attempt creates triage with bidirectional explicit references
  test("PROV-01: Submit screening attempt links attempt <-> triage deterministically", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const submission = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1), // total 9 (mild)
        gad7: makeAnswers(7, 1), // total 7 (mild)
        pq16: makeAnswers(16, 0),
      },
    });

    expect(submission.attemptId).toBeDefined();
    expect(submission.triageId).toBeDefined();

    // Verify in database directly
    await t.run(async (ctx) => {
      const attempt = await ctx.db.get(submission.attemptId);
      const triage = await ctx.db.get(submission.triageId);

      expect(attempt).not.toBeNull();
      expect(triage).not.toBeNull();

      // Explicit Convex Document ID relationships
      expect(attempt!.triageId).toBe(triage!._id);
      expect(triage!.attemptId).toBe(attempt!._id);
    });

    // Verify via provenance query
    const attemptWithTriage = await authedA.query(api.screening.getAttemptWithTriage, {
      attemptId: submission.attemptId,
    });
    expect(attemptWithTriage).not.toBeNull();
    expect(attemptWithTriage!.attempt._id).toBe(submission.attemptId);
    expect(attemptWithTriage!.triage?._id).toBe(submission.triageId);

    // Verify via reciprocal triage provenance query
    const triageWithAttempt = await authedA.query(api.triage.getTriageWithAttempt, {
      triageId: submission.triageId,
    });
    expect(triageWithAttempt).not.toBeNull();
    expect(triageWithAttempt!.triage._id).toBe(submission.triageId);
    expect(triageWithAttempt!.attempt?._id).toBe(submission.attemptId);
  });

  // PROV-02: High-risk screening creates an alert with full causal chain (attemptId and triageId)
  test("PROV-02: High-risk screening creates alert linking alert -> triage and alert -> attempt", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // High risk: PHQ-9 item 9 flag = 2 (suicide flag)
    const phq9Answers = makeAnswers(9, 1);
    phq9Answers["9"] = 2;

    const submission = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: phq9Answers,
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    expect(submission.suicideFlag).toBe(true);

    // Verify alert exists with provenance links
    let alertId: any = null;
    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_attemptId", (q) => q.eq("attemptId", submission.attemptId))
        .collect();

      expect(alerts.length).toBe(1);
      const alert = alerts[0];
      alertId = alert._id;
      expect(alert.type).toBe("suicide");
      expect(alert.attemptId).toBe(submission.attemptId);
      expect(alert.triageId).toBe(submission.triageId);
    });

    // Verify via getAttemptAlerts
    const attemptAlerts = await authedA.query(api.screening.getAttemptAlerts, {
      attemptId: submission.attemptId,
    });
    expect(attemptAlerts.length).toBe(1);
    expect(attemptAlerts[0]._id).toBe(alertId);
    expect(attemptAlerts[0].triageId).toBe(submission.triageId);

    // Verify via getAlertProvenance
    const provenance = await authedA.query(api.alerts.getAlertProvenance, { alertId });
    expect(provenance).not.toBeNull();
    expect(provenance!.alert._id).toBe(alertId);
    expect(provenance!.triage?._id).toBe(submission.triageId);
    expect(provenance!.attempt?._id).toBe(submission.attemptId);

    // Verify via getTriageAlerts
    const triageAlerts = await authedA.query(api.alerts.getTriageAlerts, {
      triageId: submission.triageId,
    });
    expect(triageAlerts.length).toBe(1);
    expect(triageAlerts[0]._id).toBe(alertId);
  });

  // PROV-03: Low-risk screening with no alert maintains attempt <-> triage, no alert created
  test("PROV-03: Low-risk screening creates attempt <-> triage without spurious alert", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Minimal score: 0 across all instruments
    const submission = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 0),
        gad7: makeAnswers(7, 0),
        pq16: makeAnswers(16, 0),
      },
    });

    expect(submission.triageLevel).toBe("mild");
    expect(submission.suicideFlag).toBe(false);
    expect(submission.psychosisFlag).toBe(false);

    // Verify attempt and triage are linked
    await t.run(async (ctx) => {
      const attempt = await ctx.db.get(submission.attemptId);
      const triage = await ctx.db.get(submission.triageId);
      expect(attempt!.triageId).toBe(submission.triageId);
      expect(triage!.attemptId).toBe(submission.attemptId);

      // Verify NO alerts exist with this attemptId or triageId
      const attemptAlerts = await ctx.db
        .query("alerts")
        .withIndex("by_attemptId", (q) => q.eq("attemptId", submission.attemptId))
        .collect();
      expect(attemptAlerts.length).toBe(0);

      const triageAlerts = await ctx.db
        .query("alerts")
        .withIndex("by_triageId", (q) => q.eq("triageId", submission.triageId))
        .collect();
      expect(triageAlerts.length).toBe(0);
    });

    // Provenance query returns empty alert list
    const attemptAlerts = await authedA.query(api.screening.getAttemptAlerts, {
      attemptId: submission.attemptId,
    });
    expect(attemptAlerts).toEqual([]);
  });

  // PROV-04: Multiple screening attempts by same student each have unique deterministic triage link
  test("PROV-04: Multiple screening attempts maintain independent, unmixed triage links", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Attempt 1: Mild
    const sub1 = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    // Attempt 2: Moderate
    const sub2 = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 2),
        gad7: makeAnswers(7, 2),
        pq16: makeAnswers(16, 0),
      },
    });

    expect(sub1.attemptId).not.toBe(sub2.attemptId);
    expect(sub1.triageId).not.toBe(sub2.triageId);

    // Verify reciprocal links are strictly isolated
    await t.run(async (ctx) => {
      const attempt1 = await ctx.db.get(sub1.attemptId);
      const triage1 = await ctx.db.get(sub1.triageId);
      const attempt2 = await ctx.db.get(sub2.attemptId);
      const triage2 = await ctx.db.get(sub2.triageId);

      expect(attempt1!.triageId).toBe(triage1!._id);
      expect(triage1!.attemptId).toBe(attempt1!._id);

      expect(attempt2!.triageId).toBe(triage2!._id);
      expect(triage2!.attemptId).toBe(attempt2!._id);

      // Distinct, non-overlapping
      expect(attempt1!.triageId).not.toBe(attempt2!.triageId);
      expect(triage1!.attemptId).not.toBe(triage2!.attemptId);
    });
  });

  // PROV-05: Existing historical records remain readable without errors
  test("PROV-05: Existing historical records with undefined attemptId/triageId remain readable", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Seed historical records that lack provenance references
    let histTriageId: any = null;
    let histAlertId: any = null;
    let histAttemptId: any = null;

    await t.run(async (ctx) => {
      histTriageId = await ctx.db.insert("triages", {
        userId: studentAId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now() - 100000,
        // attemptId intentionally left undefined (historical)
      });

      histAlertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "general",
        status: "pending",
        createdAt: Date.now() - 100000,
        // attemptId and triageId intentionally left undefined (historical)
      });

      histAttemptId = await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: Date.now() - 100000,
        completedAt: Date.now() - 99000,
        instrumentVersions: {
          phq9: "PHQ-9.v1",
          gad7: "GAD-7.v1",
          pq16: "PQ-16.v1",
        },
        responses: {
          phq9: makeAnswers(9, 1),
          gad7: makeAnswers(7, 1),
          pq16: makeAnswers(16, 0),
        },
        results: {
          phq9: { administered: true, score: 9, maxScore: 27, severity: "Mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 7, maxScore: 21, severity: "Mild", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "Normal", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        // triageId intentionally left undefined (historical)
      });
    });

    // 1. Historical triage is readable via getLatest
    const latestTriage = await authedA.query(api.triage.getLatest, { userId: studentAId });
    expect(latestTriage).not.toBeNull();
    expect(latestTriage!._id).toBe(histTriageId);
    expect(latestTriage!.attemptId).toBeUndefined();

    // 2. Historical alert is readable via getAll
    const alerts = await authedA.query(api.alerts.getAll, { userId: studentAId });
    expect(alerts.length).toBe(1);
    expect(alerts[0]._id).toBe(histAlertId);
    expect(alerts[0].attemptId).toBeUndefined();
    expect(alerts[0].triageId).toBeUndefined();

    // 3. Provenance queries on historical records return null for unlinked relatives safely
    const histAttemptProv = await authedA.query(api.screening.getAttemptWithTriage, {
      attemptId: histAttemptId,
    });
    expect(histAttemptProv).not.toBeNull();
    expect(histAttemptProv!.attempt._id).toBe(histAttemptId);
    expect(histAttemptProv!.triage).toBeNull(); // Safely null, not crashing

    const histAlertProv = await authedA.query(api.alerts.getAlertProvenance, {
      alertId: histAlertId,
    });
    expect(histAlertProv).not.toBeNull();
    expect(histAlertProv!.alert._id).toBe(histAlertId);
    expect(histAlertProv!.triage).toBeNull();
    expect(histAlertProv!.attempt).toBeNull();
  });

  // PROV-06: Unauthorized student cannot use provenance queries to access another student's data
  test("PROV-06: Unauthorized student cannot access another student's provenance data", async () => {
    const { t, studentAId, studentBId, counselorId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });
    const authedB = t.withIdentity({ subject: studentBId });
    const authedCounselor = t.withIdentity({ subject: counselorId });

    // Student A submits high-risk screening (attempt, triage, alert)
    const phq9Answers = makeAnswers(9, 1);
    phq9Answers["9"] = 3;

    const subA = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: phq9Answers,
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    let alertAId: any = null;
    await t.run(async (ctx) => {
      const alert = await ctx.db
        .query("alerts")
        .withIndex("by_attemptId", (q) => q.eq("attemptId", subA.attemptId))
        .first();
      alertAId = alert!._id;
    });

    // Student B attempts to query Student A's provenance -> All must be DENIED
    await expect(
      authedB.query(api.screening.getAttemptWithTriage, { attemptId: subA.attemptId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    await expect(
      authedB.query(api.screening.getAttemptAlerts, { attemptId: subA.attemptId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    await expect(
      authedB.query(api.triage.getTriageWithAttempt, { triageId: subA.triageId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    await expect(
      authedB.query(api.alerts.getAlertProvenance, { alertId: alertAId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    await expect(
      authedB.query(api.alerts.getTriageAlerts, { triageId: subA.triageId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    // Counselor CAN access Student A's provenance data
    const counselorAttemptProv = await authedCounselor.query(api.screening.getAttemptWithTriage, {
      attemptId: subA.attemptId,
    });
    expect(counselorAttemptProv).not.toBeNull();
    expect(counselorAttemptProv!.attempt._id).toBe(subA.attemptId);

    const counselorAlertProv = await authedCounselor.query(api.alerts.getAlertProvenance, {
      alertId: alertAId,
    });
    expect(counselorAlertProv).not.toBeNull();
    expect(counselorAlertProv!.alert._id).toBe(alertAId);
  });

  // PROV-07: An alert created independently of screening does not receive fabricated attemptId or triageId
  test("PROV-07: Independent alert does NOT receive fabricated attemptId or triageId", async () => {
    const { t, studentAId } = await setupProvenanceEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Independent alert created via alerts.createAlert
    const alertId = await authedA.mutation(api.alerts.createAlert, {
      type: "manual_sos",
    });

    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId);
      expect(alert).not.toBeNull();
      expect(alert!.type).toBe("manual_sos");
      // Zero fabricated links
      expect(alert!.attemptId).toBeUndefined();
      expect(alert!.triageId).toBeUndefined();
    });

    // Provenance query returns alert with null relatives
    const provenance = await authedA.query(api.alerts.getAlertProvenance, { alertId });
    expect(provenance).not.toBeNull();
    expect(provenance!.alert._id).toBe(alertId);
    expect(provenance!.triage).toBeNull();
    expect(provenance!.attempt).toBeNull();
  });
});
