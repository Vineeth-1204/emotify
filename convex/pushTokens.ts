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
    appVersion: v.optional(v.string()),
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

    await checkRateLimit(ctx, userId, "push_token_register", 10, 60000);

    const now = Date.now();

    // A device token belongs to whoever is signed in on that device now. If another account
    // registered it before (shared phone, account switch), remove that link so the previous
    // account's notifications can never appear on this device.
    const others = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", trimmedToken))
      .take(20);
    for (const row of others) {
      if (row.userId !== userId) await ctx.db.delete(row._id);
    }

    // Check if token already exists for this user
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId_and_token", (q) => q.eq("userId", userId).eq("token", trimmedToken))
      .first();

    const appVersion = args.appVersion?.slice(0, 40);
    let result: { status: "updated" | "registered"; id: any };
    if (existing) {
      await ctx.db.patch(existing._id, {
        platform: args.platform,
        deviceId: args.deviceId,
        appVersion,
        updatedAt: now,
      });
      result = { status: "updated", id: existing._id };
    } else {
      const id = await ctx.db.insert("pushTokens", {
        userId,
        token: trimmedToken,
        platform: args.platform,
        deviceId: args.deviceId,
        appVersion,
        updatedAt: now,
      });
      result = { status: "registered", id };
    }
    await recordRegistrationEvent(ctx, userId, { stage: "registered", status: "ok", platform: args.platform, appVersion, permission: "granted" });
    return result;
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
      // The provider said this device no longer exists (app uninstalled or data cleared).
      await recordRegistrationEvent(ctx, record.userId, { stage: "invalidated", status: "error", errorCode: "DeviceNotRegistered", platform: record.platform });
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

// ---- registration diagnostics ---------------------------------------------------------------

const REGISTRATION_STAGES = ["permission", "token", "backend", "registered", "invalidated"] as const;
const REGISTRATION_STATUSES = ["ok", "denied", "blocked", "deferred", "error"] as const;
/** The same outcome reported again within this window is not stored twice. */
const EVENT_DEDUPE_MS = 10 * 60 * 1000;

/** Error text from a device, without anything that could be a token or personal data. */
function sanitizeErrorCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return code
    .replace(/(?:ExponentPushToken|ExpoPushToken)\[[^\]]*\]/g, "[token]")
    .replace(/[^\w .:/()[\]-]/g, "")
    .slice(0, 120);
}

async function recordRegistrationEvent(
  ctx: { db: any },
  userId: string,
  event: { stage: string; status: string; errorCode?: string; permission?: string; platform?: string; appVersion?: string }
) {
  const now = Date.now();
  const last = await ctx.db
    .query("pushRegistrationEvents")
    .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();
  const errorCode = sanitizeErrorCode(event.errorCode);
  if (last && now - last.createdAt < EVENT_DEDUPE_MS && last.stage === event.stage && last.status === event.status && last.errorCode === errorCode) {
    return;
  }
  await ctx.db.insert("pushRegistrationEvents", {
    userId,
    stage: event.stage,
    status: event.status,
    errorCode,
    permission: event.permission,
    platform: event.platform?.slice(0, 20),
    appVersion: event.appVersion?.slice(0, 40),
    createdAt: now,
  });
}

/**
 * The device reports a registration step that did not succeed (permission, token or backend),
 * so the reason is visible on the server. Successful registration is recorded by
 * registerPushToken itself.
 */
export const reportRegistration = mutation({
  args: {
    stage: v.union(...REGISTRATION_STAGES.map((s) => v.literal(s))),
    status: v.union(...REGISTRATION_STATUSES.map((s) => v.literal(s))),
    errorCode: v.optional(v.string()),
    permission: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return { recorded: false };
    await checkRateLimit(ctx, identity.subject, "push_registration_report", 30, 60 * 60 * 1000);
    await recordRegistrationEvent(ctx, identity.subject, args);
    return { recorded: true };
  },
});

/**
 * The signed-in user's own phone-notification status (Profile). Never returns a full token:
 * only how many devices are registered, when, and the last registration and test results.
 */
export const getMyPushStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    const userId = identity.subject;
    const devices = await ctx.db.query("pushTokens").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
    const lastEvent = await ctx.db
      .query("pushRegistrationEvents")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_created", (q) => q.eq("recipientId", userId))
      .order("desc")
      .take(50);
    const lastTest = recent.find((n) => n.type === "notification_test");
    return {
      deviceCount: devices.length,
      lastRegisteredAt: devices.length ? Math.max(...devices.map((d) => d.updatedAt)) : null,
      lastEvent: lastEvent ? { stage: lastEvent.stage, status: lastEvent.status, errorCode: lastEvent.errorCode ?? null, createdAt: lastEvent.createdAt } : null,
      lastTest: lastTest ? { createdAt: lastTest.createdAt, pushStatus: lastTest.pushStatus ?? null, pushError: lastTest.pushError ?? null } : null,
    };
  },
});
