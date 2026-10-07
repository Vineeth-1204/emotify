/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("P14 Step 3: P1 Privacy, Authorization & Data Integrity Remediation Suite", () => {
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
        screeningComplete: false,
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
        mobile_number: "9876543203",
        role: "counsellor",
        status: "active",
        clerkId: "clerk_counselor",
        created_at: 1700000003000,
        updated_at: 1700000003000,
      });

      adminId = await ctx.db.insert("users", {
        full_name: "System Administrator",
        email: "admin@campus.edu",
        mobile_number: "9876543204",
        role: "admin",
        status: "active",
        clerkId: "clerk_admin",
        created_at: 1700000004000,
        updated_at: 1700000004000,
      });
    });

    const anon = t;
    const authedA = t.withIdentity({ subject: studentAId });
    const authedB = t.withIdentity({ subject: studentBId });
    const authedCounselor = t.withIdentity({ subject: counselorId });
    const authedAdmin = t.withIdentity({ subject: adminId });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
      anon,
      authedA,
      authedB,
      authedCounselor,
      authedAdmin,
    };
  }

  // =========================================================================
  // EMOT-SEC-06: Student PII Disclosure Tests
  // =========================================================================

  test("SEC-P1-01: Anonymous getByClerkId rejected", async () => {
    const { anon, studentAId } = await setupSecurityEnvironment();

    await expect(
      anon.query(api.users.getByClerkId, { clerkId: studentAId })
    ).rejects.toThrow(/Unauthenticated/i);

    await expect(
      anon.query(api.users.getByClerkId, { clerkId: "clerk_student_alpha" })
    ).rejects.toThrow(/Unauthenticated/i);
  });

  test("SEC-P1-02: Anonymous getUserById rejected", async () => {
    const { anon, studentAId } = await setupSecurityEnvironment();

    await expect(
      anon.query(api.users.getUserById, { userId: studentAId })
    ).rejects.toThrow(/Unauthenticated/i);
  });

  test("SEC-P1-03: Student reads own profile", async () => {
    const { authedA, studentAId } = await setupSecurityEnvironment();

    const byClerk = await authedA.query(api.users.getByClerkId, { clerkId: studentAId });
    expect(byClerk).toBeDefined();
    expect(byClerk?.full_name).toBe("Student Alpha");
    expect(byClerk?.patientId).toBe("P-101");

    const byLegacyClerk = await authedA.query(api.users.getByClerkId, { clerkId: "clerk_student_alpha" });
    expect(byLegacyClerk).toBeDefined();
    expect(byLegacyClerk?.full_name).toBe("Student Alpha");

    const byId = await authedA.query(api.users.getUserById, { userId: studentAId });
    expect(byId).toBeDefined();
    expect(byId?.full_name).toBe("Student Alpha");
  });

  test("SEC-P1-04: Student cannot read another student's profile", async () => {
    const { authedA, studentBId } = await setupSecurityEnvironment();

    await expect(
      authedA.query(api.users.getByClerkId, { clerkId: studentBId })
    ).rejects.toThrow(/Unauthorized/i);

    await expect(
      authedA.query(api.users.getByClerkId, { clerkId: "clerk_student_beta" })
    ).rejects.toThrow(/Unauthorized/i);

    await expect(
      authedA.query(api.users.getUserById, { userId: studentBId })
    ).rejects.toThrow(/Unauthorized/i);
  });

  test("SEC-P1-05: Authorized counselor behavior preserved", async () => {
    const { authedCounselor, studentAId, studentBId } = await setupSecurityEnvironment();

    const patientA = await authedCounselor.query(api.users.getByClerkId, { clerkId: studentAId });
    expect(patientA).toBeDefined();
    expect(patientA?.full_name).toBe("Student Alpha");

    const patientB = await authedCounselor.query(api.users.getUserById, { userId: studentBId });
    expect(patientB).toBeDefined();
    expect(patientB?.full_name).toBe("Student Beta");
  });

  test("SEC-P1-06: Authorized admin behavior preserved", async () => {
    const { authedAdmin, studentAId, studentBId } = await setupSecurityEnvironment();

    const patientA = await authedAdmin.query(api.users.getByClerkId, { clerkId: studentAId });
    expect(patientA).toBeDefined();
    expect(patientA?.full_name).toBe("Student Alpha");

    const patientB = await authedAdmin.query(api.users.getUserById, { userId: studentBId });
    expect(patientB).toBeDefined();
    expect(patientB?.full_name).toBe("Student Beta");
  });

  // =========================================================================
  // EMOT-SEC-09: Biometric & Screening State Mutation
  // =========================================================================

  test("SEC-P1-07: Anonymous toggleBiometric rejected", async () => {
    const { anon, studentAId } = await setupSecurityEnvironment();

    await expect(
      anon.mutation(api.users.toggleBiometric, { clerkId: studentAId, enabled: true })
    ).rejects.toThrow(/Unauthenticated/i);
  });

  test("SEC-P1-08: Student toggles own biometric state", async () => {
    const { authedA, studentAId } = await setupSecurityEnvironment();

    await authedA.mutation(api.users.toggleBiometric, { clerkId: studentAId, enabled: true });
    const profile = await authedA.query(api.users.getUserById, { userId: studentAId });
    expect(profile?.biometricEnabled).toBe(true);

    await authedA.mutation(api.users.toggleBiometric, { clerkId: studentAId, enabled: false });
    const profileAfter = await authedA.query(api.users.getUserById, { userId: studentAId });
    expect(profileAfter?.biometricEnabled).toBe(false);
  });

  test("SEC-P1-09: Student cannot toggle another student's biometric state", async () => {
    const { authedA, studentBId } = await setupSecurityEnvironment();

    await expect(
      authedA.mutation(api.users.toggleBiometric, { clerkId: studentBId, enabled: true })
    ).rejects.toThrow(/Unauthorized/i);
  });

  test("SEC-P1-10: Anonymous markScreeningComplete rejected", async () => {
    const { anon, studentAId } = await setupSecurityEnvironment();

    await expect(
      anon.mutation(api.users.markScreeningComplete, { clerkId: studentAId })
    ).rejects.toThrow(/Unauthenticated/i);
  });

  test("SEC-P1-11: Student cannot mark another student's screening complete", async () => {
    const { authedA, authedB, studentAId, studentBId } = await setupSecurityEnvironment();

    // Student A cannot mark Student B's screening complete
    await expect(
      authedA.mutation(api.users.markScreeningComplete, { clerkId: studentBId })
    ).rejects.toThrow(/Unauthorized/i);

    // Student A can mark own screening complete
    await authedA.mutation(api.users.markScreeningComplete, { clerkId: studentAId });
    const profileA = await authedA.query(api.users.getUserById, { userId: studentAId });
    expect(profileA?.screeningComplete).toBe(true);

    // Student B's screening remains incomplete
    const profileB = await authedB.query(api.users.getUserById, { userId: studentBId });
    expect(profileB?.screeningComplete).toBe(false);
  });

  // =========================================================================
  // EMOT-SEC-02: Public Default Admin Seeding
  // =========================================================================

  test("SEC-P1-12: Anonymous seedAdmin rejected", async () => {
    const { anon } = await setupSecurityEnvironment();

    await expect(
      anon.mutation(api.users.seedAdmin, {})
    ).rejects.toThrow(/(Unauthenticated|Unauthorized)/i);
  });

  test("SEC-P1-13: seedAdmin cannot recreate default admin credentials publicly", async () => {
    const { anon, authedA, authedCounselor, authedAdmin, t } = await setupSecurityEnvironment();

    // Student cannot invoke seedAdmin
    await expect(
      authedA.mutation(api.users.seedAdmin, {})
    ).rejects.toThrow(/Unauthorized/i);

    // Counselor cannot invoke seedAdmin
    await expect(
      authedCounselor.mutation(api.users.seedAdmin, {})
    ).rejects.toThrow(/Unauthorized/i);

    // Only authorized admin can invoke seedAdmin
    const res = await authedAdmin.mutation(api.users.seedAdmin, {});
    expect(res).toBeDefined();

    // Verify anonymous caller still cannot invoke it after seeding
    await expect(
      anon.mutation(api.users.seedAdmin, {})
    ).rejects.toThrow(/(Unauthenticated|Unauthorized)/i);
  });

  // =========================================================================
  // EMOT-SEC-11: Unauthenticated AI Chat-Log Injection
  // =========================================================================

  test("SEC-P1-14: Anonymous companion.logMessage rejected", async () => {
    const { anon, studentAId } = await setupSecurityEnvironment();

    await expect(
      anon.mutation(internal.companion.logMessage, {
        userId: studentAId,
        role: "user",
        content: "Malicious anonymous injection",
      })
    ).rejects.toThrow(/Unauthenticated/i);
  });

  test("SEC-P1-15: Student can log own message", async () => {
    const { authedA, studentAId, t } = await setupSecurityEnvironment();

    const logId = await authedA.mutation(internal.companion.logMessage, {
      userId: studentAId,
      role: "user",
      content: "Hello Mitra, feeling calm today.",
    });

    expect(logId).toBeDefined();

    const history = await authedA.query(api.companion.getConversationHistory, {});
    expect(history.length).toBe(1);
    expect(history[0].content).toBe("Hello Mitra, feeling calm today.");
    expect(history[0].userId).toBe(studentAId);
  });

  test("SEC-P1-16: Student cannot log another student's message", async () => {
    const { authedA, studentBId, t } = await setupSecurityEnvironment();

    await expect(
      authedA.mutation(internal.companion.logMessage, {
        userId: studentBId,
        role: "user",
        content: "Spoofed message injected by Student A",
      })
    ).rejects.toThrow(/Unauthorized/i);

    // Confirm no message was written into Student B's log
    const bLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentBId))
        .collect();
    });
    expect(bLogs.length).toBe(0);
  });

  test("SEC-P1-17: Counselor cannot inject messages into student chat", async () => {
    const { authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    await expect(
      authedCounselor.mutation(internal.companion.logMessage, {
        userId: studentAId,
        role: "user",
        content: "Counselor injecting message into student chat",
      })
    ).rejects.toThrow(/Unauthorized/i);

    const aLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(aLogs.length).toBe(0);
  });

  test("SEC-P1-18: Admin cannot inject messages into student chat", async () => {
    const { authedAdmin, studentAId, t } = await setupSecurityEnvironment();

    await expect(
      authedAdmin.mutation(internal.companion.logMessage, {
        userId: studentAId,
        role: "user",
        content: "Admin injecting message into student chat",
      })
    ).rejects.toThrow(/Unauthorized/i);

    const aLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(aLogs.length).toBe(0);
  });

  // =========================================================================
  // EMOT-SEC-07: Raw AI Chat History Exposure
  // =========================================================================

  test("SEC-P1-19: Counselor cannot retrieve unrestricted raw AI transcript", async () => {
    const { authedCounselor, authedA, studentAId } = await setupSecurityEnvironment();

    // Student A logs a personal conversation
    await authedA.mutation(internal.companion.logMessage, {
      userId: studentAId,
      role: "user",
      content: "Deeply personal journal entry about family distress",
    });

    // Counselor calls getPatientAiChatHistoryAdmin -> REJECTED
    await expect(
      authedCounselor.query(api.dashboard.getPatientAiChatHistoryAdmin, { userId: studentAId })
    ).rejects.toThrow(/Unauthorized/i);

    // Counselor calls aggregate getUsersWithAiChats -> returns empty (no leak)
    const aggregate = await authedCounselor.query(api.dashboard.getUsersWithAiChats, {});
    expect(aggregate.users.length).toBe(0);
    expect(aggregate.stats.totalMessages).toBe(0);
  });

  test("SEC-P1-20: Student cannot retrieve another student's AI transcript", async () => {
    const { authedA, authedB, studentAId } = await setupSecurityEnvironment();

    await authedA.mutation(internal.companion.logMessage, {
      userId: studentAId,
      role: "user",
      content: "Student A private thoughts",
    });

    // Student B attempts to query Student A chat history via getPatientAiChatHistoryAdmin
    await expect(
      authedB.query(api.dashboard.getPatientAiChatHistoryAdmin, { userId: studentAId })
    ).rejects.toThrow(/Unauthorized/i);

    // Student B attempts to inspect aggregate query
    const aggregate = await authedB.query(api.dashboard.getUsersWithAiChats, {});
    expect(aggregate.users.length).toBe(0);
  });

  test("SEC-P1-21: Admin behavior follows the chosen existing access model", async () => {
    const { authedA, authedAdmin, studentAId } = await setupSecurityEnvironment();

    await authedA.mutation(internal.companion.logMessage, {
      userId: studentAId,
      role: "user",
      content: "Student conversation audited under admin oversight",
    });

    // Admin can inspect AI chat history for administrative oversight
    const adminHistory = await authedAdmin.query(api.dashboard.getPatientAiChatHistoryAdmin, {
      userId: studentAId,
    });
    expect(adminHistory.messages.length).toBe(1);
    expect(adminHistory.messages[0].content).toBe("Student conversation audited under admin oversight");

    const aggregate = await authedAdmin.query(api.dashboard.getUsersWithAiChats, {});
    expect(aggregate.users.length).toBe(1);
    expect(aggregate.stats.totalMessages).toBe(1);
  });

  test("SEC-P1-22: Raw AI transcript remains excluded from clinical timeline", async () => {
    const { authedA, authedCounselor, studentAId, t } = await setupSecurityEnvironment();

    // Log an AI companion conversation
    await authedA.mutation(internal.companion.logMessage, {
      userId: studentAId,
      role: "user",
      content: "I am having anxious thoughts about exams.",
    });

    // Fetch clinical timeline for this student
    const timeline = await authedCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    // Assert that NO event in the clinical timeline originates from aiCompanionLogs or companionMessages
    const hasAiMessage = timeline.some(
      (e: any) =>
        e.sourceTable === "aiCompanionLogs" ||
        e.sourceTable === "companionMessages" ||
        e.title?.toLowerCase().includes("ai companion") ||
        e.description?.includes("anxious thoughts about exams")
    );
    expect(hasAiMessage).toBe(false);
  });

  // =========================================================================
  // EMOT-SEC-10: Incomplete User Deletion Cascade
  // =========================================================================

  test("SEC-P1-23: Student deletion removes breathing logs", async () => {
    const { authedA, authedAdmin, studentAId, t } = await setupSecurityEnvironment();

    // Log a breathing session for Student A
    await authedA.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing (4-4-4-4)",
      sourceType: "self_initiated",
      startedAt: Date.now() - 300000,
      completedAt: Date.now(),
      durationSeconds: 300,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    // Verify breathing log exists
    const logsBefore = await t.run(async (ctx) => {
      return await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(logsBefore.length).toBe(1);

    // Delete Student A
    await authedAdmin.mutation(api.users.deleteUser, { userId: studentAId });

    // Verify breathing log was cascaded
    const logsAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(logsAfter.length).toBe(0);
  });

  test("SEC-P1-24: Student deletion removes grounding logs", async () => {
    const { authedA, authedAdmin, studentAId, t } = await setupSecurityEnvironment();

    // Log a grounding session for Student A
    await authedA.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 180000,
      completedAt: Date.now(),
      durationSeconds: 180,
      stepsCompleted: 5,
      totalSteps: 5,
      status: "completed",
    });

    // Verify grounding log exists
    const logsBefore = await t.run(async (ctx) => {
      return await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(logsBefore.length).toBe(1);

    // Delete Student A
    await authedAdmin.mutation(api.users.deleteUser, { userId: studentAId });

    // Verify grounding log was cascaded
    const logsAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(logsAfter.length).toBe(0);
  });

  test("SEC-P1-25: Counselor deletion correctly handles counsellors record", async () => {
    const { authedAdmin, counselorId, t } = await setupSecurityEnvironment();

    // Add a record in counsellors table linked to this counselor
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellors", {
        userId: counselorId,
        name: "Staff Counselor",
        email: "counselor@campus.edu",
        phone: "9876543203",
        role: "counsellor",
        availability: ["Monday", "Wednesday"],
        maxWorkload: 10,
        currentWorkload: 2,
        rating: 5.0,
        status: "active",
        createdAt: Date.now(),
      });
    });

    const docsBefore = await t.run(async (ctx) => {
      return await ctx.db.query("counsellors").collect();
    });
    expect(docsBefore.some((c) => c.userId === counselorId)).toBe(true);

    // Delete Counselor user
    await authedAdmin.mutation(api.users.deleteUser, { userId: counselorId });

    const docsAfter = await t.run(async (ctx) => {
      return await ctx.db.query("counsellors").collect();
    });
    expect(docsAfter.some((c) => c.userId === counselorId)).toBe(false);
  });

  test("SEC-P1-26: Deletion does not remove another student's records", async () => {
    const { authedA, authedB, authedAdmin, studentAId, studentBId, t } = await setupSecurityEnvironment();

    // Student A logs breathing
    await authedA.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing (4-4-4-4)",
      sourceType: "self_initiated",
      startedAt: Date.now() - 300000,
      completedAt: Date.now(),
      durationSeconds: 300,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    // Student B logs breathing and grounding
    await authedB.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing (4-4-4-4)",
      sourceType: "self_initiated",
      startedAt: Date.now() - 300000,
      completedAt: Date.now(),
      durationSeconds: 300,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    await authedB.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 180000,
      completedAt: Date.now(),
      durationSeconds: 180,
      stepsCompleted: 5,
      totalSteps: 5,
      status: "completed",
    });

    // Delete Student A
    await authedAdmin.mutation(api.users.deleteUser, { userId: studentAId });

    // Assert Student B's breathing and grounding logs remain intact!
    const bBreathing = await t.run(async (ctx) => {
      return await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentBId))
        .collect();
    });
    expect(bBreathing.length).toBe(1);

    const bGrounding = await t.run(async (ctx) => {
      return await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentBId))
        .collect();
    });
    expect(bGrounding.length).toBe(1);

    // Verify Student B user still exists and can query their own profile
    const studentBUser = await authedB.query(api.users.getUserById, { userId: studentBId });
    expect(studentBUser).toBeDefined();
    expect(studentBUser?.full_name).toBe("Student Beta");
  });
});
