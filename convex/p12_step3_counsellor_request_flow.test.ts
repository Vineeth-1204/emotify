/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

describe("P12 Step 3: Counselor Request Flow Alignment", () => {
  async function setupEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Student Alpha
    let studentAId!: Id<"users">;
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9811111111",
        role: "patient",
        status: "active",
        patientId: "STU-P12-S3-A",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student Beta
    let studentBId!: Id<"users">;
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9822222222",
        role: "patient",
        status: "active",
        patientId: "STU-P12-S3-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Counselor Clara
    let counselorId!: Id<"users">;
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

    // 4. Admin Arthur
    let adminId!: Id<"users">;
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

  test("REQUEST-FLOW-01: Student can create counselor request", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Need guidance regarding course workload",
      situation_text: "Preparing for midterm exams and feeling overwhelmed",
      sourceType: "self_initiated",
    });

    expect(reqId).toBeDefined();

    await t.run(async (ctx) => {
      const record = await ctx.db.get(reqId);
      expect(record).not.toBeNull();
      expect(record?.user_id).toBe(String(studentAId));
      expect(record?.status).toBe("pending");
      expect(record?.thought_original).toBe("Need guidance regarding course workload");
      expect(record?.sourceType).toBe("self_initiated");
    });
  });

  test("REQUEST-FLOW-02: Unauthenticated user cannot create request", async () => {
    const { t } = await setupEnvironment();

    await expect(
      t.mutation(api.counsellorRequests.create, {
        thought_original: "Unauthenticated request attempt",
      })
    ).rejects.toThrow(/Unauthenticated: Login required/);
  });

  test("REQUEST-FLOW-03: Student cannot create request for another user", async () => {
    const { t, studentAId, studentBId } = await setupEnvironment();
    const authedStudentA = t.withIdentity({ subject: String(studentAId) });

    await expect(
      authedStudentA.mutation(api.counsellorRequests.create, {
        user_id: String(studentBId),
        thought_original: "Trying to forge a request for Student B",
      })
    ).rejects.toThrow(/Unauthorized: Cannot create counselor request for another user/);
  });

  test("REQUEST-FLOW-04: Duplicate active request is prevented", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    // First request
    const firstReqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Initial request",
    });

    // Immediate second request
    const secondReqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Duplicate click attempt",
    });

    // Should return existing active request ID
    expect(secondReqId).toBe(firstReqId);

    // Verify only one record exists in database
    await t.run(async (ctx) => {
      const all = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", String(studentAId)))
        .collect();
      expect(all.length).toBe(1);
      expect(all[0].thought_original).toBe("Initial request");
    });
  });

  test("REQUEST-FLOW-05: Completed/cancelled historical request does not prevent a new request", async () => {
    const { t, studentAId, counselorId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });
    const authedCounselor = t.withIdentity({ subject: String(counselorId) });

    // First request created and completed
    const firstReqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Previous issue from last month",
    });

    await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: firstReqId,
      status: "completed",
      notes: "Followed up and closed",
    });

    // New request after completion
    const secondReqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "New request for a different topic",
    });

    expect(secondReqId).not.toBe(firstReqId);

    await t.run(async (ctx) => {
      const all = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", String(studentAId)))
        .collect();
      expect(all.length).toBe(2);
      const active = all.find((r) => r.status === "pending");
      const completed = all.find((r) => r.status === "completed");
      expect(active).toBeDefined();
      expect(completed).toBeDefined();
    });
  });

  test("REQUEST-FLOW-06: Counselor receives appropriate request notification", async () => {
    const { t, studentAId, counselorId, adminId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Need someone to talk to",
    });

    await t.run(async (ctx) => {
      const counselorNotifs = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(counselorId)))
        .collect();
      expect(counselorNotifs.length).toBeGreaterThan(0);
      expect(counselorNotifs[0].type).toBe("counsellor_request");
      expect(counselorNotifs[0].message).toContain("Student Alpha requested counselor support.");

      const adminNotifs = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(adminId)))
        .collect();
      expect(adminNotifs.length).toBeGreaterThan(0);
    });
  });

  test("REQUEST-FLOW-07: Student receives notification after counselor status update", async () => {
    const { t, studentAId, counselorId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });
    const authedCounselor = t.withIdentity({ subject: String(counselorId) });

    const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Support request",
    });

    // Counselor updates status to scheduled
    await authedCounselor.mutation(api.counsellorRequests.updateStatus, {
      requestId: reqId,
      status: "scheduled",
      notes: "Appointment scheduled for Monday 10 AM",
    });

    await t.run(async (ctx) => {
      const studentNotifs = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", String(studentAId)))
        .collect();

      expect(studentNotifs.length).toBeGreaterThan(0);
      const updateNotif = studentNotifs.find((n) => n.title.includes("Scheduled"));
      expect(updateNotif).toBeDefined();
      expect(updateNotif?.type).toBe("counsellor_request");
    });
  });

  test("REQUEST-FLOW-08: Student can retrieve own request status", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Check my status",
    });

    const myRequests = await authedStudent.query(api.counsellorRequests.getMyRequests, {});
    expect(myRequests.length).toBe(1);
    expect(myRequests[0]._id).toBe(reqId);
    expect(myRequests[0].status).toBe("pending");

    const singleReq = await authedStudent.query(api.counsellorRequests.getRequestById, {
      requestId: reqId,
    });
    expect(singleReq).not.toBeNull();
    expect(singleReq?._id).toBe(reqId);
  });

  test("REQUEST-FLOW-09: Student cannot retrieve another student's request", async () => {
    const { t, studentAId, studentBId } = await setupEnvironment();
    const authedStudentA = t.withIdentity({ subject: String(studentAId) });
    const authedStudentB = t.withIdentity({ subject: String(studentBId) });

    const reqIdA = await authedStudentA.mutation(api.counsellorRequests.create, {
      thought_original: "Private Alpha Request",
    });

    // Student B attempts to query Student A's request directly
    await expect(
      authedStudentB.query(api.counsellorRequests.getRequestById, {
        requestId: reqIdA,
      })
    ).rejects.toThrow(/Unauthorized: Cannot view another student's counselor request/);

    // Student B's list should not include Student A's request
    const bRequests = await authedStudentB.query(api.counsellorRequests.getMyRequests, {});
    expect(bRequests.length).toBe(0);
  });

  test("REQUEST-FLOW-10: Counselor can retrieve intended request queue", async () => {
    const { t, studentAId, counselorId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });
    const authedCounselor = t.withIdentity({ subject: String(counselorId) });

    await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Intake request queue check",
    });

    const queue: any = await authedCounselor.query(api.dashboard.getCounsellorRequests, {
      paginate: true,
    });

    expect(queue).toBeDefined();
    expect(queue.requests.length).toBeGreaterThan(0);
    const found = queue.requests.find((r: any) => r.thought_original === "Intake request queue check");
    expect(found).toBeDefined();
    expect(found.patientName).toBe("Student Alpha");
  });

  test("REQUEST-FLOW-11: Existing safety alert behavior remains intact for the applicable urgent/crisis path", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    // In crisis path: student creates both counselor request and emergency alert
    const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
      sourceType: "emergency_modal",
      situation_text: "Crisis intervention requested",
    });

    const alertId = await authedStudent.mutation(internal.alerts.createAlert, {
      userId: String(studentAId),
      type: "counselor_request",
    });

    expect(reqId).toBeDefined();
    expect(alertId).toBeDefined();

    await t.run(async (ctx) => {
      const alert = await ctx.db.get(alertId);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("counselor_request");
      expect(alert?.status).toBe("pending");

      const req = await ctx.db.get(reqId);
      expect(req).not.toBeNull();
      expect(req?.sourceType).toBe("emergency_modal");
    });
  });

  test("REQUEST-FLOW-12: Ordinary counselor request does not generate an unnecessary crisis alert", async () => {
    const { t, studentAId } = await setupEnvironment();
    const authedStudent = t.withIdentity({ subject: String(studentAId) });

    // Ordinary counselor request
    const reqId = await authedStudent.mutation(api.counsellorRequests.create, {
      thought_original: "Routine academic guidance",
      sourceType: "self_initiated",
    });

    expect(reqId).toBeDefined();

    // Verify NO alerts were inserted
    await t.run(async (ctx) => {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", String(studentAId)))
        .collect();
      expect(alerts.length).toBe(0);
    });
  });
});
