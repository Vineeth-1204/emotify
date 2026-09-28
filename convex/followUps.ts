import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    type: v.string(),
    dueDate: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    if (!args.type || args.type.trim().length === 0) {
      throw new Error("Type is required.");
    }

    return await ctx.db.insert("followUps", {
      userId,
      type: args.type,
      dueDate: args.dueDate,
      completed: false,
      sourceType: args.sourceType || "counselor",
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: Date.now(),
    });
  },
});

export const getPending = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    return await ctx.db
      .query("followUps")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
  },
});

export const markComplete = mutation({
  args: { id: v.id("followUps") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error("Follow-up not found");

    if (followUp.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot complete follow-up for another user.");
    }

    await ctx.db.patch(args.id, { completed: true });
  },
});

/** Schedule follow-up based on triage level */
export const scheduleFollowUp = mutation({
  args: { userId: v.optional(v.string()), level: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    let intervalMs = 0;
    
    switch (args.level) {
      case "mild":
        intervalMs = 30 * 24 * 60 * 60 * 1000; // 30 days
        break;
      case "moderate":
        intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        break;
      case "severe":
      case "suicide_flag":
      case "psychosis_flag":
        // Severe cases handled manually or with high frequency
        intervalMs = 2 * 24 * 60 * 60 * 1000; // 2 days for check-in
        break;
      default:
        intervalMs = 14 * 24 * 60 * 60 * 1000; // 14 days default
    }

    const dueDate = Date.now() + intervalMs;
    
    return await ctx.db.insert("followUps", {
      userId,
      type: "screening_review",
      dueDate,
      completed: false,
      createdAt: Date.now(),
    });
  },
});
