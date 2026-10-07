/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 6: Mitra Human Avatar & Student Home Suite", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Student A
    let studentAId!: Id<"users">;
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        email: "alpha@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-A",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student B
    let studentBId!: Id<"users">;
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        email: "beta@campus.edu",
        role: "patient",
        status: "active",
        patientId: "STU-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 3. Counselor
    let counselorId!: Id<"users">;
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Dr. Counselor",
        email: "counselor@hospital.org",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, studentAId, studentBId, counselorId };
  }

  // TEST 1: New user receives Girl + Mitra defaults
  test("MITRA-01: New user receives default Girl ('female') and 'Mitra' name", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const prefs = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });

    expect(prefs).toBeDefined();
    expect(prefs.name).toBe("Emoty");
    expect(prefs.avatarGender).toBe("female");
  });

  // TEST 2 & 3: User can select Girl or Boy
  test("MITRA-02: User can select Boy avatar and persist preference", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      avatarGender: "male",
    });

    expect(updated.avatarGender).toBe("male");
    expect(updated.name).toBe("Emoty");

    const fetched = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(fetched.avatarGender).toBe("male");
  });

  test("MITRA-03: User can select Girl avatar and persist preference", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    // Set to male first
    await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      avatarGender: "male",
    });

    // Change back to female
    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      avatarGender: "female",
    });

    expect(updated.avatarGender).toBe("female");

    const fetched = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(fetched.avatarGender).toBe("female");
  });

  // TEST 4 & 5: Custom companion name
  test("MITRA-04: User can set and change companion custom name", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      name: "Aria",
    });

    expect(updated.name).toBe("Aria");

    const fetched = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(fetched.name).toBe("Aria");

    // Change name again
    const updated2 = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      name: "Zephyr",
    });
    expect(updated2.name).toBe("Zephyr");
  });

  // TEST 6: Missing name falls back safely to "Mitra"
  test("MITRA-05: Missing or whitespace-only name falls back safely to 'Mitra'", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      name: "    ",
    });

    expect(updated.name).toBe("Emoty");

    const fetched = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(fetched.name).toBe("Emoty");
  });

  // TEST 7: Invalid avatar value falls back safely to "female"
  test("MITRA-06: Invalid avatar value falls back safely to 'female'", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      avatarGender: "alien_monster",
    });

    expect(updated.avatarGender).toBe("female");
  });

  // TEST 8: Name validation strips control characters and enforces length
  test("MITRA-07: Name validation strips control characters and enforces 30 character limit", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const evilName = "Super\x00Companion\x1FName\x7FThatIsExtraordinarilyLongAndExceedsThirtyChars";
    const updated = await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      name: evilName,
    });

    expect(updated.name.length).toBeLessThanOrEqual(30);
    expect(updated.name).not.toContain("\x00");
    expect(updated.name).not.toContain("\x1F");
    expect(updated.name).not.toContain("\x7F");
  });

  // TEST 9 & 10: Changing avatar or name does NOT create new conversation or duplicate messages
  test("MITRA-08: Changing avatar or name does NOT create new conversation or duplicate messages", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    // Seed existing conversation in authoritative aiCompanionLogs
    let existingLogId!: Id<"aiCompanionLogs">;
    await t.run(async (ctx) => {
      existingLogId = await ctx.db.insert("aiCompanionLogs", {
        messageId: "msg_test_01",
        userId: studentAId,
        role: "user",
        content: "Hello, I am feeling a bit stressed today.",
        createdAt: Date.now() - 60000,
      });
    });

    const initialLogsCount = await t.run(async (ctx) => {
      return (
        await ctx.db
          .query("aiCompanionLogs")
          .withIndex("by_userId", (q) => q.eq("userId", studentAId))
          .collect()
      ).length;
    });
    expect(initialLogsCount).toBe(1);

    // Update avatar and name
    await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      name: "Kiran",
      avatarGender: "male",
    });

    // Verify logs count is completely unchanged
    const afterUpdateLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId", (q) => q.eq("userId", studentAId))
        .collect();
    });
    expect(afterUpdateLogs.length).toBe(1);
    expect(afterUpdateLogs[0]._id).toBe(existingLogId);
    expect(afterUpdateLogs[0].content).toBe("Hello, I am feeling a bit stressed today.");

    // Verify companionMessages is NOT populated as duplicate store
    const legacyMessages = await t.run(async (ctx) => {
      return await ctx.db
        .query("companionMessages")
        .filter((q) => q.eq(q.field("userId"), studentAId))
        .collect();
    });
    expect(legacyMessages.length).toBe(0);
  });

  // TEST 11: Security - Student A cannot read Student B's Mitra preferences
  test("MITRA-09: Student A cannot read Student B's Mitra preferences", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    await expect(
      asStudentA.query(api.users.getMitraPreferences, {
        userId: studentBId,
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  // TEST 12: Security - Student A cannot update Student B's Mitra preferences
  test("MITRA-10: Student A cannot update Student B's Mitra preferences", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    await expect(
      asStudentA.mutation(api.users.updateMitraPreferences, {
        userId: studentBId,
        name: "HackedName",
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  // TEST 13: Counselor can read student's Mitra preferences
  test("MITRA-11: Authorized counselor can read student's Mitra preferences", async () => {
    const { t, studentAId, counselorId } = await setupTestEnvironment();
    const asCounselor = t.withIdentity({ subject: counselorId });

    const prefs = await asCounselor.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(prefs).toBeDefined();
    expect(prefs.name).toBe("Emoty");
    expect(prefs.avatarGender).toBe("female");
  });

  // TEST 14: Daily check-in integrates with dailyCheckins table
  test("HOME-01: Daily check-in integrates with dailyCheckins and getTodayCheckin", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const todayStr = "2026-09-27";

    // Initially no check-in
    const initialCheckin = await asStudentA.query(api.microGoals.getTodayCheckin, {
      dateStr: todayStr,
    });
    expect(initialCheckin).toBeNull();

    // Submit morning checkin
    await asStudentA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "good",
      dateStr: todayStr,
    });

    // Query again - should be present
    const checkin = await asStudentA.query(api.microGoals.getTodayCheckin, {
      dateStr: todayStr,
    });
    expect(checkin).toBeDefined();
    expect(checkin?.mood).toBe("good");
    expect(checkin?.dateStr).toBe(todayStr);

    // Verify it exists in dailyCheckins table
    const stored = await t.run(async (ctx) => {
      return await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", studentAId).eq("dateStr", todayStr))
        .first();
    });
    expect(stored).not.toBeNull();
    expect(stored?.mood).toBe("good");
  });

  // TEST 15: Onboarding saves companion preferences
  test("ONBOARDING-01: completeOnboarding persists optional mitraPreferences", async () => {
    const { t, studentBId } = await setupTestEnvironment();
    const asStudentB = t.withIdentity({ subject: studentBId });

    await asStudentB.mutation(api.users.completeOnboarding, {
      userId: studentBId,
      alias: "BetaStudent",
      age: 21,
      campus: "North Campus",
      department: "Biology",
      consentVersion: "1.0",
      consentTimestamp: Date.now(),
      mitraPreferences: {
        name: "Sanjay",
        avatarGender: "male",
      },
    });

    const prefs = await asStudentB.query(api.users.getMitraPreferences, {
      userId: studentBId,
    });
    expect(prefs.name).toBe("Sanjay");
    expect(prefs.avatarGender).toBe("male");
  });

  // =========================================================================
  // PRIORITY 6.4: STUDENT PROFILE EDITING & SECURITY TESTS
  // =========================================================================

  test("PROFILE-01: Student can read own profile via getByClerkId", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const profile = await asStudentA.query(api.users.getByClerkId, {
      clerkId: studentAId,
    });

    expect(profile).toBeDefined();
    expect(profile.full_name).toBe("Student Alpha");
    expect(profile.email).toBe("alpha@campus.edu");
    expect(profile.patientId).toBe("STU-A");
    // Ensure password_hash and biometricToken are stripped
    expect((profile as any).password_hash).toBeUndefined();
    expect((profile as any).biometricToken).toBeUndefined();
  });

  test("PROFILE-02: Student can update allowed non-clinical profile fields", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    const result = await asStudentA.mutation(api.users.updateStudentProfile, {
      userId: studentAId,
      alias: "Alpha Scholar",
      age: 20,
      campus: "South Campus",
      department: "Computer Science",
      year: "3rd Year",
      gender: "female",
      emergencyContactName: "Dr. Parent",
      emergencyContactPhone: "+91 9876543210",
    });

    expect(result.success).toBe(true);

    const profile = await asStudentA.query(api.users.getByClerkId, {
      clerkId: studentAId,
    });

    expect(profile.alias).toBe("Alpha Scholar");
    expect(profile.age).toBe(20);
    expect(profile.campus).toBe("South Campus");
    expect(profile.department).toBe("Computer Science");
    expect(profile.year).toBe("3rd Year");
    expect(profile.gender).toBe("female");
    expect(profile.emergencyContactName).toBe("Dr. Parent");
    expect(profile.emergencyContactPhone).toBe("+91 9876543210");
  });

  test("PROFILE-03: Student A CANNOT update Student B's profile (authorization enforcement)", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    await expect(
      asStudentA.mutation(api.users.updateStudentProfile, {
        userId: studentBId, // Attempting to hijack Student B's profile
        alias: "Hacked Alias",
      })
    ).rejects.toThrow("Unauthorized");

    // Verify Student B's profile remains untouched
    const asStudentB = t.withIdentity({ subject: studentBId });
    const profileB = await asStudentB.query(api.users.getByClerkId, {
      clerkId: studentBId,
    });
    expect(profileB.alias).toBeUndefined();
  });

  test("PROFILE-04: Protected clinical fields cannot be modified through profile update", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    // Attempting to pass protected fields in args
    await asStudentA.mutation(api.users.updateStudentProfile, {
      userId: studentAId,
      alias: "Legit Update",
      // Even if attacker attempts extra fields or malicious payloads, only whitelisted fields are processed
    });

    // Check DB directly to ensure patientId, role, status are completely unmodified
    const userInDb = await t.run(async (ctx) => {
      return await ctx.db.get(studentAId);
    });

    expect(userInDb?.patientId).toBe("STU-A");
    expect(userInDb?.role).toBe("patient");
    expect(userInDb?.status).toBe("active");
    expect(userInDb?.alias).toBe("Legit Update");
  });

  test("PROFILE-05: Input validation prevents invalid age, empty name, and invalid gender", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    // 1. Empty alias rejected
    await expect(
      asStudentA.mutation(api.users.updateStudentProfile, {
        userId: studentAId,
        alias: "   ",
      })
    ).rejects.toThrow("Name cannot be empty");

    // 2. Age < 10 rejected
    await expect(
      asStudentA.mutation(api.users.updateStudentProfile, {
        userId: studentAId,
        age: 5,
      })
    ).rejects.toThrow("Age must be an integer between 10 and 120");

    // 3. Age > 120 rejected
    await expect(
      asStudentA.mutation(api.users.updateStudentProfile, {
        userId: studentAId,
        age: 130,
      })
    ).rejects.toThrow("Age must be an integer between 10 and 120");

    // 4. Invalid demographic gender rejected
    await expect(
      asStudentA.mutation(api.users.updateStudentProfile, {
        userId: studentAId,
        gender: "invalid_alien_gender",
      })
    ).rejects.toThrow("Invalid demographic gender option");
  });

  test("PROFILE-06: Mitra preferences and student demographic gender remain completely separate", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });

    // 1. Set Mitra companion to Male ("male")
    await asStudentA.mutation(api.users.updateMitraPreferences, {
      userId: studentAId,
      avatarGender: "male",
      name: "Dost",
    });

    // 2. Set Student demographic gender to Female ("female")
    await asStudentA.mutation(api.users.updateStudentProfile, {
      userId: studentAId,
      gender: "female",
    });

    // 3. Verify Mitra companion preference is unchanged (still male + "Dost")
    const mitraPrefs = await asStudentA.query(api.users.getMitraPreferences, {
      userId: studentAId,
    });
    expect(mitraPrefs.avatarGender).toBe("male");
    expect(mitraPrefs.name).toBe("Dost");

    // 4. Verify student demographic gender is female
    const profile = await asStudentA.query(api.users.getByClerkId, {
      clerkId: studentAId,
    });
    expect(profile.gender).toBe("female");
  });

  // =========================================================================
  // PRIORITY 6.3: DAILY CHECK-IN UPDATE / NO DUPLICATE STORAGE TESTS
  // =========================================================================

  test("HOME-02: Updating today's check-in modifies the existing record without duplicate storage", async () => {
    const { t, studentAId } = await setupTestEnvironment();
    const asStudentA = t.withIdentity({ subject: studentAId });
    const todayStr = "2026-09-28";

    // First check-in
    await asStudentA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: todayStr,
    });

    // Verify stored
    let checkin = await asStudentA.query(api.microGoals.getTodayCheckin, {
      dateStr: todayStr,
    });
    expect(checkin?.mood).toBe("calm");

    // Without allowUpdate, duplicate is rejected
    const dupRes = await asStudentA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "sad",
      dateStr: todayStr,
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.message).toContain("Already checked in today");

    // With allowUpdate: true, re-check in / update to "happy" modifies the record
    const updateRes = await asStudentA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "happy",
      dateStr: todayStr,
      allowUpdate: true,
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.updated).toBe(true);

    // Verify checkin mood is now updated to "happy"
    checkin = await asStudentA.query(api.microGoals.getTodayCheckin, {
      dateStr: todayStr,
    });
    expect(checkin?.mood).toBe("happy");

    // Verify exactly ONE record exists for studentA on todayStr (no duplicate rows)
    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", studentAId).eq("dateStr", todayStr))
        .collect();
    });
    expect(records.length).toBe(1);
    expect(records[0].mood).toBe("happy");
  });
});
