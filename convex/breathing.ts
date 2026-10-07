/**
 * Breathing Intervention Persistence Module
 * Priority 9 Step 4B - Backend Mutation & Query Handlers
 *
 * Implements row-level student authorization, rate limiting, and clinical provenance tracking.
 */

import { v } from "convex/values";
import { mutation, query } from "./functions";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

const VALID_STATUSES = ["completed", "partial", "abandoned"] as const;
const VALID_SOURCES = [
  "self_initiated",
  "emotion_map",
  "cbt_support",
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
    cyclesCompleted: v.number(),
    targetCycles: v.number(),
    status: v.string(),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Valid session required to log breathing session.");
    }
    const userId = identity.subject;

    // Apply rate limiting (max 10 breathing log writes per minute)
    await checkRateLimit(ctx, userId, "breathing_log_create", 10, 60000);

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

    // Duration and cycle validation
    if (typeof args.durationSeconds !== "number" || isNaN(args.durationSeconds) || args.durationSeconds < 0) {
      throw new Error("durationSeconds must be a non-negative number.");
    }
    if (typeof args.cyclesCompleted !== "number" || isNaN(args.cyclesCompleted) || args.cyclesCompleted < 0) {
      throw new Error("cyclesCompleted must be a non-negative integer.");
    }
    if (typeof args.targetCycles !== "number" || isNaN(args.targetCycles) || args.targetCycles < 1) {
      throw new Error("targetCycles must be at least 1.");
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

    return await ctx.db.insert("breathingLogs", {
      userId,
      protocolId: args.protocolId,
      protocolName: args.protocolName,
      sourceType: args.sourceType,
      startedAt: args.startedAt,
      completedAt: args.completedAt ?? now,
      durationSeconds: Math.round(args.durationSeconds),
      cyclesCompleted: Math.floor(args.cyclesCompleted),
      targetCycles: Math.floor(args.targetCycles),
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
      .query("breathingLogs")
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
      .query("breathingLogs")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .first();

    return latest;
  },
});
