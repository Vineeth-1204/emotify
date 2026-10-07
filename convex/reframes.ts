import { v } from "convex/values";
import { mutation, query } from "./functions";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    situation: v.string(),
    originalThought: v.string(),
    thinkingTrap: v.string(),
    guidedAnswers: v.array(v.string()),
    newThought: v.string(),
    preIntensity: v.number(),
    postIntensity: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    cbtSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (args.preIntensity < 1 || args.preIntensity > 10 || args.postIntensity < 1 || args.postIntensity > 10) {
      throw new Error("Intensities must be between 1 and 10.");
    }
    if (!args.situation.trim() || !args.originalThought.trim() || !args.newThought.trim()) {
      throw new Error("Text fields cannot be empty.");
    }

    // Redirect new writes to authoritative reframeLogs table
    const improvementPercentage = args.preIntensity > 0
      ? Math.max(0, Math.round(((args.preIntensity - args.postIntensity) / args.preIntensity) * 100))
      : 0;

    return await ctx.db.insert("reframeLogs", {
      userId,
      situation_text: args.situation,
      thought_original: args.originalThought,
      thinking_trap_choice: args.thinkingTrap,
      guided_answers: args.guidedAnswers,
      reframe_text: args.newThought,
      pre_reframe_intensity: args.preIntensity,
      post_reframe_intensity: args.postIntensity,
      improvement_percentage: improvementPercentage,
      saved_reframe_flag: true,
      favorite: false,
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      cbtSessionId: args.cbtSessionId,
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

    // Read from authoritative reframeLogs first
    const logs = await ctx.db
      .query("reframeLogs")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(20);

    if (logs.length > 0) {
      return logs.map((l) => ({
        _id: l._id as any,
        userId: l.userId,
        situation: l.situation_text,
        originalThought: l.thought_original,
        thinkingTrap: l.thinking_trap_choice,
        guidedAnswers: l.guided_answers,
        newThought: l.reframe_text,
        preIntensity: l.pre_reframe_intensity,
        postIntensity: l.post_reframe_intensity,
        createdAt: l.createdAt,
      }));
    }

    // Historical fallback if user only has legacy reframes
    return await ctx.db
      .query("reframes")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(20);
  },
});

// --- NEW REFRAME LOGS MUTATIONS & QUERIES ---

export const createLog = mutation({
  args: {
    userId: v.optional(v.string()),
    situation_text: v.string(),
    thought_original: v.string(),
    thinking_trap_choice: v.string(),
    guided_answers: v.array(v.string()),
    reframe_text: v.string(),
    pre_reframe_intensity: v.number(),
    post_reframe_intensity: v.number(),
    improvement_percentage: v.number(),
    saved_reframe_flag: v.boolean(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    cbtSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (args.pre_reframe_intensity < 1 || args.pre_reframe_intensity > 10 || args.post_reframe_intensity < 1 || args.post_reframe_intensity > 10) {
      throw new Error("Intensities must be between 1 and 10.");
    }
    if (!args.situation_text.trim() || !args.thought_original.trim() || !args.reframe_text.trim()) {
      throw new Error("Text fields cannot be empty.");
    }

    return await ctx.db.insert("reframeLogs", {
      userId,
      situation_text: args.situation_text,
      thought_original: args.thought_original,
      thinking_trap_choice: args.thinking_trap_choice,
      guided_answers: args.guided_answers,
      reframe_text: args.reframe_text,
      pre_reframe_intensity: args.pre_reframe_intensity,
      post_reframe_intensity: args.post_reframe_intensity,
      improvement_percentage: args.improvement_percentage,
      saved_reframe_flag: args.saved_reframe_flag,
      favorite: false,
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      cbtSessionId: args.cbtSessionId,
      createdAt: Date.now(),
    });
  },
});

export const updateLog = mutation({
  args: {
    id: v.id("reframeLogs"),
    reframe_text: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Log not found");

    if (item.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot update log for another user.");
    }

    if (!args.reframe_text.trim()) {
      throw new Error("Reframe text cannot be empty.");
    }

    await ctx.db.patch(args.id, { reframe_text: args.reframe_text });
  },
});

export const removeLog = mutation({
  args: {
    id: v.id("reframeLogs"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Log not found");

    if (item.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot delete log for another user.");
    }

    await ctx.db.delete(args.id);
  },
});

export const toggleFavoriteLog = mutation({
  args: {
    id: v.id("reframeLogs"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Log not found");

    if (item.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot toggle favorite log for another user.");
    }

    await ctx.db.patch(args.id, { favorite: !item.favorite });
  },
});

export const getRecentLogs = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("reframeLogs")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});
