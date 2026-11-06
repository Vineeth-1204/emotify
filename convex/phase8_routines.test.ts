/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  MORNING_AFFIRMATIONS,
  selectMorningAffirmation,
  classifyGratitudeBranch,
  MORNING_ROUTINE_COPY,
  EVENING_GRATITUDE_COPY,
} from "../common/routinesCatalogue";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 8: Morning, Evening and Daily Routines", () => {
  describe("Catalogue and Domain Rules", () => {
    test("P8-01: Exactly 7 authoritative morning affirmations exist", () => {
      expect(MORNING_AFFIRMATIONS).toHaveLength(7);
      const ids = MORNING_AFFIRMATIONS.map((a) => a.id);
      expect(ids).toEqual([
        "MORN_01",
        "MORN_02",
        "MORN_03",
        "MORN_04",
        "MORN_05",
        "MORN_06",
        "MORN_07",
      ]);
      expect(MORNING_AFFIRMATIONS[0].text).toBe(
        "I can handle today, one step at a time."
      );
      expect(MORNING_AFFIRMATIONS[6].text).toBe(
        "I am doing my best, and that is enough."
      );
    });

    test("P8-02: 3-day cooldown rotates affirmations without immediate repetition", () => {
      const recent = ["MORN_01", "MORN_02", "MORN_03"];
      const nextAffirmation = selectMorningAffirmation(recent, 0);
      expect(recent).not.toContain(nextAffirmation.id);
      expect(nextAffirmation.id).toBe("MORN_04");
    });

    test("P8-03: Cooldown resets if all 7 affirmations have been used", () => {
      const allUsed = MORNING_AFFIRMATIONS.map((a) => a.id);
      const chosen = selectMorningAffirmation(allUsed, 2);
      expect(chosen).toBeDefined();
      expect(chosen.id).toBe("MORN_03");
    });

    test("P8-04: Gratitude branch adapts strictly to clinical severity thresholds", () => {
      // Normal / Mild -> 3 entries
      expect(classifyGratitudeBranch({ triageSeverity: "mild" })).toBe(
        "minimal_mild"
      );
      expect(
        classifyGratitudeBranch({ triageSeverity: "minimal", phq9Score: 4 })
      ).toBe("minimal_mild");
      expect(
        classifyGratitudeBranch({ triageSeverity: "low", phq9Score: 9, gad7Score: 8 })
      ).toBe("minimal_mild");

      // Moderate / Severe -> 1 entry
      expect(classifyGratitudeBranch({ triageSeverity: "moderate" })).toBe(
        "moderate_severe"
      );
      expect(classifyGratitudeBranch({ triageSeverity: "severe" })).toBe(
        "moderate_severe"
      );
      expect(classifyGratitudeBranch({ triageSeverity: "critical" })).toBe(
        "moderate_severe"
      );
      expect(classifyGratitudeBranch({ phq9Score: 10 })).toBe(
        "moderate_severe"
      );
      expect(classifyGratitudeBranch({ gad7Score: 11 })).toBe(
        "moderate_severe"
      );
    });

    test("P8-05: Privacy-preserving routine notification copies", () => {
      expect(MORNING_ROUTINE_COPY.notificationTitle).toBe("Good morning! ☀️");
      expect(MORNING_ROUTINE_COPY.notificationBody).toContain("intention");
      expect(MORNING_ROUTINE_COPY.notificationBody).not.toMatch(
        /depression|anxiety|phq|gad|score|triage/i
      );

      expect(EVENING_GRATITUDE_COPY.notificationTitle).toBe("Good evening 🌙");
      expect(EVENING_GRATITUDE_COPY.notificationBody).toContain("small thing");
      expect(EVENING_GRATITUDE_COPY.notificationBody).not.toMatch(
        /depression|anxiety|phq|gad|score|triage/i
      );
    });
  });

  describe("Backend Routines & Persistence", () => {
    test("P8-06: Morning Affirmation selection and submission with idempotency", async () => {
      const t = convexTest(schema, modules);

      // Create student
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Routine Student 1",
          email: "routine1@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });

      // 1. Initial status query
      const initialStatus = await asStudent.query(
        api.routines.getMorningAffirmationStatus,
        { dateStr: "2026-10-21" }
      );
      expect(initialStatus.completed).toBe(false);
      expect(initialStatus.recommendedAffirmation).toBeDefined();

      // 2. Submit chosen affirmation
      const submitRes = await asStudent.mutation(
        api.routines.submitMorningAffirmation,
        {
          dateStr: "2026-10-21",
          affirmationId: "MORN_01",
          affirmationText: "I can handle today, one step at a time.",
          isCustom: false,
        }
      );
      expect(submitRes.success).toBe(true);
      expect(submitRes.recordId).toBeDefined();

      // 3. Status is now completed
      const afterStatus = await asStudent.query(
        api.routines.getMorningAffirmationStatus,
        { dateStr: "2026-10-21" }
      );
      expect(afterStatus.completed).toBe(true);
      expect(afterStatus.savedRecord?.affirmationText).toBe(
        "I can handle today, one step at a time."
      );

      // 4. Repeated submission returns existing record (idempotency)
      const repeatRes = await asStudent.mutation(
        api.routines.submitMorningAffirmation,
        {
          dateStr: "2026-10-21",
          affirmationId: "MORN_02",
          affirmationText: "I don't have to be perfect — I just have to try.",
          isCustom: false,
        }
      );
      expect(repeatRes.recordId).toBe(submitRes.recordId);

      // Verify no duplicate record created in DB
      const allAffirmations = await t.run(async (ctx) => {
        return await ctx.db
          .query("morningAffirmations")
          .withIndex("by_userId", (q) => q.eq("userId", studentId))
          .collect();
      });
      expect(allAffirmations).toHaveLength(1);
    });

    test("P8-07: Custom intention submission and daily check-in integration", async () => {
      const t = convexTest(schema, modules);

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Routine Student 2",
          email: "routine2@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });

      // Submit custom intention
      const customRes = await asStudent.mutation(
        api.routines.submitMorningAffirmation,
        {
          dateStr: "2026-10-21",
          affirmationText: "I will take three deep breaths before exams.",
          isCustom: true,
        }
      );
      expect(customRes.success).toBe(true);

      // Verify dailyCheckins was initialized automatically
      const checkin = await t.run(async (ctx) => {
        return await ctx.db
          .query("dailyCheckins")
          .withIndex("by_userId_and_dateStr", (q) =>
            q.eq("userId", studentId).eq("dateStr", "2026-10-21")
          )
          .first();
      });
      expect(checkin).not.toBeNull();
      expect(checkin?.mood).toBe("good");
    });

    test("P8-08: Evening gratitude validation for minimal/mild (3 entries required)", async () => {
      const t = convexTest(schema, modules);

      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Routine Student 3",
          email: "routine3@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
      });

      const asStudent = t.withIdentity({ subject: studentId });

      // Branch should be minimal_mild by default
      const eveningStatus = await asStudent.query(
        api.routines.getEveningGratitudeStatus,
        { dateStr: "2026-10-21" }
      );
      expect(eveningStatus.branch).toBe("minimal_mild");
      expect(eveningStatus.requiredEntries).toBe(3);

      // Fails if less than 3 entries provided
      await expect(
        asStudent.mutation(api.routines.submitEveningGratitude, {
          dateStr: "2026-10-21",
          gratitudeEntries: ["Only one entry"],
        })
      ).rejects.toThrow(/requires 3 items/);

      // Succeeds with 3 valid entries
      const validRes = await asStudent.mutation(
        api.routines.submitEveningGratitude,
        {
          dateStr: "2026-10-21",
          gratitudeEntries: [
            "Had coffee with a friend",
            "Finished assignment early",
            "Sunny walk home",
          ],
        }
      );
      expect(validRes.success).toBe(true);

      // Repeated submission is idempotent
      const repeatRes = await asStudent.mutation(
        api.routines.submitEveningGratitude,
        {
          dateStr: "2026-10-21",
          gratitudeEntries: ["Something else"],
        }
      );
      expect(repeatRes.recordId).toBe(validRes.recordId);
    });

    test("P8-09: Evening gratitude validation for moderate/severe (1 entry required)", async () => {
      const t = convexTest(schema, modules);

      // Create student with severe triage record
      const studentId = await t.run(async (ctx) => {
        const uid = await ctx.db.insert("users", {
          full_name: "Severe Student",
          email: "severe@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
        });
        await ctx.db.insert("triages", {
          userId: uid,
          level: "severe",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: Date.now(),
        });
        return uid;
      });

      const asStudent = t.withIdentity({ subject: studentId });

      const eveningStatus = await asStudent.query(
        api.routines.getEveningGratitudeStatus,
        { dateStr: "2026-10-21" }
      );
      expect(eveningStatus.branch).toBe("moderate_severe");
      expect(eveningStatus.requiredEntries).toBe(1);

      // 1 entry is sufficient
      const res = await asStudent.mutation(
        api.routines.submitEveningGratitude,
        {
          dateStr: "2026-10-21",
          gratitudeEntries: ["I drank water."],
        }
      );
      expect(res.success).toBe(true);
    });

    test("P8-10: Scheduled daily routine reminders evaluation and quiet hours", async () => {
      const t = convexTest(schema, modules);

      // Create student with 07:00 morning time and 20:00 evening time in Asia/Kolkata
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          full_name: "Reminder Student",
          email: "reminder@school.edu",
          role: "patient",
          status: "active",
          createdAt: Date.now(),
          notificationPreferences: {
            morningReminderTime: "07:00",
            eveningReminderTime: "20:00",
            morningReminderEnabled: true,
            eveningReminderEnabled: true,
            engagementEnabled: true,
            timezone: "Asia/Kolkata",
          },
        });
      });

      // 2026-10-21 07:15:00 IST = 2026-10-21 01:45:00 UTC
      const morningTimeMs = new Date("2026-10-21T01:45:00Z").getTime();

      // Run evaluator
      const morningRes = await t.mutation(
        internal.routines.evaluateDailyRoutineReminders,
        { nowMs: morningTimeMs }
      );
      expect(morningRes.morningRemindersSent).toBe(1);

      // Duplicate run at 07:20:00 IST does NOT send duplicate
      const duplicateRes = await t.mutation(
        internal.routines.evaluateDailyRoutineReminders,
        { nowMs: morningTimeMs + 5 * 60 * 1000 }
      );
      expect(duplicateRes.morningRemindersSent).toBe(0);

      // Evening time: 2026-10-21 20:15:00 IST = 2026-10-21 14:45:00 UTC
      const eveningTimeMs = new Date("2026-10-21T14:45:00Z").getTime();
      const eveningRes = await t.mutation(
        internal.routines.evaluateDailyRoutineReminders,
        { nowMs: eveningTimeMs }
      );
      expect(eveningRes.eveningRemindersSent).toBe(1);
    });
  });
});
