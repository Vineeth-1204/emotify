/**
 * Emotify AI-3 Step 10: Server-Authoritative Companion Rate Limiter
 *
 * Enforces multi-tier rate limiting for the Emoty AI companion:
 * 1. Concurrency / In-Flight Protection: Prevents duplicate simultaneous AI calls per user.
 * 2. Short-Term Burst Protection: Maximum 10 messages per 60 seconds.
 * 3. Daily Usage Protection: Maximum 50 messages per 24 hours.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * - Session Authoritative: Identity is ALWAYS derived from ctx.auth.
 * - Never trusts client-provided userId.
 * - Stored in dedicated `companionRateLimits` table, immune to chat history clearing.
 * - Crisis safety evaluations bypass AI rate limiting.
 */

import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import { query } from "./functions";

export const RATE_LIMIT_CONFIG = {
  BURST_MAX_REQUESTS: 10,
  BURST_WINDOW_MS: 60 * 1000, // 1 minute
  DAILY_MAX_REQUESTS: 50,
  DAILY_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 hours
  IN_FLIGHT_TIMEOUT_MS: 20 * 1000, // 20 seconds max in-flight lock
} as const;

export type RateLimitRejectionReason =
  | "CONCURRENT_REQUEST"
  | "RATE_LIMITED_BURST"
  | "RATE_LIMITED_DAILY";

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: RateLimitRejectionReason;
  message?: string;
  retryAfterMs?: number;
}

/**
 * Atomically checks and acquires rate limit token for the authenticated student.
 * If rejected, returns allowed: false with safe user-facing message and machine-readable reason.
 */
export const checkAndAcquireRateLimit = internalMutation({
  args: {},
  handler: async (ctx): Promise<RateLimitCheckResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new ConvexError("Unauthenticated: Valid session required.");
    }
    const userId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query("companionRateLimits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!existing) {
      // First-time user record
      await ctx.db.insert("companionRateLimits", {
        userId,
        burstCount: 1,
        burstWindowStart: now,
        dailyCount: 1,
        dailyWindowStart: now,
        inFlight: true,
        inFlightSince: now,
      });
      return { allowed: true };
    }

    // 1. Concurrency Check (In-Flight lock)
    if (existing.inFlight && existing.inFlightSince && (now - existing.inFlightSince < RATE_LIMIT_CONFIG.IN_FLIGHT_TIMEOUT_MS)) {
      return {
        allowed: false,
        reason: "CONCURRENT_REQUEST",
        message: "You already have a message being processed. Please wait a moment.",
        retryAfterMs: Math.max(1000, RATE_LIMIT_CONFIG.IN_FLIGHT_TIMEOUT_MS - (now - existing.inFlightSince)),
      };
    }

    // 2. Short-Term Burst Check (10 msgs / 60s)
    let burstCount = existing.burstCount;
    let burstWindowStart = existing.burstWindowStart;

    if (now - burstWindowStart > RATE_LIMIT_CONFIG.BURST_WINDOW_MS) {
      // Window expired, reset burst
      burstCount = 0;
      burstWindowStart = now;
    }

    if (burstCount >= RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS) {
      const retryAfter = Math.max(1000, RATE_LIMIT_CONFIG.BURST_WINDOW_MS - (now - burstWindowStart));
      return {
        allowed: false,
        reason: "RATE_LIMITED_BURST",
        message: "You're sending messages a bit too quickly. Please take a breath and try again shortly.",
        retryAfterMs: retryAfter,
      };
    }

    // 3. Daily Usage Check (50 msgs / 24h)
    let dailyCount = existing.dailyCount;
    let dailyWindowStart = existing.dailyWindowStart;

    if (now - dailyWindowStart > RATE_LIMIT_CONFIG.DAILY_WINDOW_MS) {
      // Daily window expired, reset daily counter
      dailyCount = 0;
      dailyWindowStart = now;
    }

    if (dailyCount >= RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS) {
      const retryAfter = Math.max(1000, RATE_LIMIT_CONFIG.DAILY_WINDOW_MS - (now - dailyWindowStart));
      return {
        allowed: false,
        reason: "RATE_LIMITED_DAILY",
        message: "You have reached your daily limit of 50 messages with Emoty. Let's take a break and chat again tomorrow!",
        retryAfterMs: retryAfter,
      };
    }

    // Allowed: increment counters and set in-flight lock
    await ctx.db.patch(existing._id, {
      burstCount: burstCount + 1,
      burstWindowStart,
      dailyCount: dailyCount + 1,
      dailyWindowStart,
      inFlight: true,
      inFlightSince: now,
    });

    return { allowed: true };
  },
});

/**
 * Releases the in-flight concurrency lock once an AI request has completed or failed.
 */
export const releaseRateLimit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) return;
    const userId = identity.subject;

    const existing = await ctx.db
      .query("companionRateLimits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inFlight: false,
        inFlightSince: undefined,
      });
    }
  },
});

/**
 * Internal variant of releaseRateLimit callable with explicit userId from server actions.
 */
export const releaseRateLimitInternal = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("companionRateLimits")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inFlight: false,
        inFlightSince: undefined,
      });
    }
  },
});

/**
 * Query current rate limit status for the authenticated student.
 */
export const getRateLimitStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        burstRemaining: RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS,
        dailyRemaining: RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS,
        inFlight: false,
      };
    }
    const userId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query("companionRateLimits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!existing) {
      return {
        burstRemaining: RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS,
        dailyRemaining: RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS,
        inFlight: false,
      };
    }

    const burstExpired = now - existing.burstWindowStart > RATE_LIMIT_CONFIG.BURST_WINDOW_MS;
    const dailyExpired = now - existing.dailyWindowStart > RATE_LIMIT_CONFIG.DAILY_WINDOW_MS;

    const currentBurst = burstExpired ? 0 : existing.burstCount;
    const currentDaily = dailyExpired ? 0 : existing.dailyCount;

    return {
      burstRemaining: Math.max(0, RATE_LIMIT_CONFIG.BURST_MAX_REQUESTS - currentBurst),
      dailyRemaining: Math.max(0, RATE_LIMIT_CONFIG.DAILY_MAX_REQUESTS - currentDaily),
      inFlight: !!existing.inFlight && existing.inFlightSince ? now - existing.inFlightSince < RATE_LIMIT_CONFIG.IN_FLIGHT_TIMEOUT_MS : false,
    };
  },
});
