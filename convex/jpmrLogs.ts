import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    completed: v.boolean(),
    durationSeconds: v.number(),
    preIntensity: v.number(),
    postIntensity: v.number(),
    startedAt: v.number(),
    completedAt: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (args.preIntensity < 1 || args.preIntensity > 10) {
      throw new Error("preIntensity must be between 1 and 10.");
    }
    if (args.postIntensity < 1 || args.postIntensity > 10) {
      throw new Error("postIntensity must be between 1 and 10.");
    }
    if (args.durationSeconds < 0) {
      throw new Error("durationSeconds cannot be negative.");
    }

    return await ctx.db.insert("jpmrLogs", {
      userId,
      completed: args.completed,
      durationSeconds: args.durationSeconds,
      preIntensity: args.preIntensity,
      postIntensity: args.postIntensity,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: Date.now(),
    });
  },
});

export const getRecent = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(20);
  },
});
