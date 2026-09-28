import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertCanAccessStudent } from "./authz";
import type { Id } from "./_generated/dataModel";

/**
 * Maps categorical daily check-in mood to a standard 1-10 intensity scale
 * for backward-compatible rendering in trend charts.
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
  args: { userId: v.optional(v.string()) },
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
    // Preserves complete user history for lifetime check-in totals without arbitrary record caps.
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

    // 7-day daily mood history (semantically bounded to 7 most recent distinct daily check-ins, sorted chronologically ascending)
    const recent7Checkins = deduplicatedCheckins
      .slice(0, 7)
      .sort((a, b) => {
        if (a.dateStr && b.dateStr && a.dateStr !== b.dateStr) {
          return a.dateStr.localeCompare(b.dateStr);
        }
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

    const recentDailyMood = recent7Checkins.map((c) => ({
      _id: c._id,
      userId: c.userId,
      dateStr: c.dateStr,
      mood: c.mood,
      intensity: moodToIntensity(c.mood),
      createdAt: c.createdAt,
    }));

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
    
    const totalCalmPoints = goals.reduce((acc, g) => acc + (g.points || 0), 0);
    const completedGoalsCount = goals.filter(g => g.completed).length;

    // JPMR Logs (Lifetime aggregate for jpmrMinutes and avgJpmrDrop)
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
    
    const jpmrMinutes = jpmrLogs.reduce((acc, log) => acc + Math.round((log.durationSeconds ?? (log.duration ?? 0)) / 60), 0);
    
    // Average Intensity Drop in JPMR
    let totalJpmrDrop = 0;
    jpmrLogs.forEach(log => {
      totalJpmrDrop += (log.preIntensity - log.postIntensity);
    });
    const avgJpmrDrop = jpmrLogs.length > 0 ? (totalJpmrDrop / jpmrLogs.length).toFixed(1) : "0";

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
        totalReframeDrop += (r.preIntensity - r.postIntensity);
      });
    } else {
      const rawLegacyReframes = await Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("reframes").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
        )
      );
      reframes = rawLegacyReframes.flat();
      reframes.forEach((r) => {
        totalReframeDrop += (r.preIntensity - r.postIntensity);
      });
    }
    const avgReframeDrop = reframes.length > 0 ? (totalReframeDrop / reframes.length).toFixed(1) : "0";

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

    // Compatibility representation for existing student Insights UI:
    // Existing UI (`app/(auth)/(tabs)/insights.tsx`) expects `stats.emotionLogs` with { createdAt, preIntensity }.
    // When dailyCheckins are present, map the 7-day daily mood history into compatibility items so the mood trend chart displays properly.
    // If no dailyCheckins exist, fall back to any episodic emotionLogs.
    const compatibilityEmotionLogs = deduplicatedCheckins.length > 0
      ? recent7Checkins.map((c) => ({
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

    // Screenings - read complete authoritative completed screeningAttempts without arbitrary limits to prevent CSV export truncation
    const rawAttempts = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("screeningAttempts").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenAttemptIds = new Set<string>();
    const attempts = rawAttempts.flat().filter((a) => {
      if (seenAttemptIds.has(a._id)) return false;
      seenAttemptIds.add(a._id);
      return true;
    }).sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt));

    let screenings: any[] = [];
    const completedAttempts = attempts.filter((a) => a.status === "completed");
    if (completedAttempts.length > 0) {
      screenings = completedAttempts.map((a) => ({
        _id: a._id,
        userId: a.userId,
        phq9_total: a.results?.phq9?.score ?? 0,
        gad7_total: a.results?.gad7?.score ?? 0,
        pq16_total: a.results?.pq16?.score ?? 0,
        wsas_total: a.results?.wsas?.administered ? a.results.wsas.score : (a.results?.wsas?.score ?? undefined),
        reqol10_total: a.results?.reqol10?.administered ? a.results.reqol10.score : (a.results?.reqol10?.score ?? undefined),
        phq9_item9_flag: a.results?.phq9?.item9Flag ?? (a as any).phq9_item9_flag ?? false,
        phq9_item9_score: a.results?.phq9?.item9Score ?? (a as any).phq9_item9_score ?? 0,
        createdAt: a.completedAt || a.startedAt,
        attemptId: String(a._id),
        status: "completed",
      }));
    } else {
      const rawLegacyScreenings = await Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("screenings").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
        )
      );
      const seenLegacyIds = new Set<string>();
      screenings = rawLegacyScreenings.flat().filter((s) => {
        if (seenLegacyIds.has(s._id)) return false;
        seenLegacyIds.add(s._id);
        return true;
      });
    }

    // Triages (Complete clinical history)
    const rawTriages = await Promise.all(
      Array.from(searchUserIds).map((id) =>
        ctx.db.query("triages").withIndex("by_userId", (q) => q.eq("userId", id)).collect()
      )
    );
    const seenTriageIds = new Set<string>();
    const triages = rawTriages.flat().filter((t) => {
      if (seenTriageIds.has(t._id)) return false;
      seenTriageIds.add(t._id);
      return true;
    });

    return {
      totalCalmPoints,
      completedGoalsCount,
      jpmrMinutes,
      avgJpmrDrop,
      reframesCount: reframes.length,
      avgReframeDrop,
      totalCheckins,
      dailyCheckins: deduplicatedCheckins,
      recentDailyMood,
      emotionLogs: compatibilityEmotionLogs,
      episodicEmotionLogs,
      microGoals: goals,
      jpmrLogs,
      reframes,
      screenings,
      triages,
    };
  },
});
