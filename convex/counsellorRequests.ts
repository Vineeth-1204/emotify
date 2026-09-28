import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { requireCounselorOrAdmin } from "./authz";

export const create = mutation({
  args: {
    user_id: v.optional(v.string()),
    thought_original: v.optional(v.string()),
    situation_text: v.optional(v.string()),
    timestamp: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    return await ctx.db.insert("counsellorRequests", {
      user_id: userId,
      thought_original: args.thought_original,
      situation_text: args.situation_text,
      timestamp: Date.now(),
      status: "pending",
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
    });
  },
});

export const updateStatus = mutation({
  args: {
    requestId: v.id("counsellorRequests"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    await ctx.db.patch(args.requestId, {
      status: args.status,
      notes: args.notes,
      updatedAt: Date.now(),
    });
  },
});

