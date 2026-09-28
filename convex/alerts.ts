import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertCanAccessStudent, requireCounselorOrAdmin } from "./authz";

/** Create a new alert */
export const createAlert = mutation({
  args: {
    userId: v.optional(v.string()),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    // Validate type
    if (!args.type || args.type.trim().length === 0) {
      throw new Error("Alert type is required.");
    }
    if (args.type.length > 100) {
      throw new Error("Alert type too long.");
    }

    console.log(`[ALERT TRIGGERED] User: ${userId}, Type: ${args.type}`);
    console.log(`[TIME] ${new Date().toISOString()}`);
    console.log(`[STATUS] PENDING — Counselor notification required`);

    return await ctx.db.insert("alerts", {
      userId,
      type: args.type,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** Acknowledge an alert (Counselor or Admin only) */
export const acknowledgeAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    await assertCanAccessStudent(ctx, alert.userId);

    await ctx.db.patch(args.alertId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
  },
});

/** Get pending alerts for a user */
export const getPending = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    let user: any = null;
    try {
      user = await ctx.db.get(targetUserId as any);
    } catch {}

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q: any) => q.eq("clerkId", targetUserId))
        .first();
    }

    const searchIds = new Set<string>([targetUserId]);
    if (user) {
      if (user._id) searchIds.add(String(user._id));
      if (user.clerkId) searchIds.add(user.clerkId);
    }

    const allPending: any[] = [];
    for (const idToSearch of Array.from(searchIds)) {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();
      allPending.push(...alerts);
    }

    const seen = new Set<string>();
    return allPending
      .filter((a) => {
        const idStr = String(a._id);
        if (seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
});

/** Get all alerts for a user */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});

/** Provenance: Get safety alert along with its causal originating triage and screening attempt */
export const getAlertProvenance = query({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) return null;

    await assertCanAccessStudent(ctx, alert.userId);

    const triage = alert.triageId ? await ctx.db.get(alert.triageId) : null;
    const attempt = alert.attemptId ? await ctx.db.get(alert.attemptId) : null;

    return { alert, triage, attempt };
  },
});

/** Provenance: Get all alerts causally generated from a specific triage */
export const getTriageAlerts = query({
  args: { triageId: v.id("triages") },
  handler: async (ctx, args) => {
    const triage = await ctx.db.get(args.triageId);
    if (!triage) return [];

    await assertCanAccessStudent(ctx, triage.userId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_triageId", (q) => q.eq("triageId", triage._id))
      .collect();
  },
});

