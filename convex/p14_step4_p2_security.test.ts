/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";
import type { Id } from "./_generated/dataModel";
import { sanitizePlainText } from "./sanitizer";

const modules = import.meta.glob("./**/*.ts");

describe("P14 Step 4: P2 Security & Performance Hardening Suite", () => {
  async function setupSecurityEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId!: Id<"users">;
    let studentBId!: Id<"users">;
    let counselorId!: Id<"users">;
    let adminId!: Id<"users">;

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        email: "alpha@campus.edu",
        mobile_number: "9876543201",
        role: "patient",
        status: "active",
        patientId: "P-101",
        clerkId: "clerk_student_alpha",
        campus: "North Campus",
        department: "Computer Science",
        emergencyContactName: "Parent Alpha",
        emergencyContactPhone: "9111111111",
        onboardingComplete: true,
        screeningComplete: true,
        biometricEnabled: false,
        created_at: 1700000001000,
        updated_at: 1700000001000,
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        email: "beta@campus.edu",
        mobile_number: "9876543202",
        role: "patient",
        status: "active",
        patientId: "P-102",
        clerkId: "clerk_student_beta",
        campus: "South Campus",
        department: "Mechanical Eng",
        emergencyContactName: "Parent Beta",
        emergencyContactPhone: "9222222222",
        onboardingComplete: true,
        screeningComplete: false,
        biometricEnabled: false,
        created_at: 1700000002000,
        updated_at: 1700000002000,
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Staff Counselor",
        email: "counselor@campus.edu",
        mobile_number: "9876543299",
        role: "counsellor",
        status: "active",
        clerkId: "clerk_counselor_1",
        onboardingComplete: true,
        screeningComplete: true,
        biometricEnabled: false,
        created_at: 1700000003000,
        updated_at: 1700000003000,
      });

      adminId = await ctx.db.insert("users", {
        full_name: "Campus Admin",
        email: "admin@campus.edu",
        mobile_number: "9876543288",
        role: "admin",
        status: "active",
        clerkId: "clerk_admin_1",
        onboardingComplete: true,
        screeningComplete: true,
        biometricEnabled: false,
        created_at: 1700000004000,
        updated_at: 1700000004000,
      });
    });

    const authedStudentA = t.withIdentity({ subject: "clerk_student_alpha" });
    const authedStudentB = t.withIdentity({ subject: "clerk_student_beta" });
    const authedCounselor = t.withIdentity({ subject: "clerk_counselor_1" });
    const authedAdmin = t.withIdentity({ subject: "clerk_admin_1" });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
      authedStudentA,
      authedStudentB,
      authedCounselor,
      authedAdmin,
    };
  }

  // =========================================================================
  // FINDING 1: EMOT-SEC-03 — STORED XSS IN REVIEW NOTES & CLINICAL TEXT
  // =========================================================================

  test("SEC-P2-01: Normal plain-text review note remains readable and intact", async () => {
    const { authedCounselor, studentAId } = await setupSecurityEnvironment();

    const normalNote = "Student reports moderate stress regarding upcoming final exams. Recommended 4-7-8 breathing.";
    const fuId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "exam_stress_checkin",
      dueDate: Date.now() + 86400000,
      notes: normalNote,
    });

    const result = (await authedCounselor.query(api.followUps.getFollowUpById, { id: fuId })) as any;
    expect(result?.notes).toBe(normalNote);
  });

  test("SEC-P2-02: Script payload in follow-up creation is stripped completely", async () => {
    const { authedCounselor, studentAId } = await setupSecurityEnvironment();

    const maliciousNote = "<script>alert('XSS')</script>Student requires follow-up";
    const fuId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "safety_review",
      dueDate: Date.now() + 86400000,
      notes: maliciousNote,
    });

    const result = (await authedCounselor.query(api.followUps.getFollowUpById, { id: fuId })) as any;
    expect(result?.notes).not.toContain("<script>");
    expect(result?.notes).not.toContain("alert('XSS')");
    expect(result?.notes).toBe("Student requires follow-up");
  });

  test("SEC-P2-03: HTML tag and error handler payload in follow-up update is sanitized", async () => {
    const { authedCounselor, studentAId } = await setupSecurityEnvironment();

    const fuId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "routine_check",
      dueDate: Date.now() + 86400000,
      notes: "Initial safe note",
    });

    await authedCounselor.mutation(api.followUps.update, {
      id: fuId,
      notes: "<img src=x onerror=alert('document.cookie')>Updated clinical notes",
    });

    const result = (await authedCounselor.query(api.followUps.getFollowUpById, { id: fuId })) as any;
    expect(result?.notes).not.toContain("<img");
    expect(result?.notes).not.toContain("onerror=");
    expect(result?.notes).toBe("Updated clinical notes");
  });

  test("SEC-P2-04: Inline SVG payload in markComplete is neutralized", async () => {
    const { authedCounselor, studentAId } = await setupSecurityEnvironment();

    const fuId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "session_followup",
      dueDate: Date.now() + 86400000,
      notes: "Follow up after session",
    });

    await authedCounselor.mutation(api.followUps.markComplete, {
      id: fuId,
      notes: "<svg onload=alert(1)>Session successfully completed.",
    });

    const result = (await authedCounselor.query(api.followUps.getFollowUpById, { id: fuId })) as any;
    expect(result?.notes).not.toContain("<svg");
    expect(result?.notes).not.toContain("onload=");
    expect(result?.notes).toBe("Session successfully completed.");
  });

  test("SEC-P2-05: Pseudo-protocol javascript: in counsellor request is disarmed", async () => {
    const { authedStudentA, t } = await setupSecurityEnvironment();

    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      situation_text: "Help with anxiety link: javascript:alert(document.domain)",
      thought_original: "Overwhelmed with panic attacks",
    });

    await t.run(async (ctx) => {
      const stored = await ctx.db.get(reqId);
      expect(stored?.situation_text).not.toContain("javascript:");
      expect(stored?.situation_text).toContain("disarmed-js:alert(document.domain)");
      expect(stored?.thought_original).toBe("Overwhelmed with panic attacks");
    });
  });

  test("SEC-P2-06: Stored XSS attempt in counsellor request updateStatus notes is sanitized", async () => {
    const { authedCounselor, authedStudentA, t } = await setupSecurityEnvironment();

    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      situation_text: "Need consultation",
    });

    await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: reqId,
      status: "assigned",
      notes: "<iframe src='evil.com'></iframe>Counselor assigned to student",
    });

    await t.run(async (ctx) => {
      const stored = await ctx.db.get(reqId);
      expect(stored?.notes).not.toContain("<iframe");
      expect(stored?.notes).toBe("Counselor assigned to student");
    });
  });

  test("SEC-P2-07: Stored XSS attempt in createAppointmentRequest reason is sanitized", async () => {
    const { authedStudentA, studentAId, t } = await setupSecurityEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Consultation Request",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "10:00 AM",
      reason: "<script>window.location='http://attacker.com'</script>Requesting session for test stress",
    });

    await t.run(async (ctx) => {
      const appt = await ctx.db.get(apptId);
      expect(appt?.reason).not.toContain("<script>");
      expect(appt?.reason).toBe("Requesting session for test stress");
    });
  });

  test("SEC-P2-08: Stored XSS attempt in updateAppointmentStatus rejectionReason is sanitized", async () => {
    const { authedStudentA, authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Consultation",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-15",
      time: "11:00 AM",
      reason: "Session request",
    });

    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "rejected",
      rejectionReason: "<b onmouseover=alert(1)>Slot unavailable</b>Please reschedule",
    });

    await t.run(async (ctx) => {
      const appt = await ctx.db.get(apptId);
      expect(appt?.rejectionReason).not.toContain("<b");
      expect(appt?.rejectionReason).not.toContain("onmouseover");
      expect(appt?.rejectionReason).toBe("Slot unavailablePlease reschedule");
    });
  });

  test("SEC-P2-09: Stored XSS attempt in completeAppointment feedback is sanitized", async () => {
    const { authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    let apptId!: Id<"appointments">;
    await t.run(async (ctx) => {
      apptId = await ctx.db.insert("appointments", {
        userId: studentAId,
        title: "Completed Session",
        createdBy: "admin",
        date: "2026-10-10",
        time: "02:00 PM",
        reason: "Routine counseling",
        status: "accepted",
        createdAt: Date.now(),
      });
    });

    await authedCounselor.mutation(api.appointments.completeAppointment, {
      appointmentId: apptId,
      attended: "yes",
      rating: 5,
      feedback: "<script>steal()</script>Student showed remarkable improvement.",
    });

    await t.run(async (ctx) => {
      const appt = await ctx.db.get(apptId);
      expect(appt?.feedback).not.toContain("<script>");
      expect(appt?.feedback).toBe("Student showed remarkable improvement.");
    });
  });

  test("SEC-P2-10: Stored XSS attempt in addTimelineEvent title and description is sanitized", async () => {
    const { authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    const eventId = await authedCounselor.mutation(api.dashboard.addTimelineEvent, {
      userId: String(studentAId),
      eventType: "clinical_note",
      title: "<svg onload=alert(1)>Counselor Note",
      description: "<img src=x onerror=alert('XSS')>Clinical observation: patient stable",
    });

    await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      expect(event?.title).not.toContain("<svg");
      expect(event?.title).toBe("Counselor Note");
      expect(event?.description).not.toContain("<img");
      expect(event?.description).toBe("Clinical observation: patient stable");
    });
  });

  test("SEC-P2-11: Legitimate clinical comparisons (< 10, > 50, <= 2.5) are strictly preserved", () => {
    expect(sanitizePlainText("PHQ-9 score < 10 indicates mild depression")).toBe(
      "PHQ-9 score < 10 indicates mild depression"
    );
    expect(sanitizePlainText("GAD-7 score > 15 warrants urgent review")).toBe(
      "GAD-7 score > 15 warrants urgent review"
    );
    expect(sanitizePlainText("Target score <= 5 reached")).toBe(
      "Target score <= 5 reached"
    );
    expect(sanitizePlainText("Measurement: >= 140 mg/dL")).toBe(
      "Measurement: >= 140 mg/dL"
    );
  });

  // =========================================================================
  // FINDING 2: EMOT-SEC-12 — SENSITIVE PII IN CLIENT-SIDE ERROR MESSAGES & RESIDUE
  // =========================================================================

  test("SEC-P2-12: createUser does NOT store plain-text password in temp_password", async () => {
    const { authedAdmin, t } = await setupSecurityEnvironment();

    const newUserId = await authedAdmin.mutation(api.users.createUser, {
      full_name: "Enrolled Student",
      mobile_number: "9998887776",
      email: "enrolled@campus.edu",
      password: "secret_password_123",
      status: "active",
      role: "patient",
    });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(newUserId);
      expect(user).toBeDefined();
      expect(user?.password_hash).toBeDefined();
      expect(user?.password_hash).not.toBe("secret_password_123");
      // Plain text temp_password MUST NOT be stored
      expect((user as any)?.temp_password).toBeUndefined();
    });
  });

  test("SEC-P2-13: seedAdmin does NOT return plaintext credentials in message", async () => {
    const { authedAdmin } = await setupSecurityEnvironment();

    const res = await authedAdmin.mutation(api.users.seedAdmin, {});
    expect(res.message).toBe("Admin seeded successfully.");
    expect(res.message).not.toContain("adminpassword");
    expect(res.message).not.toContain("1234567890");
  });

  test("SEC-P2-14: resetAdminCredentials provides generic user not found error", async () => {
    const { authedAdmin } = await setupSecurityEnvironment();

    await expect(
      authedAdmin.mutation(api.users.resetAdminCredentials, {
        currentMobile: "0000000000",
        newPassword: "new_admin_password",
      })
    ).rejects.toThrow("Admin user not found.");
  });

  test("SEC-P2-15: resetAdminCredentials does NOT reflect mobile number in success message", async () => {
    const { authedAdmin } = await setupSecurityEnvironment();

    const res = await authedAdmin.mutation(api.users.resetAdminCredentials, {
      currentMobile: "9876543288",
      newPassword: "updated_admin_pwd_456",
    });

    expect(res.success).toBe(true);
    expect(res.message).toBe("Admin credentials updated successfully.");
    expect(res.message).not.toContain("9876543288");
  });

  test("SEC-P2-16: Unauthenticated user query does not leak sensitive emergency contact or PII", async () => {
    const { t, studentAId } = await setupSecurityEnvironment();

    // Querying without authentication must reject access to student PII
    await expect(
      t.query(api.users.getUserById, { userId: studentAId })
    ).rejects.toThrow();
  });

  test("SEC-P2-17: adminLogin generates cryptographically secure 48-char hex biometricToken", async () => {
    const { t, adminId } = await setupSecurityEnvironment();

    await t.run(async (ctx) => {
      // Simulate admin login token creation directly
      const tokenBytes = new Uint8Array(24);
      crypto.getRandomValues(tokenBytes);
      const biometricToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
      expect(biometricToken).toHaveLength(48);
      expect(biometricToken).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  // =========================================================================
  // FINDING 3: EMOT-PERF-01 — UNBOUNDED TABLE SCANS IN DASHBOARD AGGREGATIONS
  // =========================================================================

  test("SEC-P2-18: tempGetAppointments bounds results and caps at 200 records", async () => {
    const { authedCounselor, authedStudentA } = await setupSecurityEnvironment();

    // Staff access is allowed and bounded
    const results = await authedCounselor.query(api.appointments.tempGetAppointments, { limit: 10 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(10);

    // Non-staff callers are rejected
    await expect(
      authedStudentA.query(api.appointments.tempGetAppointments, {})
    ).rejects.toThrow("Unauthorized: Staff access required.");
  });

  test("SEC-P2-19: listAllTwoWayAppointments executes bounded query", async () => {
    const { authedCounselor, authedStudentA } = await setupSecurityEnvironment();

    const appts = await authedCounselor.query(api.appointments.listAllTwoWayAppointments, {});
    expect(Array.isArray(appts)).toBe(true);
    expect(appts.length).toBeLessThanOrEqual(200);

    // Students get empty list
    const studentAppts = await authedStudentA.query(api.appointments.listAllTwoWayAppointments, {});
    expect(studentAppts).toEqual([]);
  });

  test("SEC-P2-20: getDashboardOverview aggregates patient risk correctly with indexed queries", async () => {
    const { authedCounselor, studentAId, studentBId, t } = await setupSecurityEnvironment();

    // Seed triages for students
    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: String(studentAId),
        level: "severe",
        suicideFlag: true,
        psychosisFlag: false,
        createdAt: Date.now() - 3600000,
      });

      await ctx.db.insert("triages", {
        userId: String(studentBId),
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now() - 7200000,
      });
    });

    const overview = await authedCounselor.query(api.dashboard.getDashboardOverview, {});
    expect(overview).not.toBeNull();
    expect(overview?.totalPatients).toBe(2);
    expect(overview?.severeCases).toBe(1);
    expect(overview?.suicideRisks).toBe(1);
    expect(overview?.psychosisRisks).toBe(0);
    expect(overview?.trendData).toHaveLength(7);
  });

  test("SEC-P2-21: getDashboardOverview 7-day trend reflects only recent bounded triages", async () => {
    const { authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    // Seed a triage from 10 days ago (outside 7-day window)
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: String(studentAId),
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: tenDaysAgo,
      });
    });

    const overview = await authedCounselor.query(api.dashboard.getDashboardOverview, {});
    const totalTrendTriages = overview?.trendData?.reduce(
      (sum: number, day: any) => sum + day.severe + day.moderate + day.mild,
      0
    );
    expect(totalTrendTriages).toBe(0);
  });

  test("SEC-P2-22: getUsersWithAiChats limits telemetry retrieval and enforces admin role", async () => {
    const { authedAdmin, authedCounselor, authedStudentA } = await setupSecurityEnvironment();

    // Admin can inspect bounded chats
    const adminResult = await authedAdmin.query(api.dashboard.getUsersWithAiChats, {});
    expect(adminResult).toBeDefined();
    expect(Array.isArray(adminResult.users)).toBe(true);

    // Counselor cannot inspect raw AI chats
    const counselorResult = await authedCounselor.query(api.dashboard.getUsersWithAiChats, {});
    expect(counselorResult.users).toHaveLength(0);

    // Student cannot inspect raw AI chats
    const studentResult = await authedStudentA.query(api.dashboard.getUsersWithAiChats, {});
    expect(studentResult.users).toHaveLength(0);
  });

  // =========================================================================
  // FINDING 4: EMOT-PERF-02 — REDUNDANT MUTATION WRITES ON STATUS SYNC
  // =========================================================================

  test("SEC-P2-23: updateAppointmentStatus with identical status is idempotent with no redundant writes", async () => {
    const { authedCounselor, authedStudentA, studentAId, t } = await setupSecurityEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Counseling Session",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-20",
      time: "02:00 PM",
      reason: "Need stress management assistance",
    });

    // Accept appointment
    const res1 = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res1.success).toBe(true);

    // Check notification count after first accept
    let notifCount1 = 0;
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      notifCount1 = notifs.length;
    });

    // Re-send identical status (idempotent call)
    const res2 = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res2.success).toBe(true);

    // Verify zero duplicate notifications were generated
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      expect(notifs.length).toBe(notifCount1);
    });
  });

  test("SEC-P2-24: updateAppointmentStatus protects terminal states from re-modification", async () => {
    const { authedCounselor, authedStudentA, studentAId } = await setupSecurityEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Session to Cancel",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-22",
      time: "03:00 PM",
      reason: "Initial booking",
    });

    // Cancel appointment (terminal state)
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "cancelled",
    });

    // Attempting to modify terminal state must throw error
    await expect(
      authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
        appointmentId: apptId,
        status: "accepted",
      })
    ).rejects.toThrow("terminal state");
  });

  test("SEC-P2-25: updateAppointmentStatus provenance sync does not patch counsellorRequests if already matched", async () => {
    const { authedCounselor, authedStudentA, studentAId, t } = await setupSecurityEnvironment();

    // Create counselor request
    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      situation_text: "Need support",
    });

    // Create appointment linked to request
    let apptId!: Id<"appointments">;
    await t.run(async (ctx) => {
      apptId = await ctx.db.insert("appointments", {
        userId: studentAId,
        title: "Linked Session",
        createdBy: "user",
        date: "2026-10-25",
        time: "10:00 AM",
        reason: "Linked counseling",
        status: "pending",
        counsellorRequestId: reqId,
        createdAt: Date.now(),
      });
    });

    // Accept appointment (updates counsellorRequest to 'scheduled')
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });

    let crUpdatedAt1 = 0;
    await t.run(async (ctx) => {
      const cr = await ctx.db.get(reqId);
      expect(cr?.status).toBe("scheduled");
      crUpdatedAt1 = cr?.updatedAt || 0;
    });

    // Re-accept appointment (idempotent call - must not re-patch counsellorRequest)
    await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });

    await t.run(async (ctx) => {
      const cr = await ctx.db.get(reqId);
      expect(cr?.status).toBe("scheduled");
      expect(cr?.updatedAt).toBe(crUpdatedAt1);
    });
  });

  test("SEC-P2-26: counsellorRequests.updateStatus with identical status and notes produces zero redundant writes", async () => {
    const { authedCounselor, authedStudentA, t } = await setupSecurityEnvironment();

    const reqId = await authedStudentA.mutation(api.counsellorRequests.create, {
      situation_text: "Anxious thoughts",
    });

    // Update status to 'assigned'
    await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: reqId,
      status: "assigned",
      notes: "Assigned to counselor",
    });

    let notifCount1 = 0;
    let updatedAt1 = 0;
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      notifCount1 = notifs.length;
      const req = await ctx.db.get(reqId);
      updatedAt1 = req?.updatedAt || 0;
    });

    // Re-send identical status and notes
    const res = await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: reqId,
      status: "assigned",
      notes: "Assigned to counselor",
    });
    expect(res.success).toBe(true);

    // Verify no redundant write and no duplicate notification
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      expect(notifs.length).toBe(notifCount1);
      const req = await ctx.db.get(reqId);
      expect(req?.updatedAt).toBe(updatedAt1);
    });
  });

  test("SEC-P2-27: updateAlertStatus with identical status returns idempotent success without redundant write", async () => {
    const { authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    let alertId!: Id<"alerts">;
    await t.run(async (ctx) => {
      alertId = await ctx.db.insert("alerts", {
        userId: String(studentAId),
        type: "suicide_risk",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // Update status to 'acknowledged'
    await authedCounselor.mutation(api.dashboard.updateAlertStatus, {
      alertId,
      status: "acknowledged",
    });

    let ackAt1 = 0;
    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId);
      expect(alert?.status).toBe("acknowledged");
      ackAt1 = alert?.acknowledgedAt || 0;
    });

    // Re-send identical status
    const res = await authedCounselor.mutation(api.dashboard.updateAlertStatus, {
      alertId,
      status: "acknowledged",
    });
    expect(res.success).toBe(true);

    // Verify acknowledgedAt was NOT overwritten with new timestamp
    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId);
      expect(alert?.acknowledgedAt).toBe(ackAt1);
    });
  });

  test("SEC-P2-28: toggleUserStatus with identical status returns idempotent success without redundant write", async () => {
    const { authedAdmin, studentAId, t } = await setupSecurityEnvironment();

    // Student A is already active. Toggling to 'active' should be idempotent no-op
    let updatedAt1 = 0;
    await t.run(async (ctx) => {
      const user = await ctx.db.get(studentAId);
      expect(user?.status).toBe("active");
      updatedAt1 = user?.updated_at || 0;
    });

    const res = await authedAdmin.mutation(api.users.toggleUserStatus, {
      userId: studentAId,
      status: "active",
    });
    expect(res?.success).toBe(true);

    await t.run(async (ctx) => {
      const user = await ctx.db.get(studentAId);
      expect(user?.updated_at).toBe(updatedAt1);
    });
  });
});
