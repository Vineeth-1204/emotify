/**
 * P0 remediation: appointment-request authorization and legacy (role-less) student accounts.
 *
 *  - appointments.createAppointmentRequest derives authority from the authenticated role and
 *    ownership; a client-supplied createdBy can no longer skip the checks.
 *  - Students whose role field is missing (created before roles were stored) keep the crisis gate
 *    and their self-service views; explicit staff roles are never treated as students.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { isStudentRole } from "./authz";

const modules = import.meta.glob("./**/*.ts");

const zeros = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
const SUICIDE = { phq9: { ...zeros(9), "9": 1 }, gad7: zeros(7), pq16: zeros(16) };

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      studentA: await user({ full_name: "Student A", role: "patient", patientId: "501" }),
      studentB: await user({ full_name: "Student B", role: "patient", patientId: "502" }),
      roleless: await user({ full_name: "Legacy Student", patientId: "503" }),
      emptyRole: await user({ full_name: "Empty Role Student", role: "", patientId: "504" }),
      otherRole: await user({ full_name: "Auditor", role: "auditor" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentA as any, counsellorId: ids.counsellorA as any });
  const appointments = () => t.run(async (ctx) => ctx.db.query("appointments").collect());
  return { t, ...ids, as, appointments };
}

const request = (userId: string, createdBy: any, extra: any = {}) => ({
  title: "Check-in",
  userId: userId as any,
  createdBy,
  date: "2026-11-02",
  time: "10:00 AM",
  reason: "Talk",
  ...extra,
});

describe("appointments.createAppointmentRequest: authority comes from the caller, not createdBy", () => {
  test("arbitrary createdBy values are rejected for every caller (the old bypass)", async () => {
    const { as, studentA, studentB, counsellorB, admin, appointments } = await setup();
    for (const createdBy of ["other", "staff", "", "ADMIN", "User", "counsellor"]) {
      for (const [caller, target] of [[studentB, studentA], [counsellorB, studentA], [admin, studentA], [studentA, studentA]]) {
        await expect(as(caller).mutation(api.appointments.createAppointmentRequest, request(target, createdBy)), `${createdBy}`).rejects.toThrow();
      }
    }
    expect(await appointments()).toHaveLength(0);
  });

  test("a student can request only for themselves, and only as 'user'", async () => {
    const { as, studentA, studentB, appointments } = await setup();
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentA, "user"))).rejects.toThrow(/only create appointments for themselves/);
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentA, "admin"))).rejects.toThrow(/Admin access required/);
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentB, "admin"))).rejects.toThrow(/Admin access required/);
    expect(await appointments()).toHaveLength(0);
    const id = await as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentB, "user"));
    const rows = await appointments();
    expect(rows.map((r) => [String(r._id), r.userId, r.createdBy])).toEqual([[String(id), studentB, "user"]]);
  });

  test("forged ids: a student cannot target a non-existent or another student's id", async () => {
    const { t, as, studentA, studentB, appointments } = await setup();
    const ghost = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { full_name: "Ghost", role: "patient", status: "active" });
      await ctx.db.delete(id);
      return id;
    });
    await expect(as(studentA).mutation(api.appointments.createAppointmentRequest, request(ghost, "user"))).rejects.toThrow(/themselves/);
    await expect(as(studentA).mutation(api.appointments.createAppointmentRequest, request(studentB, "user"))).rejects.toThrow(/themselves/);
    expect(await appointments()).toHaveLength(0);
  });

  test("a student cannot attach another student's screening or triage as provenance", async () => {
    const { t, as, studentA, studentB, appointments } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: SUICIDE });
    const { attemptId, triageId } = await t.run(async (ctx) => {
      const a = (await ctx.db.query("screeningAttempts").collect())[0];
      return { attemptId: a._id, triageId: a.triageId };
    });
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentB, "user", { attemptId }))).rejects.toThrow(/Invalid provenance/);
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, request(studentB, "user", { triageId }))).rejects.toThrow(/Invalid provenance/);
    expect(await appointments()).toHaveLength(0);
    await as(studentA).mutation(api.appointments.createAppointmentRequest, request(studentA, "user", { attemptId, triageId }));
    expect(await appointments()).toHaveLength(1);
  });

  test("anonymous callers are refused", async () => {
    const { t, studentA, appointments } = await setup();
    for (const createdBy of ["user", "admin"]) {
      await expect(t.mutation(api.appointments.createAppointmentRequest, request(studentA, createdBy))).rejects.toThrow(/Unauthenticated/);
    }
    expect(await appointments()).toHaveLength(0);
  });

  test("counsellors: only for assigned students, only as staff", async () => {
    const { as, counsellorA, counsellorB, studentA, studentB, appointments } = await setup();
    await expect(as(counsellorB).mutation(api.appointments.createAppointmentRequest, request(studentA, "admin"))).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).mutation(api.appointments.createAppointmentRequest, request(studentB, "admin"))).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).mutation(api.appointments.createAppointmentRequest, request(studentA, "user"))).rejects.toThrow(/as staff/);
    expect(await appointments()).toHaveLength(0);
    await as(counsellorA).mutation(api.appointments.createAppointmentRequest, request(studentA, "admin", { patientName: "Student A" }));
    const rows = await appointments();
    expect(rows.map((r) => [r.userId, r.createdBy])).toEqual([[studentA, "admin"]]);
  });

  test("admins keep the existing workflow for any student", async () => {
    const { as, admin, studentA, studentB, appointments } = await setup();
    await as(admin).mutation(api.appointments.createAppointmentRequest, request(studentA, "admin", { patientName: "Student A" }));
    await as(admin).mutation(api.appointments.createAppointmentRequest, request(studentB, "admin", { patientName: "Student B" }));
    expect((await appointments()).map((r) => r.createdBy)).toEqual(["admin", "admin"]);
    await expect(as(admin).mutation(api.appointments.createAppointmentRequest, request(studentA, "user"))).rejects.toThrow(/as staff/);
  });

  test("other explicit roles cannot create appointments; role-less students can for themselves", async () => {
    const { as, otherRole, roleless, studentA, appointments } = await setup();
    await expect(as(otherRole).mutation(api.appointments.createAppointmentRequest, request(studentA, "admin"))).rejects.toThrow(/cannot create appointments/);
    await expect(as(otherRole).mutation(api.appointments.createAppointmentRequest, request(otherRole, "user"))).rejects.toThrow(/cannot create appointments/);
    await as(roleless).mutation(api.appointments.createAppointmentRequest, request(roleless, "user"));
    expect((await appointments()).map((r) => r.userId)).toEqual([roleless]);
  });
});

describe("legacy accounts with no role keep student safety features", () => {
  test("role classification", () => {
    expect(isStudentRole("patient")).toBe(true);
    expect(isStudentRole(undefined)).toBe(true);
    expect(isStudentRole(null)).toBe(true);
    expect(isStudentRole("")).toBe(true);
    for (const role of ["admin", "counsellor", "auditor", "Patient"]) expect(isStudentRole(role), role).toBe(false);
  });

  for (const who of ["roleless", "emptyRole", "studentA"] as const) {
    test(`${who}: crisis gate and self-service views work after a suicide-flag check-in`, async () => {
      const s = await setup();
      const me = s[who];
      await s.as(me).mutation(api.screening.submitScreeningAttempt, { responses: SUICIDE });
      expect(await s.as(me).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: true, forceRetest: false, elevatedSupport: true });
      expect(await s.as(me).query(api.screening.getMyResultSummary, {})).toMatchObject({ status: "ready", outcome: "immediate_safety" });
      expect(await s.as(me).query(api.screening.getMyWellbeingIndicators, {})).not.toBeNull();
      expect(await s.as(me).query(api.screening.exportMyScreenings, {})).toHaveLength(1);
      // Alerts still reach staff for these students
      const alerts = await s.t.run(async (ctx) => ctx.db.query("alerts").collect());
      expect(alerts.map((a) => [a.userId, a.type])).toEqual([[me, "suicide"]]);
    });
  }

  test("a role-less student can be assigned and sees My Counsellor", async () => {
    const { as, admin, counsellorA, roleless } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: roleless as any, counsellorId: counsellorA as any });
    expect(await as(roleless).query(api.counsellorAssignments.getMyCounsellor, {})).toMatchObject({ status: "assigned" });
  });

  test("staff, other roles and anonymous callers are never treated as students", async () => {
    const { t, as, admin, counsellorA, otherRole } = await setup();
    for (const caller of [admin, counsellorA, otherRole]) {
      expect(await as(caller).query(api.triage.getMySafetyStatus, {}), String(caller)).toBeNull();
      expect(await as(caller).query(api.screening.getMyWellbeingIndicators, {})).toBeNull();
      expect(await as(caller).query(api.screening.exportMyScreenings, {})).toEqual([]);
    }
    expect(await t.query(api.triage.getMySafetyStatus, {})).toBeNull();
    // Staff never fall into the legacy student path of the old reads
    await expect(as(otherRole).query(api.triage.getLatest, {})).rejects.toThrow(/Counselor or Admin access required/);
  });
});
