import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    emotion: v.string(),
    bodyRegions: v.array(v.string()),
    preIntensity: v.optional(v.number()),
    postIntensity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    // Rate limiting (max 5 writes per minute)
    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (!args.emotion || args.emotion.trim().length === 0) {
      throw new Error("Emotion is required.");
    }
    if (args.preIntensity !== undefined && (args.preIntensity < 1 || args.preIntensity > 10)) {
      throw new Error("preIntensity must be between 1 and 10.");
    }
    if (args.postIntensity !== undefined && (args.postIntensity < 1 || args.postIntensity > 10)) {
      throw new Error("postIntensity must be between 1 and 10.");
    }

    return await ctx.db.insert("emotionLogs", {
      userId,
      emotion: args.emotion,
      bodyRegions: args.bodyRegions,
      preIntensity: args.preIntensity,
      postIntensity: args.postIntensity,
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
      .query("emotionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(20);
  },
});
