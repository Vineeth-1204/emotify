/**
 * Morning and Evening Routines & MicroGoal Reminders Backend Module
 * Implementation of Phase 8 & Phase 9 of the approved Emotify specification.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { assertCanAccessStudent, getAuthenticatedUser } from "./authz";
import { createNotification } from "./notify";
import {
  MORNING_AFFIRMATIONS,
  MORNING_ROUTINE_COPY,
  EVENING_GRATITUDE_COPY,
  MICROGOAL_REMINDER_COPY,
  selectMorningAffirmation,
  classifyGratitudeBranch,
} from "../common/routinesCatalogue";
import { getLocalTimeDetails } from "./engagementEngine";

function getLocalDateString(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ==========================================
// 1. MORNING AFFIRMATION ROUTINE (PHASE 8)
// ==========================================

export const getMorningAffirmationStatus = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        completed: false,
        todayAffirmation: MORNING_AFFIRMATIONS[0],
        allAffirmations: MORNING_AFFIRMATIONS,
        welcomeMessage: MORNING_ROUTINE_COPY.welcome,
        promptMessage: MORNING_ROUTINE_COPY.prompt,
      };
    }
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const todayStr = args.dateStr || getLocalDateString();

    // Check if already completed today
    const existing = await ctx.db
      .query("morningAffirmations")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", targetUserId).eq("dateStr", todayStr)
      )
      .first();

    if (existing) {
      return {
        completed: true,
        savedRecord: existing,
        savedAffirmation: {
          affirmationId: existing.affirmationId,
          affirmationText: existing.affirmationText,
          isCustom: existing.isCustom,
          createdAt: existing.createdAt,
        },
        closingMessage: MORNING_ROUTINE_COPY.closing,
      };
    }

    // Look up recent affirmations shown in preceding 3 days (cooldown)
    const recentAffirmations = await ctx.db
      .query("morningAffirmations")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(10);

    const recentIds = recentAffirmations
      .map((a) => a.affirmationId)
      .filter((id): id is string => typeof id === "string");

    // Use day hash as seed for deterministic daily selection
    const daySeed = todayStr.split("-").reduce((acc, part) => acc + parseInt(part, 10), 0);
    const selectedAffirmation = selectMorningAffirmation(recentIds, daySeed);

    return {
      completed: false,
      todayAffirmation: selectedAffirmation,
      recommendedAffirmation: selectedAffirmation,
      allAffirmations: MORNING_AFFIRMATIONS,
      welcomeMessage: MORNING_ROUTINE_COPY.welcome,
      promptMessage: MORNING_ROUTINE_COPY.prompt,
    };
  },
});

export const submitMorningAffirmation = mutation({
  args: {
    dateStr: v.string(),
    affirmationText: v.string(),
    affirmationId: v.optional(v.string()),
    isCustom: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const userId = identity.subject;

    if (!args.affirmationText.trim()) {
      throw new ConvexError("Affirmation text cannot be empty.");
    }

    // Idempotency: check if already submitted for this calendar date
    const existing = await ctx.db
      .query("morningAffirmations")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", userId).eq("dateStr", args.dateStr)
      )
      .first();

    if (existing) {
      return {
        success: true,
        alreadyCompleted: true,
        recordId: existing._id,
        closingMessage: MORNING_ROUTINE_COPY.closing,
      };
    }

    const recordId = await ctx.db.insert("morningAffirmations", {
      userId,
      dateStr: args.dateStr,
      affirmationId: args.affirmationId,
      affirmationText: args.affirmationText.trim(),
      isCustom: args.isCustom,
      createdAt: Date.now(),
    });

    // Daily checkin integration: if user hasn't checked in today yet, create baseline checkin
    const existingCheckin = await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", userId).eq("dateStr", args.dateStr)
      )
      .first();

    if (!existingCheckin) {
      await ctx.db.insert("dailyCheckins", {
        userId,
        dateStr: args.dateStr,
        mood: "good",
        createdAt: Date.now(),
      });
    }

    return {
      success: true,
      alreadyCompleted: false,
      recordId,
      closingMessage: MORNING_ROUTINE_COPY.closing,
    };
  },
});

// ==========================================
// 2. EVENING GRATITUDE ROUTINE (PHASE 8)
// ==========================================

export const getEveningGratitudeStatus = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        completed: false,
        branch: "minimal_mild" as const,
        copy: EVENING_GRATITUDE_COPY.minimalMild,
        requiredEntries: EVENING_GRATITUDE_COPY.minimalMild.requiredEntries,
        savedEntries: [],
      };
    }
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const todayStr = args.dateStr || getLocalDateString();

    // Check if already completed today
    const existing = await ctx.db
      .query("eveningGratitudes")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", targetUserId).eq("dateStr", todayStr)
      )
      .first();

    // Determine student's clinical severity branch:
    // Look up latest triage and screening attempts
    const latestTriage = await ctx.db
      .query("triages")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .first();

    const latestScreening = await ctx.db
      .query("screenings")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .first();

    const branch = classifyGratitudeBranch({
      triageSeverity: latestTriage?.level || (latestTriage as any)?.severity,
      phq9Score: latestScreening?.phq9_total,
      gad7Score: latestScreening?.gad7_total,
    });

    const copy =
      branch === "moderate_severe"
        ? EVENING_GRATITUDE_COPY.moderateSevere
        : EVENING_GRATITUDE_COPY.minimalMild;

    if (existing) {
      return {
        completed: true,
        branch: existing.branch as "minimal_mild" | "moderate_severe",
        copy,
        requiredEntries: copy.requiredEntries,
        savedEntries: existing.gratitudeEntries,
        closingMessage: EVENING_GRATITUDE_COPY.closing,
      };
    }

    return {
      completed: false,
      branch,
      copy,
      requiredEntries: copy.requiredEntries,
      savedEntries: [],
    };
  },
});

export const submitEveningGratitude = mutation({
  args: {
    dateStr: v.string(),
    gratitudeEntries: v.array(v.string()),
    branch: v.optional(v.string()), // "minimal_mild" | "moderate_severe"
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const userId = identity.subject;

    // Idempotency: check if already submitted for today
    const existing = await ctx.db
      .query("eveningGratitudes")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", userId).eq("dateStr", args.dateStr)
      )
      .first();

    if (existing) {
      return {
        success: true,
        alreadyCompleted: true,
        recordId: existing._id,
        closingMessage: EVENING_GRATITUDE_COPY.closing,
      };
    }

    let branch = args.branch;
    if (!branch) {
      const latestTriage = await ctx.db
        .query("triages")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .first();

      const latestScreening = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .first();

      branch = classifyGratitudeBranch({
        triageSeverity: latestTriage?.level || (latestTriage as any)?.severity,
        phq9Score: latestScreening?.phq9_total,
        gad7Score: latestScreening?.gad7_total,
      });
    }

    // Filter non-empty clean entries
    const cleanEntries = args.gratitudeEntries.map((e) => e.trim()).filter((e) => e.length > 0);

    // Validation per branch requirements:
    if (branch === "minimal_mild" && cleanEntries.length < 3) {
      throw new ConvexError("Minimal/mild branch requires 3 items that went okay today.");
    }
    if (branch === "moderate_severe" && cleanEntries.length < 1) {
      throw new ConvexError("Please share at least 1 small thing that went okay today.");
    }

    const recordId = await ctx.db.insert("eveningGratitudes", {
      userId,
      dateStr: args.dateStr,
      gratitudeEntries: cleanEntries,
      branch: branch || "minimal_mild",
      createdAt: Date.now(),
    });

    return {
      success: true,
      alreadyCompleted: false,
      recordId,
      closingMessage: EVENING_GRATITUDE_COPY.closing,
    };
  },
});

// ==========================================
// 3. DAILY ROUTINE OVERVIEW (PHASE 8)
// ==========================================

export const getDailyRoutineOverview = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        morningCompleted: false,
        eveningCompleted: false,
        checkinCompleted: false,
        goalsTotal: 0,
        goalsCompleted: 0,
        calmPointsTotal: 0,
      };
    }
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const todayStr = args.dateStr || getLocalDateString();

    const morning = await ctx.db
      .query("morningAffirmations")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", targetUserId).eq("dateStr", todayStr)
      )
      .first();

    const evening = await ctx.db
      .query("eveningGratitudes")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", targetUserId).eq("dateStr", todayStr)
      )
      .first();

    const checkin = await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q) =>
        q.eq("userId", targetUserId).eq("dateStr", todayStr)
      )
      .first();

    const allGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const todayGoals = allGoals.filter((g) => g.date === todayStr);
    const goalsCompleted = todayGoals.filter((g) => g.completed).length;

    const user = await ctx.db.get(targetUserId as Id<"users">);
    const calmPointsTotal = user?.coins || 0;

    return {
      morningCompleted: !!morning,
      eveningCompleted: !!evening,
      checkinCompleted: !!checkin,
      goalsTotal: todayGoals.length,
      goalsCompleted,
      calmPointsTotal,
    };
  },
});

// ==========================================
// 4. ROUTINE NOTIFICATION PREFERENCES (PHASE 8)
// ==========================================

export const updateRoutinePreferences = mutation({
  args: {
    morningReminderTime: v.optional(v.string()), // "07:00"
    eveningReminderTime: v.optional(v.string()), // "20:30"
    morningReminderEnabled: v.optional(v.boolean()),
    eveningReminderEnabled: v.optional(v.boolean()),
    microGoalReminderEnabled: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db.get(userId as Id<"users">);
    if (!user) throw new ConvexError("User not found");

    const currentPrefs = user.notificationPreferences || {};
    const updatedPrefs = {
      ...currentPrefs,
      morningReminderTime: args.morningReminderTime ?? currentPrefs.morningReminderTime ?? "07:00",
      eveningReminderTime: args.eveningReminderTime ?? currentPrefs.eveningReminderTime ?? "20:30",
      morningReminderEnabled: args.morningReminderEnabled ?? currentPrefs.morningReminderEnabled ?? true,
      eveningReminderEnabled: args.eveningReminderEnabled ?? currentPrefs.eveningReminderEnabled ?? true,
      microGoalReminderEnabled: args.microGoalReminderEnabled ?? currentPrefs.microGoalReminderEnabled ?? true,
      timezone: args.timezone ?? currentPrefs.timezone ?? "Asia/Kolkata",
      quietHoursStart: args.quietHoursStart ?? currentPrefs.quietHoursStart ?? 22,
      quietHoursEnd: args.quietHoursEnd ?? currentPrefs.quietHoursEnd ?? 7,
    };

    await ctx.db.patch(userId as Id<"users">, {
      notificationPreferences: updatedPrefs,
    });

    return { success: true, preferences: updatedPrefs };
  },
});

// ==========================================
// 5. 60-MINUTE MICROGOAL REMINDERS (PHASE 9)
// ==========================================

export const evaluateMicroGoalReminders = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const sixtyMinutesMs = 60 * 60 * 1000;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // Scan recent goals that are at least 60 minutes old, but not older than 24 hours
    const allGoals = await ctx.db.query("microGoals").collect();
    const candidateGoals = allGoals.filter((g) => {
      // Must be between 60 minutes and 24 hours old
      const ageMs = nowMs - g.createdAt;
      return (
        ageMs >= sixtyMinutesMs &&
        ageMs < twentyFourHoursMs &&
        !g.completed &&
        !g.skipped &&
        g.reminderStatus !== "nudged_60m"
      );
    });

    let sentCount = 0;
    let skippedCount = 0;
    const dispatchedDetails: Array<{ goalId: string; recipientId: string }> = [];

    for (const goal of candidateGoals) {
      // Latest state check immediately before sending:
      // Verify goal is STILL incomplete and not skipped
      const freshGoal = await ctx.db.get(goal._id);
      if (!freshGoal || freshGoal.completed || freshGoal.skipped) {
        skippedCount++;
        continue;
      }

      // Check student notification preferences & quiet hours
      const user = await ctx.db.get(goal.userId as Id<"users">);
      if (!user) {
        skippedCount++;
        continue;
      }

      const prefs = user.notificationPreferences;
      if (prefs?.microGoalReminderEnabled === false || prefs?.engagementEnabled === false) {
        skippedCount++;
        continue;
      }

      const timezone = prefs?.timezone || "Asia/Kolkata";
      const quietStart = prefs?.quietHoursStart ?? 22;
      const quietEnd = prefs?.quietHoursEnd ?? 7;
      const time = getLocalTimeDetails(nowMs, timezone);

      // Quiet hours check
      if (time.localHour >= quietStart || time.localHour < quietEnd) {
        skippedCount++;
        continue;
      }

      // Deduplication key per goal
      const dedupeKey = `microgoal_60m:${goal._id}`;
      const existingNotif = await ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_dedupe", (q) =>
          q.eq("recipientId", goal.userId).eq("dedupeKey", dedupeKey)
        )
        .first();

      if (existingNotif) {
        skippedCount++;
        continue;
      }

      // Choose gentle nudge message
      const nudgeIndex = Math.abs(goal.createdAt) % MICROGOAL_REMINDER_COPY.sixtyMinuteNudges.length;
      const nudgeMessage = MICROGOAL_REMINDER_COPY.sixtyMinuteNudges[nudgeIndex];

      const { created } = await createNotification(ctx, {
        recipientId: goal.userId,
        type: "reminder",
        title: MICROGOAL_REMINDER_COPY.notificationTitle,
        message: nudgeMessage,
        priority: "low",
        destination: "microgoals",
        relatedId: goal._id,
        dedupeKey,
        category: "engagement",
      });

      if (created) {
        sentCount++;
        dispatchedDetails.push({ goalId: goal._id, recipientId: goal.userId });
        await ctx.db.patch(goal._id, {
          nudgeSentAt: nowMs,
          reminderStatus: "nudged_60m",
        });
      }
    }

    return {
      evaluatedCount: candidateGoals.length,
      sentCount,
      skippedCount,
      dispatchedDetails,
    };
  },
});

// ==========================================
// 6. SCHEDULED ROUTINE REMINDERS (PHASE 8)
// ==========================================

export const evaluateDailyRoutineReminders = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const allUsers = await ctx.db.query("users").collect();
    const students = allUsers.filter(
      (u) => (!u.role || u.role === "patient" || u.role === "student") && u.status !== "inactive"
    );

    let morningRemindersSent = 0;
    let eveningRemindersSent = 0;

    for (const student of students) {
      const studentId = String(student._id);
      const prefs = student.notificationPreferences;
      if (prefs?.engagementEnabled === false) continue;

      const timezone = prefs?.timezone || "Asia/Kolkata";
      const time = getLocalTimeDetails(nowMs, timezone);

      // Morning reminder check
      const morningEnabled = prefs?.morningReminderEnabled ?? true;
      const morningTargetTime = prefs?.morningReminderTime || "07:00";
      const morningTargetHour = parseInt(morningTargetTime.split(":")[0], 10) || 7;

      if (morningEnabled && time.localHour === morningTargetHour) {
        // Check if student already did morning affirmation today
        const completedAffirmation = await ctx.db
          .query("morningAffirmations")
          .withIndex("by_userId_and_dateStr", (q) =>
            q.eq("userId", studentId).eq("dateStr", time.localDateStr)
          )
          .first();

        if (!completedAffirmation) {
          const dedupeKey = `routine_morning:${studentId}:${time.localDateStr}`;
          const { created } = await createNotification(ctx, {
            recipientId: studentId,
            type: "reminder",
            title: MORNING_ROUTINE_COPY.notificationTitle,
            message: MORNING_ROUTINE_COPY.notificationBody,
            priority: "low",
            destination: "morning_affirmation",
            dedupeKey,
            category: "engagement",
          });
          if (created) morningRemindersSent++;
        }
      }

      // Evening reminder check
      const eveningEnabled = prefs?.eveningReminderEnabled ?? true;
      const eveningTargetTime = prefs?.eveningReminderTime || "20:30";
      const eveningTargetHour = parseInt(eveningTargetTime.split(":")[0], 10) || 20;

      if (eveningEnabled && time.localHour === eveningTargetHour) {
        // Check if student already did evening gratitude today
        const completedGratitude = await ctx.db
          .query("eveningGratitudes")
          .withIndex("by_userId_and_dateStr", (q) =>
            q.eq("userId", studentId).eq("dateStr", time.localDateStr)
          )
          .first();

        if (!completedGratitude) {
          const dedupeKey = `routine_evening:${studentId}:${time.localDateStr}`;
          const { created } = await createNotification(ctx, {
            recipientId: studentId,
            type: "reminder",
            title: EVENING_GRATITUDE_COPY.notificationTitle,
            message: EVENING_GRATITUDE_COPY.notificationBody,
            priority: "low",
            destination: "evening_gratitude",
            dedupeKey,
            category: "engagement",
          });
          if (created) eveningRemindersSent++;
        }
      }
    }

    return {
      morningRemindersSent,
      eveningRemindersSent,
    };
  },
});
