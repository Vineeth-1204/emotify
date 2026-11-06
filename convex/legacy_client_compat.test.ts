/**
 * Legacy-client compatibility layer (temporary; removal condition in
 * docs/RELEASE_READINESS_REMEDIATION_REPORT.md).
 *
 * App builds released before the data-minimization change (main @ 0709df0 up to 40bfb79) call
 * triage.getLatest, screening.getLatest, screening.getAll, followUps.getStudentFollowUps
 * (sourceType) and alerts.createAlert as the signed-in student. These tests replay the exact
 * decisions those builds make from the responses, prove they match what new builds derive from
 * the minimal endpoints, and prove the legacy views never disclose clinical internals. Staff
 * responses and caseload authorization stay unchanged.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { legacyTriageLevel, legacyFollowUpSourceType } from "../common/legacyClientCompat";

const modules = import.meta.glob("./**/*.ts");

const zeros = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
const fill = (n: number, value: number, count = n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), i < count ? value : 0]));
const RESPONSES = {
  mild: { phq9: zeros(9), gad7: zeros(7), pq16: zeros(16) },
  moderate: { phq9: fill(9, 2, 6), gad7: zeros(7), pq16: zeros(16) }, // PHQ-9 = 12
  severe: { phq9: zeros(9), gad7: fill(7, 3, 5), pq16: zeros(16) }, // GAD-7 = 15
  psychosis_flag: { phq9: zeros(9), gad7: zeros(7), pq16: fill(16, 1, 6) },
  suicide_flag: { phq9: { ...zeros(9), "9": 2 }, gad7: zeros(7), pq16: zeros(16) },
};
type Level = keyof typeof RESPONSES;

/** The decisions builds 0709df0..40bfb79 make from triage.getLatest (copied from their source). */
const oldClient = (latestTriage: any, screeningComplete = true) => ({
  isEmergency: latestTriage?.level === "suicide_flag", // (tabs)/_layout.tsx crisis gate
  forceRetest: latestTriage?.level === "force_retest", // (tabs)/_layout.tsx redirect
  isScreeningComplete: screeningComplete && latestTriage?.level !== "force_retest",
  isSevere: !!latestTriage && ["severe", "suicide_flag", "psychosis_flag"].includes(latestTriage.level), // Home + AvatarContext
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      studentA: await user({ full_name: "Student A", role: "patient", patientId: "401", clerkId: "legacy_student_a" }),
      studentB: await user({ full_name: "Student B", role: "patient", patientId: "402" }),
      roleless: await user({ full_name: "Legacy Student", patientId: "403" }), // created before roles were stored
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentA as any, counsellorId: ids.counsellorA as any });
  const counts = () =>
    t.run(async (ctx) => ({
      alerts: (await ctx.db.query("alerts").collect()).length,
      notifications: (await ctx.db.query("notifications").collect()).length,
      triages: (await ctx.db.query("triages").collect()).length,
    }));
  return { t, ...ids, as, counts };
}

describe("pure mapping", () => {
  test("legacy level reveals no more than the minimal endpoints, and never under-reports", () => {
    expect(legacyTriageLevel("suicide_flag")).toBe("suicide_flag");
    expect(legacyTriageLevel("force_retest")).toBe("force_retest");
    expect(legacyTriageLevel("severe")).toBe("severe");
    expect(legacyTriageLevel("psychosis_flag")).toBe("severe");
    expect(legacyTriageLevel("moderate")).toBe("moderate");
    expect(legacyTriageLevel("mild")).toBe("mild");
    expect(legacyTriageLevel("something_new")).toBe("moderate");
    expect(legacyTriageLevel(undefined)).toBeNull();
    expect(legacyFollowUpSourceType("self_initiated")).toBe("self_initiated");
    for (const other of ["screening", "appointment", "counsellor", undefined]) expect(legacyFollowUpSourceType(other)).toBe("care_team");
  });
});

describe("old client contract: triage.getLatest", () => {
  for (const level of Object.keys(RESPONSES) as Level[]) {
    test(`${level}: old-build decisions equal the new getMySafetyStatus decisions; only { level } is returned`, async () => {
      const { as, studentA } = await setup();
      await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES[level] });
      // Old builds call it with their own id, or with no argument.
      for (const args of [{ userId: studentA }, {}]) {
        const legacy: any = await as(studentA).query(api.triage.getLatest, args);
        expect(legacy).toEqual({ level: legacyTriageLevel(level) });
        const status: any = await as(studentA).query(api.triage.getMySafetyStatus, {});
        const old = oldClient(legacy);
        expect(old.isEmergency).toBe(status.crisis);
        expect(old.forceRetest).toBe(status.forceRetest);
        expect(old.isSevere).toBe(status.elevatedSupport);
      }
    });
  }

  test("forced retest and 'no screening yet' behave as in old builds", async () => {
    const { t, as, admin, studentA, studentB } = await setup();
    expect(await as(studentB).query(api.triage.getLatest, {})).toBeNull();
    expect(oldClient(null, false)).toEqual({ isEmergency: false, forceRetest: false, isScreeningComplete: false, isSevere: false });
    await as(admin).mutation(api.triage.triggerScreeningTest, { userId: studentA });
    const legacy: any = await as(studentA).query(api.triage.getLatest, { userId: studentA });
    expect(legacy).toEqual({ level: "force_retest" });
    expect(oldClient(legacy)).toMatchObject({ forceRetest: true, isScreeningComplete: false, isEmergency: false });
    expect(await t.run(async (ctx) => (await ctx.db.query("triages").collect()).length)).toBe(1);
  });

  test("a student using their legacy clerkId alias still gets their own reduced view", async () => {
    const { as, studentA } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    expect(await as(studentA).query(api.triage.getLatest, { userId: "legacy_student_a" })).toEqual({ level: "suicide_flag" });
  });

  test("legacy accounts with no role keep the crisis gate on old and new builds", async () => {
    const { as, roleless } = await setup();
    await as(roleless).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    expect(await as(roleless).query(api.triage.getLatest, {})).toEqual({ level: "suicide_flag" });
    expect(await as(roleless).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: true, forceRetest: false, elevatedSupport: true });
  });

  test("another student's record, anonymous callers and out-of-caseload counsellors are refused", async () => {
    const { t, as, studentA, studentB, counsellorB } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    await expect(as(studentB).query(api.triage.getLatest, { userId: studentA })).rejects.toThrow(/Students can access ONLY/);
    await expect(as(studentB).query(api.triage.getLatest, { userId: "legacy_student_a" })).rejects.toThrow(/Students can access ONLY/);
    await expect(t.query(api.triage.getLatest, { userId: studentA })).rejects.toThrow(/Unauthenticated/);
    await expect(as(counsellorB).query(api.triage.getLatest, { userId: studentA })).rejects.toThrow(/not in your caseload/);
  });

  test("staff responses are unchanged (full triage record)", async () => {
    const { as, admin, counsellorA, studentA } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.psychosis_flag });
    for (const staff of [admin, counsellorA]) {
      const row: any = await as(staff).query(api.triage.getLatest, { userId: studentA });
      expect(row).toMatchObject({ level: "psychosis_flag", psychosisFlag: true, suicideFlag: false, userId: studentA });
      expect(row._id).toBeTruthy();
      expect(row.attemptId).toBeTruthy();
    }
  });
});

describe("old client contract: screening.getLatest and screening.getAll", () => {
  test("Home totals and Profile export get only the fields old builds read", async () => {
    const { as, studentA } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.moderate });
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });

    const latest: any = await as(studentA).query(api.screening.getLatest, { userId: studentA });
    expect(latest).toEqual({ phq9_total: 2, gad7_total: 0 });
    // Old Home: phq9Score = latestScreening?.phq9_total ?? 0 (same numbers the new Home derives)
    const wellbeing: any = await as(studentA).query(api.screening.getMyWellbeingIndicators, {});
    expect(wellbeing.emotionalBalance.percent).toBe(Math.round(((27 - latest.phq9_total) / 27) * 100));

    const rows: any[] = await as(studentA).query(api.screening.getAll, { userId: studentA });
    const exported: any[] = await as(studentA).query(api.screening.exportMyScreenings, {});
    expect(rows).toEqual(exported.map((r) => ({ phq9_total: r.phq9Total, gad7_total: r.gad7Total, pq16_total: r.pq16Total, phq9_item9_score: r.phq9Item9, createdAt: r.completedAt })));
    // The old CSV line renders without throwing (createdAt is a valid timestamp)
    for (const s of rows) expect(() => `${s.phq9_total},${s.gad7_total},${s.pq16_total},${s.phq9_item9_score},${new Date(s.createdAt).toISOString()}`).not.toThrow();
    for (const internal of ["_id", "attemptId", "triageId", "triageLevel", "suicideFlag", "results", "responses", "userId", "patientId"]) {
      expect(JSON.stringify([latest, rows])).not.toContain(`"${internal}"`);
    }
  });

  test("no screening yet: old Home sees null and an empty export, as before", async () => {
    const { as, studentB } = await setup();
    expect(await as(studentB).query(api.screening.getLatest, {})).toBeNull();
    expect(await as(studentB).query(api.screening.getAll, {})).toEqual([]);
  });

  test("another student, anonymous callers and out-of-caseload counsellors are refused; staff unchanged", async () => {
    const { t, as, admin, counsellorB, studentA, studentB } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.moderate });
    for (const fn of [api.screening.getLatest, api.screening.getAll]) {
      await expect(as(studentB).query(fn, { userId: studentA })).rejects.toThrow(/Students can access ONLY/);
      await expect(t.query(fn, { userId: studentA })).rejects.toThrow(/Unauthenticated/);
      await expect(as(counsellorB).query(fn, { userId: studentA })).rejects.toThrow(/not in your caseload/);
    }
    const staffRows: any[] = await as(admin).query(api.screening.getAll, { userId: studentA });
    expect(staffRows[0]).toMatchObject({ phq9_total: 12, status: "completed" });
    expect(staffRows[0].attemptId).toBeTruthy();
  });
});

describe("old client contract: Appointments follow-ups", () => {
  test("old builds keep 'Complete' only for self-initiated follow-ups", async () => {
    const { as, studentA } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.mild });
    await as(studentA).mutation(api.followUps.create, { userId: studentA, type: "check_in", dueDate: Date.now() + 86400000 } as any);
    const rows: any[] = await as(studentA).query(api.followUps.getStudentFollowUps, {});
    const byType = Object.fromEntries(rows.map((f) => [f.type, f]));
    // Old Appointments: fu.sourceType !== 'self_initiated' -> "Awaiting counsellor", else "Complete"
    expect(byType.screening_review.sourceType).toBe("care_team");
    expect(byType.check_in.sourceType).toBe("self_initiated");
    // New builds use selfInitiated; both agree
    for (const f of rows) expect(f.sourceType === "self_initiated").toBe(f.selfInitiated);
  });
});

describe("old client contract: emergency request + alerts.createAlert", () => {
  test("the legacy createAlert call succeeds for the student's own account and writes nothing", async () => {
    const { as, studentA, counts } = await setup();
    const before = await counts();
    expect(await as(studentA).mutation(api.alerts.createAlert, { userId: studentA, type: "counselor_request" })).toBeNull();
    expect(await as(studentA).mutation(api.alerts.createAlert, { type: "counselor_request" })).toBeNull();
    expect(await counts()).toEqual(before);
  });

  test("createAlert cannot create alerts: other types, other students, staff and anonymous callers are refused", async () => {
    const { t, as, admin, studentA, studentB, counts } = await setup();
    const before = await counts();
    await expect(as(studentA).mutation(api.alerts.createAlert, { type: "suicide" })).rejects.toThrow(/Unsupported/);
    await expect(as(studentB).mutation(api.alerts.createAlert, { userId: studentA, type: "counselor_request" })).rejects.toThrow(/Students can access ONLY/);
    await expect(as(admin).mutation(api.alerts.createAlert, { userId: studentA, type: "counselor_request" })).rejects.toThrow(/created by the server/);
    await expect(t.mutation(api.alerts.createAlert, { type: "counselor_request" })).rejects.toThrow(/created by the server/);
    expect(await counts()).toEqual(before);
  });
});

describe("new client contract is unchanged", () => {
  test("new builds keep using the minimal endpoints", async () => {
    const { as, studentA } = await setup();
    const res: any = await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.severe, submissionKey: "11111111-2222-4333-8444-555555555555" });
    expect(res).toEqual({ status: "submitted", outcome: "priority_support", replayed: false });
    expect(await as(studentA).query(api.screening.getMyResultSummary, {})).toMatchObject({ status: "ready", outcome: "priority_support" });
    expect(await as(studentA).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: false, elevatedSupport: true });
  });
});
