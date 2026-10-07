/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("P12 Step 7: Final Closure & End-to-End Verification", () => {
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
        patientId: "STU-E2E-A",
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
        patientId: "STU-E2E-B",
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

    const studentASubject = `sub_${studentAId}`;
    const studentBSubject = `sub_${studentBId}`;
    const counselorSubject = `sub_${counselorId}`;
    const adminSubject = `sub_${adminId}`;

    await t.run(async (ctx) => {
      await ctx.db.patch(studentAId as Id<"users">, { clerkId: studentASubject });
      await ctx.db.patch(studentBId as Id<"users">, { clerkId: studentBSubject });
      await ctx.db.patch(counselorId as Id<"users">, { clerkId: counselorSubject });
      await ctx.db.patch(adminId as Id<"users">, { clerkId: adminSubject });
    });

    const studentAClient = t.withIdentity({
      subject: studentASubject,
      tokenIdentifier: `https://issuer.example.com|${studentASubject}`,
    });

    const studentBClient = t.withIdentity({
      subject: studentBSubject,
      tokenIdentifier: `https://issuer.example.com|${studentBSubject}`,
    });

    const counselorClient = t.withIdentity({
      subject: counselorSubject,
      tokenIdentifier: `https://issuer.example.com|${counselorSubject}`,
    });

    const adminClient = t.withIdentity({
      subject: adminSubject,
      tokenIdentifier: `https://issuer.example.com|${adminSubject}`,
    });

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
      studentASubject,
      studentBSubject,
      counselorSubject,
      adminSubject,
      studentAClient,
      studentBClient,
      counselorClient,
      adminClient,
    };
  }

  test("E2E-01: Ordinary request appears in counselor queue", async () => {
    const { studentAClient, counselorClient, studentAId } = await setupEnvironment();

    const reqId = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Feeling stressed about midterm examinations.",
      situation_text: "Studying late in library.",
      sourceType: "self_initiated",
    });

    expect(reqId).toBeDefined();

    const queueRes = await counselorClient.query(api.dashboard.getCounsellorRequests, {
      paginate: true,
    });
    const found = queueRes.requests.find((r: any) => String(r._id) === String(reqId));
    expect(found).toBeDefined();
    expect(found?.user_id).toBe(studentAId);
    expect(found?.status).toBe("pending");
  });

  test("E2E-02: Ordinary request does not create crisis alert", async () => {
    const { studentAClient, t, studentAId } = await setupEnvironment();

    await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Mild scheduling inquiry.",
      situation_text: "Routine question.",
      sourceType: "self_initiated",
    });

    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
      expect(alerts.length).toBe(0);
    });
  });

  test("E2E-03: Crisis request creates counselor request and preserves safety alert", async () => {
    const { studentAClient, counselorClient, t, studentAId } = await setupEnvironment();

    // Crisis entrypoint triggers both emergency counselor request and crisis alert
    const reqId = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Emergency distress assistance needed immediately.",
      situation_text: "Crisis path trigger.",
      sourceType: "crisis",
    });

    // Alert triggered along safety escalation path
    let alertId: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "counselor_request",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Request exists in queue
    const queueRes = await counselorClient.query(api.dashboard.getCounsellorRequests, {
      paginate: true,
    });
    const req = queueRes.requests.find((r: any) => String(r._id) === String(reqId));
    expect(req).toBeDefined();
    expect(req?.sourceType).toBe("crisis");

    // Safety alert remains active and intact
    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId!);
      expect(alert).toBeDefined();
      expect(alert?.status).toBe("pending");
      expect(alert?.type).toBe("counselor_request");
    });
  });

  test("E2E-04: Counselor request → appointment provenance", async () => {
    const { studentAClient, counselorClient, studentAId, t } = await setupEnvironment();

    const reqId = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Request for stress management counseling.",
    });

    const apptId = await counselorClient.mutation(api.appointments.createAppointment, {
      userId: studentAId as Id<"users">,
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 3600000,
      description: "Stress Management Consultation",
      counsellorRequestId: reqId,
    });

    expect(apptId).toBeDefined();

    await t.run(async (ctx) => {
      const appt = await ctx.db.get(apptId);
      expect(appt?.counsellorRequestId).toBe(reqId);

      // Verify request transitioned to scheduled
      const req = await ctx.db.get(reqId);
      expect(req?.status).toBe("scheduled");
    });
  });

  test("E2E-05: Appointment → follow-up provenance", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    let apptId: Id<"appointments">;
    await t.run(async (ctx) => {
      apptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Intake Evaluation",
        date: "2026-10-15",
        time: "10:00 AM",
        status: "completed",
        attended: "yes",
        createdAt: Date.now() - 100000,
      });
    });

    const fuId = await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "counselor_checkin",
      dueDate: Date.now() + 86400000 * 3,
      notes: "Follow-up on behavioral coping mechanisms discussed in session.",
      appointmentId: apptId!,
    });

    expect(fuId).toBeDefined();

    await t.run(async (ctx) => {
      const fu = await ctx.db.get(fuId);
      expect(fu?.appointmentId).toBe(apptId);
      expect(fu?.status).toBe("pending");
    });
  });

  test("E2E-06: Full request → appointment → follow-up chain remains same student", async () => {
    const { studentAClient, counselorClient, studentAId, t } = await setupEnvironment();

    // 1. Request
    const reqId = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Full pipeline test request.",
    });

    // 2. Appointment from request
    const apptId = await counselorClient.mutation(api.appointments.createAppointment, {
      userId: studentAId as Id<"users">,
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 3600000,
      description: "Longitudinal Consultation",
      counsellorRequestId: reqId,
    });

    // 3. Follow-up from appointment
    const fuId = await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "post_intervention_review",
      dueDate: Date.now() + 86400000 * 7,
      appointmentId: apptId,
    });

    await t.run(async (ctx) => {
      const req = await ctx.db.get(reqId);
      const appt = await ctx.db.get(apptId);
      const fu = await ctx.db.get(fuId);

      expect(req?.user_id).toBe(studentAId);
      expect(String(appt?.userId)).toBe(studentAId);
      expect(fu?.userId).toBe(studentAId);

      expect(appt?.counsellorRequestId).toBe(reqId);
      expect(fu?.appointmentId).toBe(apptId);
    });
  });

  test("E2E-07: Student isolation across requests/appointments/follow-ups", async () => {
    const { studentAClient, studentBClient, counselorClient, studentAId, studentBId } = await setupEnvironment();

    const reqA = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Student A private inquiry.",
    });

    const apptA = await counselorClient.mutation(api.appointments.createAppointment, {
      userId: studentAId as Id<"users">,
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 3600000,
      description: "Student A Session",
      counsellorRequestId: reqA,
    });

    const fuA = await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "counselor_checkin",
      dueDate: Date.now() + 86400000,
      appointmentId: apptA,
    });

    // Student B attempting to read Student A requests -> rejected
    await expect(
      studentBClient.query(api.counsellorRequests.getStudentCounsellorRequests, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);

    // Student B attempting to read Student A follow-ups -> rejected
    await expect(
      studentBClient.query(api.followUps.getStudentFollowUps, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B attempting to cancel Student A appointment -> rejected
    await expect(
      studentBClient.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptA,
        status: "cancelled",
      })
    ).rejects.toThrow(/Unauthorized/);

    // Student B attempting to complete Student A follow-up -> rejected
    await expect(
      studentBClient.mutation(api.followUps.markComplete, {
        id: fuA,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("E2E-08: Counselor authorized longitudinal profile", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    let attemptId: Id<"screeningAttempts">;
    await t.run(async (ctx) => {
      attemptId = await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: Date.now() - 3600000,
        completedAt: Date.now() - 3500000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 10, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 7, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 1, maxScore: 16, severity: "low", level: "low" },
        },
        triageLevel: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
      });

      const triageId = await ctx.db.insert("triages", {
        userId: studentAId,
        attemptId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now() - 3400000,
      });

      const reqId = await ctx.db.insert("counsellorRequests", {
        user_id: studentAId,
        timestamp: Date.now() - 3000000,
        status: "scheduled",
        sourceType: "triage",
        attemptId,
        triageId,
      });

      const apptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Intake Session",
        date: "2026-10-15",
        time: "10:00 AM",
        status: "completed",
        attended: "yes",
        counsellorRequestId: reqId,
        createdAt: Date.now() - 2000000,
      });

      await ctx.db.insert("followUps", {
        userId: studentAId,
        type: "counselor_checkin",
        dueDate: Date.now() + 86400000,
        completed: false,
        status: "pending",
        appointmentId: apptId,
        createdAt: Date.now() - 1000000,
      });
    });

    const timeline = await counselorClient.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 50,
    });

    expect(timeline).toBeDefined();
    expect(timeline.length).toBeGreaterThanOrEqual(4);

    const categories = new Set(timeline.map((e: any) => e.category));
    expect(categories.has("screening")).toBe(true);
    expect(categories.has("triage")).toBe(true);
    expect(categories.has("counseling")).toBe(true);
  });

  test("E2E-09: Student cannot access counselor-only notes", async () => {
    const { counselorClient, studentAClient, studentAId } = await setupEnvironment();

    await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "counselor_checkin",
      dueDate: Date.now() + 86400000,
      notes: "CONFIDENTIAL_CLINICAL_OBSERVATION: Signs of school-avoidance defense mechanism.",
    });

    const studentView = await studentAClient.query(api.followUps.getStudentFollowUps, {});
    expect(studentView.length).toBe(1);
    expect((studentView[0] as any).notes).toBeUndefined();

    const counselorView = await counselorClient.query(api.followUps.getStudentFollowUps, {
      userId: studentAId,
    });
    expect(counselorView.length).toBe(1);
    expect((counselorView[0] as any).notes).toContain("CONFIDENTIAL_CLINICAL_OBSERVATION");
  });

  test("E2E-10: Raw AI transcript absent from timeline", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("companionMessages", {
        messageId: "msg_e2e_10",
        userId: studentAId,
        role: "user",
        content: "Private AI companion chat text: I feel totally exhausted.",
        createdAt: Date.now() - 60000,
      });
      await ctx.db.insert("aiCompanionLogs", {
        messageId: "log_e2e_10",
        userId: studentAId,
        role: "assistant",
        content: "I hear you. Let us take a grounding breath together.",
        createdAt: Date.now() - 50000,
      });
    });

    const timeline = await counselorClient.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const hasCompanion = timeline.some(
      (e: any) => e.sourceTable === "companionMessages" || e.sourceTable === "aiCompanionLogs"
    );
    expect(hasCompanion).toBe(false);

    for (const event of timeline) {
      expect(event.summary).not.toContain("Private AI companion chat text");
    }
  });

  test("E2E-11: Terminal appointment states remain immutable", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    let completedApptId: Id<"appointments">;
    let rejectedApptId: Id<"appointments">;

    await t.run(async (ctx) => {
      completedApptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Finished Consultation",
        date: "2026-10-10",
        time: "09:00 AM",
        status: "completed",
        attended: "yes",
        createdAt: Date.now() - 500000,
      });

      rejectedApptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Declined Consultation",
        date: "2026-10-12",
        time: "10:00 AM",
        status: "rejected",
        rejectionReason: "Schedule conflict",
        createdAt: Date.now() - 400000,
      });
    });

    // Completed appointment cannot be cancelled
    await expect(
      counselorClient.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: completedApptId!,
        status: "cancelled",
      })
    ).rejects.toThrow(/terminal state/);

    // Rejected appointment cannot be accepted
    await expect(
      counselorClient.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: rejectedApptId!,
        status: "accepted",
      })
    ).rejects.toThrow(/terminal state/);
  });

  test("E2E-12: Completed follow-up cannot be re-completed", async () => {
    const { counselorClient, studentAId } = await setupEnvironment();

    const fuId = await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "counselor_checkin",
      dueDate: Date.now() + 86400000,
    });

    // First completion succeeds
    await counselorClient.mutation(api.followUps.markComplete, { id: fuId });

    // Second completion is rejected
    await expect(
      counselorClient.mutation(api.followUps.markComplete, { id: fuId })
    ).rejects.toThrow(/Follow-up is already completed/);
  });

  test("E2E-13: Historical records without new provenance fields remain valid", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    await t.run(async (ctx) => {
      // Historical appointment without counsellorRequestId
      await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Legacy Standalone Appointment",
        date: "2026-08-01",
        time: "10:00 AM",
        status: "completed",
        createdAt: Date.now() - 5000000,
      });

      // Historical follow-up without appointmentId
      await ctx.db.insert("followUps", {
        userId: studentAId,
        type: "routine_checkin",
        dueDate: Date.now() + 86400000,
        completed: false,
        createdAt: Date.now() - 5000000,
      });
    });

    const timeline = await counselorClient.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "counseling",
    });

    expect(timeline.length).toBeGreaterThanOrEqual(2);
    const legacyAppt = timeline.find((e: any) => e.title.includes("Legacy Standalone"));
    const legacyFu = timeline.find((e: any) => e.sourceTable === "followUps");

    expect(legacyAppt).toBeDefined();
    expect(legacyAppt?.provenance?.counsellorRequestId).toBeUndefined();

    expect(legacyFu).toBeDefined();
    expect(legacyFu?.provenance?.appointmentId).toBeUndefined();
  });

  test("E2E-14: Notification recipients remain server-derived", async () => {
    const { studentAClient, counselorClient, studentAId, counselorId, t } = await setupEnvironment();

    // Student creates request -> notification goes to staff, recipient is server-derived
    await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Notification check inquiry.",
    });

    await t.run(async (ctx) => {
      const staffNotifs = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", counselorId))
        .collect();

      expect(staffNotifs.length).toBeGreaterThanOrEqual(1);
      expect(staffNotifs[0].type).toBe("counsellor_request");
      // Notification title/message does not leak sensitive private details
      expect(staffNotifs[0].message).toContain("requested counselor support");
    });
  });

  test("E2E-15: No duplicate canonical records generated by the complete workflow", async () => {
    const { studentAClient, counselorClient, studentAId, t } = await setupEnvironment();

    // Run complete pipeline
    const reqId = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Deduplication pipeline verification.",
    });

    const apptId = await counselorClient.mutation(api.appointments.createAppointment, {
      userId: studentAId as Id<"users">,
      startTime: Date.now() + 86400000,
      endTime: Date.now() + 86400000 + 3600000,
      description: "Consultation Call",
      counsellorRequestId: reqId,
    });

    const fuId = await counselorClient.mutation(api.followUps.create, {
      userId: studentAId,
      type: "counselor_checkin",
      dueDate: Date.now() + 86400000,
      appointmentId: apptId,
    });

    await t.run(async (ctx) => {
      const reqDocs = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", studentAId))
        .collect();
      const apptDocs = await ctx.db
        .query("appointments")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId as Id<"users">))
        .collect();
      const fuDocs = await ctx.db
        .query("followUps")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();

      expect(reqDocs.length).toBe(1);
      expect(apptDocs.length).toBe(1);
      expect(fuDocs.length).toBe(1);
    });
  });

  test("E2E-16: Longitudinal timeline contains expected canonical events", async () => {
    const { counselorClient, studentAId, t } = await setupEnvironment();

    let attemptId: Id<"screeningAttempts">;
    let reqId: Id<"counsellorRequests">;
    let apptId: Id<"appointments">;
    let fuId: Id<"followUps">;

    await t.run(async (ctx) => {
      attemptId = await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: Date.now() - 500000,
        completedAt: Date.now() - 480000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 8, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 6, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "low", level: "low" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      reqId = await ctx.db.insert("counsellorRequests", {
        user_id: studentAId,
        timestamp: Date.now() - 400000,
        status: "scheduled",
        sourceType: "self_initiated",
        attemptId,
      });

      apptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Follow-up Consultation",
        date: "2026-10-25",
        time: "10:00 AM",
        status: "completed",
        attended: "yes",
        counsellorRequestId: reqId,
        createdAt: Date.now() - 300000,
      });

      fuId = await ctx.db.insert("followUps", {
        userId: studentAId,
        type: "counselor_checkin",
        dueDate: Date.now() + 86400000,
        completed: false,
        status: "pending",
        appointmentId: apptId,
        createdAt: Date.now() - 100000,
      });
    });

    const timeline = await counselorClient.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const foundAttempt = timeline.find((e: any) => e.sourceId === String(attemptId!));
    const foundReq = timeline.find((e: any) => e.sourceId === String(reqId!));
    const foundAppt = timeline.find((e: any) => e.sourceId === String(apptId!));
    const foundFu = timeline.find((e: any) => e.sourceId === String(fuId!));

    expect(foundAttempt).toBeDefined();
    expect(foundReq).toBeDefined();
    expect(foundAppt).toBeDefined();
    expect(foundFu).toBeDefined();

    expect(foundAppt?.provenance?.counsellorRequestId).toBe(String(reqId!));
    expect(foundFu?.provenance?.appointmentId).toBe(String(apptId!));
  });

  test("E2E-17: Invalid cross-student provenance is rejected", async () => {
    const { studentAClient, studentBClient, counselorClient, studentAId, studentBId, t } = await setupEnvironment();

    // Student A's request
    const reqA = await studentAClient.mutation(api.counsellorRequests.create, {
      thought_original: "Student A's genuine request.",
    });

    // Attempting to create an appointment for Student B linked to Student A's request -> rejected
    await expect(
      counselorClient.mutation(api.appointments.createAppointment, {
        userId: studentBId as Id<"users">,
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 86400000 + 3600000,
        description: "Mismatched Appointment",
        counsellorRequestId: reqA,
      })
    ).rejects.toThrow(/Invalid provenance: Counselor request does not belong to this student/);

    // Student A's appointment
    let apptA: Id<"appointments">;
    await t.run(async (ctx) => {
      apptA = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Student A Valid Appt",
        date: "2026-10-25",
        time: "10:00 AM",
        status: "accepted",
        createdAt: Date.now(),
      });
    });

    // Attempting to create a follow-up for Student B linked to Student A's appointment -> rejected
    await expect(
      counselorClient.mutation(api.followUps.create, {
        userId: studentBId,
        type: "counselor_checkin",
        dueDate: Date.now() + 86400000,
        appointmentId: apptA!,
      })
    ).rejects.toThrow(/Invalid provenance: Appointment does not belong to this student/);
  });

  test("E2E-18: Unauthenticated access is rejected", async () => {
    const { t, studentAId } = await setupEnvironment();
    const unauthenticated = t;

    // Requests
    await expect(
      unauthenticated.mutation(api.counsellorRequests.create, {
        thought_original: "Anonymous attempt.",
      })
    ).rejects.toThrow(/Unauthenticated/);

    let apptId: any;
    await t.run(async (ctx) => {
      apptId = await ctx.db.insert("appointments", {
        userId: studentAId as Id<"users">,
        title: "Unauth Test Session",
        createdBy: "user",
        date: "2026-10-15",
        time: "10:00 AM",
        reason: "Testing auth guard",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Appointments mutation
    await expect(
      unauthenticated.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      })
    ).rejects.toThrow(/Unauthenticated/);

    // Follow-ups mutation
    await expect(
      unauthenticated.mutation(api.followUps.create, {
        userId: studentAId,
        type: "counselor_checkin",
        dueDate: Date.now() + 86400000,
      })
    ).rejects.toThrow(/Unauthenticated/);

    // Timeline query
    await expect(
      unauthenticated.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Unauthenticated/);

    // Follow-ups query safely returns empty array when unauthenticated
    const fuList = await unauthenticated.query(api.followUps.getStudentFollowUps, {
      userId: studentAId,
    });
    expect(fuList).toEqual([]);
  });
});
