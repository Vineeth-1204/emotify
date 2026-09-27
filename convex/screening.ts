import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import {
  scorePHQ9Responses,
  scoreGAD7Responses,
  scorePQ16Responses,
  scoreWSASResponses,
  scoreReQoL10Responses,
  evaluateClinicalTriage,
} from "./clinicalScoring";

/**
 * Authoritative Server-Side Screening Attempt Submission.
 * Receives validated item-level responses, calculates scores authoritatively,
 * evaluates clinical triage, creates safety alerts if needed, and stores
 * both the comprehensive screening attempt and a backward-compatible screening mirror.
 */
export const submitScreeningAttempt = mutation({
  args: {
    userId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    responses: v.object({
      phq9: v.record(v.string(), v.number()),
      gad7: v.record(v.string(), v.number()),
      pq16: v.record(v.string(), v.number()),
      wsas: v.optional(v.record(v.string(), v.number())),
      reqol10: v.optional(v.record(v.string(), v.number())),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || args.userId;
    if (!userId) {
      throw new Error("Unauthenticated: Must be logged in to submit screening.");
    }

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // 1. Authoritative Server-Side Scoring & Validation
    const phq9Result = scorePHQ9Responses(args.responses.phq9);
    if (!phq9Result.administered || phq9Result.error) {
      throw new Error(phq9Result.error || "PHQ-9 screening must be administered with all 9 items answered.");
    }

    const gad7Result = scoreGAD7Responses(args.responses.gad7);
    if (!gad7Result.administered || gad7Result.error) {
      throw new Error(gad7Result.error || "GAD-7 screening must be administered with all 7 items answered.");
    }

    const pq16Result = scorePQ16Responses(args.responses.pq16);
    if (!pq16Result.administered || pq16Result.error) {
      throw new Error(pq16Result.error || "PQ-16 screening must be administered with all 16 items answered.");
    }

    const wsasResult = scoreWSASResponses(args.responses.wsas);
    const reqol10Result = scoreReQoL10Responses(args.responses.reqol10);

    // 2. Authoritative Clinical Triage Evaluation
    const triage = evaluateClinicalTriage({
      phq9Score: phq9Result.score,
      item9Score: phq9Result.item9Score ?? 0,
      gad7Score: gad7Result.score,
      pq16Score: pq16Result.score,
      pq16Administered: pq16Result.administered,
    });

    const now = Date.now();

    // 3. Resolve Patient ID if not explicitly supplied
    let patientId: string | undefined = args.patientId;
    if (!patientId) {
      const user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("clerkId"), userId))
        .first();
      if (user?.patientId) {
        patientId = user.patientId;
      }
    }

    // 4. Longitudinal escalation monitoring (check delta vs prior screening)
    let requiresAlert = triage.requiresAlert;
    let alertType: string | undefined = triage.alertType;

    const previousScreenings = await ctx.db
      .query("screenings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);

    if (previousScreenings.length > 0) {
      const last = previousScreenings[0];
      if (phq9Result.score > last.phq9_total + 5 || gad7Result.score > last.gad7_total + 5) {
        requiresAlert = true;
        alertType = alertType || "escalation";
      }
    }

    // 5. Insert Triage record
    const triageId = await ctx.db.insert("triages", {
      userId,
      level: triage.level,
      suicideFlag: triage.suicideFlag,
      psychosisFlag: triage.psychosisFlag,
      createdAt: now,
    });

    // 6. Insert Alert if triggered by clinical flags
    if (requiresAlert) {
      await ctx.db.insert("alerts", {
        userId,
        type: alertType || "general",
        status: "pending",
        createdAt: now,
      });
    }

    // 7. Insert authoritative Screening Attempt (supports multiple attempts non-destructively)
    const attemptId = await ctx.db.insert("screeningAttempts", {
      userId,
      patientId,
      status: "completed",
      startedAt: args.startedAt ?? now,
      completedAt: now,
      instrumentVersions: {
        phq9: "PHQ-9.v1",
        gad7: "GAD-7.v1",
        pq16: "PQ-16.v1",
        wsas: "WSAS.v1",
        reqol10: "ReQoL-10.v1",
      },
      responses: {
        phq9: args.responses.phq9,
        gad7: args.responses.gad7,
        pq16: args.responses.pq16,
        wsas: args.responses.wsas,
        reqol10: args.responses.reqol10,
      },
      results: {
        phq9: {
          administered: true,
          score: phq9Result.score,
          maxScore: phq9Result.maxScore,
          severity: phq9Result.severity,
          level: phq9Result.level,
          item9Score: phq9Result.item9Score ?? 0,
          item9Flag: phq9Result.item9Flag ?? false,
        },
        gad7: {
          administered: true,
          score: gad7Result.score,
          maxScore: gad7Result.maxScore,
          severity: gad7Result.severity,
          level: gad7Result.level,
        },
        pq16: {
          administered: true,
          score: pq16Result.score,
          maxScore: pq16Result.maxScore,
          severity: pq16Result.severity,
          level: pq16Result.level,
        },
        wsas: {
          administered: wsasResult.administered,
          score: wsasResult.score,
          maxScore: wsasResult.maxScore,
          severity: wsasResult.severity,
          level: wsasResult.level,
        },
        reqol10: {
          administered: reqol10Result.administered,
          score: reqol10Result.score,
          maxScore: reqol10Result.maxScore,
          severity: reqol10Result.severity,
          level: reqol10Result.level,
        },
      },
      triageLevel: triage.level,
      suicideFlag: triage.suicideFlag,
      psychosisFlag: triage.psychosisFlag,
      triageId,
    });

    // 8. Mirror to legacy screenings table for counselor dashboard & historical compatibility
    const screeningId = await ctx.db.insert("screenings", {
      userId,
      phq9_total: phq9Result.score,
      gad7_total: gad7Result.score,
      pq16_total: pq16Result.score, // Genuine validated PQ-16 score (NOT 0)
      wsas_total: wsasResult.administered ? wsasResult.score : undefined,
      reqol10_total: reqol10Result.administered ? reqol10Result.score : undefined,
      phq9_item9_flag: phq9Result.item9Flag ?? false,
      phq9_item9_score: phq9Result.item9Score ?? 0,
      createdAt: now,
      attemptId: String(attemptId),
    });

    // Associate screeningId on the attempt
    await ctx.db.patch(attemptId, { screeningId });

    return {
      attemptId,
      screeningId,
      triageId,
      triageLevel: triage.level,
      suicideFlag: triage.suicideFlag,
      psychosisFlag: triage.psychosisFlag,
      results: {
        phq9: phq9Result,
        gad7: gad7Result,
        pq16: pq16Result,
        wsas: wsasResult,
        reqol10: reqol10Result,
      },
    };
  },
});

/** Legacy submit screening mutation for backwards compatibility */
export const submitScreening = mutation({
  args: {
    userId: v.optional(v.string()),
    phq9_total: v.number(),
    gad7_total: v.number(),
    pq16_total: v.number(),
    wsas_total: v.optional(v.number()),
    reqol10_total: v.optional(v.number()),
    phq9_item9_flag: v.boolean(),
    phq9_item9_score: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || args.userId;
    if (!userId) throw new Error("Unauthenticated");

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (args.phq9_total < 0 || args.gad7_total < 0 || args.pq16_total < 0 || args.phq9_item9_score < 0) {
      throw new Error("Scores cannot be negative.");
    }

    return await ctx.db.insert("screenings", {
      userId,
      phq9_total: args.phq9_total,
      gad7_total: args.gad7_total,
      pq16_total: args.pq16_total,
      wsas_total: args.wsas_total,
      reqol10_total: args.reqol10_total,
      phq9_item9_flag: args.phq9_item9_flag,
      phq9_item9_score: args.phq9_item9_score,
      createdAt: Date.now(),
    });
  },
});

/** Get latest completed screening attempt with full item responses & validated scores */
export const getLatestAttempt = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return null;

    const attempts = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(1);

    return attempts[0] ?? null;
  },
});

/** Get all screening attempts for longitudinal history */
export const getAllAttempts = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return [];

    return await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});

/** Get a single screening attempt by attempt ID */
export const getAttemptById = query({
  args: { attemptId: v.id("screeningAttempts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.attemptId);
  },
});

/** Get latest screening for a user (backward compatible for dashboard) */
export const getLatest = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return null;

    // Resolve stable userId if passed ID is a user _id
    try {
      const user: any = await ctx.db.get(targetUserId as any);
      if (user && typeof user.clerkId === "string") {
        targetUserId = user.clerkId;
      }
    } catch (e) {}

    if (!targetUserId) return null;
    const finalUserId: string = targetUserId;
    const screenings = await ctx.db
      .query("screenings")
      .withIndex("by_userId", (q) => q.eq("userId", finalUserId))
      .order("desc")
      .take(1);

    if (screenings.length > 0) return screenings[0];

    // Fallback search with args.userId directly
    const fallbackUserId = args.userId;
    if (fallbackUserId && fallbackUserId !== finalUserId) {
      const alt = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", fallbackUserId))
        .order("desc")
        .take(1);
      if (alt.length > 0) return alt[0];
    }

    return null;
  },
});

/** Get all screenings for a user (backward compatible for dashboard) */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return [];

    // Resolve stable userId / clerkId if passed ID is a database _id
    let user: any = null;
    try {
      user = await ctx.db.get(targetUserId as any);
    } catch (e) {}

    const searchIds = new Set<string>();
    if (targetUserId) searchIds.add(targetUserId);
    if (user) {
      if (user._id) searchIds.add(String(user._id));
      if (user.clerkId) searchIds.add(user.clerkId);
    }

    const allResults = [];
    for (const idToSearch of Array.from(searchIds)) {
      const res = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .order("desc")
        .collect();
      allResults.push(...res);
    }

    // Deduplicate by _id
    const seen = new Set();
    const deduplicated = allResults.filter((s) => {
      if (seen.has(s._id)) return false;
      seen.add(s._id);
      return true;
    });

    return deduplicated.sort((a, b) => b.createdAt - a.createdAt);
  },
});
