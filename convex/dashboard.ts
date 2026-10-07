import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  getAuthenticatedUser,
  requireAdmin,
  requireCounselorOrAdmin,
  assertCanAccessStudent,
} from "./authz";
import { sanitizePlainText } from "./sanitizer";

// Helper to resolve patient name dynamically by userId (clerkId or user _id)
async function getPatientName(ctx: any, userId: string): Promise<string> {
  let user = null;
  try {
    user = await ctx.db.get(userId as Id<"users">);
  } catch (e) {
    // Ignore conversion error if it's not a valid Id
  }
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", userId))
      .first();
  }
  return user ? (user.full_name || user.alias || "Unknown Patient") : "Unknown Patient";
}

export const getDashboardOverview = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return null;

    const patients = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .collect();

    // Map all valid patient identifiers to canonical patient document ID (_id)
    const patientIdMap = new Map<string, string>();
    for (const p of patients) {
      const canonicalId = p._id.toString();
      patientIdMap.set(canonicalId, canonicalId);
      if (p.clerkId) {
        patientIdMap.set(p.clerkId, canonicalId);
      }
    }

    // Severe / Critical Risk: Calculate based on LATEST triage per enrolled patient using indexed queries
    const latestTriageByPatient: Record<string, any> = {};
    for (const p of patients) {
      const canonicalId = p._id.toString();
      let latest = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", canonicalId))
        .order("desc")
        .first();
      const clerkId = p.clerkId;
      if (!latest && clerkId) {
        latest = await ctx.db
          .query("triages")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", clerkId))
          .order("desc")
          .first();
      }
      if (latest) {
        latestTriageByPatient[canonicalId] = latest;
      }
    }

    // Alerts - count any unresolved/active alerts (pending or escalated or active)
    const pendingAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const escalatedAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "escalated"))
      .collect();

    const activeAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const totalActiveAlerts = [...pendingAlerts, ...escalatedAlerts, ...activeAlerts];

    const latestTriagesList = Object.values(latestTriageByPatient);
    const severeCases = latestTriagesList.filter(
      (t) => t.level === "severe" || t.level === "suicide_flag" || t.level === "psychosis_flag" || t.suicideFlag || t.psychosisFlag
    ).length;

    const suicideRisks = latestTriagesList.filter((t) => t.suicideFlag || t.level === "suicide_flag").length;
    const psychosisRisks = latestTriagesList.filter((t) => t.psychosisFlag || t.level === "psychosis_flag").length;

    // Generate real trend data for the last 7 days based on indexed triages
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentTriages: any[] = [];
    for (const p of patients) {
      const canonicalId = p._id.toString();
      const recents = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", canonicalId).gte("createdAt", sevenDaysAgo))
        .take(50);
      recentTriages.push(...recents);
      const clerkId = p.clerkId;
      if (clerkId) {
        const clerkRecents = await ctx.db
          .query("triages")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", clerkId).gte("createdAt", sevenDaysAgo))
          .take(50);
        recentTriages.push(...clerkRecents);
      }
    }

    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 86399999;

      const dayTriages = recentTriages.filter(t => t.createdAt >= startOfDay && t.createdAt <= endOfDay);
      trendData.push({
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        severe: dayTriages.filter(t => t.level === "severe" || t.suicideFlag || t.psychosisFlag).length,
        moderate: dayTriages.filter(t => t.level === "moderate").length,
        mild: dayTriages.filter(t => t.level === "mild").length,
      });
    }

    return {
      totalPatients: patients.length,
      severeCases,
      suicideRisks,
      psychosisRisks,
      activeAlertsCount: totalActiveAlerts.length,
      trendData
    };
  },
});

export const getAlerts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");
    const callerId = caller ? String(caller._id) : identity.subject;

    // STEP 5D.1: User-scoped retrieval for non-staff students before database read
    if (!isStaff) {
      const canonicalId = caller ? String(caller._id) : callerId;
      const searchIds = new Set<string>([canonicalId, callerId]);
      if (caller?.clerkId) searchIds.add(caller.clerkId);

      const dbAlerts: any[] = [];
      const seenIds = new Set<string>();

      for (const uid of Array.from(searchIds)) {
        const userAlerts = await ctx.db
          .query("alerts")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .order("desc")
          .collect();
        for (const a of userAlerts) {
          if (!seenIds.has(String(a._id))) {
            seenIds.add(String(a._id));
            dbAlerts.push(a);
          }
        }
      }

      // Check student's own latest triage using user-scoped index
      let latestTriage: any = null;
      for (const uid of Array.from(searchIds)) {
        const triages = await ctx.db
          .query("triages")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .order("desc")
          .take(1);
        if (triages.length > 0) {
          if (!latestTriage || (triages[0].createdAt || 0) > (latestTriage.createdAt || 0)) {
            latestTriage = triages[0];
          }
        }
      }

      const alertUserIds = new Set(dbAlerts.map((a) => a.userId.toString()));
      const synthesizedAlerts: any[] = [...dbAlerts];

      if (latestTriage) {
        const hasSuicide = latestTriage.suicideFlag || latestTriage.level === "suicide_flag";
        const hasPsychosis = latestTriage.psychosisFlag || latestTriage.level === "psychosis_flag";
        const isSevere = latestTriage.level === "severe";

        if (hasSuicide && !alertUserIds.has(canonicalId)) {
          synthesizedAlerts.push({
            _id: `synth_suicide_${canonicalId}` as any,
            userId: canonicalId,
            type: "suicideRisk",
            status: "active",
            createdAt: latestTriage.createdAt || Date.now(),
          });
        }
        if (hasPsychosis && !alertUserIds.has(canonicalId)) {
          synthesizedAlerts.push({
            _id: `synth_psychosis_${canonicalId}` as any,
            userId: canonicalId,
            type: "psychosisRisk",
            status: "active",
            createdAt: latestTriage.createdAt || Date.now(),
          });
        }
        if (isSevere && !hasSuicide && !hasPsychosis && !alertUserIds.has(canonicalId)) {
          synthesizedAlerts.push({
            _id: `synth_severe_${canonicalId}` as any,
            userId: canonicalId,
            type: "deterioration",
            status: "active",
            createdAt: latestTriage.createdAt || Date.now(),
          });
        }
      }

      const patientName = caller ? (caller.full_name || (caller as any).alias || "Self") : "Self";
      const patientMobile = caller?.mobile_number || "N/A";
      const patientId = caller ? (caller.patientId || caller._id) : canonicalId;

      return synthesizedAlerts
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((alert) => ({
          ...alert,
          patientName,
          patientMobile,
          patientId,
        }));
    }

    // Staff path: Institution-wide clinical alerts (Bounded retrieval to prevent full-table scans)
    const dbAlerts = await ctx.db.query("alerts").order("desc").take(150);

    // Patient lookup cache to avoid full-table scans of users
    const patientCache = new Map<string, any>();
    async function resolvePatient(userId: string) {
      if (!userId) return null;
      if (patientCache.has(userId)) return patientCache.get(userId);
      let patient = null;
      try {
        patient = await ctx.db.get(userId as Id<"users">);
      } catch (e) {}
      if (!patient) {
        patient = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q: any) => q.eq("clerkId", userId))
          .first();
      }
      patientCache.set(userId, patient);
      if (patient) {
        patientCache.set(patient._id.toString(), patient);
        if (patient.clerkId) patientCache.set(patient.clerkId, patient);
      }
      return patient;
    }

    // Bounded fetch of recent triages to ensure real-time triage flags generate live alerts if not already in alerts table
    const recentTriages = await ctx.db.query("triages").order("desc").take(100);
    const latestTriageByPatient: Record<string, any> = {};
    for (const t of recentTriages) {
      if (t.userId) {
        const patient = await resolvePatient(t.userId.toString());
        if (patient) {
          const canonicalId = patient._id.toString();
          if (!latestTriageByPatient[canonicalId] || (t.createdAt || 0) > (latestTriageByPatient[canonicalId].createdAt || 0)) {
            latestTriageByPatient[canonicalId] = t;
          }
        }
      }
    }

    const alertUserIds = new Set(dbAlerts.map((a) => a.userId.toString()));
    const synthesizedAlerts: any[] = [...dbAlerts];

    // For any patient whose latest triage has suicideFlag or psychosisFlag or severe level, ensure an active alert exists
    for (const [canonicalId, triage] of Object.entries(latestTriageByPatient)) {
      const patient = await resolvePatient(canonicalId);
      if (!patient) continue;

      const hasSuicide = triage.suicideFlag || triage.level === "suicide_flag";
      const hasPsychosis = triage.psychosisFlag || triage.level === "psychosis_flag";
      const isSevere = triage.level === "severe";

      if (hasSuicide && !alertUserIds.has(canonicalId) && !alertUserIds.has(patient.clerkId || "")) {
        synthesizedAlerts.push({
          _id: `synth_suicide_${canonicalId}` as any,
          userId: canonicalId,
          type: "suicideRisk",
          status: "active",
          createdAt: triage.createdAt || Date.now(),
        });
      }
      if (hasPsychosis && !alertUserIds.has(canonicalId) && !alertUserIds.has(patient.clerkId || "")) {
        synthesizedAlerts.push({
          _id: `synth_psychosis_${canonicalId}` as any,
          userId: canonicalId,
          type: "psychosisRisk",
          status: "active",
          createdAt: triage.createdAt || Date.now(),
        });
      }
      if (isSevere && !hasSuicide && !hasPsychosis && !alertUserIds.has(canonicalId) && !alertUserIds.has(patient.clerkId || "")) {
        synthesizedAlerts.push({
          _id: `synth_severe_${canonicalId}` as any,
          userId: canonicalId,
          type: "deterioration",
          status: "active",
          createdAt: triage.createdAt || Date.now(),
        });
      }
    }

    const results = [];
    for (const alert of synthesizedAlerts) {
      const patient = await resolvePatient(alert.userId);

      results.push({
        ...alert,
        patientName: patient ? (patient.full_name || patient.alias || "Unknown Patient") : "Unknown Patient",
        patientMobile: patient?.mobile_number || "N/A",
        patientId: patient ? (patient._id || patient.clerkId) : alert.userId,
      });
    }
    return results;
  }
});

export const getActivityFeed = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");
    const callerId = caller ? String(caller._id) : identity.subject;

    let alerts: any[] = [];
    let emotionLogs: any[] = [];
    let microGoals: any[] = [];

    // STEP 5D.1: User-scoped retrieval for non-staff students before database read
    if (!isStaff) {
      const canonicalId = caller ? String(caller._id) : callerId;
      const searchIds = new Set<string>([canonicalId, callerId]);
      if (caller?.clerkId) searchIds.add(caller.clerkId);

      const seenAlerts = new Set<string>();
      const seenEmotions = new Set<string>();
      const seenGoals = new Set<string>();

      for (const uid of Array.from(searchIds)) {
        const uAlerts = await ctx.db
          .query("alerts")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .order("desc")
          .take(15);
        for (const a of uAlerts) {
          if (!seenAlerts.has(String(a._id))) {
            seenAlerts.add(String(a._id));
            alerts.push(a);
          }
        }

        const uEmotions = await ctx.db
          .query("emotionLogs")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .order("desc")
          .take(15);
        for (const e of uEmotions) {
          if (!seenEmotions.has(String(e._id))) {
            seenEmotions.add(String(e._id));
            emotionLogs.push(e);
          }
        }

        const uGoals = await ctx.db
          .query("microGoals")
          .withIndex("by_userId", (q) => q.eq("userId", uid))
          .order("desc")
          .take(15);
        for (const m of uGoals) {
          if (!seenGoals.has(String(m._id))) {
            seenGoals.add(String(m._id));
            microGoals.push(m);
          }
        }
      }
    } else {
      // Staff: Institutional feed
      alerts = await ctx.db.query("alerts").order("desc").take(15);
      emotionLogs = await ctx.db.query("emotionLogs").order("desc").take(15);
      microGoals = await ctx.db.query("microGoals").order("desc").take(15);
    }

    const feed = [];

    for (const a of alerts) {
      const patientName = await getPatientName(ctx, a.userId);
      const isSuicide = a.type === 'suicideRisk' || a.type === 'suicide';
      const isPsychosis = a.type === 'psychosisRisk' || a.type === 'psychosis';
      feed.push({
        id: a._id,
        type: 'alert',
        title: isSuicide
          ? `Suicide Risk Detected`
          : isPsychosis
            ? `Psychosis Risk Detected`
            : `Alert: ${a.type.charAt(0).toUpperCase() + a.type.slice(1).replace(/_/g, ' ')}`,
        desc: `Patient: ${patientName} • Status: ${a.status}`,
        time: a.createdAt,
        severity: isSuicide ? 'danger' : isPsychosis ? 'warning' : 'caution'
      });
    }

    for (const e of emotionLogs) {
      const patientName = await getPatientName(ctx, e.userId);
      feed.push({
        id: e._id,
        type: 'emotion',
        title: `Logged Emotion: ${e.emotion}`,
        desc: `Patient: ${patientName} • Intensity: ${e.intensity || e.postIntensity || 'N/A'}`,
        time: e.createdAt,
        severity: 'success'
      });
    }

    for (const m of microGoals) {
      const patientName = await getPatientName(ctx, m.userId);
      feed.push({
        id: m._id,
        type: 'goal',
        title: `MicroGoal ${m.completed ? 'Completed' : 'Missed'}`,
        desc: `Patient: ${patientName} • Goal: ${m.goal || m.goalTitle || 'N/A'}`,
        time: m.createdAt,
        severity: m.completed ? 'success' : 'caution'
      });
    }

    feed.sort((a, b) => b.time - a.time);
    return feed.slice(0, 15);
  }
});

export const updateAlertStatus = mutation({
  args: { alertId: v.id("alerts"), status: v.string() },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    // EMOT-PERF-02: Idempotent status update - avoid redundant write
    if (alert.status === args.status) {
      return { success: true };
    }

    await ctx.db.patch(args.alertId, {
      status: args.status,
      acknowledgedAt: Date.now(),
    });
    return { success: true };
  }
});

export const getPatientCbtAnalytics = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    // Resolve stable userId
    let user = null;
    try {
      user = await ctx.db.get(args.userId as Id<"users">);
    } catch (e) { }
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }
    if (!user) return null;
    const resolvedUserId = String(user._id);

    let sessions = await ctx.db
      .query("cbtSessions")
      .withIndex("by_userId", (q) => q.eq("userId", resolvedUserId))
      .order("desc")
      .collect();

    // Preserve legacy compatibility if no sessions found under canonical ID
    if (sessions.length === 0 && user.clerkId) {
      sessions = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId", (q) => q.eq("userId", user.clerkId!))
        .order("desc")
        .collect();
    }

    const completedSessions = sessions.filter(s => s.sessionStatus === "completed" || s.currentStep === "completed");
    const safetySessions = sessions.filter(s => s.sessionStatus === "safety_mode" || s.currentStep === "safety_mode");

    // 1. Thinking Style Trends
    const thinkingStyleTrends: Record<string, number> = {
      "I'm worried about what might happen": 0,
      "I'm being hard on myself": 0,
      "I keep blaming myself": 0,
      "I'm worried about what others think": 0,
      "I feel I should have done better": 0,
      "I feel stuck because I can't control things": 0,
    };
    completedSessions.forEach(s => {
      if (s.thinkingStyle && s.thinkingStyle in thinkingStyleTrends) {
        thinkingStyleTrends[s.thinkingStyle]++;
      }
    });

    // 2. Cognitive Distortion Trends
    const cognitiveDistortionTrends: Record<string, number> = {};
    completedSessions.forEach(s => {
      if (s.cbtDistortion) {
        cognitiveDistortionTrends[s.cbtDistortion] = (cognitiveDistortionTrends[s.cbtDistortion] || 0) + 1;
      }
    });

    // 3. Emotion Improvement & Belief Score
    let totalEmotionImprovement = 0;
    let totalBeliefScore = 0;
    let validEmotionCount = 0;
    let validBeliefCount = 0;

    completedSessions.forEach(s => {
      if (s.emotionBefore !== undefined && s.emotionAfter !== undefined) {
        totalEmotionImprovement += (s.emotionBefore - s.emotionAfter);
        validEmotionCount++;
      }
      if (s.beliefScore !== undefined) {
        totalBeliefScore += s.beliefScore;
        validBeliefCount++;
      }
    });

    const averageEmotionImprovement = validEmotionCount > 0 ? Number((totalEmotionImprovement / validEmotionCount).toFixed(1)) : 0;
    const averageBeliefScore = validBeliefCount > 0 ? Math.round(totalBeliefScore / validBeliefCount) : 0;

    // 4. Goals and Behavioural Activation
    const microGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    const recoveryPlansCount = completedSessions.filter(
      (s) => (s.recommendedGoals && s.recommendedGoals.length > 0) || s.recommendedGoal !== undefined
    ).length;

    const totalAcceptedGoals = microGoals.length;
    const completedGoalsCount = microGoals.filter((mg) => mg.completed).length;
    const skippedGoalsCount = microGoals.filter((mg) => mg.skipped).length;

    const goalCompletionRate = totalAcceptedGoals > 0
      ? Math.round((completedGoalsCount / totalAcceptedGoals) * 100)
      : 0;

    // Frequently Completed Goals
    const completedMap: Record<string, number> = {};
    microGoals.filter((mg) => mg.completed).forEach((mg) => {
      const title = mg.goalTitle || mg.goal || "Unknown Goal";
      completedMap[title] = (completedMap[title] || 0) + 1;
    });
    const frequentlyCompletedGoals = Object.entries(completedMap)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Frequently Skipped Goals
    const skippedMap: Record<string, number> = {};
    microGoals.filter((mg) => mg.skipped).forEach((mg) => {
      const title = mg.goalTitle || mg.goal || "Unknown Goal";
      skippedMap[title] = (skippedMap[title] || 0) + 1;
    });
    const frequentlySkippedGoals = Object.entries(skippedMap)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Behavioural Activation Trends (last 14 days)
    const behaviouralActivationTrends = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
      const dayGoals = microGoals.filter((mg) => mg.createdAt >= startOfDay && mg.createdAt < endOfDay);
      behaviouralActivationTrends.push({
        date: dateStr,
        completed: dayGoals.filter((mg) => mg.completed).length,
        total: dayGoals.length
      });
    }

    // Most Effective Goal Categories
    const categoryMap: Record<string, number> = {};
    microGoals.filter((mg) => mg.completed).forEach((mg) => {
      const cat = mg.category || "General";
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const mostEffectiveGoalCategories = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // 5. Weekly/Monthly Progress
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const weeklyProgress = completedSessions.filter(s => s.timestamp >= oneWeekAgo).length;
    const monthlyProgress = completedSessions.filter(s => s.timestamp >= oneMonthAgo).length;

    // 6. Recovery Trend (oldest to newest for charts)
    const recoveryTrend = [...completedSessions]
      .reverse()
      .map(s => {
        const d = new Date(s.timestamp);
        return {
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          emotionBefore: s.emotionBefore ?? 0,
          emotionAfter: s.emotionAfter ?? 0,
          beliefScore: s.beliefScore ?? 0,
        };
      });

    // Consolidated Recovery Timeline
    const recoveryTimeline = [
      ...completedSessions.map((s) => ({
        type: "session",
        timestamp: s.timestamp,
        title: "Completed CBT Session",
        details: `Emotion: ${s.emotion || "Stress"} improved from ${s.emotionBefore ?? 0} to ${s.emotionAfter ?? 0}`
      })),
      ...microGoals.filter((mg) => mg.completed).map((mg) => ({
        type: "goal",
        timestamp: mg.completedAt || mg.createdAt,
        title: `Completed Goal: ${mg.goalTitle}`,
        details: `Earned +${mg.points || 25} XP in category ${mg.category}`
      }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    // 7. High Risk Alerts
    const highRiskAlerts = safetySessions.map(s => ({
      sessionId: s._id,
      timestamp: s.timestamp,
      riskFlags: s.riskFlags || [],
      situation: s.situation || "Unknown Situation",
    }));

    // 8. Somatic & Relaxation Data (JPMR, Breathing, Grounding & Emotion Maps)
    const jpmrLogs = await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    const breathingLogs = await ctx.db
      .query("breathingLogs")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .order("desc")
      .take(50);

    const groundingLogs = await ctx.db
      .query("groundingLogs")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .order("desc")
      .take(50);

    const emotionMaps = await ctx.db
      .query("emotionMaps")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    const emotionLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    // 9. Cognitive Reframes Data
    const reframeLogs = await ctx.db
      .query("reframeLogs")
      .withIndex("by_user", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    // 10. Gamification Stats (Streaks, Badges, User points)
    const streak = await ctx.db
      .query("streaks")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .first();

    const badges = await ctx.db
      .query("badges")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

    return {
      totalCbtSessions: completedSessions.length,
      thinkingStyleTrends,
      cognitiveDistortionTrends,
      emotionImprovement: averageEmotionImprovement,
      beliefImprovement: averageBeliefScore,
      goalCompletionRate,
      weeklyProgress,
      monthlyProgress,
      recoveryTrend,
      highRiskAlerts,
      sessionsHistory: sessions,
      recoveryPlansCount,
      frequentlyCompletedGoals,
      frequentlySkippedGoals,
      behaviouralActivationTrends,
      mostEffectiveGoalCategories,
      recoveryTimeline,
      // Enhanced Telemetry
      jpmrLogs,
      breathingLogs,
      groundingLogs,
      emotionMaps,
      emotionLogs,
      reframeLogs,
      streak,
      badges,
      microGoals,
      xp: user.xp || 0,
      level: user.level || 1,
      coins: user.coins || 0,
    };
  }
});

export interface HistoryCursorPayload {
  timestamp: number;
  id: string;
}

export type PaginatedCbtResult = any[] & {
  sessions: any[];
  nextCursor: string | null;
};

export type PaginatedRequestsResult = any[] & {
  requests: any[];
  nextCursor: string | null;
};

export type PaginatedAuditResult = any[] & {
  logs: any[];
  nextCursor: string | null;
};

export function encodeHistoryCursor(payload: HistoryCursorPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(json);
}

export function decodeHistoryCursor(cursorStr: string): HistoryCursorPayload {
  let json = "";
  try {
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(cursorStr, "base64").toString("utf-8");
    } else {
      json = atob(cursorStr);
    }
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.timestamp !== "number" ||
      isNaN(parsed.timestamp) ||
      typeof parsed.id !== "string" ||
      parsed.id.trim() === ""
    ) {
      throw new Error("Invalid history cursor shape");
    }
    return parsed;
  } catch (err) {
    throw new Error("Invalid cursor format");
  }
}

export const listAllCbtSessions = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    paginate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      return ((args.cursor !== undefined || args.paginate === true)
        ? { sessions: [], nextCursor: null }
        : []) as any as PaginatedCbtResult;
    }

    const effectiveLimit = Math.min(Math.max(args.limit ?? 20, 1), 50);

    let cursorObj: HistoryCursorPayload | null = null;
    if (args.cursor) {
      cursorObj = decodeHistoryCursor(args.cursor);
    }

    const fetchBatchSize = Math.max(effectiveLimit * 3, 60);
    const sessions = await ctx.db
      .query("cbtSessions")
      .withIndex("by_timestamp", (q) =>
        cursorObj ? q.lte("timestamp", cursorObj.timestamp) : q
      )
      .order("desc")
      .take(fetchBatchSize);

    // Compound deterministic ordering: timestamp DESC, _id DESC
    const eligible = [];
    for (const session of sessions) {
      const itemTimestamp = session.timestamp ?? session._creationTime;
      const itemId = String(session._id);

      if (cursorObj) {
        if (itemTimestamp > cursorObj.timestamp) continue;
        if (itemTimestamp === cursorObj.timestamp && itemId.localeCompare(cursorObj.id) >= 0) continue;
      }
      eligible.push(session);
    }

    const pageRecords = eligible.slice(0, effectiveLimit);
    const hasMore = eligible.length > effectiveLimit;

    const results = [];
    for (const session of pageRecords) {
      const patientName = await getPatientName(ctx, session.userId);
      results.push({
        ...session,
        patientName,
      });
    }

    const nextCursor =
      hasMore && pageRecords.length > 0
        ? encodeHistoryCursor({
            timestamp: pageRecords[pageRecords.length - 1].timestamp ?? pageRecords[pageRecords.length - 1]._creationTime,
            id: String(pageRecords[pageRecords.length - 1]._id),
          })
        : null;

    if (args.cursor !== undefined || args.paginate === true) {
      return {
        sessions: results,
        nextCursor,
      } as any as PaginatedCbtResult;
    }

    return results as any as PaginatedCbtResult;
  }
});

export const getCounsellorRequests = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    paginate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      return ((args.cursor !== undefined || args.paginate === true)
        ? { requests: [], nextCursor: null }
        : []) as any as PaginatedRequestsResult;
    }

    const effectiveLimit = Math.min(Math.max(args.limit ?? 25, 1), 50);

    let cursorObj: HistoryCursorPayload | null = null;
    if (args.cursor) {
      cursorObj = decodeHistoryCursor(args.cursor);
    }

    const fetchBatchSize = Math.max(effectiveLimit * 3, 75);
    const requests = await ctx.db
      .query("counsellorRequests")
      .withIndex("by_timestamp", (q) =>
        cursorObj ? q.lte("timestamp", cursorObj.timestamp) : q
      )
      .order("desc")
      .take(fetchBatchSize);

    // Compound deterministic ordering: timestamp DESC, _id DESC
    const eligible = [];
    for (const req of requests) {
      const itemTimestamp = req.timestamp ?? req._creationTime;
      const itemId = String(req._id);

      if (cursorObj) {
        if (itemTimestamp > cursorObj.timestamp) continue;
        if (itemTimestamp === cursorObj.timestamp && itemId.localeCompare(cursorObj.id) >= 0) continue;
      }
      eligible.push(req);
    }

    const pageRecords = eligible.slice(0, effectiveLimit);
    const hasMore = eligible.length > effectiveLimit;

    const results = [];
    for (const req of pageRecords) {
      const userId = req.user_id || "";
      let patient = null;
      try {
        patient = await ctx.db.get(userId as Id<"users">);
      } catch (e) { }
      if (!patient && userId) {
        patient = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
          .first();
      }
      results.push({
        ...req,
        patientName: patient ? (patient.full_name || patient.alias || "Unknown Patient") : "Unknown Patient",
        patientMobile: patient?.mobile_number || "N/A",
        patientId: patient ? (patient._id || patient.clerkId) : userId,
      });
    }

    const nextCursor =
      hasMore && pageRecords.length > 0
        ? encodeHistoryCursor({
            timestamp: pageRecords[pageRecords.length - 1].timestamp ?? pageRecords[pageRecords.length - 1]._creationTime,
            id: String(pageRecords[pageRecords.length - 1]._id),
          })
        : null;

    if (args.cursor !== undefined || args.paginate === true) {
      return {
        requests: results,
        nextCursor,
      } as any as PaginatedRequestsResult;
    }

    return results as any as PaginatedRequestsResult;
  }
});

export const getAuditLogs = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    paginate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "admin") {
      return ((args.cursor !== undefined || args.paginate === true)
        ? { logs: [], nextCursor: null }
        : []) as any as PaginatedAuditResult;
    }

    const effectiveLimit = Math.min(Math.max(args.limit ?? 50, 1), 100);

    let cursorObj: HistoryCursorPayload | null = null;
    if (args.cursor) {
      cursorObj = decodeHistoryCursor(args.cursor);
    }

    const fetchBatchSize = Math.max(effectiveLimit * 3, 150);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp", (q) =>
        cursorObj ? q.lte("timestamp", cursorObj.timestamp) : q
      )
      .order("desc")
      .take(fetchBatchSize);

    // Compound deterministic ordering: timestamp DESC, _id DESC
    const eligible = [];
    for (const log of logs) {
      const itemTimestamp = log.timestamp ?? log._creationTime;
      const itemId = String(log._id);

      if (cursorObj) {
        if (itemTimestamp > cursorObj.timestamp) continue;
        if (itemTimestamp === cursorObj.timestamp && itemId.localeCompare(cursorObj.id) >= 0) continue;
      }
      eligible.push(log);
    }

    const pageRecords = eligible.slice(0, effectiveLimit);
    const hasMore = eligible.length > effectiveLimit;

    const results = [];
    for (const log of pageRecords) {
      let patientName = "System / Admin";
      if (log.userId) {
        patientName = await getPatientName(ctx, log.userId);
      }
      results.push({
        ...log,
        patientName,
      });
    }

    const nextCursor =
      hasMore && pageRecords.length > 0
        ? encodeHistoryCursor({
            timestamp: pageRecords[pageRecords.length - 1].timestamp ?? pageRecords[pageRecords.length - 1]._creationTime,
            id: String(pageRecords[pageRecords.length - 1]._id),
          })
        : null;

    if (args.cursor !== undefined || args.paginate === true) {
      return {
        logs: results,
        nextCursor,
      } as any as PaginatedAuditResult;
    }

    return results as any as PaginatedAuditResult;
  }
});

// ENTERPRISE COUNSELLOR MANAGEMENT
export const getCounsellors = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    return await ctx.db.query("counsellors").order("desc").collect();
  }
});

export const addCounsellor = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    role: v.string(),
    availability: v.array(v.string()),
    maxWorkload: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    return await ctx.db.insert("counsellors", {
      name: args.name,
      email: args.email,
      phone: args.phone,
      role: args.role,
      availability: args.availability,
      maxWorkload: args.maxWorkload,
      currentWorkload: 0,
      rating: 5.0,
      status: "active",
      createdAt: Date.now(),
    });
  }
});

export const updateCounsellorStatus = mutation({
  args: { counsellorId: v.id("counsellors"), status: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    await ctx.db.patch(args.counsellorId, { status: args.status });
  }
});

// ENTERPRISE CLINICAL TIMELINE
export const getPatientTimeline = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    return await ctx.db
      .query("clinicalTimelines")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  }
});

export const addTimelineEvent = mutation({
  args: {
    userId: v.string(),
    eventType: v.string(),
    title: v.string(),
    description: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireCounselorOrAdmin(ctx);

    return await ctx.db.insert("clinicalTimelines", {
      userId: args.userId,
      eventType: args.eventType,
      title: sanitizePlainText(args.title),
      description: sanitizePlainText(args.description),
      performedBy: staff.full_name || "Staff",
      timestamp: Date.now(),
      metadata: args.metadata,
    });
  }
});

// ENTERPRISE AI MONITORING LOGS
export const getAiMonitoringLogs = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    const logs = await ctx.db.query("aiMonitoringLogs").order("desc").take(100);
    const results = [];
    for (const log of logs) {
      const patientName = await getPatientName(ctx, log.userId);
      results.push({ ...log, patientName });
    }
    return results;
  }
});

// ENTERPRISE SYSTEM NOTIFICATIONS
// ENTERPRISE SYSTEM NOTIFICATIONS
export const getNotifications = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await getAuthenticatedUser(ctx);
    const searchRecipientIds = new Set<string>();

    if (identity.subject) {
      searchRecipientIds.add(identity.subject);
    }
    if (caller) {
      searchRecipientIds.add(String(caller._id));
      if (caller.clerkId) {
        searchRecipientIds.add(caller.clerkId);
      }
      if (caller.patientId) {
        searchRecipientIds.add(caller.patientId);
      }
    }

    const seenIds = new Set<string>();
    const notifications: any[] = [];

    for (const recipientId of Array.from(searchRecipientIds)) {
      const notifs = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) => q.eq("recipientId", recipientId))
        .order("desc")
        .take(50);

      for (const n of notifs) {
        const idStr = String(n._id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          notifications.push(n);
        }
      }
    }

    notifications.sort((a, b) => {
      const tA = a.createdAt ?? a._creationTime ?? 0;
      const tB = b.createdAt ?? b._creationTime ?? 0;
      return tB - tA;
    });

    return notifications.slice(0, 50);
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    const caller = await getAuthenticatedUser(ctx);
    const validRecipientIds = new Set<string>();

    if (identity.subject) {
      validRecipientIds.add(identity.subject);
    }
    if (caller) {
      validRecipientIds.add(String(caller._id));
      if (caller.clerkId) {
        validRecipientIds.add(caller.clerkId);
      }
      if (caller.patientId) {
        validRecipientIds.add(caller.patientId);
      }
    }

    const isRecipient = validRecipientIds.has(notification.recipientId);
    const isAdmin = caller?.role === "admin";

    if (!isRecipient && !isAdmin) {
      throw new Error("Unauthorized: Cannot mark another user's notification as read");
    }

    await ctx.db.patch(args.notificationId, { read: true });
    return { success: true };
  },
});

// ENTERPRISE ANALYTICS METRICS
export const getEnterpriseAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return null;

    const patients = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .collect();

    const patientIdMap = new Map<string, string>();
    for (const p of patients) {
      const canonicalId = p._id.toString();
      patientIdMap.set(canonicalId, canonicalId);
      if (p.clerkId) {
        patientIdMap.set(p.clerkId, canonicalId);
      }
    }

    // Latest triage per patient using indexed lookups
    const latestTriageByPatient: Record<string, any> = {};
    for (const p of patients) {
      const canonicalId = p._id.toString();
      let latest = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", canonicalId))
        .order("desc")
        .first();
      const clerkId = p.clerkId;
      if (!latest && clerkId) {
        latest = await ctx.db
          .query("triages")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", clerkId))
          .order("desc")
          .first();
      }
      if (latest) {
        latestTriageByPatient[canonicalId] = latest;
      }
    }
    const latestTriagesList = Object.values(latestTriageByPatient);

    // Calculate PHQ / GAD averages from authoritative attempts, falling back to legacy screenings
    let totalPhq = 0;
    let totalGad = 0;
    let count = 0;

    for (const p of patients) {
      const canonicalId = p._id.toString();
      const userAttempts = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", canonicalId))
        .take(50);
      const userCompleted = userAttempts.filter((a) => a.status === "completed");
      for (const a of userCompleted) {
        if (a.results?.phq9?.score !== undefined) {
          totalPhq += a.results.phq9.score;
          totalGad += a.results.gad7.score;
          count++;
        }
      }
      const clerkId = p.clerkId;
      if (clerkId) {
        const clerkAttempts = await ctx.db
          .query("screeningAttempts")
          .withIndex("by_userId", (q) => q.eq("userId", clerkId))
          .take(50);
        const clerkCompleted = clerkAttempts.filter((a) => a.status === "completed");
        for (const a of clerkCompleted) {
          if (a.results?.phq9?.score !== undefined) {
            totalPhq += a.results.phq9.score;
            totalGad += a.results.gad7.score;
            count++;
          }
        }
      }
    }

    if (count === 0) {
      for (const p of patients) {
        const canonicalId = p._id.toString();
        const fallbackScreenings = await ctx.db
          .query("screenings")
          .withIndex("by_userId", (q) => q.eq("userId", canonicalId))
          .take(20);
        fallbackScreenings.forEach((s) => {
          totalPhq += s.phq9_total;
          totalGad += s.gad7_total;
          count++;
        });
      }
    }

    const avgPhq = count > 0 ? (totalPhq / count).toFixed(1) : "0";
    const avgGad = count > 0 ? (totalGad / count).toFixed(1) : "0";

    const sessions = await ctx.db.query("cbtSessions").order("desc").take(500);
    const emotionLogs = await ctx.db.query("emotionLogs").order("desc").take(500);

    return {
      totalPatients: patients.length,
      totalSessions: sessions.length,
      completedSessions: sessions.filter((s) => s.sessionStatus === "completed").length,
      avgPhqScore: avgPhq,
      avgGadScore: avgGad,
      riskDistribution: {
        mild: latestTriagesList.filter((t) => t.level === "mild").length,
        moderate: latestTriagesList.filter((t) => t.level === "moderate").length,
        severe: latestTriagesList.filter((t) => t.level === "severe" || t.suicideFlag || t.psychosisFlag).length,
      },
      totalEmotionLogs: emotionLogs.length,
    };
  }
});

// ENTERPRISE TRASH / SOFT DELETE
export const getTrashItems = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "admin") return [];

    return await ctx.db.query("trash").order("desc").collect();
  }
});

export const restoreTrashItem = mutation({
  args: { trashId: v.id("trash") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const item = await ctx.db.get(args.trashId);
    if (!item) return;

    if (item.itemType === "patient" && item.deletedData) {
      try {
        const parsed = JSON.parse(item.deletedData);
        if (parsed.user) {
          const { _id, _creationTime, ...userData } = parsed.user;
          // Re-insert user back into DB
          await ctx.db.insert("users", {
            ...userData,
            status: "active",
            updated_at: Date.now(),
          });
        }
      } catch (e) {
        console.error("Failed to restore user data from trash:", e);
      }
    }

    await ctx.db.delete(args.trashId);
  }
});

// ENTERPRISE AI COMPANION CHAT INSPECTION
export const getUsersWithAiChats = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "admin") {
      return {
        users: [],
        stats: { totalUsers: 0, totalMessages: 0, activeToday: 0, highRiskFlags: 0 }
      };
    }

    const companionLogs = await ctx.db
      .query("aiCompanionLogs")
      .order("desc")
      .take(500);
    const fallbackMessages = await ctx.db
      .query("companionMessages")
      .order("desc")
      .take(200);
    const telemetryLogs = await ctx.db
      .query("aiMonitoringLogs")
      .order("desc")
      .take(200);

    const userMessageMap = new Map<string, any[]>();

    for (const msg of companionLogs) {
      if (!msg.userId) continue;
      if (!userMessageMap.has(msg.userId)) {
        userMessageMap.set(msg.userId, []);
      }
      userMessageMap.get(msg.userId)!.push({
        id: msg._id.toString(),
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    }

    for (const msg of fallbackMessages) {
      if (!msg.userId) continue;
      if (!userMessageMap.has(msg.userId)) {
        userMessageMap.set(msg.userId, []);
      }
      const existing = userMessageMap.get(msg.userId)!;
      if (!existing.some(e => e.id === msg._id.toString() || (e.content === msg.content && Math.abs(e.createdAt - msg.createdAt) < 1000))) {
        existing.push({
          id: msg._id.toString(),
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    for (const log of telemetryLogs) {
      if (!log.userId) continue;
      if (!userMessageMap.has(log.userId)) {
        userMessageMap.set(log.userId, []);
      }
      const existing = userMessageMap.get(log.userId)!;
      if (existing.length === 0) {
        if (log.prompt) {
          existing.push({
            id: `${log._id}_p`,
            role: "user",
            content: log.prompt,
            createdAt: log.timestamp,
          });
        }
        if (log.aiResponse) {
          existing.push({
            id: `${log._id}_r`,
            role: "assistant",
            content: log.aiResponse,
            createdAt: log.timestamp + 10,
          });
        }
      }
    }

    const allUsers = await ctx.db.query("users").collect();
    const patientMap = new Map<string, any>();
    for (const p of allUsers) {
      patientMap.set(p._id.toString(), p);
      if (p.clerkId) {
        patientMap.set(p.clerkId, p);
      }
    }

    const startOfToday = new Date().setHours(0, 0, 0, 0);
    let totalMessages = 0;
    let activeTodayCount = 0;
    const highRiskFlags = telemetryLogs.filter(l => l.riskScore > 70).length;

    const userList: any[] = [];

    for (const [userId, msgs] of userMessageMap.entries()) {
      msgs.sort((a, b) => a.createdAt - b.createdAt);

      const patient = patientMap.get(userId);
      const patientName = patient ? (patient.full_name || patient.alias || "Patient") : "Patient";
      const patientIdDisplay = patient ? (patient.patientId || (patient.clerkId ? patient.clerkId.slice(-6) : patient._id.toString().slice(-6))) : userId.slice(-6);
      const email = patient?.email || patient?.mobile_number || "N/A";

      const msgCount = msgs.length;
      totalMessages += msgCount;

      const lastMsg = msgs[msgs.length - 1];
      const lastActive = lastMsg ? lastMsg.createdAt : Date.now();

      if (lastActive >= startOfToday) {
        activeTodayCount++;
      }

      const latestMessageSnippet = lastMsg ? lastMsg.content : "No messages recorded";

      userList.push({
        userId,
        patientName,
        patientIdDisplay,
        email,
        messageCount: msgCount,
        lastActive,
        latestMessageSnippet,
        lastRole: lastMsg?.role || "user",
      });
    }

    userList.sort((a, b) => b.lastActive - a.lastActive);

    return {
      users: userList,
      stats: {
        totalUsers: userList.length,
        totalMessages,
        activeToday: activeTodayCount,
        highRiskFlags,
      }
    };
  }
});

export const getPatientAiChatHistoryAdmin = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: Login required.");
    }
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "admin") {
      throw new Error("Unauthorized: Administrative access required to view AI companion chat transcripts.");
    }

    let patient = null;
    try {
      patient = await ctx.db.get(args.userId as Id<"users">);
    } catch (e) {}
    if (!patient) {
      patient = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }

    const patientName = patient ? (patient.full_name || patient.alias || "Patient") : "Patient";
    const patientIdDisplay = patient ? (patient.patientId || (patient.clerkId ? patient.clerkId.slice(-6) : patient._id.toString().slice(-6))) : args.userId.slice(-6);

    let aiLogs = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    if (aiLogs.length === 0) {
      const fallback = await ctx.db
        .query("companionMessages")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
      aiLogs = fallback.map((m) => ({ ...m, _id: m._id as any }));
    }

    let formattedMessages = aiLogs.map((m) => ({
      _id: m._id.toString(),
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));

    if (formattedMessages.length === 0) {
      const telemetry = await ctx.db
        .query("aiMonitoringLogs")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();

      for (const t of telemetry) {
        if (t.prompt) {
          formattedMessages.push({
            _id: `${t._id}_p`,
            role: "user",
            content: t.prompt,
            createdAt: t.timestamp,
          });
        }
        if (t.aiResponse) {
          formattedMessages.push({
            _id: `${t._id}_r`,
            role: "assistant",
            content: t.aiResponse,
            createdAt: t.timestamp + 10,
          });
        }
      }
    }

    formattedMessages.sort((a, b) => a.createdAt - b.createdAt);

    return {
      patient: {
        userId: args.userId,
        patientName,
        patientIdDisplay,
        email: patient?.email || patient?.mobile_number || "N/A",
      },
      messages: formattedMessages,
    };
  }
});



