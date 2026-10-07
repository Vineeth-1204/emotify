import { v } from "convex/values";
import { mutation, query } from "./functions";
import { assertCanAccessStudent, requireCounselorOrAdmin } from "./authz";

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
    await assertCanAccessStudent(ctx, args.userId);

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
    await assertCanAccessStudent(ctx, args.userId);

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

