import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/** Acknowledge an alert */
export const acknowledgeAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    if (alert.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot acknowledge alert for another user.");
    }

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
    const userId = identity.subject;

    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

/** Get all alerts for a user */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});
