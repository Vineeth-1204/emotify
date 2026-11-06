/**
 * Counsellor appointment workflow: student -> CURRENT assigned counsellor, validated lifecycle,
 * server-side authorization for every transition, duplicates/conflicts, reassignment policy and
 * the notification recipient matrix (EMOTIFY_NOTIFICATION_EVENT_MATRIX.md).
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin One", role: "admin" }),
      admin2: await user({ full_name: "Admin Two", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      studentA: await user({ full_name: "Student Alpha", role: "patient", patientId: "601" }),
      studentB: await user({ full_name: "Student Beta", role: "patient", patientId: "602" }),
      studentC: await user({ full_name: "Student Gamma", role: "patient", patientId: "603" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentA as any, counsellorId: ids.counsellorA as any });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentB as any, counsellorId: ids.counsellorB as any });
  const notes = (type?: string) =>
    t.run(async (ctx) => (await ctx.db.query("notifications").collect()).filter((n) => !type || n.type === type));
  const appts = () => t.run(async (ctx) => ctx.db.query("appointments").collect());
  const request = (student: string, extra: any = {}) =>
    as(student).mutation(api.appointments.createAppointmentRequest, {
      title: "Check-in",
      userId: student as any,
      createdBy: "user",
      date: day(3),
      time: "10:00 AM",
      reason: "Talk",
      ...extra,
    });
  return { t, ...ids, as, notes, appts, request };
}

describe("student requests go to the CURRENT assigned counsellor", () => {
  test("the server derives the counsellor; the student cannot choose one", async () => {
    const { as, studentA, counsellorA, counsellorB, appts, request } = await setup();
    const id = await request(studentA);
    expect((await appts()).map((a) => [String(a._id), a.counsellorId, a.status])).toEqual([[String(id), counsellorA, "pending"]]);
    // A modified API call naming another counsellor is rejected by the argument validator.
    await expect(
      as(studentA).mutation(api.appointments.createAppointmentRequest, {
        title: "x", userId: studentA as any, createdBy: "user", date: day(3), time: "11:00 AM", reason: "x", counsellorId: counsellorB,
      } as any)
    ).rejects.toThrow();
    expect(await appts()).toHaveLength(1);
  });

  test("a student cannot request for another student or as staff", async () => {
    const { as, studentA, studentB, appts } = await setup();
    await expect(as(studentB).mutation(api.appointments.createAppointmentRequest, { title: "x", userId: studentA as any, createdBy: "user", date: day(3), time: "10:00 AM", reason: "x" })).rejects.toThrow(/themselves/);
    await expect(as(studentA).mutation(api.appointments.createAppointmentRequest, { title: "x", userId: studentA as any, createdBy: "admin", date: day(3), time: "10:00 AM", reason: "x" })).rejects.toThrow(/Admin access required/);
    expect(await appts()).toHaveLength(0);
  });

  test("unassigned student: the request goes to the admin queue, never to a counsellor", async () => {
    const { studentC, admin, admin2, counsellorA, counsellorB, appts, notes, request } = await setup();
    await request(studentC);
    expect((await appts())[0].counsellorId).toBeUndefined();
    const queue = await notes("appointment_needs_counsellor");
    expect(queue.map((n) => n.recipientId).sort()).toEqual([admin, admin2].sort());
    const counsellorNotes = (await notes()).filter((n) => n.recipientId === counsellorA || n.recipientId === counsellorB);
    expect(counsellorNotes.filter((n) => n.type.startsWith("appointment"))).toHaveLength(0);
    // The student gets a supportive confirmation (in-app).
    expect((await notes("appointment_requested"))[0].message).toMatch(/care team/);
  });

  test("invalid dates and times are rejected", async () => {
    const { request, appts, studentA } = await setup();
    const cases: Array<[any, RegExp]> = [
      [{ date: "2026-13-01" }, /valid date/],
      [{ date: "tomorrow" }, /valid date/],
      [{ date: day(-5) }, /has not passed/],
      [{ date: day(400) }, /within the next/],
      [{ time: "25:00 PM" }, /valid time/],
      [{ time: "10:00" }, /valid time/],
    ];
    for (const [bad, message] of cases) {
      await expect(request(studentA, bad), JSON.stringify(bad)).rejects.toThrow(message);
    }
    expect(await appts()).toHaveLength(0);
  });

  test("retries and duplicate submissions create one appointment; at most 3 open requests", async () => {
    const { request, studentA, appts, notes } = await setup();
    const key = "req-0123456789abcdef";
    const first = await request(studentA, { requestKey: key });
    expect(await request(studentA, { requestKey: key })).toEqual(first);
    // Same slot, no key (e.g. double tap): returns the open request instead of a duplicate.
    expect(await request(studentA)).toEqual(first);
    expect(await appts()).toHaveLength(1);
    expect(await notes("appointment_request_received")).toHaveLength(1);
    await request(studentA, { time: "11:00 AM" });
    await request(studentA, { time: "12:00 PM" });
    await expect(request(studentA, { time: "01:00 PM" })).rejects.toThrow(/already have 3 requests/);
    await expect(request(studentA, { requestKey: "bad key!" })).rejects.toThrow(/Invalid request key/);
  });
});

describe("lifecycle: requested -> confirmed / declined / new time -> completed", () => {
  test("counsellor confirms; the student is notified; history is recorded", async () => {
    const { as, studentA, counsellorA, appts, notes, request } = await setup();
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    const [a] = await appts();
    expect(a.status).toBe("accepted");
    expect(a.statusHistory!.map((h) => [h.status, h.event, h.actorRole])).toEqual([
      ["pending", "requested", "student"],
      ["accepted", "confirmed", "counsellor"],
    ]);
    const confirmed = await notes("appointment_confirmed");
    expect(confirmed.map((n) => n.recipientId)).toEqual([studentA]);
    expect(confirmed[0]).toMatchObject({ destination: "appointments", relatedId: String(id), pushStatus: "queued" });
  });

  test("students cannot confirm their own request or complete an appointment", async () => {
    const { as, studentA, counsellorA, appts, request } = await setup();
    const id = await request(studentA);
    await expect(as(studentA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" })).rejects.toThrow(/Receiver must accept/);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    await expect(as(studentA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "completed" })).rejects.toThrow(/Only your counsellor/);
    // The legacy "complete" call from older app builds records feedback only.
    const res: any = await as(studentA).mutation(api.appointments.completeAppointment, { appointmentId: id, attended: "yes", rating: 5, feedback: "Helpful" });
    expect(res.statusChanged).toBe(false);
    const [a] = await appts();
    expect(a.status).toBe("accepted");
    expect(a).toMatchObject({ rating: 5, feedback: "Helpful", isFeedbackCompleted: true });
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "completed" });
    expect((await appts())[0].status).toBe("completed");
  });

  test("new time proposed by the counsellor is accepted by the student and applied", async () => {
    const { as, studentA, counsellorA, appts, notes, request } = await setup();
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.requestReschedule, { appointmentId: id, newDate: day(5), newTime: "02:30 PM" });
    expect((await notes("appointment_reschedule_proposed")).map((n) => n.recipientId)).toEqual([studentA]);
    // The proposer cannot accept their own proposal.
    await expect(as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" })).rejects.toThrow(/Receiver must accept/);
    await as(studentA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    const [a] = await appts();
    expect(a).toMatchObject({ status: "accepted", date: day(5), time: "02:30 PM", slotKey: `${day(5)} 14:30` });
    expect(a.rescheduleDate).toBeUndefined();
    expect((await notes("appointment_updated")).map((n) => n.recipientId)).toEqual([counsellorA]);
  });

  test("a different-day reschedule is a normal proposal (no automatic rejection)", async () => {
    const { as, studentA, counsellorA, appts, request } = await setup();
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    await as(studentA).mutation(api.appointments.requestReschedule, { appointmentId: id, newDate: day(10), newTime: "09:00 AM" });
    expect((await appts())[0]).toMatchObject({ status: "waiting", rescheduledBy: "user", rescheduleDate: day(10) });
  });

  test("declining needs a reason; terminal states cannot change; withdraw keeps the record", async () => {
    const { as, studentA, counsellorA, appts, request } = await setup();
    const id = await request(studentA);
    await expect(as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "rejected" })).rejects.toThrow(/reason is required/);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "rejected", rejectionReason: "Fully booked" });
    await expect(as(studentA).mutation(api.appointments.cancelAppointment, { appointmentId: id })).rejects.toThrow(/terminal state/);
    const id2 = await request(studentA, { time: "03:00 PM" });
    const res: any = await as(studentA).mutation(api.appointments.deleteAppointment, { appointmentId: id2 });
    expect(res).toMatchObject({ deleted: false });
    expect((await appts()).find((a) => a._id === id2)?.status).toBe("cancelled");
  });

  test("a counsellor cannot confirm two appointments in the same slot", async () => {
    const { as, admin, studentA, studentC, counsellorA, request } = await setup();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: studentC as any, counsellorId: counsellorA as any });
    const a1 = await request(studentA);
    const a2 = await request(studentC);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: a1, status: "accepted" });
    await expect(as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: a2, status: "accepted" })).rejects.toThrow(/no longer available/);
    await expect(request(studentC, { time: "10:00 AM", date: day(3), requestKey: "another-key-123456" })).resolves.toEqual(a2);
  });
});

describe("authorization: direct API access", () => {
  test("Counsellor A cannot read or act on Counsellor B's student or appointment", async () => {
    const { as, studentB, counsellorA, request } = await setup();
    const idB = await request(studentB);
    await expect(as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: idB, status: "accepted" })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).mutation(api.appointments.requestReschedule, { appointmentId: idB, newDate: day(4), newTime: "10:00 AM" })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).mutation(api.appointments.cancelAppointment, { appointmentId: idB })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).query(api.appointments.listAppointments, { paginationOpts: { numItems: 50, cursor: null }, studentId: studentB as any })).rejects.toThrow(/not in your caseload/);
    // A counsellor-filter argument cannot widen a counsellor's view.
    const page = await as(counsellorA).query(api.appointments.listAppointments, { paginationOpts: { numItems: 50, cursor: null }, counsellorId: studentB as any });
    expect(page.page).toHaveLength(0);
    await expect(as(counsellorA).query(api.appointments.getTwoWayAppointmentsForPatient, { userId: studentB })).rejects.toThrow(/not in your caseload/);
  });

  test("a student cannot read another student's appointments or change their status", async () => {
    const { as, studentA, studentB, request } = await setup();
    const idB = await request(studentB);
    await expect(as(studentA).query(api.appointments.getTwoWayAppointmentsForPatient, { userId: studentB })).rejects.toThrow(/Unauthorized/);
    for (const status of ["accepted", "completed", "cancelled", "rejected"]) {
      await expect(as(studentA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: idB, status, rejectionReason: "x" })).rejects.toThrow(/Unauthorized/);
    }
    expect((await as(studentA).query(api.appointments.listMyAppointments, { paginationOpts: { numItems: 50, cursor: null } })).page).toHaveLength(0);
    await expect(as(studentA).query(api.appointments.listAppointments, { paginationOpts: { numItems: 50, cursor: null } })).rejects.toThrow(/Counselor or Admin/);
  });

  test("the previous counsellor loses access immediately after reassignment; open requests follow the student", async () => {
    const { as, admin, studentA, counsellorA, counsellorB, appts, notes, request } = await setup();
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counsellorB as any });
    const [a] = await appts();
    expect(a).toMatchObject({ counsellorId: counsellorB, status: "pending", createdBy: "user" });
    expect(a.statusHistory!.at(-1)).toMatchObject({ event: "reassigned", actorRole: "system" });
    await expect(as(counsellorA).mutation(api.appointments.cancelAppointment, { appointmentId: id })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorA).query(api.appointments.getTwoWayAppointmentsForPatient, { userId: studentA })).rejects.toThrow(/not in your caseload/);
    expect((await notes("appointment_reconfirm_needed")).map((n) => n.recipientId)).toEqual([studentA]);
    expect((await notes("appointment_request_received")).filter((n) => n.recipientId === counsellorB)).toHaveLength(1);
    // The new counsellor can confirm.
    await as(counsellorB).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
  });

  test("unassigning sends open appointments to the admin queue", async () => {
    const { as, admin, studentA, appts, notes, request } = await setup();
    await request(studentA);
    await as(admin).mutation(api.counsellorAssignments.unassign, { studentId: studentA as any });
    expect((await appts())[0].counsellorId).toBeUndefined();
    expect((await notes("appointment_needs_counsellor")).length).toBeGreaterThan(0);
    const exceptions: any = await as(admin).query(api.counsellorAssignments.getAdminExceptions, {});
    expect(exceptions.openAppointmentsWithoutCounsellor.count).toBe(1);
  });

  test("unauthenticated callers are refused everywhere", async () => {
    const { t, studentA, request } = await setup();
    const id = await request(studentA);
    await expect(t.mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" })).rejects.toThrow(/Unauthenticated/);
    await expect(t.mutation(api.appointments.createAppointmentRequest, { title: "x", userId: studentA as any, createdBy: "user", date: day(3), time: "10:00 AM", reason: "x" })).rejects.toThrow(/Unauthenticated/);
    await expect(t.query(api.appointments.listAppointments, { paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(/Unauthenticated|Login required/);
    expect((await t.query(api.appointments.listMyAppointments, { paginationOpts: { numItems: 5, cursor: null } })).page).toEqual([]);
  });

  test("admins see the whole organisation and can filter by counsellor, student, date and status", async () => {
    const { as, admin, studentA, studentB, studentC, counsellorA, counsellorB, request } = await setup();
    await request(studentA);
    await request(studentB, { date: day(4) });
    await request(studentC);
    const all = async (args: any = {}) =>
      (await as(admin).query(api.appointments.listAppointments, { paginationOpts: { numItems: 100, cursor: null }, ...args })).page;
    expect((await all()).map((a: any) => a.studentName).sort()).toEqual(["Student Alpha", "Student Beta", "Student Gamma"]);
    expect((await all({ counsellorId: counsellorA })).map((a: any) => a.studentName)).toEqual(["Student Alpha"]);
    expect((await all({ counsellorId: counsellorB })).map((a: any) => a.counsellorName)).toEqual(["Counsellor B"]);
    expect((await all({ studentId: studentB })).map((a: any) => a.studentName)).toEqual(["Student Beta"]);
    expect((await all({ date: day(4) })).map((a: any) => a.studentName)).toEqual(["Student Beta"]);
    expect((await all({ needsCounsellor: true })).map((a: any) => a.studentName)).toEqual(["Student Gamma"]);
    expect((await all({ status: "pending" })).length).toBe(3);
    expect((await all({ status: "accepted" })).length).toBe(0);
    // The counsellor sees only their own
    const mine = (await as(counsellorA).query(api.appointments.listAppointments, { paginationOpts: { numItems: 100, cursor: null } })).page;
    expect(mine.map((a: any) => a.studentName)).toEqual(["Student Alpha"]);
    expect(mine[0].actions).toEqual(expect.arrayContaining(["accept", "decline", "propose_time", "cancel"]));
  });

  test("students see their own appointments without internal links", async () => {
    const { as, studentA, request } = await setup();
    await request(studentA);
    const page = (await as(studentA).query(api.appointments.listMyAppointments, { paginationOpts: { numItems: 10, cursor: null } })).page;
    expect(page[0]).toMatchObject({ statusLabel: "Requested", counsellorName: "Counsellor A", actions: ["propose_time", "cancel"] });
    for (const hidden of ["attemptId", "triageId", "counsellorId", "slotKey", "requestKey", "userId"]) expect(page[0]).not.toHaveProperty(hidden);
    const legacy: any[] = await as(studentA).query(api.appointments.getTwoWayAppointmentsForPatient, { userId: studentA });
    for (const hidden of ["attemptId", "triageId", "counsellorId", "slotKey", "requestKey"]) expect(legacy[0]).not.toHaveProperty(hidden);
  });
});
