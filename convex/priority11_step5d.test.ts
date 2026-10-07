/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 5D: Counselor Roster & History Pagination", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    let studentBId = "";
    let counselorId = "";
    let adminId = "";

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9876543201",
        role: "patient",
        status: "active",
        patientId: "101",
        created_at: 1700000001000,
        updated_at: 1700000001000,
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9876543202",
        role: "patient",
        status: "active",
        patientId: "102",
        created_at: 1700000002000,
        updated_at: 1700000002000,
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Staff Counselor",
        mobile_number: "9876543203",
        role: "counsellor",
        status: "active",
        created_at: 1700000003000,
        updated_at: 1700000003000,
      });

      adminId = await ctx.db.insert("users", {
        full_name: "System Administrator",
        mobile_number: "9876543204",
        role: "admin",
        status: "active",
        created_at: 1700000004000,
        updated_at: 1700000004000,
      });
    });

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
      authedA,
      authedB,
      authedCounselor,
      authedAdmin,
    };
  }

  // ==========================================
  // ROSTER PAGINATION TESTS
  // ==========================================

  test("P11-5D-ROSTER-01: First roster page returns default bounded number (25)", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    // Insert 35 patients
    await t.run(async (ctx) => {
      for (let i = 1; i <= 35; i++) {
        await ctx.db.insert("users", {
          full_name: `Roster Patient ${i}`,
          mobile_number: `91000000${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          patientId: `${200 + i}`,
          created_at: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedAdmin.query(api.users.listPatients, { paginate: true });
    expect(res.patients).toHaveLength(25);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-ROSTER-02: Explicit limit works", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 20; i++) {
        await ctx.db.insert("users", {
          full_name: `Roster Patient ${i}`,
          mobile_number: `91000001${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          created_at: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedAdmin.query(api.users.listPatients, { limit: 10, paginate: true });
    expect(res.patients).toHaveLength(10);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-ROSTER-03: Maximum limit is enforced (capped at 50)", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 65; i++) {
        await ctx.db.insert("users", {
          full_name: `Roster Patient ${i}`,
          mobile_number: `91000002${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          created_at: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedAdmin.query(api.users.listPatients, { limit: 100, paginate: true });
    expect(res.patients).toHaveLength(50);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-ROSTER-04: Second page contains no first-page duplicates", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 30; i++) {
        await ctx.db.insert("users", {
          full_name: `Roster Patient ${i}`,
          mobile_number: `91000003${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          created_at: 1700000000000 + i * 1000,
        });
      }
    });

    const page1 = await authedAdmin.query(api.users.listPatients, { limit: 15, paginate: true });
    expect(page1.patients).toHaveLength(15);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedAdmin.query(api.users.listPatients, {
      cursor: page1.nextCursor!,
      limit: 15,
      paginate: true,
    });

    const page1Ids = new Set(page1.patients.map((p: any) => p._id));
    for (const p of page2.patients) {
      expect(page1Ids.has(p._id)).toBe(false);
    }
  });

  test("P11-5D-ROSTER-05: Same-timestamp students paginate deterministically", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    const exactSameTimestamp = 1715000000000;
    await t.run(async (ctx) => {
      for (let i = 1; i <= 20; i++) {
        await ctx.db.insert("users", {
          full_name: `Same Time Patient ${i}`,
          mobile_number: `91000004${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          created_at: exactSameTimestamp,
        });
      }
    });

    const page1 = await authedAdmin.query(api.users.listPatients, { limit: 10, paginate: true });
    expect(page1.patients).toHaveLength(10);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedAdmin.query(api.users.listPatients, {
      cursor: page1.nextCursor!,
      limit: 10,
      paginate: true,
    });

    const p1Ids = new Set(page1.patients.map((p: any) => p._id));
    for (const p of page2.patients) {
      expect(p1Ids.has(p._id)).toBe(false);
    }
  });

  test("P11-5D-ROSTER-06: Final roster page returns nextCursor === null", async () => {
    const { authedCounselor } = await setupTestEnvironment();

    // In setup, only 2 patients (studentA, studentB) were inserted
    const res = await authedCounselor.query(api.users.listPatients, { limit: 10, paginate: true });
    expect(res.patients).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  test("P11-5D-ROSTER-07: Unauthenticated roster access is rejected", async () => {
    const { t } = await setupTestEnvironment();
    const res = await t.query(api.users.listPatients, { paginate: true });
    expect(res.patients).toHaveLength(0);
    expect(res.nextCursor).toBeNull();
  });

  test("P11-5D-ROSTER-08: Non-staff access is rejected", async () => {
    const { authedA } = await setupTestEnvironment();
    const res = await authedA.query(api.users.listPatients, { paginate: true });
    expect(res.patients).toHaveLength(0);
    expect(res.nextCursor).toBeNull();
  });

  test("P11-5D-ROSTER-09: Patient selector query is bounded and staff-authorized", async () => {
    const { t, authedA, authedCounselor } = await setupTestEnvironment();

    // Insert 60 patients
    await t.run(async (ctx) => {
      for (let i = 1; i <= 60; i++) {
        await ctx.db.insert("users", {
          full_name: `Selector Patient ${i}`,
          mobile_number: `92000000${i.toString().padStart(2, "0")}`,
          role: "patient",
          status: "active",
          created_at: 1700000000000 + i * 1000,
        });
      }
    });

    // Student cannot access selector
    const unauthedRes = await authedA.query(api.users.searchPatientSelector, {});
    expect(unauthedRes).toHaveLength(0);

    // Counselor receives bounded selector results (max 50)
    const staffRes = await authedCounselor.query(api.users.searchPatientSelector, {});
    expect(staffRes.length).toBeLessThanOrEqual(50);
    expect(staffRes.length).toBeGreaterThan(0);

    // Minimal selector fields returned, password/hashes absent
    const first = staffRes[0];
    expect(first).toHaveProperty("_id");
    expect(first).toHaveProperty("full_name");
    expect(first).toHaveProperty("patientId");
    expect(first).toHaveProperty("mobile_number");
    expect((first as any).password_hash).toBeUndefined();
    expect((first as any).temp_password).toBeUndefined();
    expect((first as any).biometricToken).toBeUndefined();
  });

  // ==========================================
  // AUTHORIZATION-AFTER-RETRIEVAL FIX TESTS
  // ==========================================

  test("P11-5D-AUTH-01: Student A cannot retrieve Student B alerts", async () => {
    const { t, studentAId, studentBId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      // Insert alert for Student A
      await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "active",
        createdAt: 1710000001000,
      });

      // Insert alert for Student B
      await ctx.db.insert("alerts", {
        userId: studentBId,
        type: "deterioration",
        status: "active",
        createdAt: 1710000002000,
      });
    });

    const alerts = await authedA.query(api.dashboard.getAlerts, {});
    expect(alerts).toHaveLength(1);
    expect(alerts[0].userId).toBe(studentAId);
    expect(alerts.some((a: any) => a.userId === studentBId)).toBe(false);
  });

  test("P11-5D-AUTH-02: Student A still receives their own alerts when Student B has many newer alerts", async () => {
    const { t, studentAId, studentBId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      // Student A has an older alert
      await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "active",
        createdAt: 1700000000000,
      });

      // Student B has 100 newer alerts
      for (let i = 1; i <= 100; i++) {
        await ctx.db.insert("alerts", {
          userId: studentBId,
          type: "deterioration",
          status: "active",
          createdAt: 1700000000000 + i * 1000,
        });
      }
    });

    // Student A must not be starved out by global alerts
    const alerts = await authedA.query(api.dashboard.getAlerts, {});
    expect(alerts).toHaveLength(1);
    expect(alerts[0].userId).toBe(studentAId);
  });

  test("P11-5D-AUTH-03: Student activity feed cannot be starved by another student's activity", async () => {
    const { t, studentAId, studentBId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      // Student A has 1 emotion log
      await ctx.db.insert("emotionLogs", {
        userId: studentAId,
        emotion: "joy",
        bodyRegions: ["chest"],
        createdAt: 1700000000000,
      });

      // Student B has 50 newer emotion logs
      for (let i = 1; i <= 50; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentBId,
          emotion: "anxiety",
          bodyRegions: ["head"],
          createdAt: 1700000000000 + i * 1000,
        });
      }
    });

    const feed = await authedA.query(api.dashboard.getActivityFeed, {});
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toContain("joy");
  });

  test("P11-5D-AUTH-04: Staff activity/alerts behavior remains institution-wide", async () => {
    const { t, studentAId, studentBId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("alerts", {
        userId: studentAId,
        type: "suicideRisk",
        status: "active",
        createdAt: 1710000001000,
      });
      await ctx.db.insert("alerts", {
        userId: studentBId,
        type: "psychosisRisk",
        status: "active",
        createdAt: 1710000002000,
      });
    });

    const alerts = await authedCounselor.query(api.dashboard.getAlerts, {});
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const alertUsers = new Set(alerts.map((a: any) => a.userId));
    expect(alertUsers.has(studentAId)).toBe(true);
    expect(alertUsers.has(studentBId)).toBe(true);
  });

  // ==========================================
  // CBT SESSIONS HISTORY PAGINATION
  // ==========================================

  test("P11-5D-CBT-01: First page bounded to default 20", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 30; i++) {
        await ctx.db.insert("cbtSessions", {
          userId: studentAId,
          timestamp: 1700000000000 + i * 1000,
          stepIndex: 1,
          sessionStatus: "completed",
          currentStep: "completed",
          conversation: [],
        });
      }
    });

    const res = await authedCounselor.query(api.dashboard.listAllCbtSessions, { paginate: true });
    expect(res.sessions).toHaveLength(20);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-CBT-02: Cursor resumes correctly", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 25; i++) {
        await ctx.db.insert("cbtSessions", {
          userId: studentAId,
          timestamp: 1700000000000 + i * 1000,
          stepIndex: 1,
          sessionStatus: "completed",
          currentStep: "completed",
          conversation: [],
        });
      }
    });

    const page1 = await authedCounselor.query(api.dashboard.listAllCbtSessions, { limit: 15, paginate: true });
    expect(page1.sessions).toHaveLength(15);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedCounselor.query(api.dashboard.listAllCbtSessions, {
      cursor: page1.nextCursor!,
      limit: 15,
      paginate: true,
    });
    expect(page2.sessions).toHaveLength(10);
    expect(page2.nextCursor).toBeNull();
  });

  test("P11-5D-CBT-03: No duplicates across pages", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 30; i++) {
        await ctx.db.insert("cbtSessions", {
          userId: studentAId,
          timestamp: 1700000000000 + i * 1000,
          stepIndex: 1,
          sessionStatus: "completed",
          currentStep: "completed",
          conversation: [],
        });
      }
    });

    const page1 = await authedCounselor.query(api.dashboard.listAllCbtSessions, { limit: 15, paginate: true });
    const page2 = await authedCounselor.query(api.dashboard.listAllCbtSessions, {
      cursor: page1.nextCursor!,
      limit: 15,
      paginate: true,
    });

    const p1Ids = new Set(page1.sessions.map((s: any) => s._id));
    for (const s of page2.sessions) {
      expect(p1Ids.has(s._id)).toBe(false);
    }
  });

  test("P11-5D-CBT-04: Same timestamp ordering is deterministic", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    const sameTime = 1716000000000;
    await t.run(async (ctx) => {
      for (let i = 1; i <= 20; i++) {
        await ctx.db.insert("cbtSessions", {
          userId: studentAId,
          timestamp: sameTime,
          stepIndex: 1,
          sessionStatus: "completed",
          currentStep: "completed",
          conversation: [],
        });
      }
    });

    const page1 = await authedCounselor.query(api.dashboard.listAllCbtSessions, { limit: 10, paginate: true });
    expect(page1.sessions).toHaveLength(10);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedCounselor.query(api.dashboard.listAllCbtSessions, {
      cursor: page1.nextCursor!,
      limit: 10,
      paginate: true,
    });
    expect(page2.sessions).toHaveLength(10);

    const p1Ids = new Set(page1.sessions.map((s: any) => s._id));
    for (const s of page2.sessions) {
      expect(p1Ids.has(s._id)).toBe(false);
    }
  });

  // ==========================================
  // COUNSELOR REQUESTS PAGINATION
  // ==========================================

  test("P11-5D-REQ-01: Pagination works (default bounded 25)", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 35; i++) {
        await ctx.db.insert("counsellorRequests", {
          user_id: studentAId,
          timestamp: 1700000000000 + i * 1000,
          status: "pending",
        });
      }
    });

    const res = await authedCounselor.query(api.dashboard.getCounsellorRequests, { paginate: true });
    expect(res.requests).toHaveLength(25);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-REQ-02: No duplicate/skipped records across pages", async () => {
    const { t, studentAId, authedCounselor } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 25; i++) {
        await ctx.db.insert("counsellorRequests", {
          user_id: studentAId,
          timestamp: 1700000000000 + i * 1000,
          status: "pending",
        });
      }
    });

    const page1 = await authedCounselor.query(api.dashboard.getCounsellorRequests, { limit: 15, paginate: true });
    expect(page1.requests).toHaveLength(15);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedCounselor.query(api.dashboard.getCounsellorRequests, {
      cursor: page1.nextCursor!,
      limit: 15,
      paginate: true,
    });
    expect(page2.requests).toHaveLength(10);

    const p1Ids = new Set(page1.requests.map((r: any) => r._id));
    for (const r of page2.requests) {
      expect(p1Ids.has(r._id)).toBe(false);
    }
  });

  // ==========================================
  // AUDIT LOGS PAGINATION
  // ==========================================

  test("P11-5D-AUDIT-01: Admin-only authorization remains enforced", async () => {
    const { authedCounselor, authedA, authedAdmin } = await setupTestEnvironment();

    // Student access rejected
    const studentRes = await authedA.query(api.dashboard.getAuditLogs, { paginate: true });
    expect(studentRes.logs).toHaveLength(0);

    // Counselor access rejected (Admin only)
    const counselorRes = await authedCounselor.query(api.dashboard.getAuditLogs, { paginate: true });
    expect(counselorRes.logs).toHaveLength(0);

    // Admin access allowed
    const adminRes = await authedAdmin.query(api.dashboard.getAuditLogs, { paginate: true });
    expect(Array.isArray(adminRes.logs)).toBe(true);
  });

  test("P11-5D-AUDIT-02: Pagination works (default bounded 50)", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 60; i++) {
        await ctx.db.insert("auditLogs", {
          action: "password_reset",
          details: `Reset for user ${i}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedAdmin.query(api.dashboard.getAuditLogs, { paginate: true });
    expect(res.logs).toHaveLength(50);
    expect(res.nextCursor).not.toBeNull();
  });

  test("P11-5D-AUDIT-03: No duplicate/skipped records across pages", async () => {
    const { t, authedAdmin } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 1; i <= 30; i++) {
        await ctx.db.insert("auditLogs", {
          action: "security_alert",
          details: `Event ${i}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    const page1 = await authedAdmin.query(api.dashboard.getAuditLogs, { limit: 15, paginate: true });
    expect(page1.logs).toHaveLength(15);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedAdmin.query(api.dashboard.getAuditLogs, {
      cursor: page1.nextCursor!,
      limit: 15,
      paginate: true,
    });
    expect(page2.logs).toHaveLength(15);

    const p1Ids = new Set(page1.logs.map((l: any) => l._id));
    for (const l of page2.logs) {
      expect(p1Ids.has(l._id)).toBe(false);
    }
  });
});
