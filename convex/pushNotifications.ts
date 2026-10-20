import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { pushCopyFor } from "./notify";
import { MOBILE_DESTINATION_ROUTES, isNotificationDestination, type NotificationDestination } from "../common/notificationRoutes";

const FORBIDDEN_LOCKSCREEN_TERMS =
  /depress|anxiety disorder|psychos|suicid|risk|score|symptom|severe|crisis|emergency|attempt|diagnos/i;

/**
 * Validates that push notification content is privacy-safe.
 * Lock-screen messages must never expose clinical scores, symptoms, risk labels, or diagnoses.
 */
export function validatePrivacySafePushContent(title: string, body: string): boolean {
  if (!title || !body) return false;
  if (FORBIDDEN_LOCKSCREEN_TERMS.test(title) || FORBIDDEN_LOCKSCREEN_TERMS.test(body)) {
    return false;
  }
  return true;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  channelId?: string;
  data?: Record<string, any>;
  priority?: "default" | "normal" | "high";
}

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo recommends checking receipts after delivery has had time to complete. */
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

/**
 * Real delivery is opt-in per deployment: set EXPO_PUSH_LIVE=true (and optionally
 * EXPO_ACCESS_TOKEN for Expo enhanced push security). Otherwise messages are logged as "mock".
 * Unit tests never reach the network unless a test stubs fetch and opts in explicitly.
 */
export function isLivePushEnabled(): boolean {
  const flag = process.env.EXPO_PUSH_LIVE;
  if (!flag) return false;
  if (process.env.NODE_ENV === "test") return flag === "stubbed-fetch";
  return flag === "true" || flag === "1";
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return headers;
}

type SendOutcome = {
  status: "sent" | "mock" | "failed";
  successCount: number;
  failedCount: number;
  tickets: Array<{ id: string; token: string }>;
  invalidTokens: string[];
  error?: string;
};

/** Sends messages to the Expo push service. Never throws; tokens are not logged. */
async function sendToExpo(messages: ExpoPushMessage[]): Promise<SendOutcome> {
  if (!isLivePushEnabled()) {
    console.log(`[PUSH MOCK] ${messages.length} message(s) on channel ${messages[0]?.channelId ?? "default"}`);
    return { status: "mock", successCount: messages.length, failedCount: 0, tickets: [], invalidTokens: [] };
  }
  try {
    const response = await fetch(EXPO_PUSH_SEND_URL, { method: "POST", headers: expoHeaders(), body: JSON.stringify(messages) });
    if (!response.ok) {
      return { status: "failed", successCount: 0, failedCount: messages.length, tickets: [], invalidTokens: [], error: `Expo push HTTP ${response.status}` };
    }
    const result: any = await response.json();
    const tickets: any[] = Array.isArray(result?.data) ? result.data : [];
    const out: SendOutcome = { status: "sent", successCount: 0, failedCount: 0, tickets: [], invalidTokens: [] };
    tickets.forEach((ticket, i) => {
      const token = messages[i]?.to;
      if (ticket?.status === "ok") {
        out.successCount++;
        if (ticket.id && token) out.tickets.push({ id: String(ticket.id), token });
      } else {
        out.failedCount++;
        if (ticket?.details?.error === "DeviceNotRegistered" && token) out.invalidTokens.push(token);
        out.error = ticket?.details?.error ?? ticket?.message ?? "ticket_error";
      }
    });
    if (out.successCount === 0 && out.failedCount > 0) out.status = "failed";
    return out;
  } catch (err: any) {
    return { status: "failed", successCount: 0, failedCount: messages.length, tickets: [], invalidTokens: [], error: String(err?.message || err).slice(0, 200) };
  }
}

/** Internal: what delivering one notification needs. Tokens never leave the server. */
export const getDeliveryContext = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.notificationId);
    if (!n) return null;
    const recipientUserId = ctx.db.normalizeId("users", n.recipientId);
    const recipient = recipientUserId ? await ctx.db.get(recipientUserId) : null;
    const tokens = recipient
      ? (await ctx.db.query("pushTokens").withIndex("by_userId", (q) => q.eq("userId", String(recipient._id))).take(20)).map((t) => t.token)
      : [];
    return {
      type: n.type,
      destination: n.destination,
      pushStatus: n.pushStatus,
      recipientActive: !!recipient && recipient.status !== "inactive",
      tokens,
    };
  },
});

/** Internal: record a delivery outcome on the notification row (no tokens, no message text). */
export const recordDelivery = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    pushStatus: v.string(),
    pushTicketIds: v.optional(v.array(v.string())),
    pushError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.notificationId);
    if (!n) return;
    await ctx.db.patch(args.notificationId, {
      pushStatus: args.pushStatus,
      pushTicketIds: args.pushTicketIds,
      pushError: args.pushError,
      pushUpdatedAt: Date.now(),
    });
  },
});

/**
 * Internal: deliver one persisted notification to the recipient's devices.
 * Scheduled once by createNotification (Convex runs a scheduled action at most once); the
 * "queued" check makes any accidental second run a no-op.
 */
export const deliverNotification = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const delivery: any = await ctx.runQuery(internal.pushNotifications.getDeliveryContext, { notificationId: args.notificationId });
    if (!delivery || delivery.pushStatus !== "queued") return { status: "skipped" };

    const record = (pushStatus: string, extra: { pushTicketIds?: string[]; pushError?: string } = {}) =>
      ctx.runMutation(internal.pushNotifications.recordDelivery, { notificationId: args.notificationId, pushStatus, ...extra });

    const copy = pushCopyFor(delivery.type);
    if (!copy || !validatePrivacySafePushContent(copy.title, copy.body)) {
      await record("skipped", { pushError: copy ? "copy_failed_privacy_check" : "no_push_copy" });
      return { status: "skipped" };
    }
    if (!delivery.recipientActive) {
      await record("skipped", { pushError: "recipient_inactive" });
      return { status: "skipped" };
    }
    if (delivery.tokens.length === 0) {
      await record("no_tokens");
      return { status: "no_tokens" };
    }

    const destination: NotificationDestination = isNotificationDestination(delivery.destination) ? delivery.destination : "notifications";
    // Only ids and a destination key travel in the payload; `route` is for older app builds.
    const data = { notificationId: String(args.notificationId), destination, route: MOBILE_DESTINATION_ROUTES[destination] };
    const messages: ExpoPushMessage[] = delivery.tokens.map((to: string) => ({
      to,
      title: copy.title,
      body: copy.body,
      sound: "default",
      channelId: copy.channelId,
      data,
      priority: copy.channelId === "default" ? "default" : "high",
    }));

    const outcome = await sendToExpo(messages);
    for (const token of outcome.invalidTokens) {
      await ctx.runMutation(internal.pushTokens.deleteToken, { token });
    }
    await record(outcome.status, { pushTicketIds: outcome.tickets.map((t) => t.id), pushError: outcome.error });
    if (outcome.tickets.length > 0) {
      await ctx.scheduler.runAfter(RECEIPT_CHECK_DELAY_MS, internal.pushNotifications.checkReceipts, {
        notificationId: args.notificationId,
        tickets: outcome.tickets,
      });
    }
    return { status: outcome.status };
  },
});

/** Internal: read Expo delivery receipts; prune tokens the provider reports as unregistered. */
export const checkReceipts = internalAction({
  args: {
    notificationId: v.id("notifications"),
    tickets: v.array(v.object({ id: v.string(), token: v.string() })),
  },
  handler: async (ctx, args) => {
    if (!isLivePushEnabled() || args.tickets.length === 0) return { checked: 0 };
    try {
      const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids: args.tickets.map((t) => t.id) }),
      });
      if (!response.ok) return { checked: 0 };
      const receipts: Record<string, any> = (await response.json())?.data ?? {};
      let errors = 0;
      for (const ticket of args.tickets) {
        const receipt = receipts[ticket.id];
        if (receipt?.status !== "error") continue;
        errors++;
        if (receipt.details?.error === "DeviceNotRegistered") {
          await ctx.runMutation(internal.pushTokens.deleteToken, { token: ticket.token });
        }
      }
      if (errors > 0) {
        await ctx.runMutation(internal.pushNotifications.recordDelivery, {
          notificationId: args.notificationId,
          pushStatus: errors === args.tickets.length ? "failed" : "sent",
          pushTicketIds: args.tickets.map((t) => t.id),
          pushError: `receipt_errors:${errors}`,
        });
      }
      return { checked: args.tickets.length, errors };
    } catch {
      return { checked: 0 };
    }
  },
});

/**
 * Server-side Action: Dispatches privacy-safe mobile push notifications via the Expo Push API.
 * Kept for direct server use; business events go through notify.createNotification, which
 * persists the in-app record first and then schedules deliverNotification.
 */
export const sendPushNotification = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    channelId: v.optional(v.string()), // "default" | "appointments" | "important" | "reminders"
  },
  handler: async (ctx, args) => {
    // 1. Content Privacy Check
    if (!validatePrivacySafePushContent(args.title, args.body)) {
      throw new Error(
        "Push notification content violates privacy policy: contains sensitive mental-health, diagnostic, or clinical wording."
      );
    }

    // 2. Retrieve user tokens
    const tokens: string[] = await ctx.runQuery(internal.pushTokens.getTokensForUser, {
      userId: args.userId,
    });

    if (!tokens || tokens.length === 0) {
      return { status: "no_tokens", sentCount: 0 };
    }

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: args.title,
      body: args.body,
      sound: "default",
      channelId: args.channelId || "default",
      data: args.data || {},
      priority: "high",
    }));

    const outcome = await sendToExpo(messages);
    for (const token of outcome.invalidTokens) {
      await ctx.runMutation(internal.pushTokens.deleteToken, { token });
    }
    if (outcome.status === "mock") {
      return { status: "mock_delivered", sentCount: messages.length, mock: true };
    }
    if (outcome.status === "failed" && outcome.successCount === 0 && outcome.tickets.length === 0 && outcome.error?.startsWith("Expo push HTTP")) {
      return { status: "delivery_failed", sentCount: tokens.length, error: outcome.error };
    }
    return {
      status: "delivered",
      sentCount: tokens.length,
      successCount: outcome.successCount,
      failedCount: outcome.failedCount,
    };
  },
});
