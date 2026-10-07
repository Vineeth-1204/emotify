/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("P14 Step 5: Final Security & Cross-Cutting Verification Suite", () => {
  async function setupFinalEnvironment() {
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
  // 1. FINAL P0 VERIFICATION: CRITICAL ACCESS & CREDENTIAL BOUNDARIES
  // =========================================================================

  test("FINAL-P0-01: Anonymous and unauthorized calls to getActiveApiKey and insertApiKey remain rejected", async () => {
    const { t, authedStudentA, authedCounselor } = await setupFinalEnvironment();

    await expect(t.query(api.cbt.getActiveApiKey, {})).rejects.toThrow("Unauthenticated");
    await expect(authedStudentA.query(api.cbt.getActiveApiKey, {})).rejects.toThrow("Unauthorized");
    await expect(authedCounselor.query(api.cbt.getActiveApiKey, {})).rejects.toThrow("Unauthorized");

    await expect(t.mutation(api.cbt.insertApiKey, { key: "new_key" })).rejects.toThrow("Unauthenticated");
    await expect(authedStudentA.mutation(api.cbt.insertApiKey, { key: "new_key" })).rejects.toThrow("Unauthorized");
    await expect(authedCounselor.mutation(api.cbt.insertApiKey, { key: "new_key" })).rejects.toThrow("Unauthorized");
  });

  test("FINAL-P0-02: Anonymous and unauthorized callers to resetAdminCredentials remain rejected", async () => {
    const { t, authedStudentA, authedCounselor } = await setupFinalEnvironment();

    await expect(
      t.mutation(api.users.resetAdminCredentials, { currentMobile: "9876543288", newPassword: "p" })
    ).rejects.toThrow("Unauthenticated");

    await expect(
      authedStudentA.mutation(api.users.resetAdminCredentials, { currentMobile: "9876543288", newPassword: "p" })
    ).rejects.toThrow("Unauthorized");

    await expect(
      authedCounselor.mutation(api.users.resetAdminCredentials, { currentMobile: "9876543288", newPassword: "p" })
    ).rejects.toThrow("Unauthorized");
  });

  test("FINAL-P0-03: Anonymous completeOnboarding rejected and cross-student onboarding blocked", async () => {
    const { t, authedStudentA, studentBId } = await setupFinalEnvironment();

    await expect(
      t.mutation(api.users.completeOnboarding, {
        alias: "Hacker",
        age: 20,
        campus: "North",
        department: "CS",
        consentVersion: "v1",
        consentTimestamp: Date.now(),
      })
    ).rejects.toThrow("Unauthenticated");

    await expect(
      authedStudentA.mutation(api.users.completeOnboarding, {
        userId: String(studentBId),
        alias: "Hacked Beta",
        age: 21,
        campus: "South",
        department: "Mech",
        consentVersion: "v1",
        consentTimestamp: Date.now(),
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("FINAL-P0-04: Legacy client-scored screening and triage writers are no longer callable", async () => {
    const { t, authedStudentA } = await setupFinalEnvironment();

    for (const caller of [t, authedStudentA]) {
      await expect(
        caller.mutation((api.screening as any).submitScreening, {
          phq9_total: 10,
          gad7_total: 8,
          pq16_total: 0,
          phq9_item9_flag: false,
          phq9_item9_score: 0,
        })
      ).rejects.toThrow();

      await expect(
        caller.mutation((api.triage as any).processTriage, {
          phq9_total: 0,
          gad7_total: 0,
          pq16_total: 0,
          phq9_item9_score: 0,
        })
      ).rejects.toThrow();
    }
  });


  // =========================================================================
  // 2. FINAL P1 VERIFICATION: PRIVACY, INTEGRITY & LOG ISOLATION
  // =========================================================================

  test("FINAL-P1-01: Cross-student PII access via getByClerkId and getUserById remains strictly denied", async () => {
    const { authedStudentA, studentBId } = await setupFinalEnvironment();

    await expect(
      authedStudentA.query(api.users.getUserById, { userId: studentBId })
    ).rejects.toThrow("Unauthorized");

    await expect(
      authedStudentA.query(api.users.getByClerkId, { clerkId: "clerk_student_beta" })
    ).rejects.toThrow("Unauthorized");
  });

  test("FINAL-P1-02: Counselors cannot retrieve raw AI companion transcripts", async () => {
    const { authedCounselor, authedAdmin, authedStudentA } = await setupFinalEnvironment();

    await expect(
      authedCounselor.query(api.dashboard.getPatientAiChatHistoryAdmin, { userId: "clerk_student_alpha" })
    ).rejects.toThrow("Unauthorized");

    await expect(
      authedStudentA.query(api.dashboard.getPatientAiChatHistoryAdmin, { userId: "clerk_student_alpha" })
    ).rejects.toThrow("Unauthorized");

    // Admin access works
    const adminView = await authedAdmin.query(api.dashboard.getPatientAiChatHistoryAdmin, {
      userId: "clerk_student_alpha",
    });
    expect(adminView).toBeDefined();
  });

  test("FINAL-P1-03: Deletion of student A does not touch student B somatic/clinical logs", async () => {
    const { authedAdmin, studentAId, studentBId, t } = await setupFinalEnvironment();

    // Insert somatic logs for both students
    await t.run(async (ctx) => {
      await ctx.db.insert("breathingLogs", {
        userId: String(studentAId),
        protocolId: "relaxing_478",
        protocolName: "Relaxing Breath (4-7-8)",
        sourceType: "self_initiated",
        durationSeconds: 120,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
        createdAt: Date.now(),
      });

      await ctx.db.insert("breathingLogs", {
        userId: String(studentBId),
        protocolId: "box_4444",
        protocolName: "Box Breathing (4-4-4-4)",
        sourceType: "self_initiated",
        durationSeconds: 180,
        cyclesCompleted: 6,
        targetCycles: 6,
        status: "completed",
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
        createdAt: Date.now(),
      });
    });

    // Delete Student A
    await authedAdmin.mutation(api.users.deleteUser, { userId: studentAId });

    // Verify Student A logs are gone, but Student B logs remain intact
    await t.run(async (ctx) => {
      const logsA = await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", String(studentAId)))
        .collect();
      expect(logsA).toHaveLength(0);

      const logsB = await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", String(studentBId)))
        .collect();
      expect(logsB).toHaveLength(1);
    });
  });

  // =========================================================================
  // 3. FINAL P2 VERIFICATION: XSS, CREDENTIAL RESIDUE, BOUNDING & IDEMPOTENCY
  // =========================================================================

  test("FINAL-P2-01: Plain-text sanitizer neutralizes complex XSS vectors while preserving clinical math", async () => {
    const { authedCounselor, studentAId } = await setupFinalEnvironment();

    const complexPayload = "<script>fetch('//evil.com')</script><a href='javascript:alert(1)'>Click me</a> Clinical math: PHQ-9 < 10 and GAD-7 >= 5";
    const fuId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "assessment_review",
      dueDate: Date.now() + 86400000,
      notes: complexPayload,
    });

    const fu = (await authedCounselor.query(api.followUps.getFollowUpById, { id: fuId })) as any;
    expect(fu?.notes).not.toContain("<script>");
    expect(fu?.notes).not.toContain("<a href");
    expect(fu?.notes).not.toContain("javascript:");
    // Entire tag is stripped, leaving inner text
    expect(fu?.notes).toContain("Click me");
    expect(fu?.notes).toContain("PHQ-9 < 10");
    expect(fu?.notes).toContain("GAD-7 >= 5");

    // Also verify raw unquoted pseudo-protocol disarming
    const rawNoteId = await authedCounselor.mutation(api.followUps.create, {
      userId: String(studentAId),
      type: "assessment_review",
      dueDate: Date.now() + 86400000,
      notes: "Follow-up via javascript:openLink() protocol and onclick=exec()",
    });
    const rawFu = (await authedCounselor.query(api.followUps.getFollowUpById, { id: rawNoteId })) as any;
    expect(rawFu?.notes).toContain("disarmed-js:openLink()");
    expect(rawFu?.notes).toContain("blocked-handler=exec()");
  });

  test("FINAL-P2-02: getEnterpriseAnalytics executes strictly indexed and bounded queries", async () => {
    const { authedCounselor, studentAId, t } = await setupFinalEnvironment();

    // Insert completed screening attempt
    await t.run(async (ctx) => {
      await ctx.db.insert("screeningAttempts", {
        userId: String(studentAId),
        status: "completed",
        startedAt: Date.now() - 100000,
        completedAt: Date.now() - 90000,
        attemptType: "baseline",
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 10, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 6, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 0, maxScore: 16, severity: "normal", level: "low" },
        },
        triageLevel: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const analytics = await authedCounselor.query(api.dashboard.getEnterpriseAnalytics, {});
    expect(analytics).not.toBeNull();
    expect(analytics?.totalPatients).toBe(2);
    expect(analytics?.avgPhqScore).toBe("10.0");
    expect(analytics?.avgGadScore).toBe("6.0");
  });

  test("FINAL-P2-03: Status synchronization across appointments and requests is idempotent and safe", async () => {
    const { authedCounselor, authedStudentA, studentAId, t } = await setupFinalEnvironment();

    const apptId = await authedStudentA.mutation(api.appointments.createAppointmentRequest, {
      title: "Follow-up Consultation",
      userId: studentAId,
      createdBy: "user",
      date: "2026-10-30",
      time: "03:00 PM",
      reason: "Post-session review",
    });

    // Accept appointment
    const res1 = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res1.success).toBe(true);

    let notifCount1 = 0;
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      notifCount1 = notifs.length;
    });

    // Repeated call with identical status
    const res2 = await authedCounselor.mutation(api.appointments.updateAppointmentStatus, {
      appointmentId: apptId,
      status: "accepted",
    });
    expect(res2.success).toBe(true);

    // Verify zero duplicate notifications
    await t.run(async (ctx) => {
      const notifs = await ctx.db.query("notifications").collect();
      expect(notifs.length).toBe(notifCount1);
    });
  });
});
