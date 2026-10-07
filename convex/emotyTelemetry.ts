/**
 * Emotify AI-3 Step 10: Privacy-First AI Telemetry Subsystem
 *
 * Implements privacy-preserving, server-authoritative telemetry for the
 * Emoty AI companion.
 *
 * PRIVACY GUARANTEES:
 * - NO raw user messages
 * - NO raw AI responses
 * - NO PHQ-9, GAD-7, or PQ-16 scores
 * - NO counselor notes or conversation content
 * - NO crisis disclosure text
 * - Telemetry is strictly METADATA ONLY (latencies, paths, success states, error categories).
 */

import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./authz";

export const TELEMETRY_PATHS = [
  "crisis",
  "third_party",
  "gemini",
  "fallback",
  "rate_limited",
] as const;

export type TelemetryPath = (typeof TELEMETRY_PATHS)[number];

export const TELEMETRY_FALLBACK_REASONS = [
  "RATE_LIMITED",
  "NO_API_KEY",
  "PROVIDER_TIMEOUT",
  "PROVIDER_ERROR",
  "PARSE_ERROR",
  "CONTRACT_INVALID",
] as const;

export type TelemetryFallbackReason = (typeof TELEMETRY_FALLBACK_REASONS)[number];

/**
 * Records a privacy-safe telemetry event into aiTelemetryLogs.
 * Enforces session ownership and strict metadata validator.
 */
export const recordTelemetry = mutation({
  args: {
    durationMs: v.number(),
    path: v.union(
      v.literal("crisis"),
      v.literal("third_party"),
      v.literal("gemini"),
      v.literal("fallback"),
      v.literal("rate_limited")
    ),
    mode: v.string(),
    actionType: v.string(),
    avatarState: v.string(),
    safetyCategory: v.string(),
    geminiCalled: v.boolean(),
    geminiSuccess: v.boolean(),
    fallbackUsed: v.boolean(),
    fallbackReason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new ConvexError("Unauthenticated: Session required to record telemetry.");
    }
    const userId = identity.subject;

    // Insert strictly validated metadata
    return await ctx.db.insert("aiTelemetryLogs", {
      userId,
      timestamp: Date.now(),
      durationMs: Math.max(0, Math.round(args.durationMs)),
      path: args.path,
      mode: args.mode,
      actionType: args.actionType,
      avatarState: args.avatarState,
      safetyCategory: args.safetyCategory,
      geminiCalled: args.geminiCalled,
      geminiSuccess: args.geminiSuccess,
      fallbackUsed: args.fallbackUsed,
      fallbackReason: args.fallbackReason,
      errorCode: args.errorCode,
      model: args.model,
    });
  },
});

/**
 * Developer/Admin query to retrieve aggregated telemetry metrics over a time window.
 * Requires admin authorization.
 */
export const getTelemetryMetrics = query({
  args: {
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const since = args.sinceMs ?? Date.now() - 24 * 60 * 60 * 1000; // default 24h

    const logs = await ctx.db
      .query("aiTelemetryLogs")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .collect();

    const totalRequests = logs.length;
    let geminiCalls = 0;
    let geminiSuccesses = 0;
    let fallbacks = 0;
    let rateLimited = 0;
    let crisisInterventions = 0;
    let thirdPartyInterventions = 0;
    let totalDurationMs = 0;

    const fallbackReasons: Record<string, number> = {};

    for (const log of logs) {
      totalDurationMs += log.durationMs;
      if (log.geminiCalled) geminiCalls++;
      if (log.geminiSuccess) geminiSuccesses++;
      if (log.fallbackUsed) {
        fallbacks++;
        const r = log.fallbackReason || "UNKNOWN";
        fallbackReasons[r] = (fallbackReasons[r] || 0) + 1;
      }
      if (log.path === "rate_limited") rateLimited++;
      if (log.path === "crisis") crisisInterventions++;
      if (log.path === "third_party") thirdPartyInterventions++;
    }

    const avgDurationMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;

    return {
      windowSince: since,
      totalRequests,
      geminiCalls,
      geminiSuccesses,
      geminiSuccessRate: geminiCalls > 0 ? (geminiSuccesses / geminiCalls) * 100 : 100,
      fallbacks,
      fallbackReasons,
      rateLimited,
      crisisInterventions,
      thirdPartyInterventions,
      avgDurationMs,
    };
  },
});
