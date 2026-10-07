import { MutationCtx, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEvent } from "./audit";

/**
 * Checks and increments rate limit for a key.
 * Throws an error if rate limit exceeded.
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  userId: string,
  action: string,
  maxRequests: number,
  windowMs: number
) {
  const now = Date.now();
  const key = `${userId}:${action}`;
  
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing) {
    await ctx.db.insert("rateLimits", {
      key,
      count: 1,
      windowStart: now,
    });
    return;
  }

  if (now - existing.windowStart > windowMs) {
    // Window expired, reset window and count
    await ctx.db.patch(existing._id, {
      count: 1,
      windowStart: now,
    });
    return;
  }

  if (existing.count >= maxRequests) {
    // Log rate limit violation in audit logs
    await logAuditEvent(
      ctx,
      userId,
      "rate_limit_exceeded",
      `Rate limit for action ${action} exceeded. Count: ${existing.count}/${maxRequests} in window.`
    );
    throw new Error(`Rate limit exceeded for action: ${action}. Please try again later.`);
  }

  // Increment count
  await ctx.db.patch(existing._id, {
    count: existing.count + 1,
  });
}

/**
 * Internal: consume one rate-limit token for the authenticated caller.
 * Used by actions (which have no direct DB access), e.g. text-to-speech.
 */
export const consumeForCaller = internalMutation({
  args: {
    action: v.string(),
    maxRequests: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Login required.");
    }
    await checkRateLimit(ctx, identity.subject, args.action, args.maxRequests, args.windowMs);
  },
});
