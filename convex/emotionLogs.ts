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
    selectedEmotions: v.optional(v.array(v.string())),
    strongestEmotion: v.optional(v.string()),
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
    if (args.selectedEmotions !== undefined) {
      if (!Array.isArray(args.selectedEmotions) || args.selectedEmotions.length === 0) {
        throw new Error("selectedEmotions cannot be empty.");
      }
      for (const e of args.selectedEmotions) {
        if (!e || typeof e !== "string" || e.trim().length === 0) {
          throw new Error("Each selected emotion must be a non-empty string.");
        }
      }
      if (args.strongestEmotion !== undefined) {
        const found = args.selectedEmotions.some(
          (e) => e.trim().toLowerCase() === args.strongestEmotion!.trim().toLowerCase()
        );
        if (!found) {
          throw new Error("strongestEmotion must be one of the selected emotions.");
        }
      }
    }
    if (args.preIntensity !== undefined && (args.preIntensity < 1 || args.preIntensity > 10)) {
      throw new Error("preIntensity must be between 1 and 10.");
    }
    if (args.postIntensity !== undefined && (args.postIntensity < 1 || args.postIntensity > 10)) {
      throw new Error("postIntensity must be between 1 and 10.");
    }

    const resolvedStrongest =
      args.strongestEmotion ??
      (args.selectedEmotions && args.selectedEmotions.length === 1
        ? args.selectedEmotions[0]
        : args.emotion);

    return await ctx.db.insert("emotionLogs", {
      userId,
      emotion: resolvedStrongest || args.emotion,
      bodyRegions: args.bodyRegions,
      preIntensity: args.preIntensity,
      postIntensity: args.postIntensity,
      selectedEmotions: args.selectedEmotions,
      strongestEmotion: resolvedStrongest,
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

/**
 * Phase 3 — Post-Intervention Check
 * Patches postIntensity onto an existing emotionLog record after genuine intervention completion.
 * Used only when the user provides a post-intervention self-report through the Mitra follow-up step.
 * Does NOT create a new record. Does NOT accept clinical scores.
 */
export const recordPostIntensity = mutation({
  args: {
    logId: v.id("emotionLogs"),
    postIntensity: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    // Rate limiting — shares the journal_write bucket
    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    if (args.postIntensity < 1 || args.postIntensity > 10) {
      throw new Error("postIntensity must be between 1 and 10.");
    }

    const record = await ctx.db.get(args.logId);
    if (!record) throw new Error("Emotion log not found.");
    if (record.userId !== userId) throw new Error("Unauthorized: Cannot update another user's emotion log.");

    // Only patch if not already set (prevent double-recording)
    if (record.postIntensity !== undefined) {
      return args.logId; // idempotent — already recorded
    }

    await ctx.db.patch(args.logId, { postIntensity: args.postIntensity });
    return args.logId;
  },
});

