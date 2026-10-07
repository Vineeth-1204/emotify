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

describe("Priority 4 Step 3: Authorization & Access Control Suite (AUTH-01 to AUTH-12)", () => {
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
        patientId: "STU-A",
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
        patientId: "STU-B",
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

    // Student A submits screening
    const authedA = t.withIdentity({ subject: studentAId });
    const attemptA = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    // Student A starts CBT session
    const cbtA = await authedA.mutation(api.cbt.startSession, { forceNew: true });

    // Student A creates counselor request
    const reqA = await authedA.mutation(api.counsellorRequests.create, {
      thought_original: "Feeling stressed about exams",
      situation_text: "Study hall",
      timestamp: Date.now(),
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
      cbtASessionId: cbtA.session!._id,
      reqAId: reqA,
    };
  }

  // AUTH-01: Unauthenticated → screening = DENIED
  test("AUTH-01: Unauthenticated caller accessing screening is DENIED", async () => {
    const { t, attemptAId } = await setupEnvironment();
    await expect(
      t.query(api.screening.getAttemptById, { attemptId: attemptAId })
    ).rejects.toThrow(/Unauthenticated/);
  });

  // AUTH-02: Student A → Student A screening = ALLOWED
  test("AUTH-02: Student A accessing Student A screening is ALLOWED", async () => {
    const { t, studentAId, attemptAId } = await setupEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });
    const res = await authedA.query(api.screening.getAttemptById, { attemptId: attemptAId });
    expect(res).toBeDefined();
    expect(res?.userId).toBe(studentAId);
  });

  // AUTH-03: Student A → Student B screening = DENIED
  test("AUTH-03: Student B attempting to access Student A screening is DENIED", async () => {
    const { t, studentBId, attemptAId } = await setupEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.screening.getAttemptById, { attemptId: attemptAId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // AUTH-04: Student A → Student B CBT = DENIED
  test("AUTH-04: Student B attempting to access Student A CBT session is DENIED", async () => {
    const { t, studentBId, cbtASessionId } = await setupEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.cbt.getSession, { sessionId: cbtASessionId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // AUTH-05: Student A → Student B appointments = DENIED
  test("AUTH-05: Student B attempting to access Student A appointments is DENIED", async () => {
    const { t, studentAId, studentBId } = await setupEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.appointments.getPatientAppointments, { userId: studentAId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // AUTH-06: Student A → Student B triage = DENIED
  test("AUTH-06: Student B attempting to access Student A triage is DENIED", async () => {
    const { t, studentAId, studentBId } = await setupEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.query(api.triage.getLatestByUserId, { userId: studentAId })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // AUTH-07: Student → unblockPatient = DENIED
  test("AUTH-07: Student attempting to unblock patient is DENIED", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });
    await expect(
      authedA.mutation(api.triage.unblockPatient, {
        userId: studentAId,
        action: "switch_moderate",
      })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  // AUTH-08: Student → triggerScreeningTest for another student = DENIED
  test("AUTH-08: Student attempting to triggerScreeningTest for another student is DENIED", async () => {
    const { t, studentAId, studentBId } = await setupEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });
    await expect(
      authedA.mutation(api.triage.triggerScreeningTest, {
        userId: studentBId,
      })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  // AUTH-09: Student → modify another student's counselor request = DENIED
  test("AUTH-09: Student attempting to update status of counselor request is DENIED", async () => {
    const { t, studentBId, reqAId } = await setupEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });
    await expect(
      authedB.mutation(api.counsellorRequests.updateStatus, {
        requestId: reqAId,
        status: "approved",
      })
    ).rejects.toThrow(/Counselor or Admin access required/);
  });

  // AUTH-10: Appropriate staff role → authorized patient data = ALLOWED
  test("AUTH-10: Authorized counselor can access patient clinical screening, triage, and appointments", async () => {
    const { t, counselorId, studentAId, attemptAId, cbtASessionId } = await setupEnvironment();
    const authedCounselor = t.withIdentity({ subject: counselorId });

    // 1. Screening access
    const screening = await authedCounselor.query(api.screening.getAttemptById, {
      attemptId: attemptAId,
    });
    expect(screening?.userId).toBe(studentAId);

    // 2. CBT access
    const cbt = await authedCounselor.query(api.cbt.getSession, {
      sessionId: cbtASessionId,
    });
    expect(cbt?.userId).toBe(studentAId);

    // 3. Triage access
    const triage = await authedCounselor.query(api.triage.getLatestByUserId, {
      userId: studentAId,
    });
    expect(triage?.userId).toBe(studentAId);

    // 4. Clinical unblock action
    const unblockRes = await authedCounselor.mutation(api.triage.unblockPatient, {
      userId: studentAId,
      action: "switch_low",
    });
    expect(unblockRes.success).toBe(true);
  });

  // AUTH-11: Unauthenticated → safety/triage data = DENIED
  test("AUTH-11: Unauthenticated caller accessing safety/triage data is DENIED", async () => {
    const { t, studentAId } = await setupEnvironment();
    await expect(
      t.query(api.triage.getLatestByUserId, { userId: studentAId })
    ).rejects.toThrow(/Unauthenticated/);
  });

  // AUTH-12: Unauthenticated → appointment data = DENIED
  test("AUTH-12: Unauthenticated caller accessing appointments or tempGetAppointments is DENIED", async () => {
    const { t, studentAId } = await setupEnvironment();
    await expect(
      t.query(api.appointments.getPatientAppointments, { userId: studentAId })
    ).rejects.toThrow(/Unauthenticated/);

    await expect(
      t.query(api.appointments.tempGetAppointments, {})
    ).rejects.toThrow(/Unauthorized: Staff access required/);
  });
});
