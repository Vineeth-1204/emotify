import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  getAuthenticatedUser,
  requireAdmin,
  requireCounselorOrAdmin,
  assertCanAccessStudent,
} from "./authz";

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

    // For dashboard overview, we count triages belonging to active enrolled patients
    const rawTriages = await ctx.db.query("triages").collect();
    const triages = rawTriages.filter((t) => t.userId && patientIdMap.has(t.userId.toString()));

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

    // Severe / Critical Risk: Calculate based on LATEST triage per enrolled patient (not raw historical log count or unmapped aliases)
    const latestTriageByPatient: Record<string, any> = {};
    for (const t of triages) {
      const canonicalId = patientIdMap.get(t.userId.toString())!;
      if (!latestTriageByPatient[canonicalId] || (t.createdAt || 0) > (latestTriageByPatient[canonicalId].createdAt || 0)) {
        latestTriageByPatient[canonicalId] = t;
      }
    }

    const latestTriagesList = Object.values(latestTriageByPatient);
    const severeCases = latestTriagesList.filter(
      (t) => t.level === "severe" || t.level === "suicide_flag" || t.level === "psychosis_flag" || t.suicideFlag || t.psychosisFlag
    ).length;

    const suicideRisks = latestTriagesList.filter((t) => t.suicideFlag || t.level === "suicide_flag").length;
    const psychosisRisks = latestTriagesList.filter((t) => t.psychosisFlag || t.level === "psychosis_flag").length;

    // Generate real trend data for the last 7 days based on triages
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 86399999;

      const dayTriages = triages.filter(t => t.createdAt >= startOfDay && t.createdAt <= endOfDay);
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

    // Fetch all explicitly logged alert records
    let dbAlerts = await ctx.db.query("alerts").order("desc").collect();

    // If student, filter ONLY their own clinical alerts
    if (!isStaff) {
      const canonicalId = caller ? String(caller._id) : callerId;
      const legacyId = caller?.clerkId;
      dbAlerts = dbAlerts.filter(
        (a) => a.userId === canonicalId || (legacyId && a.userId === legacyId) || a.userId === callerId
      );
    }
    
    // Fetch all active patients
    const patients = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .collect();

    const patientMap = new Map<string, any>();
    for (const p of patients) {
      patientMap.set(p._id.toString(), p);
      if (p.clerkId) {
        patientMap.set(p.clerkId, p);
      }
    }

    // Fetch latest triage per patient to ensure real-time triage flags generate live alerts if not already in alerts table
    const rawTriages = await ctx.db.query("triages").order("desc").collect();
    const latestTriageByPatient: Record<string, any> = {};
    for (const t of rawTriages) {
      if (t.userId && patientMap.has(t.userId.toString())) {
        const canonicalId = patientMap.get(t.userId.toString())!._id.toString();
        if (!latestTriageByPatient[canonicalId] || (t.createdAt || 0) > (latestTriageByPatient[canonicalId].createdAt || 0)) {
          latestTriageByPatient[canonicalId] = t;
        }
      }
    }

    const alertUserIds = new Set(dbAlerts.map(a => a.userId.toString()));
    const synthesizedAlerts: any[] = [...dbAlerts];

    // For any patient whose latest triage has suicideFlag or psychosisFlag or severe level, ensure an active alert exists
    for (const [canonicalId, triage] of Object.entries(latestTriageByPatient)) {
      if (!isStaff && canonicalId !== callerId && canonicalId !== (caller ? String(caller._id) : "") && canonicalId !== (caller?.clerkId || "")) {
        continue;
      }
      const patient = patientMap.get(canonicalId);
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
      let patient = null;
      try {
        patient = await ctx.db.get(alert.userId as Id<"users">);
      } catch (e) {}
      if (!patient && alert.userId) {
        patient = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", alert.userId))
          .first();
      }

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

    let alerts = await ctx.db.query("alerts").order("desc").take(isStaff ? 15 : 50);
    let emotionLogs = await ctx.db.query("emotionLogs").order("desc").take(isStaff ? 15 : 50);
    let microGoals = await ctx.db.query("microGoals").order("desc").take(isStaff ? 15 : 50);

    if (!isStaff) {
      const canonicalId = caller ? String(caller._id) : callerId;
      const legacyId = caller?.clerkId;
      const matchesCaller = (uid: string) => uid === canonicalId || (legacyId && uid === legacyId) || uid === callerId;
      alerts = alerts.filter(a => matchesCaller(a.userId));
      emotionLogs = emotionLogs.filter(e => matchesCaller(e.userId));
      microGoals = microGoals.filter(m => matchesCaller(m.userId));
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

    await ctx.db.patch(args.alertId, {
      status: args.status,
      acknowledgedAt: Date.now(),
    });
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

    // 8. Somatic & Relaxation Data (JPMR & Emotion Maps)
    const jpmrLogs = await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q: any) => q.eq("userId", resolvedUserId))
      .collect();

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

export const listAllCbtSessions = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    const sessions = await ctx.db
      .query("cbtSessions")
      .order("desc")
      .take(50);

    const results = [];
    for (const session of sessions) {
      const patientName = await getPatientName(ctx, session.userId);
      results.push({
        ...session,
        patientName,
      });
    }
    return results;
  }
});

export const getCounsellorRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    const requests = await ctx.db
      .query("counsellorRequests")
      .order("desc")
      .take(50);

    const results = [];
    for (const req of requests) {
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
    return results;
  }
});

export const getAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "admin") return [];

    const logs = await ctx.db.query("auditLogs").order("desc").take(100);
    const results = [];

    for (const log of logs) {
      let patientName = "System / Admin";
      if (log.userId) {
        patientName = await getPatientName(ctx, log.userId);
      }
      results.push({
        ...log,
        patientName,
      });
    }

    return results;
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
      title: args.title,
      description: args.description,
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
export const getNotifications = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db.query("notifications").order("desc").take(50);
  }
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    await ctx.db.patch(args.notificationId, { read: true });
  }
});

// ENTERPRISE ANALYTICS METRICS
export const getEnterpriseAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return null;

    const users = await ctx.db.query("users").collect();
    const patients = users.filter(u => u.role === "patient");

    const patientIdMap = new Map<string, string>();
    for (const p of patients) {
      const canonicalId = p._id.toString();
      patientIdMap.set(canonicalId, canonicalId);
      if (p.clerkId) {
        patientIdMap.set(p.clerkId, canonicalId);
      }
    }

    const sessions = await ctx.db.query("cbtSessions").collect();
    const rawTriages = await ctx.db.query("triages").collect();
    const triages = rawTriages.filter((t) => t.userId && patientIdMap.has(t.userId.toString()));
    const rawAttempts = await ctx.db.query("screeningAttempts").collect();
    const completedAttempts = rawAttempts.filter(
      (a) => a.status === "completed" && a.userId && patientIdMap.has(a.userId.toString())
    );
    const emotionLogs = await ctx.db.query("emotionLogs").collect();

    const latestTriageByPatient: Record<string, any> = {};
    for (const t of triages) {
      const canonicalId = patientIdMap.get(t.userId.toString())!;
      if (!latestTriageByPatient[canonicalId] || (t.createdAt || 0) > (latestTriageByPatient[canonicalId].createdAt || 0)) {
        latestTriageByPatient[canonicalId] = t;
      }
    }
    const latestTriagesList = Object.values(latestTriageByPatient);

    // Calculate PHQ / GAD averages from authoritative attempts, falling back to legacy screenings
    let totalPhq = 0;
    let totalGad = 0;
    let count = 0;

    if (completedAttempts.length > 0) {
      for (const a of completedAttempts) {
        if (a.results?.phq9?.score !== undefined) {
          totalPhq += a.results.phq9.score;
          totalGad += a.results.gad7.score;
          count++;
        }
      }
    } else {
      const fallbackScreenings = await ctx.db.query("screenings").collect();
      fallbackScreenings.forEach((s) => {
        totalPhq += s.phq9_total;
        totalGad += s.gad7_total;
      });
      count = fallbackScreenings.length;
    }

    const avgPhq = count > 0 ? (totalPhq / count).toFixed(1) : "0";
    const avgGad = count > 0 ? (totalGad / count).toFixed(1) : "0";

    return {
      totalPatients: patients.length,
      dau: Math.round(patients.length * 0.45),
      wau: Math.round(patients.length * 0.75),
      mau: patients.length,
      totalSessions: sessions.length,
      completedSessions: sessions.filter(s => s.sessionStatus === "completed").length,
      avgPhqScore: avgPhq,
      avgGadScore: avgGad,
      riskDistribution: {
        mild: latestTriagesList.filter(t => t.level === "mild").length,
        moderate: latestTriagesList.filter(t => t.level === "moderate").length,
        severe: latestTriagesList.filter(t => t.level === "severe" || t.suicideFlag || t.psychosisFlag).length,
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
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      return {
        users: [],
        stats: { totalUsers: 0, totalMessages: 0, activeToday: 0, highRiskFlags: 0 }
      };
    }

    const companionLogs = await ctx.db.query("aiCompanionLogs").collect();
    const fallbackMessages = await ctx.db.query("companionMessages").collect();
    const telemetryLogs = await ctx.db.query("aiMonitoringLogs").collect();

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
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      return { patient: null, messages: [] };
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



