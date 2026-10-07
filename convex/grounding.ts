/**
 * Sensory Grounding Intervention Persistence Module
 * Priority 9 Step 5B — Backend Mutation & Query Handlers
 *
 * Implements row-level student authorization, rate limiting, and clinical provenance tracking.
 * Strictly enforces zero free-text storage and zero environmental/surveillance data capture.
 */

import { v } from "convex/values";
import { mutation, query } from "./functions";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

const VALID_STATUSES = ["completed", "partial", "abandoned"] as const;
const VALID_SOURCES = [
  "self_initiated",
  "cbt_support",
  "emotion_map",
  "crisis_blocker",
  "micro_goal",
  "counselor_recommended",
  "routine",
] as const;

export const logSession = mutation({
  args: {
    protocolId: v.string(),
    protocolName: v.string(),
    sourceType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationSeconds: v.number(),
    stepsCompleted: v.number(),
    totalSteps: v.optional(v.number()),
    status: v.string(),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Valid session required to log sensory grounding session.");
    }
    const userId = identity.subject;

    // Apply rate limiting (max 10 grounding log writes per minute)
    await checkRateLimit(ctx, userId, "grounding_log_create", 10, 60000);

    // Protocol validations
    if (!args.protocolId || args.protocolId.trim().length === 0) {
      throw new Error("Invalid protocolId: protocolId is required.");
    }
    if (!args.protocolName || args.protocolName.trim().length === 0) {
      throw new Error("Invalid protocolName: protocolName is required.");
    }

    // Status validation
    if (!VALID_STATUSES.includes(args.status as any)) {
      throw new Error(
        `Invalid status '${args.status}'. Must be one of: ${VALID_STATUSES.join(", ")}.`
      );
    }

    // Source validation
    if (!VALID_SOURCES.includes(args.sourceType as any)) {
      throw new Error(
        `Invalid sourceType '${args.sourceType}'. Must be one of: ${VALID_SOURCES.join(", ")}.`
      );
    }

    // Duration and step validation
    if (typeof args.durationSeconds !== "number" || isNaN(args.durationSeconds) || args.durationSeconds < 0) {
      throw new Error("durationSeconds must be a non-negative number.");
    }
    if (typeof args.stepsCompleted !== "number" || isNaN(args.stepsCompleted) || args.stepsCompleted < 0 || args.stepsCompleted > 5) {
      throw new Error("stepsCompleted must be an integer between 0 and 5.");
    }

    const totalSteps = args.totalSteps ?? 5;
    if (typeof totalSteps !== "number" || totalSteps < 1) {
      throw new Error("totalSteps must be at least 1.");
    }

    // Optional screening attempt provenance validation
    if (args.attemptId) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt || attempt.userId !== userId) {
        throw new Error("Invalid attemptId: Referenced screening attempt does not belong to user.");
      }
    }

    // Optional triage provenance validation
    if (args.triageId) {
      const triage = await ctx.db.get(args.triageId);
      if (!triage || triage.userId !== userId) {
        throw new Error("Invalid triageId: Referenced triage record does not belong to user.");
      }
    }

    const now = Date.now();

    return await ctx.db.insert("groundingLogs", {
      userId,
      protocolId: args.protocolId,
      protocolName: args.protocolName,
      sourceType: args.sourceType,
      startedAt: args.startedAt,
      completedAt: args.completedAt ?? now,
      durationSeconds: Math.round(args.durationSeconds),
      stepsCompleted: Math.floor(args.stepsCompleted),
      totalSteps: Math.floor(totalSteps),
      status: args.status,
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: now,
    });
  },
});

export const getUserLogs = query({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated");
    }

    const targetUserId = args.userId || identity.subject;

    // Enforces student self-access OR authorized counselor access
    await assertCanAccessStudent(ctx, targetUserId);

    const logs = await ctx.db
      .query("groundingLogs")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(args.limit ?? 50);

    return logs;
  },
});

export const getRecentSession = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      return null;
    }

    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const latest = await ctx.db
      .query("groundingLogs")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .first();

    return latest;
  },
});
