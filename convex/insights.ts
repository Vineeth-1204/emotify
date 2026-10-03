import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertCanAccessStudent, requireCounselorOrAdmin } from "./authz";
import type { Id } from "./_generated/dataModel";

/**
 * Maps categorical daily check-in mood to a standard 1-10 intensity scale
 * for backward-compatible rendering in legacy callers.
 */
function moodToIntensity(mood: string): number {
  switch (mood?.toLowerCase()) {
    case "good":
    case "happy":
      return 8;
    case "calm":
      return 6;
    case "low":
    case "sad":
      return 4;
    case "heavy":
    case "worried":
      return 3;
    default:
      return 5;
  }
}

export const getDailyStats = query({
  args: {
    userId: v.optional(v.string()),
    referenceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Must be logged in to view insights.");
    }
    const targetUserId = args.userId || identity.subject;

    // Strict clinical authorization check: student can only view own; counselor/admin can view authorized students
    await assertCanAccessStudent(ctx, targetUserId);

    // Resolve canonical user ID and legacy clerkId to ensure complete data retrieval
    let user = null;
    try {
      user = await ctx.db.get(targetUserId as Id<"users">);
    } catch {
      // targetUserId might be a string identifier or clerkId
    }
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q: any) => q.eq("clerkId", targetUserId))
        .first();
    }

    const canonicalUserId = user ? String(user._id) : targetUserId;
    const searchUserIds = new Set<string>([canonicalUserId, targetUserId]);
    if (user?.clerkId) searchUserIds.add(user.clerkId);

    // 1. Daily Check-ins (Authoritative source for daily check-in count and daily mood trend)
    // Priority 11 Step 5A: Query bounded to exact 7-day calendar window when referenceDate is provided,
    // using the existing compound index ["userId", "dateStr"] to eliminate lifetime user scans.
    let rawDailyCheckins: any[][] = [];

    if (args.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(args.referenceDate)) {
      const [refY, refM, refD] = args.referenceDate.split("-").map(Number);
      const dStart = new Date(refY, refM - 1, refD - 6, 12, 0, 0);
      const startY = dStart.getFullYear();
      const startM = String(dStart.getMonth() + 1).padStart(2, "0");
      const startD = String(dStart.getDate()).padStart(2, "0");
      const startDateStr = `${startY}-${startM}-${startD}`;
      const endDateStr = args.referenceDate;

      rawDailyCheckins = await Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db
            .query("dailyCheckins")
            .withIndex("by_userId_and_dateStr", (q) =>
              q.eq("userId", id).gte("dateStr", startDateStr).lte("dateStr", endDateStr)
            )
            .collect()
        )
      );
    } else {
      // Legacy fallback when no referenceDate is provided (preserves Priority 7 backward compatibility)
      rawDailyCheckins = await Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db
            .query("dailyCheckins")
            .withIndex("by_userId", (q) => q.eq("userId", id))
            .collect()
        )
      );
    }

    const seenCheckinIds = new Set<string>();
    const seenDates = new Set<string>();
    const deduplicatedCheckins: any[] = [];
    
    // Sort combined checkins newest first before deduplicating
    const allCheckinsSorted = rawDailyCheckins
      .flat()
      .filter((c) => {
        const idStr = String(c._id);
        if (seenCheckinIds.has(idStr)) return false;
        seenCheckinIds.add(idStr);
        return true;
      })
      .sort((a, b) => {
        if (b.dateStr && a.dateStr && b.dateStr !== a.dateStr) {
          return b.dateStr.localeCompare(a.dateStr);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

    // Deduplicate by dateStr: if multiple entries exist for the same calendar date, keep the latest
    for (const c of allCheckinsSorted) {
      if (c.dateStr) {
        if (seenDates.has(c.dateStr)) continue;
        seenDates.add(c.dateStr);
      }
      deduplicatedCheckins.push(c);
    }

    const totalCheckins = deduplicatedCheckins.length;

    // Strict 7-calendar-day daily mood history
    // When referenceDate is provided: window rule is reference date minus 6 calendar days through reference date.
    // Categorical values only, no numeric intensity, explicit empty slots for missing days.
    let recentDailyMood: any[] = [];

    if (args.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(args.referenceDate)) {
      const checkinByDate = new Map<string, any>();
      for (const c of deduplicatedCheckins) {
        if (c.dateStr && !checkinByDate.has(c.dateStr)) {
          checkinByDate.set(c.dateStr, c);
        }
      }

      const [refY, refM, refD] = args.referenceDate.split("-").map(Number);
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (let offset = -6; offset <= 0; offset++) {
        // Explicit local calendar construction anchored safely at local noon (12:00:00)
        // to prevent UTC midnight boundary rollover.
        const d = new Date(refY, refM - 1, refD + offset, 12, 0, 0);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${day}`;
        const label = weekdayNames[d.getDay()];

        const matchedCheckin = checkinByDate.get(dateStr);
        if (matchedCheckin) {
          recentDailyMood.push({
            dateStr,
            mood: matchedCheckin.mood,
            label,
            hasCheckin: true,
            _id: matchedCheckin._id,
            createdAt: matchedCheckin.createdAt,
          });
        } else {
          recentDailyMood.push({
            dateStr,
            mood: null,
            label,
            hasCheckin: false,
          });
        }
      }
    } else {
      // Legacy fallback when no referenceDate is provided (preserves Priority 7 backward compatibility)
      const recent7Checkins = deduplicatedCheckins
        .slice(0, 7)
        .sort((a, b) => {
          if (a.dateStr && b.dateStr && a.dateStr !== b.dateStr) {
            return a.dateStr.localeCompare(b.dateStr);
          }
          return (a.createdAt || 0) - (b.createdAt || 0);
        });

      recentDailyMood = recent7Checkins.map((c) => ({
        _id: c._id,
        userId: c.userId,
        dateStr: c.dateStr,
        mood: c.mood,
        intensity: moodToIntensity(c.mood),
        createdAt: c.createdAt,
      }));
    }

    // MicroGoals (Lifetime aggregate for totalCalmPoints and completedGoalsCount)
    const rawGoals = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("microGoals").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenGoalIds = new Set<string>();
    const goals = rawGoals.flat().filter((g) => {
      if (seenGoalIds.has(g._id)) return false;
      seenGoalIds.add(g._id);
      return true;
    });
    
    const completedGoals = goals.filter((g) => g.completed === true);
    const totalCalmPoints = completedGoals.reduce((acc, g) => acc + (g.points || 0), 0);
    const completedGoalsCount = completedGoals.length;

    // JPMR Logs (Lifetime aggregate for jpmrMinutes, jpmrSessions, and avgJpmrDrop)
    const rawJpmr = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("jpmrLogs").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenJpmrIds = new Set<string>();
    const jpmrLogs = rawJpmr.flat().filter((l) => {
      if (seenJpmrIds.has(l._id)) return false;
      seenJpmrIds.add(l._id);
      return true;
    });
    
    const jpmrSessionsCompleted = jpmrLogs.length;
    const jpmrMinutes = jpmrLogs.reduce((acc, log) => acc + Math.round((log.durationSeconds ?? (log.duration ?? 0)) / 60), 0);
    
    // Average Intensity Drop in JPMR
    let totalJpmrDrop = 0;
    let validJpmrDrops = 0;
    jpmrLogs.forEach(log => {
      if (typeof log.preIntensity === "number" && typeof log.postIntensity === "number") {
        totalJpmrDrop += (log.preIntensity - log.postIntensity);
        validJpmrDrops++;
      }
    });
    const avgJpmrDrop = validJpmrDrops > 0 ? (totalJpmrDrop / validJpmrDrops).toFixed(1) : "0";

    // Breathing Logs (Lifetime aggregate for Mindful Relaxation)
    // Completion criteria: status === "completed" AND completedAt !== undefined AND cyclesCompleted >= targetCycles
    const rawBreathing = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("breathingLogs").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenBreathingIds = new Set<string>();
    const breathingLogs = rawBreathing.flat().filter((l) => {
      if (seenBreathingIds.has(l._id)) return false;
      seenBreathingIds.add(l._id);
      return true;
    });

    const completedBreathing = breathingLogs.filter(
      (l) => l.status === "completed" && l.completedAt !== undefined && l.cyclesCompleted >= l.targetCycles
    );
    const breathingSessionsCompleted = completedBreathing.length;
    const breathingDurationMinutes = Math.round(
      completedBreathing.reduce((acc, l) => acc + (l.durationSeconds ?? 0), 0) / 60
    );

    // Grounding Logs (Lifetime aggregate for Mindful Relaxation)
    // Completion criteria: status === "completed" AND completedAt !== undefined AND stepsCompleted === totalSteps
    const rawGrounding = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("groundingLogs").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenGroundingIds = new Set<string>();
    const groundingLogs = rawGrounding.flat().filter((l) => {
      if (seenGroundingIds.has(l._id)) return false;
      seenGroundingIds.add(l._id);
      return true;
    });

    const completedGrounding = groundingLogs.filter(
      (l) => l.status === "completed" && l.completedAt !== undefined && l.stepsCompleted === l.totalSteps
    );
    const groundingSessionsCompleted = completedGrounding.length;
    const groundingDurationMinutes = Math.round(
      completedGrounding.reduce((acc, l) => acc + (l.durationSeconds ?? 0), 0) / 60
    );

    // Mindful Relaxation (Combined Behavioral Wellness Aggregate)
    // Non-clinical behavioral telemetry combining guided somatic interventions
    const mindfulRelaxationMinutes = jpmrMinutes + breathingDurationMinutes + groundingDurationMinutes;
    const mindfulRelaxationSessions = jpmrSessionsCompleted + breathingSessionsCompleted + groundingSessionsCompleted;

    const mindfulRelaxation = {
      totalMinutes: mindfulRelaxationMinutes,
      totalSessions: mindfulRelaxationSessions,
      breakdown: {
        breathing: {
          sessionsCompleted: breathingSessionsCompleted,
          minutes: breathingDurationMinutes,
        },
        grounding: {
          sessionsCompleted: groundingSessionsCompleted,
          minutes: groundingDurationMinutes,
        },
        jpmr: {
          sessionsCompleted: jpmrSessionsCompleted,
          minutes: jpmrMinutes,
        },
      },
    };

    // Reframes - read authoritative reframeLogs primarily, fallback to legacy reframes (Lifetime aggregate)
    const rawReframeLogs = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("reframeLogs").withIndex("by_user", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenReframeIds = new Set<string>();
    const reframeLogs = rawReframeLogs.flat().filter((l) => {
      if (seenReframeIds.has(l._id)) return false;
      seenReframeIds.add(l._id);
      return true;
    });

    let totalReframeDrop = 0;
    let validReframeDrops = 0;
    let reframes: any[] = [];

    if (reframeLogs.length > 0) {
      reframes = reframeLogs.map((l) => ({
        _id: l._id,
        userId: l.userId,
        situation: l.situation_text,
        originalThought: l.thought_original,
        thinkingTrap: l.thinking_trap_choice,
        guidedAnswers: l.guided_answers,
        newThought: l.reframe_text,
        preIntensity: l.pre_reframe_intensity,
        postIntensity: l.post_reframe_intensity,
        createdAt: l.createdAt,
      }));
      reframes.forEach((r) => {
        if (typeof r.preIntensity === "number" && typeof r.postIntensity === "number") {
          totalReframeDrop += (r.preIntensity - r.postIntensity);
          validReframeDrops++;
        }
      });
    } else {
      const rawLegacyReframes = await Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("reframes").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
        )
      );
      reframes = rawLegacyReframes.flat();
      reframes.forEach((r) => {
        if (typeof r.preIntensity === "number" && typeof r.postIntensity === "number") {
          totalReframeDrop += (r.preIntensity - r.postIntensity);
          validReframeDrops++;
        }
      });
    }
    const avgReframeDrop = validReframeDrops > 0 ? (totalReframeDrop / validReframeDrops).toFixed(1) : "0";

    // Episodic Emotion Logs (Clean separation from daily mood trend)
    const rawEmotionLogs = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("emotionLogs").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenEmotionIds = new Set<string>();
    const episodicEmotionLogs = rawEmotionLogs.flat().filter((l) => {
      if (seenEmotionIds.has(l._id)) return false;
      seenEmotionIds.add(l._id);
      return true;
    });

    // Compatibility representation for legacy callers
    const compatibilityEmotionLogs = deduplicatedCheckins.length > 0
      ? deduplicatedCheckins.slice(0, 7).map((c) => ({
          _id: c._id,
          userId: c.userId,
          emotion: c.mood,
          preIntensity: moodToIntensity(c.mood),
          postIntensity: moodToIntensity(c.mood),
          createdAt: c.createdAt,
          dateStr: c.dateStr,
          isDailyCheckin: true,
        }))
      : episodicEmotionLogs;

    return {
      totalCalmPoints,
      completedGoalsCount,
      jpmrMinutes,
      jpmrSessions: jpmrSessionsCompleted,
      avgJpmrDrop,
      reframesCount: reframes.length,
      avgReframeDrop,
      totalCheckins,
      dailyCheckins: deduplicatedCheckins,
      recentDailyMood,
      mindfulRelaxation,
      emotionLogs: compatibilityEmotionLogs,
      episodicEmotionLogs,
      microGoals: goals,
      jpmrLogs,
      reframes,
    };
  },
});


/**
 * Focused query for counselors and administrators to inspect a student's
 * recent daily check-in (self-reported wellness telemetry) history.
 *
 * Strictly non-diagnostic: does not alter screening, triage, or alert state.
 */
export const getCounselorStudentDailyCheckins = query({
  args: {
    userId: v.string(),
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Role enforcement: Caller must be a Counselor or Admin
    await requireCounselorOrAdmin(ctx);

    // 2. Student authorization: Ensure caller can access target student
    await assertCanAccessStudent(ctx, args.userId);

    // 3. Resolve canonical user identity and legacy clerkId
    let user = null;
    try {
      user = await ctx.db.get(args.userId as Id<"users">);
    } catch {
      // args.userId might be a string or clerkId
    }
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q: any) => q.eq("clerkId", args.userId))
        .first();
    }

    const canonicalUserId = user ? String(user._id) : args.userId;
    const searchUserIds = new Set<string>([canonicalUserId, args.userId]);
    if (user?.clerkId) searchUserIds.add(user.clerkId);

    // 4. Retrieve dailyCheckins across all matching identities
    const rawDailyCheckins = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db
          .query("dailyCheckins")
          .withIndex("by_userId", (q) => q.eq("userId", id))
          .collect()
      )
    );

    const seenCheckinIds = new Set<string>();
    const seenDates = new Set<string>();
    const deduplicatedCheckins: Array<{
      _id: Id<"dailyCheckins">;
      userId: string;
      dateStr: string;
      mood: string;
      createdAt: number;
    }> = [];

    // Sort combined checkins newest first before deduplicating
    const allCheckinsSorted = rawDailyCheckins
      .flat()
      .filter((c) => {
        const idStr = String(c._id);
        if (seenCheckinIds.has(idStr)) return false;
        seenCheckinIds.add(idStr);
        return true;
      })
      .sort((a, b) => {
        if (b.dateStr && a.dateStr && b.dateStr !== a.dateStr) {
          return b.dateStr.localeCompare(a.dateStr);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

    // Deduplicate by dateStr: if multiple entries exist for the same calendar date, keep the latest
    for (const c of allCheckinsSorted) {
      if (c.dateStr) {
        if (seenDates.has(c.dateStr)) continue;
        seenDates.add(c.dateStr);
      }
      deduplicatedCheckins.push({
        _id: c._id,
        userId: c.userId,
        dateStr: c.dateStr,
        mood: c.mood,
        createdAt: c.createdAt,
      });
    }

    const totalCheckins = deduplicatedCheckins.length;

    // Validate lookback window (default 14, min 1, max 90)
    const lookback = Math.min(Math.max(args.lookbackDays ?? 14, 1), 90);

    // Slice the most recent distinct calendar days and sort chronologically ascending for timeline review
    const recentCheckins = deduplicatedCheckins
      .slice(0, lookback)
      .sort((a, b) => {
        if (a.dateStr && b.dateStr && a.dateStr !== b.dateStr) {
          return a.dateStr.localeCompare(b.dateStr);
        }
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

    return {
      studentId: canonicalUserId,
      totalCheckins,
      lookbackDays: lookback,
      checkins: recentCheckins,
    };
  },
});
