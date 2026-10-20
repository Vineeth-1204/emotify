import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ZERO_PQ16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 0]));
/** PHQ-9 item 9 endorsed: raises a suicide-risk alert, the safety path assignments must carry. */
const FLAGGED = {
  phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 1 },
  gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  pq16: ZERO_PQ16,
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: now, ...doc });
    return {
      admin: await user({ full_name: "Admin Ada", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor Asha", role: "counsellor", email: "asha.login@example.edu", mobile_number: "9000000001" }),
      counsellorB: await user({ full_name: "Counsellor Bala", role: "counsellor", mobile_number: "9000000002" }),
      inactiveCounsellor: await user({ full_name: "Counsellor Former", role: "counsellor", status: "inactive" }),
      s1: await user({ full_name: "Student One", role: "patient", patientId: "101" }),
      s2: await user({ full_name: "Student Two", role: "patient", patientId: "102" }),
      s3: await user({ full_name: "Student Three", role: "patient", patientId: "103" }),
      inactiveStudent: await user({ full_name: "Student Paused", role: "patient", patientId: "104", status: "inactive" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  return { t, ...ids, as };
}

const activeRows = (t: any) =>
  t.run(async (ctx: any) => (await ctx.db.query("counsellorAssignments").collect()).filter((r: any) => r.active));

/** Student-linked records of every clinical type for one student. */
async function seedClinicalRecords(t: any, asStudent: any, studentId: string) {
  await asStudent.mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
  return await t.run(async (ctx: any) => {
    const now = Date.now();
    const attempt = (await ctx.db.query("screeningAttempts").collect()).find((a: any) => a.userId === studentId);
    const triage = (await ctx.db.query("triages").collect()).find((x: any) => x.userId === studentId);
    const alert = (await ctx.db.query("alerts").collect()).find((x: any) => x.userId === studentId);
    const appointmentId = await ctx.db.insert("appointments", { userId: studentId, status: "pending", createdAt: now, startTime: now + 3600000, date: "2026-10-20", time: "10:00 AM", title: "Check-in" });
    const followUpId = await ctx.db.insert("followUps", { userId: studentId, type: "check_in", dueDate: now + 86400000, completed: false, createdAt: now, status: "pending" });
    const requestId = await ctx.db.insert("counsellorRequests", { user_id: studentId, timestamp: now, status: "pending", thought_original: "test" });
    return { attemptId: attempt._id, triageId: triage._id, alertId: alert._id, appointmentId, followUpId, requestId };
  });
}

describe("admin assignment operations", () => {
  test("admin assigns one student; the counsellor is notified and the change is audited", async () => {
    const { t, admin, counsellorA, s1, as } = await setup();
    const res: any = await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    expect(res).toMatchObject({ success: true, outcome: "assigned", unchanged: false });

    const rows = await activeRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: s1, counsellorId: counsellorA, assignedBy: admin, active: true });

    const notes = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notes.filter((n) => n.recipientId === counsellorA && n.type === "caseload_assignment")).toHaveLength(1);
    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audit.some((a) => a.action === "caseload_assigned")).toBe(true);
  });

  test("bulk assignment assigns several students in one request", async () => {
    const { t, admin, counsellorA, s1, s2, s3, as } = await setup();
    const res: any = await as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2, s3] as any, counsellorId: counsellorA as any });
    expect(res.success).toBe(true);
    expect(res.summary).toEqual({ assigned: 3, reassigned: 0, unchanged: 0, failed: 0 });
    expect((await activeRows(t)).map((r: any) => r.studentId).sort()).toEqual([s1, s2, s3].sort());
    // One summary notification, not one per student
    const notes = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notes.filter((n) => n.recipientId === counsellorA)).toHaveLength(1);
  });

  test("reassignment ends the previous row, keeps it as history, and notifies both counsellors", async () => {
    const { t, admin, counsellorA, counsellorB, s1, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    const res: any = await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });
    expect(res.outcome).toBe("reassigned");

    const all = await t.run(async (ctx) => ctx.db.query("counsellorAssignments").collect());
    expect(all).toHaveLength(2);
    const old = all.find((r) => r.counsellorId === counsellorA)!;
    expect(old).toMatchObject({ active: false, endedBy: admin, endReason: "reassigned" });
    expect(old.endedAt).toBeGreaterThan(0);
    expect(all.find((r) => r.counsellorId === counsellorB)).toMatchObject({ active: true });

    const history: any[] = await as(admin).query(api.counsellorAssignments.getStudentAssignmentHistory, { studentId: s1 as any });
    expect(history.map((h) => [h.counsellorName, h.active])).toEqual([["Counsellor Bala", true], ["Counsellor Asha", false]]);

    const notes = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notes.some((n) => n.recipientId === counsellorA && n.title === "Caseload updated")).toBe(true);
    expect(notes.some((n) => n.recipientId === counsellorB && n.title === "New student assigned")).toBe(true);
  });

  test("admin removes an assignment, singly and in bulk", async () => {
    const { t, admin, counsellorA, s1, s2, s3, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2, s3] as any, counsellorId: counsellorA as any });
    expect(await as(admin).mutation(api.counsellorAssignments.unassign, { studentId: s1 as any })).toMatchObject({ ended: 1 });
    const bulk: any = await as(admin).mutation(api.counsellorAssignments.unassignMany, { studentIds: [s1, s2, s3] as any });
    expect(bulk.summary).toEqual({ unassigned: 2, unchanged: 1 });
    expect(await activeRows(t)).toHaveLength(0);
    const ended = await t.run(async (ctx) => ctx.db.query("counsellorAssignments").collect());
    expect(ended.every((r) => r.endReason === "unassigned" && r.endedBy === admin)).toBe(true);
  });

  test("repeating the same assignment is idempotent and never creates a duplicate active row", async () => {
    const { t, admin, counsellorA, s1, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    const again: any = await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    expect(again.outcome).toBe("unchanged");
    const bulk: any = await as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s1] as any, counsellorId: counsellorA as any });
    expect(bulk.summary).toEqual({ assigned: 0, reassigned: 0, unchanged: 1, failed: 0 });
    expect(await activeRows(t)).toHaveLength(1);
  });

  test("concurrent conflicting requests leave exactly one active counsellor", async () => {
    const { t, admin, counsellorA, counsellorB, s1, s2, as } = await setup();
    const asAdmin = as(admin);
    await Promise.all([
      asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any }),
      asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any }),
      asAdmin.mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2] as any, counsellorId: counsellorA as any }),
      asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any }),
    ]);
    const rows = await activeRows(t);
    expect(rows.filter((r: any) => r.studentId === s1)).toHaveLength(1);
    expect(rows.filter((r: any) => r.studentId === s2)).toHaveLength(1);
  });

  test("a legacy duplicate active row is repaired by the next assignment", async () => {
    const { t, admin, counsellorA, counsellorB, s1, as } = await setup();
    await t.run(async (ctx) => {
      for (const c of [counsellorA, counsellorB]) {
        await ctx.db.insert("counsellorAssignments", { studentId: s1 as any, counsellorId: c as any, assignedBy: admin as any, assignedAt: 1, active: true });
      }
    });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    const rows = await activeRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].counsellorId).toBe(counsellorA);
  });

  test("invalid student and counsellor combinations are rejected", async () => {
    const { admin, counsellorA, inactiveCounsellor, s1, inactiveStudent, as } = await setup();
    const asAdmin = as(admin);
    await expect(asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: s1 as any })).rejects.toThrow("Counsellor not found.");
    await expect(asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: admin as any })).rejects.toThrow("Counsellor not found.");
    await expect(asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: inactiveCounsellor as any })).rejects.toThrow("Counsellor account is inactive.");
    await expect(asAdmin.mutation(api.counsellorAssignments.assign, { studentId: counsellorA as any, counsellorId: counsellorA as any })).rejects.toThrow("Student not found.");
    await expect(asAdmin.mutation(api.counsellorAssignments.assign, { studentId: inactiveStudent as any, counsellorId: counsellorA as any })).rejects.toThrow("Student account is inactive.");
    await expect(asAdmin.mutation(api.counsellorAssignments.assignMany, { studentIds: [], counsellorId: counsellorA as any })).rejects.toThrow("Select at least one student.");
  });

  test("bulk assignment reports partial failures per student and still applies the valid ones", async () => {
    const { t, admin, counsellorA, counsellorB, s1, s2, inactiveStudent, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });
    const res: any = await as(admin).mutation(api.counsellorAssignments.assignMany, {
      studentIds: [s1, s2, inactiveStudent, counsellorB] as any,
      counsellorId: counsellorA as any,
    });
    expect(res.success).toBe(false);
    expect(res.summary).toEqual({ assigned: 1, reassigned: 1, unchanged: 0, failed: 2 });
    const byId = Object.fromEntries(res.results.map((r: any) => [r.studentId, r]));
    expect(byId[inactiveStudent]).toMatchObject({ outcome: "failed", error: "Student account is inactive." });
    expect(byId[counsellorB]).toMatchObject({ outcome: "failed", error: "Student not found." });
    const rows = await activeRows(t);
    expect(rows.map((r: any) => [r.studentId, r.counsellorId]).sort()).toEqual([[s1, counsellorA], [s2, counsellorA]].sort());
  });

  test("bulk requests are capped at 100 distinct students", async () => {
    const { t, admin, counsellorA, as } = await setup();
    const many = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 101; i++) ids.push(await ctx.db.insert("users", { role: "patient", status: "active", full_name: `Bulk ${i}` }));
      return ids;
    });
    await expect(as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: many, counsellorId: counsellorA as any })).rejects.toThrow("at most 100");
    expect(await activeRows(t)).toHaveLength(0);
  });

  test("counsellors, students and anonymous callers cannot read or change assignments", async () => {
    const { t, counsellorA, s1, s2, as } = await setup();
    for (const caller of [as(counsellorA), as(s1), t]) {
      await expect(caller.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2] as any, counsellorId: counsellorA as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorAssignments.unassign, { studentId: s1 as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorAssignments.unassignMany, { studentIds: [s1] as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.query(api.counsellorAssignments.listStudentAssignments, {})).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.query(api.counsellorAssignments.listCounsellorUsers, {})).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.query(api.counsellorAssignments.getCounsellorRoster, { counsellorId: counsellorA as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.query(api.counsellorAssignments.getStudentAssignmentHistory, { studentId: s1 as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
    }
    expect(await activeRows(t)).toHaveLength(0);
  });
});

describe("admin roster views", () => {
  test("roster shows each student's counsellor, totals and filters", async () => {
    const { admin, counsellorA, counsellorB, s1, s2, as } = await setup();
    const asAdmin = as(admin);
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });

    const all: any = await asAdmin.query(api.counsellorAssignments.listStudentAssignments, {});
    expect(all.summary).toEqual({ totalStudents: 4, assigned: 2, unassigned: 2, assignedToInactiveCounsellor: 0 });
    expect(all.rows.find((r: any) => r.studentId === s1).counsellor).toMatchObject({ name: "Counsellor Asha", active: true });

    const unassigned: any = await asAdmin.query(api.counsellorAssignments.listStudentAssignments, { status: "unassigned" });
    expect(unassigned.rows.map((r: any) => r.patientId).sort()).toEqual(["103", "104"]);
    const forB: any = await asAdmin.query(api.counsellorAssignments.listStudentAssignments, { counsellorId: counsellorB as any });
    expect(forB.rows.map((r: any) => r.studentId)).toEqual([s2]);
    const search: any = await asAdmin.query(api.counsellorAssignments.listStudentAssignments, { search: "102" });
    expect(search.rows.map((r: any) => r.studentId)).toEqual([s2]);

    const counsellors: any[] = await asAdmin.query(api.counsellorAssignments.listCounsellorUsers, {});
    expect(counsellors.map((c) => [c.full_name, c.caseloadSize])).toEqual([["Counsellor Asha", 1], ["Counsellor Bala", 1]]);
    const withInactive: any[] = await asAdmin.query(api.counsellorAssignments.listCounsellorUsers, { includeInactive: true });
    expect(withInactive.find((c) => c.full_name === "Counsellor Former")).toMatchObject({ status: "inactive", caseloadSize: 0 });

    const roster: any = await asAdmin.query(api.counsellorAssignments.getCounsellorRoster, { counsellorId: counsellorA as any });
    expect(roster.students.map((s: any) => s.studentId)).toEqual([s1]);
  });

  test("students whose counsellor was deactivated are flagged for reassignment", async () => {
    const { t, admin, counsellorA, s1, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    await as(admin).mutation(api.users.toggleUserStatus, { userId: counsellorA as any, status: "inactive" });
    const res: any = await as(admin).query(api.counsellorAssignments.listStudentAssignments, {});
    expect(res.summary.assignedToInactiveCounsellor).toBe(1);
    expect(res.rows.find((r: any) => r.studentId === s1).counsellor.active).toBe(false);
    expect(await activeRows(t)).toHaveLength(1); // reversible: reactivating restores the caseload
  });
});

describe("caseload authorization across clinical endpoints", () => {
  async function scopedSetup() {
    const base = await setup();
    const records = await seedClinicalRecords(base.t, base.as(base.s1), base.s1);
    await base.as(base.admin).mutation(api.counsellorAssignments.assign, { studentId: base.s1 as any, counsellorId: base.counsellorA as any });
    return { ...base, records };
  }

  /** Every staff read path for one student's records; each must succeed or throw together. */
  const studentReads = (caller: any, studentId: string, r: any) => [
    () => caller.query(api.users.getByClerkId, { clerkId: studentId }),
    () => caller.query(api.timeline.getStudentClinicalTimeline, { userId: studentId }),
    () => caller.query(api.dashboard.getPatientTimeline, { userId: studentId }),
    () => caller.query(api.screening.getAll, { userId: studentId }),
    () => caller.query(api.screening.getScreeningHistory, { userId: studentId }),
    () => caller.query(api.screening.getAttemptById, { attemptId: r.attemptId }),
    () => caller.query(api.triage.getLatestByUserId, { userId: studentId }),
    () => caller.query(api.triage.getTriageWithAttempt, { triageId: r.triageId }),
    () => caller.query(api.alerts.getAll, { userId: studentId }),
    () => caller.query(api.alerts.getAlertProvenance, { alertId: r.alertId }),
    () => caller.query(api.followUps.getStudentFollowUps, { userId: studentId }),
    () => caller.query(api.followUps.getFollowUpById, { id: r.followUpId }),
    () => caller.query(api.appointments.getPatientAppointments, { userId: studentId }),
    () => caller.query(api.counsellorRequests.getStudentCounsellorRequests, { userId: studentId }),
    () => caller.query(api.counsellorRequests.getRequestById, { requestId: r.requestId }),
    () => caller.query(api.counsellorAssignments.getForStudent, { studentId }),
  ];
  const studentWrites = (caller: any, studentId: string, r: any) => [
    () => caller.mutation(api.alerts.acknowledgeAlert, { alertId: r.alertId }),
    () => caller.mutation(api.followUps.markComplete, { id: r.followUpId }),
    () => caller.mutation(api.triage.unblockPatient, { userId: studentId, action: "switch_low" }),
    () => caller.mutation(api.dashboard.addTimelineEvent, { userId: studentId, eventType: "note", title: "x", description: "y" }),
  ];

  test("counsellor A reads an assigned student's records; counsellor B is refused on every endpoint, including by record id", async () => {
    const { s1, counsellorA, counsellorB, records, as } = await scopedSetup();
    for (const read of studentReads(as(counsellorA), s1, records)) await expect(read()).resolves.not.toThrow();
    for (const read of studentReads(as(counsellorB), s1, records)) await expect(read()).rejects.toThrow(/not in your caseload|Unauthorized/);
    for (const write of studentWrites(as(counsellorB), s1, records)) await expect(write()).rejects.toThrow(/not in your caseload|Unauthorized/);
  });

  test("list endpoints only return the caller's caseload", async () => {
    const { t, s1, s2, counsellorA, counsellorB, admin, as } = await scopedSetup();
    await seedClinicalRecords(t, as(s2), s2);
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });

    const rosterA: any = await as(counsellorA).query(api.users.listPatients, {});
    expect(rosterA.map((p: any) => String(p._id))).toEqual([s1]);
    const selector: any[] = await as(counsellorA).query(api.users.searchPatientSelector, { search: "Student" });
    expect(selector.map((p) => String(p._id))).toEqual([s1]);

    const owned = (rows: any[], key = "userId") => Array.from(new Set(rows.map((r) => String(r[key]))));
    expect(owned(await as(counsellorA).query(api.dashboard.getAlerts, {}))).toEqual([s1]);
    expect(owned(await as(counsellorB).query(api.dashboard.getAlerts, {}))).toEqual([s2]);
    const followUps: any = await as(counsellorA).query(api.followUps.listAllFollowUps, {});
    expect(owned(Array.isArray(followUps) ? followUps : followUps.items ?? followUps.page ?? [])).toEqual([s1]);
    expect(owned(await as(counsellorA).query(api.appointments.listAllAppointments, {}))).toEqual([s1]);
    expect(owned(await as(counsellorA).query(api.appointments.listAllTwoWayAppointments, {}))).toEqual([s1]);
  });

  test("reassignment moves access: the previous counsellor loses it, the new one sees the full history", async () => {
    const { s1, admin, counsellorA, counsellorB, records, as } = await scopedSetup();
    const historyBefore: any = await as(counsellorA).query(api.screening.getAll, { userId: s1 });

    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });

    for (const read of studentReads(as(counsellorA), s1, records)) await expect(read()).rejects.toThrow(/not in your caseload|Unauthorized/);
    for (const read of studentReads(as(counsellorB), s1, records)) await expect(read()).resolves.not.toThrow();
    expect(await as(counsellorB).query(api.screening.getAll, { userId: s1 })).toEqual(historyBefore);
    const alertsB: any[] = await as(counsellorB).query(api.dashboard.getAlerts, {});
    expect(alertsB.some((a) => String(a._id) === String(records.alertId))).toBe(true);
    expect(await as(counsellorA).query(api.dashboard.getAlerts, {})).toEqual([]);
  });

  test("reassignment preserves every clinical record and its provenance", async () => {
    const { t, s1, admin, counsellorB, as } = await scopedSetup();
    const snapshot = async () =>
      t.run(async (ctx) => {
        const out: Record<string, any[]> = {};
        for (const table of ["screeningAttempts", "triages", "alerts", "appointments", "followUps", "counsellorRequests", "clinicalTimelines"] as const) {
          out[table] = await ctx.db.query(table).collect();
        }
        return out;
      });
    const before = await snapshot();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });
    await as(admin).mutation(api.counsellorAssignments.unassign, { studentId: s1 as any });
    const after = await snapshot();
    // Clinical records are untouched.
    for (const table of ["screeningAttempts", "triages", "alerts", "followUps", "counsellorRequests", "clinicalTimelines"]) {
      expect(after[table], table).toEqual(before[table]);
    }
    // Open appointments follow the student (workflow fields: counsellorId, status, history), but
    // their identity and provenance never change.
    const provenance = (rows: any[]) =>
      rows.map(({ _id, userId, attemptId, triageId, counsellorRequestId, date, time, title, reason, createdAt }) => ({ _id, userId, attemptId, triageId, counsellorRequestId, date, time, title, reason, createdAt }));
    expect(provenance(after.appointments)).toEqual(provenance(before.appointments));
  });

  test("the new counsellor is told about open safety alerts at hand-over", async () => {
    const { t, s1, admin, counsellorB, as } = await scopedSetup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });
    const note = (await t.run(async (ctx) => ctx.db.query("notifications").collect())).find((n) => n.recipientId === counsellorB && n.type === "caseload_assignment")!;
    expect(note.priority).toBe("high");
    expect(note.message).toMatch(/open safety alert/);
  });

  test("an unassigned student is not visible to any counsellor, but remains visible to admins", async () => {
    const { s1, admin, counsellorA, records, as } = await scopedSetup();
    await as(admin).mutation(api.counsellorAssignments.unassign, { studentId: s1 as any });
    for (const read of studentReads(as(counsellorA), s1, records)) await expect(read()).rejects.toThrow(/not in your caseload|Unauthorized/);
    for (const read of studentReads(as(admin), s1, records)) await expect(read()).resolves.not.toThrow();
  });

  test("a safety alert for a student whose counsellor is deactivated still reaches the active counsellors", async () => {
    const { t, admin, counsellorA, counsellorB, s2, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorA as any });
    await as(admin).mutation(api.users.toggleUserStatus, { userId: counsellorA as any, status: "inactive" });
    await as(s2).mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
    const recipients = (await t.run(async (ctx) => ctx.db.query("notifications").collect()))
      .filter((n) => n.type === "critical_risk")
      .map((n) => n.recipientId);
    expect(recipients).toContain(counsellorB);
    expect(recipients).toContain(admin);
    expect(recipients).not.toContain(counsellorA);
  });
});

describe("student: my counsellor", () => {
  test("an assigned student sees only the counsellor's display name, role and status", async () => {
    const { admin, counsellorA, s1, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    const mine: any = await as(s1).query(api.counsellorAssignments.getMyCounsellor, {});
    expect(mine).toEqual({
      status: "assigned",
      counsellor: { displayName: "Counsellor Asha", role: "Counsellor", email: null, phone: null },
      assignedAt: expect.any(Number),
    });
    // Login identifiers, account email, ids and clinical data are never included
    const text = JSON.stringify(mine);
    for (const secret of ["9000000001", "asha.login@example.edu", counsellorA, "triage", "alert", "phq"]) expect(text).not.toContain(secret);
  });

  test("linked directory contact details stay hidden until approved (see counsellor_contact_approval.test.ts)", async () => {
    const { t, admin, counsellorA, s1, as } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellors", {
        userId: counsellorA as any, name: "Counsellor Asha", email: "counselling@college.edu", phone: "0441234567",
        role: "counsellor", availability: [], maxWorkload: 20, rating: 5, status: "active", createdAt: 1,
      });
    });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    // Legacy entry without approval fields: linking alone never shares contact details
    const mine: any = await as(s1).query(api.counsellorAssignments.getMyCounsellor, {});
    expect(mine.counsellor).toMatchObject({ email: null, phone: null });
  });

  test("unassigned, reassigned, deactivated-counsellor and non-student states", async () => {
    const { t, admin, counsellorA, counsellorB, s1, as } = await setup();
    const mine = () => as(s1).query(api.counsellorAssignments.getMyCounsellor, {}) as Promise<any>;
    expect(await mine()).toEqual({ status: "unassigned" });

    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    expect((await mine()).counsellor.displayName).toBe("Counsellor Asha");
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });
    expect((await mine()).counsellor.displayName).toBe("Counsellor Bala");

    await as(admin).mutation(api.users.toggleUserStatus, { userId: counsellorB as any, status: "inactive" });
    expect(await mine()).toEqual({ status: "unavailable" });

    expect(await as(counsellorA).query(api.counsellorAssignments.getMyCounsellor, {})).toEqual({ status: "not_student" });
    expect(await t.query(api.counsellorAssignments.getMyCounsellor, {})).toEqual({ status: "unauthenticated" });
  });

  test("a student cannot read another student's assignment through any assignment endpoint", async () => {
    const { admin, counsellorA, counsellorB, s1, s2, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });
    // getMyCounsellor takes no student argument: s2 always gets s2's counsellor
    expect(((await as(s2).query(api.counsellorAssignments.getMyCounsellor, {})) as any).counsellor.displayName).toBe("Counsellor Bala");
    await expect(as(s2).query(api.counsellorAssignments.getForStudent, { studentId: s1 as any })).rejects.toThrow(/Unauthorized/);
    // getForStudent returns internal ids, so it is staff-only even for the student's own record
    await expect(as(s1).query(api.counsellorAssignments.getForStudent, { studentId: s1 as any })).rejects.toThrow(/Unauthorized/);
  });
});

describe("deletion keeps assignments consistent", () => {
  test("deleting a counsellor ends their active assignments; the students become unassigned", async () => {
    const { t, admin, counsellorA, s1, s2, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2] as any, counsellorId: counsellorA as any });
    await as(admin).mutation(api.users.deleteUser, { userId: counsellorA as any });
    expect(await activeRows(t)).toHaveLength(0);
    const rows = await t.run(async (ctx) => ctx.db.query("counsellorAssignments").collect());
    expect(rows.map((r) => r.endReason)).toEqual(["counsellor_deleted", "counsellor_deleted"]);
    expect(await as(s1).query(api.counsellorAssignments.getMyCounsellor, {})).toEqual({ status: "unassigned" });
    const roster: any = await as(admin).query(api.counsellorAssignments.listStudentAssignments, {});
    expect(roster.summary.unassigned).toBe(4);
  });

  test("deleting a student removes their assignment rows and keeps the counsellor's caseload count correct", async () => {
    const { t, admin, counsellorA, s1, s2, as } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assignMany, { studentIds: [s1, s2] as any, counsellorId: counsellorA as any });
    await as(admin).mutation(api.users.deleteUser, { userId: s1 as any });
    const rows = await t.run(async (ctx) => ctx.db.query("counsellorAssignments").collect());
    expect(rows.map((r) => r.studentId)).toEqual([s2]);
    const counsellors: any[] = await as(admin).query(api.counsellorAssignments.listCounsellorUsers, {});
    expect(counsellors.find((c) => c.full_name === "Counsellor Asha").caseloadSize).toBe(1);
  });
});

describe("student profile receives answers it can render", () => {
  test("every getMyCounsellor answer maps to a defined profile view", async () => {
    const { myCounsellorView } = await import("../common/myCounsellorState");
    const { t, admin, counsellorA, s1, as } = await setup();
    const online = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 };
    const view = async (caller: any) => myCounsellorView(true, await caller.query(api.counsellorAssignments.getMyCounsellor, {}), online);
    expect(await view(as(s1))).toBe("unassigned");
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorA as any });
    expect(await view(as(s1))).toBe("assigned");
    expect(await view(t)).toBe("signInAgain");
    expect(await view(as(counsellorA))).toBe("hidden");
  });
});
