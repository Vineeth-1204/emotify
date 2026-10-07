/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

function makeAnswers(count: number, score: number = 0) {
  const ans: Record<string, number> = {};
  for (let i = 1; i <= count; i++) {
    ans[String(i)] = score;
  }
  return ans;
}

describe("Priority 4: Role-Based Authorization & Access Control Suite", () => {
  // Setup helper
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Create Student A
    let studentAId = "";
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alice",
        mobile_number: "9000000001",
        role: "patient",
        status: "active",
        patientId: "STU-001",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Create Student B
    let studentBId = "";
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Bob",
        mobile_number: "9000000002",
        role: "patient",
        status: "active",
        patientId: "STU-002",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Create Counselor
    let counselorId = "";
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Carol",
        mobile_number: "9000000003",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 4. Create Admin
    let adminId = "";
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Admin Dave",
        mobile_number: "9000000004",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 5. Submit screening for Student A
    const authedA = t.withIdentity({ subject: studentAId });
    const attemptA = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
      attemptAId: attemptA.attemptId,
    };
  }

  test("1. Student CAN access ONLY their own clinical data", async () => {
    const { t, studentAId, attemptAId } = await setupTestEnvironment();

    const authedA = t.withIdentity({ subject: studentAId });
    const savedAttempt = await authedA.query(api.screening.getAttemptById, {
      attemptId: attemptAId,
    });

    expect(savedAttempt).toBeDefined();
    expect(savedAttempt?.userId).toBe(studentAId);
  });

  test("2. Student CANNOT access another student's clinical screening data (DENIED)", async () => {
    const { t, studentBId, attemptAId } = await setupTestEnvironment();

    // Student B attempts to query Student A's screening attempt
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.screening.getAttemptById, {
        attemptId: attemptAId,
      })
    ).rejects.toThrow("Unauthorized: Students can access ONLY their own clinical data.");
  });

  test("3. Student CANNOT access another student's appointments (DENIED)", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();

    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.appointments.getPatientAppointments, {
        userId: studentAId,
      })
    ).rejects.toThrow("Unauthorized: Students can access ONLY their own clinical data.");
  });

  test("4. Counselor CAN access assigned/authorized student clinical data", async () => {
    const { t, counselorId, studentAId, attemptAId } = await setupTestEnvironment();

    const authedCounselor = t.withIdentity({ subject: counselorId });

    // Counselor accesses Student A's screening attempt
    const savedAttempt = await authedCounselor.query(api.screening.getAttemptById, {
      attemptId: attemptAId,
    });
    expect(savedAttempt).toBeDefined();
    expect(savedAttempt?.userId).toBe(studentAId);

    // Counselor accesses Student A's appointments
    const appointments = await authedCounselor.query(api.appointments.getPatientAppointments, {
      userId: studentAId,
    });
    expect(Array.isArray(appointments)).toBe(true);
  });

  test("5. Counselor CAN perform clinical triage operations (unblockPatient)", async () => {
    const { t, counselorId, studentAId } = await setupTestEnvironment();

    const authedCounselor = t.withIdentity({ subject: counselorId });
    const result = await authedCounselor.mutation(api.triage.unblockPatient, {
      userId: studentAId,
      action: "switch_moderate",
    });

    expect(result.success).toBe(true);
    expect(result.newLevel).toBe("moderate");
  });

  test("6. Student CANNOT perform clinical triage operations (DENIED)", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const authedStudent = t.withIdentity({ subject: studentAId });
    await expect(
      authedStudent.mutation(api.triage.unblockPatient, {
        userId: studentAId,
        action: "switch_moderate",
      })
    ).rejects.toThrow("Unauthorized: Counselor or Admin access required.");
  });

  test("7. Counselor CANNOT perform administrative staff-management operations (DENIED)", async () => {
    const { t, counselorId } = await setupTestEnvironment();

    const authedCounselor = t.withIdentity({ subject: counselorId });
    await expect(
      authedCounselor.mutation(api.dashboard.addCounsellor, {
        name: "New Counselor",
        email: "counselor2@emotify.com",
        phone: "9999999999",
        role: "counsellor",
        availability: ["Monday"],
        maxWorkload: 10,
      })
    ).rejects.toThrow("Unauthorized: Administrative access required.");
  });

  test("8. Admin CAN perform administrative clinical and staff operations", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    const authedAdmin = t.withIdentity({ subject: adminId });

    // Admin can unblock patient
    const triageResult = await authedAdmin.mutation(api.triage.unblockPatient, {
      userId: studentAId,
      action: "switch_low",
    });
    expect(triageResult.success).toBe(true);
    expect(triageResult.newLevel).toBe("mild");

    // Admin can add a counsellor
    const counsellorId = await authedAdmin.mutation(api.dashboard.addCounsellor, {
      name: "Dr. Smith",
      email: "smith@emotify.com",
      phone: "9876543210",
      role: "Lead Counsellor",
      availability: ["Monday", "Wednesday"],
      maxWorkload: 15,
    });
    expect(counsellorId).toBeDefined();
  });

  test("9. Unauthorized unauthenticated user is strictly DENIED", async () => {
    const { t, attemptAId } = await setupTestEnvironment();

    // Call without authentication
    await expect(
      t.query(api.screening.getAttemptById, {
        attemptId: attemptAId,
      })
    ).rejects.toThrow("Unauthenticated: Login required to access clinical data.");
  });
});
