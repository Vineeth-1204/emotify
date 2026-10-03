/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 5A: Telemetry Query Bounding & Patient ID Counter", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    let studentBId = "";
    let counselorId = "";
    let adminId = "";

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student A",
        mobile_number: "9876543211",
        role: "patient",
        status: "active",
        patientId: "101",
        xp: 100,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student B",
        mobile_number: "9876543212",
        role: "patient",
        status: "active",
        patientId: "102",
        xp: 100,
        level: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor",
        mobile_number: "9876543213",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      adminId = await ctx.db.insert("users", {
        full_name: "Admin User",
        mobile_number: "9876543214",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, studentAId, studentBId, counselorId, adminId };
  }

  // =========================================================================
  // 1. PATIENT ID COUNTER TEST MATRIX (P11-5A-ID-01 through P11-5A-ID-10)
  // =========================================================================
  describe("Patient ID Counter Matrix", () => {
    test("P11-5A-ID-01: Empty/new database initializes counter at base value (101)", async () => {
      const t = convexTest(schema, modules);

      // Verify no counter exists yet
      const initialVal = await t.query(api.users.getPatientCounter, {});
      expect(initialVal).toBeNull();

      // Register a first student in empty DB
      const result = await t.mutation(api.users.registerStudent, {
        full_name: "First Student",
        mobile_number: "9100000001",
        password: "password123",
      });

      expect(result.token).toBeDefined();

      // Counter should now be initialized to 101
      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(101);

      // User should have patientId "101"
      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000001"))
          .first();
        expect(u?.patientId).toBe("101");
      });
    });

    test("P11-5A-ID-02: Existing users with patient IDs initialize counter from current max", async () => {
      const { t } = await setupTestEnvironment();

      // Environment has users with IDs "101" and "102".
      // Counter is not yet in counters table until first allocation.
      const initialCounter = await t.query(api.users.getPatientCounter, {});
      expect(initialCounter).toBeNull();

      // Register new student
      const result = await t.mutation(api.users.registerStudent, {
        full_name: "New Student",
        mobile_number: "9100000003",
        password: "password123",
      });

      expect(result.token).toBeDefined();

      // Counter must initialize from max (102) + 1 = 103
      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(103);
    });

    test("P11-5A-ID-03: Existing maximum patient ID is respected (e.g. high legacy ID 250)", async () => {
      const t = convexTest(schema, modules);

      // Pre-seed an existing user with patientId 250
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          full_name: "Legacy Student",
          mobile_number: "9100000250",
          role: "patient",
          status: "active",
          patientId: "250",
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      });

      // Register next user
      await t.mutation(api.users.registerStudent, {
        full_name: "Post Legacy Student",
        mobile_number: "9100000251",
        password: "password123",
      });

      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(251);

      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000251"))
          .first();
        expect(u?.patientId).toBe("251");
      });
    });

    test("P11-5A-ID-04: New registration receives exactly max + 1", async () => {
      const { t } = await setupTestEnvironment();

      // Max in environment is 102
      await t.mutation(api.users.registerStudent, {
        full_name: "Student 103",
        mobile_number: "9100000103",
        password: "password123",
      });

      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000103"))
          .first();
        expect(u?.patientId).toBe("103");
      });
    });

    test("P11-5A-ID-05: Existing patient IDs remain unchanged after new registration", async () => {
      const { t, studentAId, studentBId } = await setupTestEnvironment();

      await t.mutation(api.users.registerStudent, {
        full_name: "Student 103",
        mobile_number: "9100000103",
        password: "password123",
      });

      await t.run(async (ctx) => {
        const userA: any = await ctx.db.get(studentAId as any);
        const userB: any = await ctx.db.get(studentBId as any);
        expect(userA?.patientId).toBe("101");
        expect(userB?.patientId).toBe("102");
      });
    });

    test("P11-5A-ID-06: Deleted users do not cause ID reuse", async () => {
      const { t } = await setupTestEnvironment();

      // Register student 103
      await t.mutation(api.users.registerStudent, {
        full_name: "Student 103",
        mobile_number: "9100000103",
        password: "password123",
      });

      // Now delete student 103 from users table
      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000103"))
          .first();
        if (u) await ctx.db.delete(u._id);
      });

      // Register another student — must get 104, NOT reuse 103
      await t.mutation(api.users.registerStudent, {
        full_name: "Student 104",
        mobile_number: "9100000104",
        password: "password123",
      });

      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000104"))
          .first();
        expect(u?.patientId).toBe("104");
      });

      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(104);
    });

    test("P11-5A-ID-07: Sequential registrations cannot receive the same ID and maintain monotonic ordering", async () => {
      const { t } = await setupTestEnvironment();

      // Deterministic sequential execution simulating transactional registrations
      const r1 = await t.mutation(api.users.registerStudent, {
        full_name: "Batch Student 1",
        mobile_number: "9100000011",
        password: "password123",
      });
      const r2 = await t.mutation(api.users.registerStudent, {
        full_name: "Batch Student 2",
        mobile_number: "9100000012",
        password: "password123",
      });

      expect(r1.token).toBeDefined();
      expect(r2.token).toBeDefined();

      await t.run(async (ctx) => {
        const u1 = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000011"))
          .first();
        const u2 = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000012"))
          .first();

        expect(u1?.patientId).toBe("103");
        expect(u2?.patientId).toBe("104");
        expect(u1?.patientId).not.toBe(u2?.patientId);
      });
    });

    test("P11-5A-ID-08: Duplicate registration failure does not corrupt or advance the counter", async () => {
      const { t } = await setupTestEnvironment();

      // Attempt to register with mobile number that already exists (Student A: 9876543211)
      const res = await t.mutation(api.users.registerStudent, {
        full_name: "Duplicate Mobile",
        mobile_number: "9876543211",
        password: "password123",
      });

      expect(res.error).toMatch(/already registered/i);

      // Counter should not have been created/advanced
      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBeNull();

      // Subsequent valid registration should get 103
      await t.mutation(api.users.registerStudent, {
        full_name: "Valid Student",
        mobile_number: "9100000999",
        password: "password123",
      });

      const updatedVal = await t.query(api.users.getPatientCounter, {});
      expect(updatedVal).toBe(103);
    });

    test("P11-5A-ID-09: Failed validation does not create a malformed counter state", async () => {
      const { t } = await setupTestEnvironment();

      // Password too short (< 6 chars)
      const res = await t.mutation(api.users.registerStudent, {
        full_name: "Invalid Student",
        mobile_number: "9100000555",
        password: "123",
      });

      expect(res.error).toMatch(/at least 6 characters/i);

      // Counter remains uncorrupted
      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBeNull();
    });

    test("P11-5A-ID-10: Counter remains correct after multiple sequential registrations", async () => {
      const { t } = await setupTestEnvironment();

      for (let i = 1; i <= 5; i++) {
        await t.mutation(api.users.registerStudent, {
          full_name: `Student Series ${i}`,
          mobile_number: `910000070${i}`,
          password: "password123",
        });
      }

      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(107); // 102 + 5 = 107
    });

    test("P11-5A-ID-11: concurrent first initialization cannot allocate duplicate patient IDs", async () => {
      const t = convexTest(schema, modules);

      // Verify no counter exists initially
      const initialVal = await t.query(api.users.getPatientCounter, {});
      expect(initialVal).toBeNull();

      // Launch two registrations concurrently on empty database
      const [r1, r2] = await Promise.all([
        t.mutation(api.users.registerStudent, {
          full_name: "Concurrent First A",
          mobile_number: "9100000081",
          password: "password123",
        }),
        t.mutation(api.users.registerStudent, {
          full_name: "Concurrent First B",
          mobile_number: "9100000082",
          password: "password123",
        }),
      ]);

      expect(r1.token).toBeDefined();
      expect(r2.token).toBeDefined();

      let p1 = "";
      let p2 = "";
      await t.run(async (ctx) => {
        const u1 = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000081"))
          .first();
        const u2 = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000082"))
          .first();
        p1 = u1?.patientId || "";
        p2 = u2?.patientId || "";
      });

      // Both must receive unique, non-overlapping IDs
      expect(p1).toBeTruthy();
      expect(p2).toBeTruthy();
      expect(p1).not.toBe(p2);
      expect(new Set([p1, p2])).toEqual(new Set(["101", "102"]));

      // Counter document must be at 102
      const counterVal = await t.query(api.users.getPatientCounter, {});
      expect(counterVal).toBe(102);
    });

    test("P11-5A-ID-12: recovers defensively from duplicate counter documents by picking highest and cleaning duplicates", async () => {
      const t = convexTest(schema, modules);

      // Insert two competing counter documents (simulating a split-brain mock or abnormal state)
      await t.run(async (ctx) => {
        await ctx.db.insert("counters", {
          name: "patientId",
          value: 150,
        });
        await ctx.db.insert("counters", {
          name: "patientId",
          value: 180,
        });
      });

      // Next registration should pick max (180), advance to 181, and clean up duplicate
      const res = await t.mutation(api.users.registerStudent, {
        full_name: "Recovery Student",
        mobile_number: "9100000181",
        password: "password123",
      });

      expect(res.token).toBeDefined();

      await t.run(async (ctx) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "9100000181"))
          .first();
        expect(u?.patientId).toBe("181");

        // Assert strictly 1 counter document remains
        const counters = await ctx.db
          .query("counters")
          .withIndex("by_name", (q) => q.eq("name", "patientId"))
          .collect();
        expect(counters).toHaveLength(1);
        expect(counters[0].value).toBe(181);
      });
    });
  });


  // =========================================================================
  // 2. BOUNDED STUDENT INSIGHTS 7-DAY MOOD QUERY
  // =========================================================================
  describe("Bounded Student Insights 7-Day Mood Query", () => {
    test("P11-5A-MOOD-01: Normal seven-day window produces exact expected results", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // Insert 7 check-ins for 2026-09-26 through 2026-10-02
        const moods = ["calm", "good", "low", "good", "calm", "heavy", "good"];
        const dates = [
          "2026-09-26",
          "2026-09-27",
          "2026-09-28",
          "2026-09-29",
          "2026-09-30",
          "2026-10-01",
          "2026-10-02",
        ];
        for (let i = 0; i < 7; i++) {
          await ctx.db.insert("dailyCheckins", {
            userId: studentAId,
            dateStr: dates[i],
            mood: moods[i],
            createdAt: 1727300000000 + i * 86400000,
          });
        }
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      expect(stats.recentDailyMood[0].dateStr).toBe("2026-09-26");
      expect(stats.recentDailyMood[0].mood).toBe("calm");
      expect(stats.recentDailyMood[0].hasCheckin).toBe(true);

      expect(stats.recentDailyMood[6].dateStr).toBe("2026-10-02");
      expect(stats.recentDailyMood[6].mood).toBe("good");
      expect(stats.recentDailyMood[6].hasCheckin).toBe(true);
    });

    test("P11-5A-MOOD-02: Month boundary transition works correctly across months", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Reference date: April 2, 2026 (boundary spans March 27 to April 2)
      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-03-27",
          mood: "calm",
          createdAt: 1000,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-04-02",
          mood: "good",
          createdAt: 2000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-04-02",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      expect(stats.recentDailyMood[0].dateStr).toBe("2026-03-27");
      expect(stats.recentDailyMood[0].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[0].mood).toBe("calm");

      expect(stats.recentDailyMood[6].dateStr).toBe("2026-04-02");
      expect(stats.recentDailyMood[6].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[6].mood).toBe("good");

      // Mid-days are missing
      expect(stats.recentDailyMood[1].dateStr).toBe("2026-03-28");
      expect(stats.recentDailyMood[1].hasCheckin).toBe(false);
      expect(stats.recentDailyMood[1].mood).toBeNull();
    });

    test("P11-5A-MOOD-03: Year boundary transition works correctly across December to January", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Reference date: Jan 3, 2026 (spans Dec 28, 2025 to Jan 3, 2026)
      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2025-12-28",
          mood: "low",
          createdAt: 1000,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-01-03",
          mood: "good",
          createdAt: 2000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-01-03",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      expect(stats.recentDailyMood[0].dateStr).toBe("2025-12-28");
      expect(stats.recentDailyMood[0].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[0].mood).toBe("low");

      expect(stats.recentDailyMood[6].dateStr).toBe("2026-01-03");
      expect(stats.recentDailyMood[6].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[6].mood).toBe("good");
    });

    test("P11-5A-MOOD-04: Empty check-ins returns 7 slots with hasCheckin: false", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      for (const entry of stats.recentDailyMood) {
        expect(entry.hasCheckin).toBe(false);
        expect(entry.mood).toBeNull();
      }
    });

    test("P11-5A-MOOD-05: Sparse check-ins correctly places check-ins only on matching dates", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-28",
          mood: "good",
          createdAt: 1000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      const sep28 = stats.recentDailyMood.find((d) => d.dateStr === "2026-09-28");
      expect(sep28?.hasCheckin).toBe(true);
      expect(sep28?.mood).toBe("good");

      const oct02 = stats.recentDailyMood.find((d) => d.dateStr === "2026-10-02");
      expect(oct02?.hasCheckin).toBe(false);
    });

    test("P11-5A-MOOD-06: Check-in exactly at lower boundary (refDate - 6) is included", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Lower boundary for 2026-10-02 is 2026-09-26
      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-26",
          mood: "calm",
          createdAt: 1000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood[0].dateStr).toBe("2026-09-26");
      expect(stats.recentDailyMood[0].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[0].mood).toBe("calm");
    });

    test("P11-5A-MOOD-07: Check-in exactly at upper boundary (refDate) is included", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-10-02",
          mood: "good",
          createdAt: 1000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood[6].dateStr).toBe("2026-10-02");
      expect(stats.recentDailyMood[6].hasCheckin).toBe(true);
      expect(stats.recentDailyMood[6].mood).toBe("good");
    });

    test("P11-5A-MOOD-08: Check-in one day outside window (refDate - 7 and refDate + 1) is excluded from bounded query", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await t.run(async (ctx) => {
        // One day before window
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-25",
          mood: "low",
          createdAt: 1000,
        });
        // In-window
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-09-28",
          mood: "good",
          createdAt: 2000,
        });
        // One day after window
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: "2026-10-03",
          mood: "calm",
          createdAt: 3000,
        });
      });

      const stats = await session.query(api.insights.getDailyStats, {
        userId: studentAId,
        referenceDate: "2026-10-02",
      });

      expect(stats.recentDailyMood).toHaveLength(7);
      const includedDates = stats.recentDailyMood.map((d) => d.dateStr);
      expect(includedDates).not.toContain("2026-09-25");
      expect(includedDates).not.toContain("2026-10-03");
      expect(includedDates).toContain("2026-09-28");
    });
  });

  // =========================================================================
  // 3. BOUNDED SCREENING HISTORY
  // =========================================================================
  describe("Bounded Screening History", () => {
    function makeResponses() {
      const phq9: Record<string, number> = {};
      for (let i = 1; i <= 9; i++) phq9[`phq9_q${i}`] = 1;
      const gad7: Record<string, number> = {};
      for (let i = 1; i <= 7; i++) gad7[`gad7_q${i}`] = 1;
      const pq16: Record<string, number> = {};
      for (let i = 1; i <= 16; i++) pq16[`pq16_q${i}`] = 0;
      return { phq9, gad7, pq16 };
    }

    test("P11-5A-SCR-01: Screening history returns newest attempts first", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      await session.mutation(api.screening.submitScreeningAttempt, {
        userId: studentAId,
        startedAt: 1000,
        responses: makeResponses(),
      });

      await session.mutation(api.screening.submitScreeningAttempt, {
        userId: studentAId,
        startedAt: 2000,
        responses: makeResponses(),
      });

      const history = await session.query(api.screening.getScreeningHistory, {
        userId: studentAId,
      });

      expect(history.length).toBe(2);
      expect(history[0]._creationTime).toBeGreaterThanOrEqual(history[1]._creationTime);
    });

    test("P11-5A-SCR-02: Screening history returns at most 20 records at database level", async () => {
      const { t, studentAId } = await setupTestEnvironment();
      const session = t.withIdentity({ subject: studentAId });

      // Insert 25 attempts directly in db to test bounding
      await t.run(async (ctx) => {
        for (let i = 1; i <= 25; i++) {
          await ctx.db.insert("screeningAttempts", {
            userId: studentAId,
            status: "completed",
            startedAt: 1000000 + i * 1000,
            completedAt: 1000000 + i * 1000 + 500,
            triageLevel: "mild",
            suicideFlag: false,
            psychosisFlag: false,
            instrumentVersions: {
              phq9: "1.0",
              gad7: "1.0",
              pq16: "1.0",
            },
            responses: {
              phq9: {},
              gad7: {},
              pq16: {},
            },
            results: {
              phq9: { administered: true, score: 5, maxScore: 27, severity: "Mild", level: "mild", item9Score: 0, item9Flag: false },
              gad7: { administered: true, score: 4, maxScore: 21, severity: "Minimal", level: "minimal" },
              pq16: { administered: true, score: 0, maxScore: 16, severity: "Low", level: "low" },
            },
          });
        }
      });

      const history = await session.query(api.screening.getScreeningHistory, {
        userId: studentAId,
      });

      expect(history.length).toBe(20);

      const allAttempts = await session.query(api.screening.getAllAttempts, {
        userId: studentAId,
      });
      expect(allAttempts.length).toBe(20);
    });

    test("P11-5A-SCR-03: Authorization check prevents Student A from querying Student B's screening history", async () => {
      const { t, studentAId, studentBId } = await setupTestEnvironment();
      const sessionA = t.withIdentity({ subject: studentAId });

      await expect(
        sessionA.query(api.screening.getScreeningHistory, {
          userId: studentBId,
        })
      ).rejects.toThrow(/Unauthorized/i);
    });

    test("P11-5A-SCR-04: Authorized counselor can view student's screening history", async () => {
      const { t, studentAId, counselorId } = await setupTestEnvironment();
      const sessionCounselor = t.withIdentity({ subject: counselorId });

      await t.run(async (ctx) => {
        await ctx.db.insert("screeningAttempts", {
          userId: studentAId,
          status: "completed",
          startedAt: 5000,
          triageLevel: "minimal",
          suicideFlag: false,
          psychosisFlag: false,
          instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
          responses: { phq9: {}, gad7: {}, pq16: {} },
          results: {
            phq9: { administered: true, score: 3, maxScore: 27, severity: "Minimal", level: "minimal", item9Score: 0, item9Flag: false },
            gad7: { administered: true, score: 2, maxScore: 21, severity: "Minimal", level: "minimal" },
            pq16: { administered: true, score: 0, maxScore: 16, severity: "Low", level: "low" },
          },
        });
      });

      const history = await sessionCounselor.query(api.screening.getScreeningHistory, {
        userId: studentAId,
      });

      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe(studentAId);
    });
  });
});
