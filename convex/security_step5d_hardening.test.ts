/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("P11 Step 5D: Targeted Security & Scalability Hardening", () => {
  async function setupEnvironment() {
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
        patientId: "P-101",
        created_at: 1700000001000,
        updated_at: 1700000001000,
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9876543202",
        role: "patient",
        status: "active",
        patientId: "P-102",
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

    return { t, studentAId, studentBId, counselorId, adminId, authedA, authedB, authedCounselor, authedAdmin };
  }

  // ==========================================
  // PRIORITY 0: NOTIFICATIONS AUTHORIZATION
  // ==========================================
  describe("Notifications Security & Scoping", () => {
    test("NOTIF-01: Unauthenticated caller receives empty list", async () => {
      const { t } = await setupEnvironment();
      const notifs = await t.query(api.dashboard.getNotifications, {});
      expect(notifs).toEqual([]);
    });

    test("NOTIF-02: Student A sees only Student A notifications, not Student B", async () => {
      const { t, studentAId, studentBId, authedA, authedB } = await setupEnvironment();

      await t.run(async (ctx) => {
        await ctx.db.insert("notifications", {
          recipientId: studentAId,
          type: "reminder",
          title: "Student A Notice 1",
          message: "Alpha reminder",
          priority: "low",
          read: false,
          archived: false,
          createdAt: 1700000010000,
        });

        await ctx.db.insert("notifications", {
          recipientId: studentAId,
          type: "reminder",
          title: "Student A Notice 2",
          message: "Alpha notice 2",
          priority: "medium",
          read: false,
          archived: false,
          createdAt: 1700000020000,
        });

        await ctx.db.insert("notifications", {
          recipientId: studentBId,
          type: "critical_risk",
          title: "Student B Private Notice",
          message: "Beta secret alert",
          priority: "critical",
          read: false,
          archived: false,
          createdAt: 1700000030000,
        });
      });

      const notifsA = await authedA.query(api.dashboard.getNotifications, {});
      expect(notifsA.length).toBe(2);
      expect(notifsA.every((n: any) => n.recipientId === studentAId)).toBe(true);
      expect(notifsA.some((n: any) => n.title.includes("Beta"))).toBe(false);

      // Ordering check: newest first
      expect(notifsA[0].title).toBe("Student A Notice 2");
      expect(notifsA[1].title).toBe("Student A Notice 1");

      const notifsB = await authedB.query(api.dashboard.getNotifications, {});
      expect(notifsB.length).toBe(1);
      expect(notifsB[0].title).toBe("Student B Private Notice");
    });

    test("NOTIF-03: Student A cannot mark Student B notification as read", async () => {
      const { t, studentBId, authedA } = await setupEnvironment();

      let bNotifId: any;
      await t.run(async (ctx) => {
        bNotifId = await ctx.db.insert("notifications", {
          recipientId: studentBId,
          type: "reminder",
          title: "Beta Task",
          message: "Complete activity",
          priority: "low",
          read: false,
          archived: false,
          createdAt: Date.now(),
        });
      });

      await expect(
        authedA.mutation(api.dashboard.markNotificationRead, { notificationId: bNotifId })
      ).rejects.toThrow("Unauthorized");
    });

    test("NOTIF-04: Legitimate owner or admin can mark notification as read", async () => {
      const { t, studentAId, authedA } = await setupEnvironment();

      let aNotifId: any;
      await t.run(async (ctx) => {
        aNotifId = await ctx.db.insert("notifications", {
          recipientId: studentAId,
          type: "reminder",
          title: "Alpha Task",
          message: "Complete check-in",
          priority: "low",
          read: false,
          archived: false,
          createdAt: Date.now(),
        });
      });

      // Mark read as owner
      const res = await authedA.mutation(api.dashboard.markNotificationRead, { notificationId: aNotifId });
      expect(res).toEqual({ success: true });

      await t.run(async (ctx) => {
        const notif: any = await ctx.db.get(aNotifId);
        expect(notif?.read).toBe(true);
      });
    });
  });

  // ==========================================
  // PRIORITY 1: STUDENT SEARCH SCALABILITY
  // ==========================================
  describe("Student Search Scalability (>100 records)", () => {
    test("SEARCH-01: Finds target student located beyond the first 100 records", async () => {
      const { t, authedCounselor } = await setupEnvironment();

      // Seed 130 patients so that older patients are well beyond the top 100
      await t.run(async (ctx) => {
        const baseTime = 1700000000000;
        for (let i = 1; i <= 130; i++) {
          const isTarget = i === 125;
          await ctx.db.insert("users", {
            full_name: isTarget ? "Deep Ocean Student" : `Student Batch ${i}`,
            mobile_number: isTarget ? "9988776655" : `9800000${String(i).padStart(3, "0")}`,
            role: "patient",
            status: "active",
            patientId: isTarget ? "P-DEEP-999" : `P-${1000 + i}`,
            created_at: baseTime - i * 1000, // Older records have lower created_at
            updated_at: baseTime - i * 1000,
          });
        }
      });

      // 1. Search by full name
      const searchByName: any = await authedCounselor.query(api.users.listPatients, {
        search: "Deep Ocean",
        paginate: true,
      });
      expect(searchByName.patients.length).toBe(1);
      expect(searchByName.patients[0].full_name).toBe("Deep Ocean Student");

      // 2. Search by student/patient ID
      const searchById: any = await authedCounselor.query(api.users.listPatients, {
        search: "P-DEEP-999",
        paginate: true,
      });
      expect(searchById.patients.length).toBe(1);
      expect(searchById.patients[0].patientId).toBe("P-DEEP-999");

      // 3. Search by mobile number
      const searchByPhone: any = await authedCounselor.query(api.users.listPatients, {
        search: "9988776655",
        paginate: true,
      });
      expect(searchByPhone.patients.length).toBe(1);
      expect(searchByPhone.patients[0].mobile_number).toBe("9988776655");

      // 4. No-result search
      const noResults: any = await authedCounselor.query(api.users.listPatients, {
        search: "NonexistentStudentXYZ",
        paginate: true,
      });
      expect(noResults.patients.length).toBe(0);

      // 5. Unfiltered normal cursor pagination works cleanly
      const page1: any = await authedCounselor.query(api.users.listPatients, {
        limit: 20,
        paginate: true,
      });
      expect(page1.patients.length).toBe(20);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2
      const page2: any = await authedCounselor.query(api.users.listPatients, {
        cursor: page1.nextCursor,
        limit: 20,
        paginate: true,
      });
      expect(page2.patients.length).toBe(20);
      // Ensure no duplicates between page 1 and page 2
      const page1Ids = new Set(page1.patients.map((p: any) => p._id));
      for (const p of page2.patients) {
        expect(page1Ids.has(p._id)).toBe(false);
      }
    });

    test("SEARCH-02: searchPatientSelector also finds students beyond first 100", async () => {
      const { t, authedCounselor } = await setupEnvironment();

      await t.run(async (ctx) => {
        const baseTime = 1700100000000;
        for (let i = 1; i <= 120; i++) {
          const isTarget = i === 115;
          await ctx.db.insert("users", {
            full_name: isTarget ? "Selector Target" : `Patient ${i}`,
            mobile_number: isTarget ? "9112233445" : `9700000${String(i).padStart(3, "0")}`,
            role: "patient",
            status: "active",
            patientId: isTarget ? "P-SEL-777" : `P-${2000 + i}`,
            created_at: baseTime - i * 1000,
            updated_at: baseTime - i * 1000,
          });
        }
      });

      const results = await authedCounselor.query(api.users.searchPatientSelector, {
        search: "Selector Target",
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].full_name).toBe("Selector Target");
    });
  });

  // ==========================================
  // PRIORITY 1: STAFF ALERTS BOUNDED RETRIEVAL
  // ==========================================
  describe("Staff Alerts Hardening & Bounding", () => {
    test("ALERTS-01: Staff retrieves expected alerts and students see only their own", async () => {
      const { t, studentAId, studentBId, authedA, authedCounselor } = await setupEnvironment();

      await t.run(async (ctx) => {
        await ctx.db.insert("alerts", {
          userId: studentAId,
          type: "deterioration",
          status: "active",
          createdAt: 1700000050000,
        });

        await ctx.db.insert("alerts", {
          userId: studentBId,
          type: "suicideRisk",
          status: "pending",
          createdAt: 1700000060000,
        });
      });

      // Student A sees only their own alert
      const studentAlerts = await authedA.query(api.dashboard.getAlerts, {});
      expect(studentAlerts.length).toBe(1);
      expect(studentAlerts[0].userId).toBe(studentAId);
      expect(studentAlerts[0].patientName).toBe("Student Alpha");

      // Staff counselor sees both alerts
      const staffAlerts = await authedCounselor.query(api.dashboard.getAlerts, {});
      expect(staffAlerts.length).toBe(2);
      // Newest first
      expect(staffAlerts[0].userId).toBe(studentBId);
      expect(staffAlerts[0].patientName).toBe("Student Beta");
      expect(staffAlerts[1].userId).toBe(studentAId);
      expect(staffAlerts[1].patientName).toBe("Student Alpha");
    });

    test("ALERTS-02: Bounded retrieval handles large alert volume without error", async () => {
      const { t, studentAId, authedCounselor } = await setupEnvironment();

      // Insert 180 alerts (greater than the 150 bound)
      await t.run(async (ctx) => {
        for (let i = 1; i <= 180; i++) {
          await ctx.db.insert("alerts", {
            userId: studentAId,
            type: i % 2 === 0 ? "deterioration" : "cbt_crisis",
            status: "active",
            createdAt: 1700000100000 + i * 1000,
          });
        }
      });

      const staffAlerts = await authedCounselor.query(api.dashboard.getAlerts, {});
      // Bounded take(150) prevents unbounded memory runaway
      expect(staffAlerts.length).toBeLessThanOrEqual(150);
      expect(staffAlerts.length).toBeGreaterThan(0);
      // Must be descending by createdAt
      for (let i = 0; i < staffAlerts.length - 1; i++) {
        expect(staffAlerts[i].createdAt).toBeGreaterThanOrEqual(staffAlerts[i + 1].createdAt);
      }
    });
  });

  // ==========================================
  // SECONDARY FIX: APPOINTMENT PAGINATION
  // ==========================================
  describe("Appointment Pagination Normalization", () => {
    test("APPT-01: Legacy appointments without date/time are normalized and not dropped", async () => {
      const { t, studentAId, authedCounselor } = await setupEnvironment();

      await t.run(async (ctx) => {
        // Modern appointment with explicit date and time
        await ctx.db.insert("appointments", {
          userId: studentAId as any,
          status: "scheduled",
          title: "Modern Session",
          date: "2026-10-15",
          time: "10:00 AM",
          createdAt: 1700000200000,
        });

        // Legacy appointment with only startTime
        await ctx.db.insert("appointments", {
          userId: studentAId as any,
          status: "pending",
          title: "Legacy Session",
          startTime: 1700000100000,
          createdAt: 1700000100000,
        });
      });

      const paginated: any = await authedCounselor.query(
        api.appointments.listAllTwoWayAppointmentsPaginated,
        { paginationOpts: { numItems: 10, cursor: null } }
      );

      // Both modern and legacy appointments must be returned (legacy is NOT dropped)
      expect(paginated.page.length).toBe(2);
      const legacyItem = paginated.page.find((a: any) => a.title === "Legacy Session");
      expect(legacyItem).toBeDefined();
      expect(legacyItem.date).not.toBeUndefined();
      expect(legacyItem.time).not.toBeUndefined();
      expect(legacyItem.date).not.toBe("");
    });
  });
});
