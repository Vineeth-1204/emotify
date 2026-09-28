import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";
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
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Must be logged in to submit screening.");
    }
    const authSubject = identity.subject;

    // Authoritative caller resolution: Student can only submit for their own identity.
    // If a different args.userId is provided, caller MUST be authorized staff (admin/counselor).
    if (args.userId && args.userId !== authSubject) {
      await assertCanAccessStudent(ctx, args.userId);
    }
    const userId = (args.userId && args.userId !== authSubject) ? args.userId : authSubject;

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

    // 3. Resolve Patient ID authoritatively via canonical users._id
    let patientId: string | undefined = args.patientId;
    if (!patientId) {
      let user = null;
      try {
        user = await ctx.db.get(userId as Id<"users">);
      } catch (e) {
        // Not a valid Id<"users">, proceed to indexed fallback
      }
      if (!user) {
        user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
          .first();
      }
      if (user?.patientId) {
        patientId = user.patientId;
      }
    }

    // 4. Longitudinal escalation monitoring (check delta vs prior screening)
    let requiresAlert = triage.requiresAlert;
    let alertType: string | undefined = triage.alertType;

    const priorAttempts = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);

    const lastCompleted = priorAttempts.find((a) => a.status === "completed");
    if (lastCompleted && lastCompleted.results) {
      const prevPhq = lastCompleted.results.phq9?.score ?? 0;
      const prevGad = lastCompleted.results.gad7?.score ?? 0;
      if (phq9Result.score > prevPhq + 5 || gad7Result.score > prevGad + 5) {
        requiresAlert = true;
        alertType = alertType || "escalation";
      }
    } else {
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
    }

    // 5a. Server-Side Deterministic Attempt Type Classification
    // Safe server-side logic:
    // - If latest prior triage was "force_retest" -> "force_retest"
    // - Else if user already has a prior completed screening attempt -> "reassessment"
    // - Else (first approved screening) -> "baseline"
    const latestPriorTriageDoc = await ctx.db
      .query("triages")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    let attemptType: "baseline" | "reassessment" | "force_retest" = "baseline";
    if (latestPriorTriageDoc?.level === "force_retest") {
      attemptType = "force_retest";
    } else if (lastCompleted) {
      attemptType = "reassessment";
    } else {
      attemptType = "baseline";
    }

    // 5b. Insert Triage record
    const triageId = await ctx.db.insert("triages", {
      userId,
      level: triage.level,
      suicideFlag: triage.suicideFlag,
      psychosisFlag: triage.psychosisFlag,
      createdAt: now,
    });

    // 6. Insert authoritative Screening Attempt (supports multiple attempts non-destructively)
    const attemptId = await ctx.db.insert("screeningAttempts", {
      userId,
      patientId,
      status: "completed",
      attemptType,
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

    // 7. Establish deterministic provenance on Triage
    await ctx.db.patch(triageId, { attemptId });

    // 8. Insert Alert if triggered by clinical flags (with explicit provenance links)
    if (requiresAlert) {
      await ctx.db.insert("alerts", {
        userId,
        type: alertType || "general",
        status: "pending",
        createdAt: now,
        attemptId,
        triageId,
      });
    }

    // 8. Legacy mirror write to screenings discontinued:
    // All readers (dashboard.ts, PatientDetail.tsx via getAll, wellness.ts, triage.ts, insights.ts)
    // now query authoritative screeningAttempts. Historical screenings records remain intact for fallback.

    return {
      attemptId,
      attemptType,
      screeningId: undefined,
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
    await assertCanAccessStudent(ctx, targetUserId);

    const attempt = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "completed"))
      .first();

    return attempt ?? null;
  },
});

/** Get raw latest attempt regardless of status (e.g. for resume or inspection of abandoned/in-progress attempts) */
export const getLatestRawAttempt = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return null;
    await assertCanAccessStudent(ctx, targetUserId);

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
    await assertCanAccessStudent(ctx, targetUserId);

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
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return null;
    await assertCanAccessStudent(ctx, attempt.userId);
    return attempt;
  },
});

/** Get latest screening for a user (reads authoritative screeningAttempts with legacy fallback) */
export const getLatest = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return null;
    await assertCanAccessStudent(ctx, targetUserId);

    // Resolve stable userId if passed ID is a user _id
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

    // 1. Primary: Check authoritative screeningAttempts (completed only)
    for (const idToSearch of Array.from(searchIds)) {
      const attempt = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .order("desc")
        .filter((q) => q.eq(q.field("status"), "completed"))
        .first();

      if (attempt) {
        return {
          _id: attempt._id as any,
          userId: attempt.userId,
          attemptType: attempt.attemptType,
          phq9_total: attempt.results?.phq9?.score ?? 0,
          gad7_total: attempt.results?.gad7?.score ?? 0,
          pq16_total: attempt.results?.pq16?.score ?? 0,
          wsas_total: attempt.results?.wsas?.administered ? attempt.results.wsas.score : undefined,
          reqol10_total: attempt.results?.reqol10?.administered ? attempt.results.reqol10.score : undefined,
          phq9_item9_flag: attempt.results?.phq9?.item9Flag ?? false,
          phq9_item9_score: attempt.results?.phq9?.item9Score ?? 0,
          createdAt: attempt.completedAt || attempt.startedAt,
          attemptId: String(attempt._id),
          status: "completed",
        };
      }
    }

    // 2. Historical fallback: check legacy screenings table
    for (const idToSearch of Array.from(searchIds)) {
      const screenings = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .order("desc")
        .take(1);

      if (screenings.length > 0) return screenings[0];
    }

    return null;
  },
});

/** Get all screenings for a user (reads authoritative screeningAttempts with legacy fallback) */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let targetUserId = args.userId || identity?.subject;
    if (!targetUserId) return [];
    await assertCanAccessStudent(ctx, targetUserId);

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

    // 1. Primary: Check authoritative screeningAttempts
    const allAttempts = [];
    for (const idToSearch of Array.from(searchIds)) {
      const res = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .order("desc")
        .collect();
      allAttempts.push(...res);
    }

    const completedAttempts = allAttempts.filter((a) => a.status === "completed");
    if (completedAttempts.length > 0) {
      const seen = new Set();
      const deduplicated = completedAttempts.filter((a) => {
        if (seen.has(a._id)) return false;
        seen.add(a._id);
        return true;
      });

      return deduplicated
        .sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt))
        .map((a) => ({
          _id: a._id as any,
          userId: a.userId,
          phq9_total: a.results?.phq9?.score ?? 0,
          gad7_total: a.results?.gad7?.score ?? 0,
          pq16_total: a.results?.pq16?.score ?? 0,
          wsas_total: a.results?.wsas?.administered ? a.results.wsas.score : undefined,
          reqol10_total: a.results?.reqol10?.administered ? a.results.reqol10.score : undefined,
          phq9_item9_flag: a.results?.phq9?.item9Flag ?? false,
          phq9_item9_score: a.results?.phq9?.item9Score ?? 0,
          createdAt: a.completedAt || a.startedAt,
          attemptId: String(a._id),
        }));
    }

    // 2. Historical fallback: check legacy screenings table
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

/** Provenance: Get screening attempt together with its causally linked triage record */
export const getAttemptWithTriage = query({
  args: { attemptId: v.id("screeningAttempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return null;

    await assertCanAccessStudent(ctx, attempt.userId);

    let triage = null;
    if (attempt.triageId) {
      triage = await ctx.db.get(attempt.triageId);
    }
    if (!triage) {
      triage = await ctx.db
        .query("triages")
        .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
        .first();
    }

    return { attempt, triage };
  },
});

/** Provenance: Get all alerts causally generated from this screening attempt */
export const getAttemptAlerts = query({
  args: { attemptId: v.id("screeningAttempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return [];

    await assertCanAccessStudent(ctx, attempt.userId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .collect();
  },
});
