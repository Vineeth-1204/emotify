/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("P12 Step 4: Appointment Lifecycle & Provenance Integration", () => {
  async function setupEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Student A
    let studentAId = "";
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9811111111",
        role: "patient",
        status: "active",
        patientId: "STU-P12-A",
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
        patientId: "STU-P12-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Counselor
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

    // 4. Admin
    let adminId = "";
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Admin Alice",
        mobile_number: "9844444444",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const authedStudentA = t.withIdentity({
      subject: studentAId,
      issuer: "https://auth.emotify.com",
    });

    const authedStudentB = t.withIdentity({
      subject: studentBId,
      issuer: "https://auth.emotify.com",
    });

    const authedCounselor = t.withIdentity({
      subject: counselorId,
      issuer: "https://auth.emotify.com",
    });

    const authedAdmin = t.withIdentity({
      subject: adminId,
      issuer: "https://auth.emotify.com",
    });

    return {
      t,
      studentAId: studentAId as Id<"users">,
      studentBId: studentBId as Id<"users">,
      counselorId: counselorId as Id<"users">,
      adminId: adminId as Id<"users">,
      authedStudentA,
      authedStudentB,
      authedCounselor,
      authedAdmin,
    };
  }

  // APPT-LIFE-01: Student can create/view their own appointment through the valid existing flow
  test("APPT-LIFE-01: Student can create/view their own appointment through the valid existing flow", async () => {
    const { authedStudentA, studentAId, t } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Stress Counseling",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "Exam stress preparation",
    });

    expect(apptId).toBeDefined();

    const appts = await authedStudentA.query(api.appointments.getTwoWayAppointmentsForPatient, {
      userId: studentAId,
    });

    expect(appts.length).toBe(1);
    expect(appts[0]._id).toBe(apptId);
    expect(appts[0].status).toBe("pending");
    expect(appts[0].title).toBe("Stress Counseling");
  });

  // APPT-LIFE-02: Unauthenticated appointment mutation is rejected
  test("APPT-LIFE-02: Unauthenticated appointment mutation is rejected", async () => {
    const { t, studentAId } = await setupEnvironment();

    // Create an appointment first using authenticated run
    let apptId: any;
    await t.run(async (ctx) => {
      apptId = await ctx.db.insert("appointments", {
        userId: studentAId,
        title: "Test Session",
        createdBy: "user",
        date: "2026-10-15",
        time: "10:00 AM",
        reason: "General discussion",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Unauthenticated mutation attempt
    await expect(
      t.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      })
    ).rejects.toThrow(/Unauthenticated/);

    await expect(
      t.mutation(api.appointments.requestReschedule, {
        appointmentId: apptId,
        newTime: "11:00 AM",
        newDate: "2026-10-15",
      })
    ).rejects.toThrow(/Unauthenticated/);

    await expect(
      t.mutation(api.appointments.completeAppointment, {
        appointmentId: apptId,
        attended: "yes",
      })
    ).rejects.toThrow(/Unauthenticated/);
  });

  // APPT-LIFE-03: Student cannot mutate another student's appointment
  test("APPT-LIFE-03: Student cannot mutate another student's appointment", async () => {
    const { authedStudentA, authedStudentB, studentAId } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Student A Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "Need help",
    });

    // Student B tries to accept or reject Student A's appointment
    await expect(
      authedStudentB.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "rejected",
        rejectionReason: "Malicious attempt",
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B tries to reschedule Student A's appointment
    await expect(
      authedStudentB.mutation(api.appointments.requestReschedule, {
        appointmentId: apptId,
        newTime: "02:00 PM",
        newDate: "2026-10-15",
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B tries to cancel Student A's appointment
    await expect(
      authedStudentB.mutation(api.appointments.cancelAppointment, {
        appointmentId: apptId,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  // APPT-LIFE-04: Student cannot arbitrarily complete another student's appointment
  test("APPT-LIFE-04: Student cannot arbitrarily complete another student's appointment", async () => {
    const { authedStudentA, authedStudentB, authedCounselor, studentAId } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Student A Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "Need guidance",
    });

    // Counselor accepts it
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });

    // Student B tries to mark it completed
    await expect(
      authedStudentB.mutation(api.appointments.completeAppointment, {
        appointmentId: apptId,
        attended: "yes",
        rating: 5,
        feedback: "Hacked completion",
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B also cannot complete via updateAppointmentStatus
    await expect(
      authedStudentB.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "completed",
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  // APPT-LIFE-05: Invalid appointment status transition is rejected
  test("APPT-LIFE-05: Invalid appointment status transition is rejected", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Student A Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "Need help",
    });

    // 1. Cannot jump directly from 'pending' to 'completed'
    await expect(
      authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "completed",
      })
    ).rejects.toThrow(/Invalid transition/);

    // 2. Reject the appointment -> moves to terminal status 'rejected'
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "rejected",
      rejectionReason: "No slots available today",
    });

    // 3. Modifying a terminal appointment must be rejected
    await expect(
      authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      })
    ).rejects.toThrow(/terminal state/);

    await expect(
      authedStudentA.mutation(api.appointments.requestReschedule, {
        appointmentId: apptId,
        newTime: "02:00 PM",
        newDate: "2026-10-15",
      })
    ).rejects.toThrow(/terminal state/);

    await expect(
      authedStudentA.mutation(api.appointments.completeAppointment, {
        appointmentId: apptId,
        attended: "yes",
      })
    ).rejects.toThrow(/terminal state/);
  });

  // APPT-LIFE-06: Authorized counselor can perform the intended existing appointment action
  test("APPT-LIFE-06: Authorized counselor can perform the intended existing appointment action", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Counselor Consultation",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "Discuss wellness goals",
    });

    // Counselor accepts
    const res = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res.success).toBe(true);

    const updated = await t.run(async (ctx) => {
      return await ctx.db.get(apptId);
    });
    expect(updated?.status).toBe("accepted");
  });

  // APPT-LIFE-07: Unauthorized counselor/staff mutation is rejected according to receiver rules
  test("APPT-LIFE-07: Unauthorized counselor/staff mutation is rejected according to receiver rules", async () => {
    const { authedStudentA, authedCounselor, authedAdmin, studentAId } = await setupEnvironment();

    // Staff creates appointment proposed to student A
    const apptId = await authedAdmin.mutation(api.appointments.createAppointmentRequest, {
      title: "Mandatory Counselor Check-in",
      userId: studentAId,
      createdBy: "admin",
      patientName: "Student Alpha",
      date: "2026-10-15",
      time: "11:00 AM",
      reason: "Follow-up",
    });

    // Receiver must accept: for createdBy="admin", the receiver is the student!
    // A counselor cannot accept on behalf of the student
    await expect(
      authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      })
    ).rejects.toThrow(/Receiver must accept\/reject/);

    // Student A can accept their proposed appointment
    const res = await authedStudentA.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res.success).toBe(true);
  });

  // APPT-LIFE-08: Admin retains intended appointment privileges
  test("APPT-LIFE-08: Admin retains intended appointment privileges", async () => {
    const { authedAdmin, studentAId, t } = await setupEnvironment();

    const startTime = Date.now() + 3600000;
    const endTime = startTime + 3600000;

    const apptId = await authedAdmin.mutation(api.appointments.createAppointment, {
      userId: studentAId,
      startTime,
      endTime,
      description: "Admin scheduled session",
    });
    expect(apptId).toBeDefined();

    const apptDoc = await t.run(async (ctx) => {
      return await ctx.db.get(apptId);
    });
    expect(apptDoc?.status).toBe("scheduled");
    expect(apptDoc?.userId).toBe(studentAId);

    // Admin can cancel appointment
    const cancelRes = await authedAdmin.mutation(api.appointments.cancelAppointment, {
      appointmentId: apptId,
    });
    expect(cancelRes.success).toBe(true);

    const cancelledDoc = await t.run(async (ctx) => {
      return await ctx.db.get(apptId);
    });
    expect(cancelledDoc?.status).toBe("cancelled");
  });

  // PROV-01: Valid counselorRequest -> appointment provenance is stored
  test("PROV-01: Valid counselorRequest -> appointment provenance is stored", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupEnvironment();

    // 1. Student creates counselor request
    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      thought_original: "Feeling overwhelmed by coursework",
      situation_text: "Final semester exams approaching",
    });

    // 2. Counselor schedules appointment referencing this counselor request
    const apptId = await authedCounselor.mutation(api.appointments.createAppointmentRequest, {
      title: "Counselor Consultation",
      userId: studentAId,
      createdBy: "admin",
      patientName: "Student Alpha",
      date: "2026-10-16",
      time: "02:00 PM",
      reason: "Follow-up on exam stress request",
      counsellorRequestId: reqId,
    });

    // Verify appointment stores provenance
    const apptDoc = await t.run(async (ctx) => {
      return await ctx.db.get(apptId);
    });
    expect(apptDoc?.counsellorRequestId).toBe(reqId);

    // Verify counselor request is updated to 'scheduled'
    const reqDoc = await t.run(async (ctx) => {
      return await ctx.db.get(reqId);
    });
    expect(reqDoc?.status).toBe("scheduled");
  });

  // PROV-02: Appointment cannot reference another student's counselor request
  test("PROV-02: Appointment cannot reference another student's counselor request", async () => {
    const { authedStudentA, authedStudentB, authedCounselor, studentAId, studentBId } = await setupEnvironment();

    // Student A creates counselor request
    const reqIdA = await authedStudentA.mutation(api.counsellorRequests.create, {
      thought_original: "Student A issue",
    });

    // Student B tries to create appointment linking Student A's request
    await expect(
      authedStudentB.mutation(api.appointments.createAppointmentRequest, {
        title: "Malicious Student B Appointment",
        userId: studentBId,
        createdBy: "user",
        date: "2026-10-16",
        time: "03:00 PM",
        reason: "Attempting to claim Student A request",
        counsellorRequestId: reqIdA,
      })
    ).rejects.toThrow(/Invalid provenance/);

    // Counselor tries to attach Student A's request to Student B's appointment
    await expect(
      authedCounselor.mutation(api.appointments.createAppointmentRequest, {
        title: "Mismatched Appointment",
        userId: studentBId,
        createdBy: "admin",
        patientName: "Student Beta",
        date: "2026-10-16",
        time: "03:00 PM",
        reason: "Mismatch check",
        counsellorRequestId: reqIdA,
      })
    ).rejects.toThrow(/Invalid provenance/);
  });

  // PROV-03: Appointment cannot reference nonexistent counselor request
  test("PROV-03: Appointment cannot reference nonexistent counselor request", async () => {
    const { authedStudentA, studentAId, t } = await setupEnvironment();

    // Fabricate a fake request ID
    let fakeReqId: any;
    await t.run(async (ctx) => {
      // Create and delete to get valid typed ID format
      const tempId = await ctx.db.insert("counsellorRequests", {
        user_id: String(studentAId),
        timestamp: Date.now(),
      });
      await ctx.db.delete(tempId);
      fakeReqId = tempId;
    });

    await expect(
      authedStudentA.mutation(api.appointments.createAppointmentRequest, {
        title: "Orphaned Request Test",
        userId: studentAId,
        createdBy: "user",
        date: "2026-10-16",
        time: "04:00 PM",
        reason: "Testing fake provenance",
        counsellorRequestId: fakeReqId,
      })
    ).rejects.toThrow(/Invalid provenance: Counselor request not found/);
  });

  // PROV-04: Provenance remains retrievable from both sides where the schema supports reciprocal/indexed access
  test("PROV-04: Provenance remains retrievable from both sides where the schema supports reciprocal/indexed access", async () => {
    const { authedStudentA, authedCounselor, studentAId } = await setupEnvironment();

    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      thought_original: "Need longitudinal tracking test",
    });

    const apptId = await authedCounselor.mutation(api.appointments.createAppointmentRequest, {
      title: "Reciprocal Test Session",
      userId: studentAId,
      createdBy: "admin",
      patientName: "Student Alpha",
      date: "2026-10-17",
      time: "11:00 AM",
      reason: "Provenance verification",
      counsellorRequestId: reqId,
    });

    // Query appointment by counselor request ID
    const foundAppt = await authedStudentA.query(api.appointments.getAppointmentByCounsellorRequestId, {
      counsellorRequestId: reqId,
    });

    expect(foundAppt).toBeDefined();
    expect(foundAppt?._id).toBe(apptId);
    expect(foundAppt?.counsellorRequestId).toBe(reqId);
  });

  // NOTIF-01: Valid appointment status change generates the intended student notification
  test("NOTIF-01: Valid appointment status change generates the intended student notification", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Anxiety Consultation",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-18",
      time: "09:00 AM",
      reason: "Anxiety support",
    });

    // Counselor accepts the appointment
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });

    // Check notifications for student A
    const notifications = await t.run(async (ctx) => {
      return await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(studentAId)))
        .collect();
    });

    expect(notifications.length).toBeGreaterThan(0);
    const acceptedNotif = notifications.find((n) => n.type === "appointment_accepted");
    expect(acceptedNotif).toBeDefined();
    expect(acceptedNotif?.title).toBe("Appointment Accepted");
    expect(acceptedNotif?.recipientId).toBe(String(studentAId));
  });

  // NOTIF-02: Notification recipient cannot be forged by client input
  test("NOTIF-02: Notification recipient cannot be forged by client input", async () => {
    const { authedStudentA, authedStudentB, authedCounselor, studentAId, studentBId, t } = await setupEnvironment();

    // Student A creates appointment
    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Confidential Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-18",
      time: "10:00 AM",
      reason: "Personal",
    });

    // Counselor accepts it
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });

    // Verify Student B received NO notification
    const studentBNotifs = await t.run(async (ctx) => {
      return await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(studentBId)))
        .collect();
    });

    const leakedNotif = studentBNotifs.find((n) => n.type === "appointment_accepted");
    expect(leakedNotif).toBeUndefined();
  });

  // REG-01: Existing P12 Step 2 security tests still pass
  test("REG-01: Existing P12 Step 2 appointment authorization still passes", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupEnvironment();

    // Student creates appointment request
    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Step 2 Regression Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-19",
      time: "03:00 PM",
      reason: "Regression check",
    });

    // Counselor accepts
    const res = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res.success).toBe(true);

    const doc = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(doc?.status).toBe("accepted");
  });

  // REG-02: Existing P12 Step 3 counselor-request tests still pass
  test("REG-02: Existing P12 Step 3 counselor request flow still functions alongside appointments", async () => {
    const { authedStudentA, authedCounselor, studentAId } = await setupEnvironment();

    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      thought_original: "Step 3 Regression Thought",
      situation_text: "Step 3 Situation",
    });

    const myRequests = await authedStudentA.query(api.counsellorRequests.getMyRequests, {});
    expect(myRequests.length).toBe(1);
    expect(myRequests[0]._id).toBe(reqId);

    // Counselor updates request status
    const updateRes = await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: reqId,
      status: "scheduled",
      notes: "Scheduled via regression test",
    });
    expect(updateRes.success).toBe(true);
  });
});
