import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { insertSafetyAlert } from "./alerts";

const modules = import.meta.glob("./**/*.ts");

const ZERO_PQ16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 0]));
const FLAGGED_RESPONSES = {
  phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 1 },
  gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  pq16: ZERO_PQ16,
};
const MILD_RESPONSES = {
  phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0 },
  gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  pq16: ZERO_PQ16,
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: now, ...doc });
    return {
      adminId: await user({ full_name: "Admin Alice", role: "admin" }),
      counsellorAId: await user({ full_name: "Counsellor Asha", role: "counsellor", mobile_number: "9100000001" }),
      counsellorBId: await user({ full_name: "Counsellor Bala", role: "counsellor", mobile_number: "9100000002" }),
      inactiveCounsellorId: await user({ full_name: "Counsellor Inactive", role: "counsellor", status: "inactive", mobile_number: "9100000003" }),
      studentAId: await user({ full_name: "Student Alpha", role: "patient", patientId: "201" }),
      studentBId: await user({ full_name: "Student Beta", role: "patient", patientId: "202" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  return { t, ...ids, as };
}

describe("Phase B3: Emergency counsellor requests and notification correctness", () => {
  test("REQUEST-B3-01: create with returnOutcome: true returns truthful delivery and recipient counts", async () => {
    const { as, studentAId, counsellorAId, counsellorBId, adminId, t } = await setup();

    const res: any = await as(studentAId).mutation(api.counsellorRequests.create, {
      thought_original: "Need help right away",
      sourceType: "emergency_modal",
      returnOutcome: true,
    });

    expect(res).toMatchObject({
      success: true,
      deduplicated: false,
      notifiedStaffCount: 3, // admin + 2 active counsellors (student is unassigned)
      deliveryStatus: "notified",
    });
    expect(typeof res.requestId).toBe("string");

    // Notifications were sent to active counsellors and admin
    await t.run(async (ctx) => {
      const notifsA = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counsellorAId)))
        .collect();
      const notifsB = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counsellorBId)))
        .collect();
      const notifsAdmin = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(adminId)))
        .collect();
      expect(notifsA.length).toBe(1);
      expect(notifsB.length).toBe(1);
      expect(notifsAdmin.length).toBe(1);
    });
  });

  test("REQUEST-B3-02: deduplicated requests return existing request with deduplicated: true", async () => {
    const { as, studentAId } = await setup();

    const first: any = await as(studentAId).mutation(api.counsellorRequests.create, {
      thought_original: "First request",
      returnOutcome: true,
    });
    expect(first.deduplicated).toBe(false);

    const second: any = await as(studentAId).mutation(api.counsellorRequests.create, {
      thought_original: "Accidental second click",
      returnOutcome: true,
    });

    expect(second.deduplicated).toBe(true);
    expect(second.requestId).toBe(first.requestId);
  });

  test("REQUEST-B3-03: legacy callers without returnOutcome receive requestId directly for backwards compatibility", async () => {
    const { as, studentAId } = await setup();

    const reqId = await as(studentAId).mutation(api.counsellorRequests.create, {
      thought_original: "Legacy call",
    });

    expect(typeof reqId).toBe("string");
  });

  test("REQUEST-B3-04: assigned students route notifications to assigned active counsellor plus admins, excluding unassigned counsellors", async () => {
    const { as, t, adminId, counsellorAId, counsellorBId, studentAId } = await setup();

    // Assign studentA to counsellorA
    await as(adminId).mutation(api.counsellorAssignments.assign, {
      studentId: studentAId,
      counsellorId: counsellorAId,
    });

    const res: any = await as(studentAId).mutation(api.counsellorRequests.create, {
      thought_original: "Request for assigned counsellor",
      returnOutcome: true,
    });

    // Should notify admin + counsellorA only (not counsellorB)
    expect(res.notifiedStaffCount).toBe(2);
    expect(res.deliveryStatus).toBe("notified");

    await t.run(async (ctx) => {
      const notifsB = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counsellorBId)))
        .collect();
      // Counsellor B was NOT notified
      expect(notifsB.length).toBe(0);
    });
  });

  test("REQUEST-B3-05: zero active staff scenario truthfully reports no_active_staff without claiming notified", async () => {
    const t = convexTest(schema, modules);
    const studentId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        full_name: "Lonely Student",
        role: "patient",
        status: "active",
        created_at: Date.now(),
      });
    });

    const res: any = await t.withIdentity({ subject: String(studentId) }).mutation(api.counsellorRequests.create, {
      thought_original: "Help when nobody is on shift",
      returnOutcome: true,
    });

    expect(res.deliveryStatus).toBe("no_active_staff");
    expect(res.notifiedStaffCount).toBe(0);
    expect(res.deduplicated).toBe(false);
  });
});

describe("Phase B4: Alert delivery observability", () => {
  test("ALERT-B4-01: zero recipients preserves alert record, sets deliveryStatus to no_active_staff, and logs audit event", async () => {
    const t = convexTest(schema, modules);
    const studentId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        full_name: "Solitary Student",
        role: "patient",
        status: "active",
        created_at: Date.now(),
      });
    });

    // Insert alert when no staff exist in system
    const alertId = await t.run(async (ctx) => {
      return await insertSafetyAlert(ctx, {
        userId: String(studentId),
        type: "suicide",
        source: "screening",
      });
    });

    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId);
      expect(alert).not.toBeNull();
      expect(alert?.deliveryStatus).toBe("no_active_staff");
      expect(alert?.notifiedStaffCount).toBe(0);
      expect(alert?.deliveryFailureCount).toBe(1);

      // Audit event was recorded without leaking student personal details
      const logs = await ctx.db.query("auditLogs").collect();
      const failLog = logs.find((l) => l.action === "alert_delivery_failure");
      expect(failLog).toBeDefined();
      expect(failLog?.details).toContain("zero active staff recipients");
      expect(failLog?.details).not.toMatch(/student name|patientId|notes|thought/i);
    });
  });

  test("ALERT-B4-02: authorized staff can query undelivered alerts via getUndeliveredAlerts", async () => {
    const { t, as, adminId, studentAId } = await setup();

    // Directly insert an unnotified alert
    await t.run(async (ctx) => {
      await ctx.db.insert("alerts", {
        userId: String(studentAId),
        type: "suicide",
        status: "pending",
        createdAt: Date.now(),
        deliveryStatus: "no_active_staff",
        deliveryFailureCount: 1,
        notifiedStaffCount: 0,
      });
    });

    const undelivered = await as(adminId).query(api.alerts.getUndeliveredAlerts, {});
    expect(undelivered.length).toBeGreaterThan(0);
    expect(undelivered[0].deliveryStatus).toBe("no_active_staff");

    // Student cannot query undelivered alerts
    await expect(as(studentAId).query(api.alerts.getUndeliveredAlerts, {})).rejects.toThrow(/Unauthorized/);
  });
});

describe("Phase B5: Crisis gate characterization", () => {
  test("GATE-B5-01: characterization test: crisis gate strictly tracks the latest triage level", async () => {
    const { as, studentAId, t } = await setup();

    // 1. Initial flagged screening raises crisis gate
    await as(studentAId).mutation(api.screening.submitScreeningAttempt, {
      responses: FLAGGED_RESPONSES,
    });

    let status = await as(studentAId).query(api.triage.getMySafetyStatus, {});
    expect(status?.crisis).toBe(true);
    expect(status?.elevatedSupport).toBe(true);

    // Verify open suicide alert exists
    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", String(studentAId)))
        .collect();
      const suicideAlert = alerts.find((a) => a.type === "suicide" && a.status === "pending");
      expect(suicideAlert).toBeDefined();
    });

    // 2. A subsequent mild screening turns off crisis gate even though previous suicide alert is still pending
    await as(studentAId).mutation(api.screening.submitScreeningAttempt, {
      responses: MILD_RESPONSES,
    });

    status = await as(studentAId).query(api.triage.getMySafetyStatus, {});
    // Current behavior: crisis gate drops to false because latest triage is mild
    expect(status?.crisis).toBe(false);

    // Characterization: the suicide alert remains open in alerts table
    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", String(studentAId)))
        .collect();
      const suicideAlert = alerts.find((a) => a.type === "suicide" && a.status === "pending");
      expect(suicideAlert).toBeDefined();
    });
  });
});

describe("Phase B6: Counsellor offboarding and authorization", () => {
  test("OFFBOARD-B6-01: toggleUserStatus and editUser reject unvalidated status strings like 'suspended'", async () => {
    const { as, adminId, counsellorAId } = await setup();

    await expect(
      as(adminId).mutation(api.users.toggleUserStatus, {
        userId: counsellorAId,
        status: "suspended",
      })
    ).rejects.toThrow(/Invalid user status/);

    await expect(
      as(adminId).mutation(api.users.editUser, {
        userId: counsellorAId,
        full_name: "Counsellor Asha",
        mobile_number: "9100000001",
        status: "pending_review",
      })
    ).rejects.toThrow(/Invalid user status/);
  });

  test("OFFBOARD-B6-02: deactivating a counsellor ends their active assignments with counsellor_deactivated and revokes caseload access", async () => {
    const { as, t, adminId, counsellorAId, studentAId } = await setup();

    // 1. Assign studentA to counsellorA
    await as(adminId).mutation(api.counsellorAssignments.assign, {
      studentId: studentAId,
      counsellorId: counsellorAId,
    });

    // Counsellor A can access studentA
    await expect(as(counsellorAId).query(api.screening.getAll, { userId: String(studentAId) })).resolves.toBeDefined();

    // 2. Deactivate counsellor A
    await as(adminId).mutation(api.users.toggleUserStatus, {
      userId: counsellorAId,
      status: "inactive",
    });

    // 3. Admin roster flags student for reassignment and student sees unavailable
    const roster: any = await as(adminId).query(api.counsellorAssignments.listStudentAssignments, {});
    expect(roster.summary.assignedToInactiveCounsellor).toBe(1);

    const myCounsellor = await as(studentAId).query(api.counsellorAssignments.getMyCounsellor, {});
    expect(myCounsellor).toEqual({ status: "unavailable" });

    // 4. Inactive counsellor cannot access student records
    await expect(as(counsellorAId).query(api.screening.getAll, { userId: String(studentAId) })).rejects.toThrow(
      /Unauthenticated|Unauthorized/
    );

    // 5. Inactive counsellor cannot receive new assignments
    await expect(
      as(adminId).mutation(api.counsellorAssignments.assign, {
        studentId: studentAId,
        counsellorId: counsellorAId,
      })
    ).rejects.toThrow(/inactive/i);
  });

  test("OFFBOARD-B6-03: students of deactivated counsellors do not lose safety-alert coverage", async () => {
    const { as, t, adminId, counsellorAId, counsellorBId, studentAId } = await setup();

    // Assign studentA to counsellorA
    await as(adminId).mutation(api.counsellorAssignments.assign, {
      studentId: studentAId,
      counsellorId: counsellorAId,
    });

    // Deactivate counsellor A
    await as(adminId).mutation(api.users.toggleUserStatus, {
      userId: counsellorAId,
      status: "inactive",
    });

    // Now studentA submits a flagged screening
    await as(studentAId).mutation(api.screening.submitScreeningAttempt, {
      responses: FLAGGED_RESPONSES,
    });

    // Active counsellor B and Admin receive the safety alert notification (unassigned fallback)
    await t.run(async (ctx) => {
      const notifsB = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counsellorBId)))
        .collect();
      const notifsAdmin = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(adminId)))
        .collect();
      const notifsA = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counsellorAId)))
        .collect();

      const safetyB = notifsB.filter((n) => n.type === "critical_risk" || n.type === "safety_alert");
      const safetyAdmin = notifsAdmin.filter((n) => n.type === "critical_risk" || n.type === "safety_alert");
      const safetyA = notifsA.filter((n) => n.type === "critical_risk" || n.type === "safety_alert");

      expect(safetyB.length).toBeGreaterThan(0);
      expect(safetyAdmin.length).toBeGreaterThan(0);
      // Inactive counsellor received no safety alert notification
      expect(safetyA.length).toBe(0);
    });
  });
});
