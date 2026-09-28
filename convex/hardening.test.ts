/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 5 Step 2: Clinical Architecture Hardening Suite", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Admin
    let adminId: Id<"users">;
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Admin User",
        email: "admin@hospital.org",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // 2. Student Alpha
    let studentAId: Id<"users">;
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

    // 3. Student Beta
    let studentBId: Id<"users">;
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

    // 4. Counselor Clara
    let counselorId: Id<"users">;
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Clara",
        email: "clara@hospital.org",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, adminId: adminId!, studentAId: studentAId!, studentBId: studentBId!, counselorId: counselorId! };
  }

  // =========================================================================
  // CATEGORY 1: DELETION CASCADE TESTS (DELETE-01 to DELETE-06)
  // =========================================================================

  test("DELETE-01: Deleting a student removes all required user-owned clinical/wellness records", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    // Populate student A clinical records
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", { userId: studentAId, token: "token-a", createdAt: Date.now(), expiresAt: Date.now() + 10000 });
      await ctx.db.insert("screenings", { userId: studentAId, phq9_total: 10, gad7_total: 8, pq16_total: 2, phq9_item9_flag: false, phq9_item9_score: 0, createdAt: Date.now() });
      await ctx.db.insert("triages", { userId: studentAId, level: "green", suicideFlag: false, psychosisFlag: false, createdAt: Date.now() });
      await ctx.db.insert("alerts", { userId: studentAId, type: "checkin", status: "pending", createdAt: Date.now() });
      await ctx.db.insert("cbtSessions", { userId: studentAId, stepIndex: 0, timestamp: Date.now(), sessionStatus: "active", currentStep: "understanding", conversation: [] });
      await ctx.db.insert("jpmrLogs", { userId: studentAId, completed: true, durationSeconds: 600, preIntensity: 7, postIntensity: 3, createdAt: Date.now() });
      await ctx.db.insert("microGoals", { userId: studentAId, goalId: "g1", goalTitle: "Walk", goalDescription: "Walk", category: "Exercise", difficulty: "easy", points: 10, completed: false, skipped: false, createdAt: Date.now() });
      await ctx.db.insert("reframes", { userId: studentAId, situation: "exam", originalThought: "fail", thinkingTrap: "fortune", guidedAnswers: [], newThought: "prepared", preIntensity: 8, postIntensity: 3, createdAt: Date.now() });
      await ctx.db.insert("reframeLogs", { userId: studentAId, situation_text: "exam", thought_original: "fail", thinking_trap_choice: "fortune", guided_answers: [], reframe_text: "prepared", pre_reframe_intensity: 8, post_reframe_intensity: 3, improvement_percentage: 63, saved_reframe_flag: true, createdAt: Date.now() });
      await ctx.db.insert("followUps", { userId: studentAId, type: "checkin", dueDate: Date.now() + 86400000, completed: false, createdAt: Date.now() });
      await ctx.db.insert("appointments", { userId: studentAId, status: "scheduled", createdAt: Date.now() });
      await ctx.db.insert("counsellorRequests", { user_id: studentAId, timestamp: Date.now(), status: "pending" });
      await ctx.db.insert("wellnessProfiles", { userId: studentAId, personality_traits: [], mood_pattern: "stable", wellness_goals: [], energy_pattern: "high", last_updated: Date.now() });
    });

    // Delete student A as admin
    const adminSession = t.withIdentity({ subject: adminId });
    const result = await adminSession.mutation(api.users.deleteUser, { userId: studentAId });
    expect(result.success).toBe(true);

    // Verify all records deleted
    await t.run(async (ctx) => {
      expect(await ctx.db.get(studentAId)).toBeNull();
      expect((await ctx.db.query("sessions").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("screenings").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("triages").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("alerts").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("cbtSessions").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("jpmrLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("microGoals").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("reframes").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("reframeLogs").withIndex("by_user", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("followUps").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("appointments").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("counsellorRequests").withIndex("by_user_id", (q) => q.eq("user_id", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("wellnessProfiles").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
    });
  });

  test("DELETE-02: Deleting a student removes sensitive mood/body-map/case-note records", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("emotionLogs", { userId: studentAId, emotion: "anxious", bodyRegions: ["chest"], createdAt: Date.now() });
      await ctx.db.insert("emotionMaps", { userId: studentAId, emotionLabel: "tense", selectedRegions: ["shoulders"], bodyRatings: [{ region: "shoulders", intensity: 7 }], averageIntensity: 7, suggestedAction: "jpmr", createdAt: Date.now() });
      await ctx.db.insert("dailyCheckins", { userId: studentAId, dateStr: "2026-09-27", mood: "good", createdAt: Date.now() });
      await ctx.db.insert("clinicalTimelines", { userId: studentAId, eventType: "case_note", title: "Note", description: "Sensitive clinical note", timestamp: Date.now() });
      await ctx.db.insert("aiMonitoringLogs", { userId: studentAId, prompt: "help", aiResponse: "I am here", riskScore: 0.1, riskCategory: "low", flaggedKeywords: [], aiConfidence: 0.9, escalated: false, reviewed: false, timestamp: Date.now() });
    });

    const adminSession = t.withIdentity({ subject: adminId });
    await adminSession.mutation(api.users.deleteUser, { userId: studentAId });

    await t.run(async (ctx) => {
      expect((await ctx.db.query("emotionLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("emotionMaps").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("dailyCheckins").withIndex("by_userId_and_dateStr", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("clinicalTimelines").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("aiMonitoringLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
    });
  });

  test("DELETE-03: Deleting a student removes user-owned gamification/notification/login-history records", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("points", { userId: studentAId, totalPoints: 120, updatedAt: Date.now() });
      await ctx.db.insert("badges", { userId: studentAId, badgeId: "first_checkin", badgeName: "First Checkin", earnedAt: Date.now() });
      await ctx.db.insert("streaks", { userId: studentAId, currentStreak: 5, longestStreak: 10, lastCompletionDate: "2026-09-27" });
      await ctx.db.insert("weeklyMissions", { userId: studentAId, weekStart: "2026-09-21", goalCountTarget: 5, goalCountCurrent: 3, jpmrTarget: 3, jpmrCurrent: 1, journalTarget: 2, journalCurrent: 2, completed: false, xpReward: 50, coinsReward: 20 });
      await ctx.db.insert("monthlyChallenges", { userId: studentAId, monthStr: "2026-09", goalCountTarget: 20, goalCountCurrent: 15, streakTarget: 7, streakCurrent: 5, journalTarget: 10, journalCurrent: 8, completed: false, badgeRewardId: "b_month", badgeRewardName: "September" });
      await ctx.db.insert("notifications", { recipientId: studentAId, type: "reminder", title: "Goal reminder", message: "Time for walk", priority: "low", read: false, archived: false, createdAt: Date.now() });
      await ctx.db.insert("loginHistory", { userId: studentAId, status: "success", timestamp: Date.now() });
    });

    const adminSession = t.withIdentity({ subject: adminId });
    await adminSession.mutation(api.users.deleteUser, { userId: studentAId });

    await t.run(async (ctx) => {
      expect((await ctx.db.query("points").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("badges").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("streaks").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("weeklyMissions").withIndex("by_userId_and_weekStart", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("monthlyChallenges").withIndex("by_userId_and_monthStr", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("notifications").withIndex("by_recipientId", (q) => q.eq("recipientId", studentAId)).collect()).length).toBe(0);
      expect((await ctx.db.query("loginHistory").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
    });
  });

  test("DELETE-04: Deleting Student A does not affect Student B", async () => {
    const { t, adminId, studentAId, studentBId } = await setupTestEnvironment();

    // Populate data for both Student A and Student B
    await t.run(async (ctx) => {
      await ctx.db.insert("points", { userId: studentAId, totalPoints: 100, updatedAt: Date.now() });
      await ctx.db.insert("points", { userId: studentBId, totalPoints: 200, updatedAt: Date.now() });
      await ctx.db.insert("jpmrLogs", { userId: studentAId, completed: true, durationSeconds: 300, preIntensity: 6, postIntensity: 2, createdAt: Date.now() });
      await ctx.db.insert("jpmrLogs", { userId: studentBId, completed: true, durationSeconds: 400, preIntensity: 8, postIntensity: 4, createdAt: Date.now() });
      await ctx.db.insert("notifications", { recipientId: studentAId, type: "reminder", title: "A", message: "A", priority: "low", read: false, archived: false, createdAt: Date.now() });
      await ctx.db.insert("notifications", { recipientId: studentBId, type: "reminder", title: "B", message: "B", priority: "low", read: false, archived: false, createdAt: Date.now() });
    });

    const adminSession = t.withIdentity({ subject: adminId });
    await adminSession.mutation(api.users.deleteUser, { userId: studentAId });

    // Verify Student A data gone, Student B data untouched
    await t.run(async (ctx) => {
      expect(await ctx.db.get(studentAId)).toBeNull();
      expect(await ctx.db.get(studentBId)).not.toBeNull();

      expect((await ctx.db.query("points").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      const bPoints = await ctx.db.query("points").withIndex("by_userId", (q) => q.eq("userId", studentBId)).collect();
      expect(bPoints.length).toBe(1);
      expect(bPoints[0].totalPoints).toBe(200);

      expect((await ctx.db.query("jpmrLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect()).length).toBe(0);
      const bJpmr = await ctx.db.query("jpmrLogs").withIndex("by_userId", (q) => q.eq("userId", studentBId)).collect();
      expect(bJpmr.length).toBe(1);
      expect(bJpmr[0].durationSeconds).toBe(400);

      expect((await ctx.db.query("notifications").withIndex("by_recipientId", (q) => q.eq("recipientId", studentAId)).collect()).length).toBe(0);
      const bNotif = await ctx.db.query("notifications").withIndex("by_recipientId", (q) => q.eq("recipientId", studentBId)).collect();
      expect(bNotif.length).toBe(1);
      expect(bNotif[0].title).toBe("B");
    });
  });

  test("DELETE-05: Global and system records are preserved during deletion", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    let auditId: Id<"auditLogs">;
    let settingId: Id<"systemSettings">;
    await t.run(async (ctx) => {
      auditId = await ctx.db.insert("auditLogs", { action: "user_registered", userId: studentAId, timestamp: Date.now() });
      settingId = await ctx.db.insert("systemSettings", { key: "site_name", value: "Emotify", category: "branding", updatedAt: Date.now() });
    });

    const adminSession = t.withIdentity({ subject: adminId });
    await adminSession.mutation(api.users.deleteUser, { userId: studentAId });

    // Global audit trail and settings must NOT be deleted
    await t.run(async (ctx) => {
      expect(await ctx.db.get(auditId!)).not.toBeNull();
      expect(await ctx.db.get(settingId!)).not.toBeNull();
      // Soft-delete trash archive should exist
      const trash = await ctx.db.query("trash").withIndex("by_itemType", (q) => q.eq("itemType", "patient")).collect();
      expect(trash.length).toBeGreaterThan(0);
    });
  });

  test("DELETE-06: Repeated deletion does not produce inconsistent state", async () => {
    const { t, adminId, studentAId } = await setupTestEnvironment();

    const adminSession = t.withIdentity({ subject: adminId });
    await adminSession.mutation(api.users.deleteUser, { userId: studentAId });

    // Calling deleteUser again on already deleted user should throw "User not found"
    await expect(adminSession.mutation(api.users.deleteUser, { userId: studentAId })).rejects.toThrow("User not found");
  });

  // =========================================================================
  // CATEGORY 2: MITRA DEDUPLICATION TESTS (MITRA-01 to MITRA-05)
  // =========================================================================

  test("MITRA-01 & MITRA-03: New user message creates exactly one authoritative AI companion log and NO duplicate companionMessages record", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const studentSession = t.withIdentity({ subject: studentAId });
    const msgId = "user-msg-001";
    await studentSession.mutation(api.companion.createMessage, {
      messageId: msgId,
      role: "user",
      content: "Feeling stressed about upcoming finals.",
    });

    await t.run(async (ctx) => {
      // Authoritative aiCompanionLogs must contain exactly 1 record
      const logs = await ctx.db.query("aiCompanionLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect();
      expect(logs.length).toBe(1);
      expect(logs[0].messageId).toBe(msgId);
      expect(logs[0].content).toBe("Feeling stressed about upcoming finals.");

      // Redundant companionMessages mirror must NOT receive new writes
      const legacy = await ctx.db.query("companionMessages").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect();
      expect(legacy.length).toBe(0);
    });
  });

  test("MITRA-02: New assistant response creates exactly one authoritative AI companion log", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const studentSession = t.withIdentity({ subject: studentAId });
    const replyId = "asst-reply-001";
    await studentSession.mutation(api.companion.createMessage, {
      messageId: replyId,
      role: "assistant",
      content: "I hear you. Let's take a deep breath together.",
    });

    await t.run(async (ctx) => {
      const logs = await ctx.db.query("aiCompanionLogs").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect();
      expect(logs.length).toBe(1);
      expect(logs[0].role).toBe("assistant");
      expect(logs[0].content).toBe("I hear you. Let's take a deep breath together.");

      const legacy = await ctx.db.query("companionMessages").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect();
      expect(legacy.length).toBe(0);
    });
  });

  test("MITRA-04: Existing historical companionMessages remain untouched and queryable via fallback", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    // Insert historical legacy messages directly
    await t.run(async (ctx) => {
      await ctx.db.insert("companionMessages", {
        messageId: "hist-001",
        userId: studentAId,
        role: "user",
        content: "Historical user message from previous version",
        createdAt: 1000,
      });
    });

    const studentSession = t.withIdentity({ subject: studentAId });
    // getConversationHistory falls back to companionMessages when aiCompanionLogs is empty
    const history = await studentSession.query(api.companion.getConversationHistory, {});
    expect(history.length).toBe(1);
    expect(history[0].content).toBe("Historical user message from previous version");
  });

  test("MITRA-05: Student companion isolation remains intact", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();

    const sessionA = t.withIdentity({ subject: studentAId });
    await sessionA.mutation(api.companion.createMessage, {
      messageId: "a-msg-1",
      role: "user",
      content: "Student A private thoughts",
    });

    const sessionB = t.withIdentity({ subject: studentBId });
    const historyB = await sessionB.query(api.companion.getConversationHistory, {});
    expect(historyB.length).toBe(0); // Student B cannot see Student A's messages
  });

  // =========================================================================
  // CATEGORY 3: REFRAME DEDUPLICATION TESTS (REFRAME-01 to REFRAME-05)
  // =========================================================================

  test("REFRAME-01 & REFRAME-02: New reframe creates authoritative reframeLogs record and NO new legacy reframes record", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const studentSession = t.withIdentity({ subject: studentAId });

    // Calling reframes.create (legacy mutation)
    await studentSession.mutation(api.reframes.create, {
      situation: "Failed a test",
      originalThought: "I will never succeed in college",
      thinkingTrap: "Catastrophizing",
      guidedAnswers: ["I studied hard", "It was only one test"],
      newThought: "One test does not define my academic path",
      preIntensity: 9,
      postIntensity: 3,
    });

    await t.run(async (ctx) => {
      // Authoritative reframeLogs must have 1 record
      const logs = await ctx.db.query("reframeLogs").withIndex("by_user", (q) => q.eq("userId", studentAId)).collect();
      expect(logs.length).toBe(1);
      expect(logs[0].situation_text).toBe("Failed a test");
      expect(logs[0].thought_original).toBe("I will never succeed in college");
      expect(logs[0].reframe_text).toBe("One test does not define my academic path");
      expect(logs[0].improvement_percentage).toBe(67);

      // Legacy reframes table must NOT receive any write
      const legacy = await ctx.db.query("reframes").withIndex("by_userId", (q) => q.eq("userId", studentAId)).collect();
      expect(legacy.length).toBe(0);
    });
  });

  test("REFRAME-03: Historical reframes records remain untouched and queryable via fallback", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("reframes", {
        userId: studentAId,
        situation: "Historical situation",
        originalThought: "Historical thought",
        thinkingTrap: "All-or-Nothing",
        guidedAnswers: [],
        newThought: "Historical reframe",
        preIntensity: 8,
        postIntensity: 4,
        createdAt: 2000,
      });
    });

    const studentSession = t.withIdentity({ subject: studentAId });
    // getRecent should fall back to legacy reframes when reframeLogs is empty
    const recent = await studentSession.query(api.reframes.getRecent, {});
    expect(recent.length).toBe(1);
    expect(recent[0].situation).toBe("Historical situation");
    expect(recent[0].newThought).toBe("Historical reframe");
  });

  test("REFRAME-04: Student isolation remains intact for reframes", async () => {
    const { t, studentAId, studentBId } = await setupTestEnvironment();

    const sessionA = t.withIdentity({ subject: studentAId });
    await sessionA.mutation(api.reframes.createLog, {
      situation_text: "Private situation",
      thought_original: "Private thought",
      thinking_trap_choice: "Trap",
      guided_answers: [],
      reframe_text: "Private reframe",
      pre_reframe_intensity: 7,
      post_reframe_intensity: 3,
      improvement_percentage: 57,
      saved_reframe_flag: true,
    });

    const sessionB = t.withIdentity({ subject: studentBId });
    // Student B requesting Student A's reframes must be rejected
    await expect(sessionB.query(api.reframes.getRecentLogs, { userId: studentAId })).rejects.toThrow(/Unauthorized/);
  });

  test("REFRAME-05: Timeline continues using reframeLogs", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const studentSession = t.withIdentity({ subject: studentAId });
    await studentSession.mutation(api.reframes.createLog, {
      situation_text: "Timeline situation",
      thought_original: "Timeline thought",
      thinking_trap_choice: "Overgeneralization",
      guided_answers: ["Context 1"],
      reframe_text: "Timeline new thought",
      pre_reframe_intensity: 8,
      post_reframe_intensity: 2,
      improvement_percentage: 75,
      saved_reframe_flag: true,
    });

    const timeline = await studentSession.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId });
    const reframeEvents = timeline.filter((e) => e.eventType === "reframe_completed");
    expect(reframeEvents.length).toBe(1);
    expect(reframeEvents[0].sourceTable).toBe("reframeLogs");
    expect(reframeEvents[0].title).toBe("Cognitive Reframe: Overgeneralization");
  });

  // =========================================================================
  // CATEGORY 4: INTERVENTION PROVENANCE TESTS (PROV-INT-01 to PROV-INT-03)
  // =========================================================================

  test("PROV-INT-01: Interventions created without explicit source default safely to self_initiated without fabricated provenance", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    const studentSession = t.withIdentity({ subject: studentAId });

    // 1. JPMR log without explicit provenance
    const jpmrId = await studentSession.mutation(api.jpmrLogs.create, {
      completed: true,
      durationSeconds: 300,
      preIntensity: 6,
      postIntensity: 2,
      startedAt: Date.now() - 300000,
      completedAt: Date.now(),
    });

    // 2. Reframe log without explicit provenance
    const reframeId = await studentSession.mutation(api.reframes.createLog, {
      situation_text: "Self test",
      thought_original: "Self thought",
      thinking_trap_choice: "Filtering",
      guided_answers: [],
      reframe_text: "Self reframe",
      pre_reframe_intensity: 7,
      post_reframe_intensity: 3,
      improvement_percentage: 57,
      saved_reframe_flag: true,
    });

    // 3. MicroGoal without explicit provenance
    const goalId = await studentSession.mutation(api.microGoals.createGoal, {
      goalId: "custom_1",
      goalTitle: "Custom Walk",
      goalDescription: "Walk around",
      category: "Exercise",
      difficulty: "easy",
      points: 15,
    });

    await t.run(async (ctx) => {
      const jpmr = await ctx.db.get(jpmrId);
      expect(jpmr?.sourceType).toBe("self_initiated");
      expect(jpmr?.attemptId).toBeUndefined();
      expect(jpmr?.triageId).toBeUndefined();

      const reframe = await ctx.db.get(reframeId);
      expect(reframe?.sourceType).toBe("self_initiated");
      expect(reframe?.attemptId).toBeUndefined();
      expect(reframe?.triageId).toBeUndefined();

      const goal = await ctx.db.get(goalId);
      expect(goal?.sourceType).toBe("self_initiated");
      expect(goal?.attemptId).toBeUndefined();
      expect(goal?.triageId).toBeUndefined();
    });
  });

  test("PROV-INT-02: Interventions created with explicit parent retain deterministic provenance", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    let attemptId: Id<"screeningAttempts">;
    let triageId: Id<"triages">;

    await t.run(async (ctx) => {
      triageId = await ctx.db.insert("triages", {
        userId: studentAId,
        level: "yellow",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
      attemptId = await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: Date.now() - 60000,
        completedAt: Date.now(),
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 7, maxScore: 27, severity: "Mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 6, maxScore: 21, severity: "Mild", level: "mild" },
          pq16: { administered: false, score: 0, maxScore: 16, severity: "None", level: "none" },
        },
        triageLevel: "yellow",
        suicideFlag: false,
        psychosisFlag: false,
        triageId,
      });
    });

    const studentSession = t.withIdentity({ subject: studentAId });

    // Start CBT session with explicit screening provenance
    const cbtRes = await studentSession.mutation(api.cbt.startSession, {
      forceNew: true,
      sourceType: "screening",
      attemptId: attemptId!,
      triageId: triageId!,
    });

    await t.run(async (ctx) => {
      const cbt = await ctx.db.get(cbtRes.session!._id);
      expect(cbt?.sourceType).toBe("screening");
      expect(cbt?.attemptId).toEqual(attemptId);
      expect(cbt?.triageId).toEqual(triageId);
    });
  });

  test("PROV-INT-03: Historical intervention records lacking provenance fields remain valid", async () => {
    const { t, studentAId } = await setupTestEnvironment();

    let legacyJpmrId: Id<"jpmrLogs">;
    await t.run(async (ctx) => {
      legacyJpmrId = await ctx.db.insert("jpmrLogs", {
        userId: studentAId,
        completed: true,
        durationSeconds: 180,
        preIntensity: 5,
        postIntensity: 2,
        createdAt: 5000,
      });
    });

    const studentSession = t.withIdentity({ subject: studentAId });
    const recentJpmr = await studentSession.query(api.jpmrLogs.getRecent, {});
    expect(recentJpmr.length).toBe(1);
    expect(recentJpmr[0]._id).toEqual(legacyJpmrId!);
    expect(recentJpmr[0].sourceType).toBeUndefined();
    expect(recentJpmr[0].attemptId).toBeUndefined();
  });
});
