import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

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
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    // Resolve target student canonical identifiers (users._id and clerkId)
    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    const searchIds = new Set<string>([targetUserId]);
    if (targetUser) {
      if (targetUser._id) searchIds.add(String(targetUser._id));
      if (targetUser.clerkId) searchIds.add(targetUser.clerkId);
    }

    const allFollowUps = [];
    for (const idToSearch of Array.from(searchIds)) {
      const res = await ctx.db
        .query("followUps")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .filter((q) => q.eq(q.field("completed"), false))
        .collect();
      allFollowUps.push(...res);
    }

    // Deduplicate by _id
    const seen = new Set();
    return allFollowUps.filter((f) => {
      if (seen.has(f._id)) return false;
      seen.add(f._id);
      return true;
    });
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

/** Schedule follow-up based on triage level with causal provenance */
export const scheduleFollowUp = mutation({
  args: {
    userId: v.optional(v.string()),
    level: v.string(),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");
    const authSubject = identity.subject;

    // Authoritative student resolution: Student can only schedule for themselves.
    // If a different args.userId is provided, caller MUST be authorized staff.
    if (args.userId && args.userId !== authSubject) {
      await assertCanAccessStudent(ctx, args.userId);
    }
    const targetUserId = (args.userId && args.userId !== authSubject) ? args.userId : authSubject;

    await checkRateLimit(ctx, targetUserId, "journal_write", 5, 60000);

    // Validate provenance if provided
    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    const validStudentIds = new Set<string>([targetUserId]);
    if (targetUser) {
      if (targetUser._id) validStudentIds.add(String(targetUser._id));
      if (targetUser.clerkId) validStudentIds.add(targetUser.clerkId);
    }

    if (args.attemptId) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt) {
        throw new Error("Invalid attemptId: Screening attempt record not found.");
      }
      if (!validStudentIds.has(attempt.userId)) {
        throw new Error("Unauthorized: Screening attempt does not belong to target student.");
      }
    }

    if (args.triageId) {
      const triage = await ctx.db.get(args.triageId);
      if (!triage) {
        throw new Error("Invalid triageId: Triage record not found.");
      }
      if (!validStudentIds.has(triage.userId)) {
        throw new Error("Unauthorized: Triage record does not belong to target student.");
      }
    }

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
      userId: targetUserId,
      type: "screening_review",
      dueDate,
      completed: false,
      sourceType: args.attemptId ? "screening" : "counselor",
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: Date.now(),
    });
  },
});

