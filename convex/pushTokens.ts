import { v } from "convex/values";
import { mutation, query } from "./functions";
import { internalMutation, internalQuery } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";

/** Token validation pattern for Expo push tokens: ExponentPushToken[...] or ExpoPushToken[...] */
export const EXPO_PUSH_TOKEN_RE = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function isValidPushToken(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  return EXPO_PUSH_TOKEN_RE.test(token.trim());
}

/** Authenticated mutation: register a device push token for the current user */
export const registerPushToken = mutation({
  args: {
    token: v.string(),
    platform: v.string(), // "android" | "ios" | "web"
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new Error("Unauthenticated: Must be logged in to register a push token.");
    }
    const userId = identity.subject;

    const trimmedToken = args.token.trim();
    if (!isValidPushToken(trimmedToken)) {
      throw new Error("Invalid push token format. Expected ExponentPushToken[...] or ExpoPushToken[...]");
    }

    await checkRateLimit(ctx, userId, "journal_write", 10, 60000);

    const now = Date.now();

    // Check if token already exists for this user
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId_and_token", (q) => q.eq("userId", userId).eq("token", trimmedToken))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        platform: args.platform,
        deviceId: args.deviceId,
        updatedAt: now,
      });
      return { status: "updated", id: existing._id };
    }

    const id = await ctx.db.insert("pushTokens", {
      userId,
      token: trimmedToken,
      platform: args.platform,
      deviceId: args.deviceId,
      updatedAt: now,
    });

    return { status: "registered", id };
  },
});

/** Authenticated mutation: remove a device push token (e.g. on logout or permission revocation) */
export const removePushToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new Error("Unauthenticated");
    }
    const userId = identity.subject;

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId_and_token", (q) => q.eq("userId", userId).eq("token", args.token.trim()))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { status: "removed" };
    }

    return { status: "not_found" };
  },
});

/** Authenticated query: get active push tokens for caller */
export const getMyPushTokens = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return [];
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

/** Internal query: retrieve all push tokens registered for a specific user ID */
export const getTokensForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return tokens.map((t) => t.token);
  },
});

/** Internal mutation: delete an invalid or expired push token */
export const deleteToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }
  },
});

/** Internal mutation: delete all tokens for a user (called during account deletion) */
export const cleanupTokensForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }
  },
});
