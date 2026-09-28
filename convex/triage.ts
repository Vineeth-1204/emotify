import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent, requireCounselorOrAdmin } from "./authz";

/** Run triage logic and save result, checking for escalation/improvement */
export const processTriage = mutation({
  args: {
    userId: v.optional(v.string()),
    phq9_total: v.number(),
    gad7_total: v.number(),
    pq16_total: v.number(),
    wsas_total: v.optional(v.number()),
    reqol10_total: v.optional(v.number()),
    phq9_item9_score: v.number(),
    attemptId: v.optional(v.id("screeningAttempts")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    const { phq9_total, gad7_total, pq16_total, phq9_item9_score } = args;
    if (phq9_total < 0 || gad7_total < 0 || pq16_total < 0 || phq9_item9_score < 0) {
      throw new Error("Scores cannot be negative.");
    }

    let level: string = "mild";
    let suicideFlag = false;
    let psychosisFlag = false;
    let requiresAlert = false;
    let alertType: string | undefined = undefined;

    // Logic from utils/triage.ts
    if (phq9_item9_score > 0) {
      level = "suicide_flag";
      suicideFlag = true;
      requiresAlert = true;
      alertType = "suicide";
    } else if (pq16_total >= 6) {
      level = "psychosis_flag";
      psychosisFlag = true;
      requiresAlert = true;
      alertType = "psychosis";
    } else if (phq9_total >= 15 || gad7_total >= 15) {
      level = "severe";
      requiresAlert = true;
      alertType = "severe";
    } else if (
      (phq9_total >= 10 && phq9_total <= 14) ||
      (gad7_total >= 10 && gad7_total <= 14)
    ) {
      level = "moderate";
    } else {
      level = "mild";
    }

    // Monitoring: check for escalation relative to previous screening (PHQ-9 or GAD-7)
    const attempts = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(2);

    const completed = attempts.filter((a) => a.status === "completed");
    if (completed.length > 1) {
      const last = completed[1];
      const prevPhq = last.results?.phq9?.score ?? 0;
      const prevGad = last.results?.gad7?.score ?? 0;
      if (phq9_total > prevPhq + 5 || gad7_total > prevGad + 5) {
        requiresAlert = true;
        alertType = "escalation";
      }
    } else {
      const previousScreening = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(2);

      if (previousScreening.length > 1) {
        const last = previousScreening[1];
        if (phq9_total > last.phq9_total + 5 || gad7_total > last.gad7_total + 5) {
          requiresAlert = true;
          alertType = "escalation";
        }
      }
    }

    const triageId = await ctx.db.insert("triages", {
      userId,
      level,
      suicideFlag,
      psychosisFlag,
      attemptId: args.attemptId,
      createdAt: Date.now(),
    });

    if (requiresAlert) {
      await ctx.db.insert("alerts", {
        userId,
        type: alertType || "general",
        status: "pending",
        createdAt: Date.now(),
        attemptId: args.attemptId,
        triageId,
      });
    }

    return { level, triageId };
  },
});

/** Get latest triage for a specific user (used by admin or given userId) */
export const getLatestByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Assert authorization: Student can only view their own triage; Counselor/Admin can view any student's triage
    await assertCanAccessStudent(ctx, args.userId);

    // 1. Primary path: query by canonical userId (users._id)
    const triages = await ctx.db
      .query("triages")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(1);
    if (triages.length > 0) return triages[0];

    // 2. Deterministic fallback for legacy callers passing clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
      .first();

    if (user) {
      const canonicalTriages = await ctx.db
        .query("triages")
        .withIndex("by_userId", (q) => q.eq("userId", String(user._id)))
        .order("desc")
        .take(1);
      if (canonicalTriages.length > 0) return canonicalTriages[0];
    }

    return null;
  },
});

/** Admin / Counsellor mutation to trigger a screening test requirement for any patient */
export const triggerScreeningTest = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Only Counselor or Admin can perform administrative clinical triggers
    await requireCounselorOrAdmin(ctx);

    const triageId = await ctx.db.insert("triages", {
      userId: args.userId,
      level: "force_retest",
      suicideFlag: false,
      psychosisFlag: false,
      createdAt: Date.now(),
    });

    return { success: true, triageId };
  },
});

/** Admin / Counsellor mutation to unblock a severe patient with 3 actions */
export const unblockPatient = mutation({
  args: {
    userId: v.string(),
    action: v.union(v.literal("switch_moderate"), v.literal("switch_low"), v.literal("force_retest")),
  },
  handler: async (ctx, args) => {
    // Only Counselor or Admin can perform clinical triage overrides & alert resolution
    const caller = await requireCounselorOrAdmin(ctx);

    let newLevel = "mild";
    if (args.action === "switch_moderate") {
      newLevel = "moderate";
    } else if (args.action === "switch_low") {
      newLevel = "mild";
    } else if (args.action === "force_retest") {
      newLevel = "force_retest";
    }

    const triageId = await ctx.db.insert("triages", {
      userId: args.userId,
      level: newLevel,
      suicideFlag: false,
      psychosisFlag: false,
      createdAt: Date.now(),
    });

    // Resolve any pending alerts for this patient
    const pendingAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const alert of pendingAlerts) {
      await ctx.db.patch(alert._id, { status: "resolved" });
    }

    // Auto record audit log for clinical safety compliance
    await ctx.db.insert("auditLogs", {
      userId: String(caller._id),
      action: "UNBLOCK_PATIENT",
      details: `Unblocked patient ${args.userId} with action '${args.action}'. New level set to '${newLevel}'.`,
      timestamp: Date.now(),
    });

    return { success: true, newLevel, triageId };
  },
});

/** Get latest triage for current user or authorized student */
export const getLatest = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    let triages = await ctx.db
      .query("triages")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(1);

    if (triages.length > 0) return triages[0];

    // Fallback if targetUserId is a legacy clerkId or canonical conversion
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
      .first();

    if (user) {
      triages = await ctx.db
        .query("triages")
        .withIndex("by_userId", (q) => q.eq("userId", String(user._id)))
        .order("desc")
        .take(1);
      if (triages.length > 0) return triages[0];
    }

    return null;
  },
});

/** Provenance: Get triage record along with its originating screening attempt */
export const getTriageWithAttempt = query({
  args: { triageId: v.id("triages") },
  handler: async (ctx, args) => {
    const triage = await ctx.db.get(args.triageId);
    if (!triage) return null;

    await assertCanAccessStudent(ctx, triage.userId);

    let attempt = null;
    if (triage.attemptId) {
      attempt = await ctx.db.get(triage.attemptId);
    }
    if (!attempt) {
      attempt = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_triageId", (q) => q.eq("triageId", triage._id))
        .first();
    }

    return { triage, attempt };
  },
});

