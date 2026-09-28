import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    emotionLabel: v.string(),
    selectedRegions: v.array(v.string()),
    bodyRatings: v.array(
      v.object({
        region: v.string(),
        intensity: v.number(),
      })
    ),
    averageIntensity: v.number(),
    suggestedAction: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // Validation
    if (!args.emotionLabel || args.emotionLabel.trim().length === 0) {
      throw new Error("Emotion label is required.");
    }

    if (
      typeof args.averageIntensity !== "number" ||
      isNaN(args.averageIntensity) ||
      args.averageIntensity < 1 ||
      args.averageIntensity > 10
    ) {
      throw new Error("averageIntensity must be a valid number between 1 and 10.");
    }

    if (!Array.isArray(args.bodyRatings) || args.bodyRatings.length === 0) {
      throw new Error("bodyRatings must be a non-empty array.");
    }

    for (const rating of args.bodyRatings) {
      if (
        typeof rating.intensity !== "number" ||
        isNaN(rating.intensity) ||
        rating.intensity < 1 ||
        rating.intensity > 10
      ) {
        throw new Error(`Rating intensity for region '${rating.region}' must be a valid number between 1 and 10.`);
      }
    }

    return await ctx.db.insert("emotionMaps", {
      userId,
      emotionLabel: args.emotionLabel,
      selectedRegions: args.selectedRegions,
      bodyRatings: args.bodyRatings,
      averageIntensity: args.averageIntensity,
      suggestedAction: args.suggestedAction,
      createdAt: Date.now(),
    });
  },
});

export const getRecentLogs = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) return [];
    const targetUserId = args.userId || identity.subject;

    // Enforce student isolation and authorized staff access
    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("emotionMaps")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(50);
  },
});
