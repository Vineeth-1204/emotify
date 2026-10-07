/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

describe("P12 Step 2: Security & Authorization Defect Remediation", () => {
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
        full_name: "Admin Arthur",
        mobile_number: "9844444444",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
    };
  }

  // ==========================================
  // APPOINTMENT AUTHORIZATION TESTS
  // ==========================================

  describe("Appointment Status Authorization", () => {
    test("APPT-AUTH-01: Counselor can accept a pending student-created appointment when authorized", async () => {
      const { t, studentAId, counselorId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });
      const authedCounselor = t.withIdentity({ subject: counselorId });

      // Student creates an appointment request
      const apptId = await authedStudent.mutation(api.appointments.createAppointmentRequest, {
        title: "Counseling Intake",
        userId: studentAId as any,
        createdBy: "user",
        date: "2026-10-10",
        time: "10:00 AM",
        reason: "Need guidance with exam stress",
      });

      // Verify initial pending status
      await t.run(async (ctx) => {
        const appt = await ctx.db.get(apptId);
        expect(appt?.status).toBe("pending");
      });

      // Counselor accepts the appointment
      const result = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      });

      expect(result.success).toBe(true);

      // Verify accepted status persisted
      await t.run(async (ctx) => {
        const appt = await ctx.db.get(apptId);
        expect(appt?.status).toBe("accepted");
      });
    });

    test("APPT-AUTH-02: Counselor can reject a pending student-created appointment when authorized", async () => {
      const { t, studentAId, counselorId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });
      const authedCounselor = t.withIdentity({ subject: counselorId });

      const apptId = await authedStudent.mutation(api.appointments.createAppointmentRequest, {
        title: "Intake Session",
        userId: studentAId as any,
        createdBy: "user",
        date: "2026-10-10",
        time: "11:00 AM",
        reason: "Stress management",
      });

      const result = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "rejected",
        rejectionReason: "Slot unavailable, please pick another time.",
      });

      expect(result.success).toBe(true);

      await t.run(async (ctx) => {
        const appt = await ctx.db.get(apptId);
        expect(appt?.status).toBe("rejected");
        expect(appt?.rejectionReason).toBe("Slot unavailable, please pick another time.");
      });
    });

    test("APPT-AUTH-03: Admin can still accept/reject the appointment", async () => {
      const { t, studentAId, adminId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });
      const authedAdmin = t.withIdentity({ subject: adminId });

      const apptId = await authedStudent.mutation(api.appointments.createAppointmentRequest, {
        title: "Intake Session",
        userId: studentAId as any,
        createdBy: "user",
        date: "2026-10-10",
        time: "02:00 PM",
        reason: "Academic burnout",
      });

      const result = await authedAdmin.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      });

      expect(result.success).toBe(true);

      await t.run(async (ctx) => {
        const appt = await ctx.db.get(apptId);
        expect(appt?.status).toBe("accepted");
      });
    });

    test("APPT-AUTH-04: Unauthenticated caller is rejected", async () => {
      const { t, studentAId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });

      const apptId = await authedStudent.mutation(api.appointments.createAppointmentRequest, {
        title: "Intake Session",
        userId: studentAId as any,
        createdBy: "user",
        date: "2026-10-10",
        time: "03:00 PM",
        reason: "General counseling",
      });

      // Unauthenticated caller
      await expect(
        t.mutation(api.appointments.updateAppointmentStatus, {
          appointmentId: apptId,
          status: "accepted",
        })
      ).rejects.toThrow(/Unauthenticated/);
    });

    test("APPT-AUTH-05: Unauthorized student cannot accept another party's appointment", async () => {
      const { t, studentAId, studentBId } = await setupEnvironment();
      const authedStudentA = t.withIdentity({ subject: studentAId });
      const authedStudentB = t.withIdentity({ subject: studentBId });

      const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
        title: "Alpha Intake",
        userId: studentAId as any,
        createdBy: "user",
        date: "2026-10-10",
        time: "04:00 PM",
        reason: "Private concerns",
      });

      // Student B attempts to accept Student A's appointment
      await expect(
        authedStudentB.mutation(api.appointments.updateAppointmentStatus, {
          appointmentId: apptId,
          status: "accepted",
        })
      ).rejects.toThrow(/Unauthorized: Cannot access or modify another user's appointment/);

      // Student A (creator) attempts to accept their own pending user-created appointment (must be receiver)
      await expect(
        authedStudentA.mutation(api.appointments.updateAppointmentStatus, {
          appointmentId: apptId,
          status: "accepted",
        })
      ).rejects.toThrow(/Unauthorized: Receiver must accept\/reject/);
    });
  });

  // ==========================================
  // FOLLOW-UP AUTHORIZATION TESTS
  // ==========================================

  describe("Follow-Up Completion Authorization", () => {
    test("FOLLOWUP-AUTH-01: Student can complete own follow-up", async () => {
      const { t, studentAId } = await setupEnvironment();
      const authedStudentA = t.withIdentity({ subject: studentAId });

      let followUpId!: Id<"followUps">;
      await t.run(async (ctx) => {
        followUpId = await ctx.db.insert("followUps", {
          sourceType: "self_initiated", // students may only close their own self-initiated follow-ups
          userId: studentAId,
          type: "breathing_exercise",
          dueDate: Date.now() + 86400000,
          completed: false,
          createdAt: Date.now(),
        });
      });

      const res = await authedStudentA.mutation(api.followUps.markComplete, {
        id: followUpId,
      });

      expect(res.success).toBe(true);

      await t.run(async (ctx) => {
        const item = await ctx.db.get(followUpId);
        expect(item?.completed).toBe(true);
      });
    });

    test("FOLLOWUP-AUTH-02: Student cannot complete another student's follow-up", async () => {
      const { t, studentAId, studentBId } = await setupEnvironment();
      const authedStudentB = t.withIdentity({ subject: studentBId });

      let followUpId!: Id<"followUps">;
      await t.run(async (ctx) => {
        followUpId = await ctx.db.insert("followUps", {
          userId: studentAId,
          type: "journal_checkin",
          dueDate: Date.now() + 86400000,
          completed: false,
          createdAt: Date.now(),
        });
      });

      await expect(
        authedStudentB.mutation(api.followUps.markComplete, {
          id: followUpId,
        })
      ).rejects.toThrow(/Unauthorized: Cannot complete follow-up for another user/);

      // Verify it was NOT completed
      await t.run(async (ctx) => {
        const item = await ctx.db.get(followUpId);
        expect(item?.completed).toBe(false);
      });
    });

    test("FOLLOWUP-AUTH-03: Authorized counselor can complete student's follow-up", async () => {
      const { t, studentAId, counselorId } = await setupEnvironment();
      const authedCounselor = t.withIdentity({ subject: counselorId });

      let followUpId!: Id<"followUps">;
      await t.run(async (ctx) => {
        followUpId = await ctx.db.insert("followUps", {
          userId: studentAId,
          type: "counselor_review",
          dueDate: Date.now() + 86400000,
          completed: false,
          createdAt: Date.now(),
        });
      });

      const res = await authedCounselor.mutation(api.followUps.markComplete, {
        id: followUpId,
      });

      expect(res.success).toBe(true);

      await t.run(async (ctx) => {
        const item = await ctx.db.get(followUpId);
        expect(item?.completed).toBe(true);
      });
    });

    test("FOLLOWUP-AUTH-04: Admin can complete student's follow-up", async () => {
      const { t, studentAId, adminId } = await setupEnvironment();
      const authedAdmin = t.withIdentity({ subject: adminId });

      let followUpId!: Id<"followUps">;
      await t.run(async (ctx) => {
        followUpId = await ctx.db.insert("followUps", {
          userId: studentAId,
          type: "clinical_followup",
          dueDate: Date.now() + 86400000,
          completed: false,
          createdAt: Date.now(),
        });
      });

      const res = await authedAdmin.mutation(api.followUps.markComplete, {
        id: followUpId,
      });

      expect(res.success).toBe(true);

      await t.run(async (ctx) => {
        const item = await ctx.db.get(followUpId);
        expect(item?.completed).toBe(true);
      });
    });

    test("FOLLOWUP-AUTH-05: Unauthenticated caller is rejected", async () => {
      const { t, studentAId } = await setupEnvironment();

      let followUpId!: Id<"followUps">;
      await t.run(async (ctx) => {
        followUpId = await ctx.db.insert("followUps", {
          userId: studentAId,
          type: "general_check",
          dueDate: Date.now() + 86400000,
          completed: false,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.followUps.markComplete, {
          id: followUpId,
        })
      ).rejects.toThrow(/Unauthenticated: Login required/);
    });
  });

  // ==========================================
  // COUNSELLOR REQUEST AUTHORIZATION TESTS
  // ==========================================

  describe("Counsellor Request Status Authorization", () => {
    test("REQUEST-AUTH-01: Counselor can update request status", async () => {
      const { t, studentAId, counselorId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });
      const authedCounselor = t.withIdentity({ subject: counselorId });

      const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
        thought_original: "Need immediate support with anxiety",
        timestamp: Date.now(),
      });

      const res = await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
        requestId: reqId,
        status: "assigned",
        notes: "Assigned to Counselor Clara",
      });

      expect(res.success).toBe(true);

      await t.run(async (ctx) => {
        const req = await ctx.db.get(reqId);
        expect(req?.status).toBe("assigned");
        expect(req?.notes).toBe("Assigned to Counselor Clara");
      });
    });

    test("REQUEST-AUTH-02: Admin can update request status", async () => {
      const { t, studentAId, adminId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });
      const authedAdmin = t.withIdentity({ subject: adminId });

      const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
        thought_original: "Urgent academic pressure",
        timestamp: Date.now(),
      });

      const res = await authedAdmin.mutation(api.counsellorRequests.updateStatus, {
        requestId: reqId,
        status: "completed",
        notes: "Intake handled by Admin",
      });

      expect(res.success).toBe(true);

      await t.run(async (ctx) => {
        const req = await ctx.db.get(reqId);
        expect(req?.status).toBe("completed");
        expect(req?.notes).toBe("Intake handled by Admin");
      });
    });

    test("REQUEST-AUTH-03: Student cannot update request status", async () => {
      const { t, studentAId, studentBId } = await setupEnvironment();
      const authedStudentA = t.withIdentity({ subject: studentAId });
      const authedStudentB = t.withIdentity({ subject: studentBId });

      const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
        thought_original: "Need support",
        timestamp: Date.now(),
      });

      // Student B attempts to update status
      await expect(
        authedStudentB.mutation(api.counsellorRequests.updateStatus, {
          requestId: reqId,
          status: "completed",
        })
      ).rejects.toThrow(/Counselor or Admin access required/);

      // Student A (the requester) also cannot change administrative status
      await expect(
        authedStudentA.mutation(api.counsellorRequests.updateStatus, {
          requestId: reqId,
          status: "completed",
        })
      ).rejects.toThrow(/Counselor or Admin access required/);
    });

    test("REQUEST-AUTH-04: Unauthenticated caller is rejected", async () => {
      const { t, studentAId } = await setupEnvironment();
      const authedStudent = t.withIdentity({ subject: studentAId });

      const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
        thought_original: "Support needed",
        timestamp: Date.now(),
      });

      await expect(
        t.mutation(api.counsellorRequests.updateStatus, {
          requestId: reqId,
          status: "assigned",
        })
      ).rejects.toThrow(/Unauthenticated: Login required/);
    });
  });
});
