import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createNotification, pushCopyFor } from "./notify";
import { MOBILE_DESTINATION_ROUTES, isNotificationDestination, type NotificationDestination } from "../common/notificationRoutes";
import { readStoredEmotyPreferences } from "../common/companionName";
import { resolveAvatarCharacterId, getNotificationAvatarUrl, isStudentUserRole } from "../common/avatarNotification";

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
  richContent?: {
    image?: string;
  };
}

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo recommends checking receipts after delivery has had time to complete. */
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

/**
 * Real delivery is opt-in per deployment: set EXPO_PUSH_LIVE=true (and optionally
 * EXPO_ACCESS_TOKEN for Expo enhanced push security). Otherwise nothing is sent and the
 * notification row records pushStatus "mock" with pushError "live_push_disabled".
 * Unit tests never reach the network unless a test stubs fetch and opts in explicitly.
 */
export function isLivePushEnabled(): boolean {
  const flag = process.env.EXPO_PUSH_LIVE?.trim().toLowerCase();
  if (!flag) return false;
  if (process.env.NODE_ENV === "test") return flag === "stubbed-fetch";
  return flag === "true" || flag === "1" || flag === "yes" || flag === "on";
}

/** Recorded on the notification when this deployment does not send real pushes. */
export const LIVE_PUSH_DISABLED = "live_push_disabled";

/** Provider error text without any push token in it (Expo messages quote the token). */
function redactTokens(text: string): string {
  return text.replace(/(?:ExponentPushToken|ExpoPushToken)\[[^\]]*\]/g, "[token]").slice(0, 200);
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
    console.warn(
      `[PUSH MOCK] ${messages.length} message(s) not sent: EXPO_PUSH_LIVE is not "true" on this deployment, so devices receive nothing.`
    );
    return { status: "mock", successCount: messages.length, failedCount: 0, tickets: [], invalidTokens: [], error: LIVE_PUSH_DISABLED };
  }
  try {
    const response = await fetch(EXPO_PUSH_SEND_URL, { method: "POST", headers: expoHeaders(), body: JSON.stringify(messages) });
    if (!response.ok) {
      const detail = redactTokens(await response.text().catch(() => "")).slice(0, 120);
      return {
        status: "failed",
        successCount: 0,
        failedCount: messages.length,
        tickets: [],
        invalidTokens: [],
        error: `Expo push HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      };
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
        out.error = `ticket:${ticket?.details?.error ?? (ticket?.message ? redactTokens(String(ticket.message)) : "unknown")}`;
      }
    });
    if (out.successCount === 0 && out.failedCount > 0) out.status = "failed";
    return out;
  } catch (err: any) {
    return { status: "failed", successCount: 0, failedCount: messages.length, tickets: [], invalidTokens: [], error: redactTokens(String(err?.message || err)) };
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
    const prefs = recipient ? readStoredEmotyPreferences(recipient) : undefined;
    return {
      type: n.type,
      destination: n.destination,
      pushStatus: n.pushStatus,
      recipientActive: !!recipient && recipient.status !== "inactive",
      recipientRole: recipient?.role ?? null,
      avatarGender: prefs?.avatarGender ?? null,
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

/** "ExponentPushToken[…wxyz]": enough to tell devices apart, never the usable token. */
function maskToken(token: string): string {
  const inner = /\[([^\]]*)\]/.exec(token)?.[1] ?? "";
  return `${token.split("[")[0]}[…${inner.slice(-4)}]`;
}

/** The first pipeline stage that did not succeed for one notification, in plain words. */
function pushStage(n: any, now: number): string {
  switch (n.pushStatus) {
    case undefined:
      return "1 in-app only: this notification type has no push copy, so no push is attempted";
    case "queued":
      return now - n.createdAt > 60_000
        ? "2 dispatch did not run: delivery was scheduled but never completed (check Convex logs for pushNotifications:deliverNotification)"
        : "2 dispatch pending: delivery is scheduled";
    case "skipped":
      return `3 skipped by the server: ${n.pushError ?? "unknown reason"}`;
    case "no_tokens":
      return "4 no device token: the recipient has no registered Expo push token (the app did not register; see the device checks)";
    case "mock":
      return "5 live push disabled: EXPO_PUSH_LIVE is not \"true\" on this deployment, so nothing was sent to Expo";
    case "failed":
      return String(n.pushError ?? "").includes("receipt:")
        ? `7 rejected by FCM/APNs (Expo receipt): ${n.pushError}`
        : `6 rejected by Expo: ${n.pushError ?? "unknown error"}`;
    case "partially_failed":
      return `7 delivered to FCM/APNs for some devices; others failed: ${n.pushError}`;
    case "sent":
      return n.pushError
        ? `6 accepted by Expo for some devices; others failed: ${n.pushError}`
        : "6 accepted by Expo; the FCM/APNs receipt is checked about 15 minutes after sending";
    case "provider_accepted":
      return "7 accepted by FCM/APNs: delivery left the server side; if nothing appeared, check the phone (channel settings, Do Not Disturb, battery optimisation)";
    default:
      return `unknown status ${n.pushStatus}`;
  }
}

/**
 * Owner diagnostic for "the in-app notification arrived but the phone showed nothing".
 * Internal, so only the deployment owner can run it (dashboard or CLI):
 *   npx convex run pushNotifications:diagnosePush '{}'
 *   npx convex run pushNotifications:diagnosePush '{"userId":"<users _id>"}'
 * Reports the latest push-eligible notifications, the recipient's devices and the first stage
 * that did not succeed. Returns no secrets, no full push tokens and no notification text.
 */
export const diagnosePush = internalQuery({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const rows = args.userId
      ? await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_created", (q) => q.eq("recipientId", String(args.userId)))
          .order("desc")
          .take(limit)
      : (await ctx.db.query("notifications").order("desc").take(200)).filter((n) => n.pushStatus !== undefined).slice(0, limit);
    const now = Date.now();

    const recipientIds = [...new Set(rows.map((n) => n.recipientId))];
    const recipients = [];
    for (const rid of recipientIds) {
      const id = ctx.db.normalizeId("users", rid);
      const user = id ? await ctx.db.get(id) : null;
      const tokens = id ? await ctx.db.query("pushTokens").withIndex("by_userId", (q) => q.eq("userId", String(id))).take(20) : [];
      recipients.push({
        recipientId: rid,
        role: user?.role ?? null,
        active: !!user && user.status !== "inactive",
        devices: tokens.map((t) => ({ platform: t.platform, token: maskToken(t.token), registeredAt: new Date(t.updatedAt).toISOString() })),
      });
    }

    return {
      deployment: {
        livePushEnabled: isLivePushEnabled(),
        expoPushLiveSet: !!process.env.EXPO_PUSH_LIVE,
        expoAccessTokenSet: !!process.env.EXPO_ACCESS_TOKEN,
      },
      notifications: rows.map((n) => ({
        notificationId: n._id,
        createdAt: new Date(n.createdAt).toISOString(),
        type: n.type,
        recipientId: n.recipientId,
        pushStatus: n.pushStatus ?? null,
        pushError: n.pushError ?? null,
        expoTickets: n.pushTicketIds?.length ?? 0,
        stage: pushStage(n, now),
      })),
      recipients,
    };
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
        ticketError: outcome.error,
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
    /** Error from devices Expo refused at send time (kept so the final record shows it). */
    ticketError: v.optional(v.string()),
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
      // A receipt says whether Expo handed the message to FCM/APNs. It does not prove the phone
      // displayed it; that is only observable on the device.
      let errors = 0;
      let accepted = 0;
      const codes = new Set<string>();
      for (const ticket of args.tickets) {
        const receipt = receipts[ticket.id];
        if (receipt?.status === "ok") accepted++;
        if (receipt?.status !== "error") continue;
        errors++;
        codes.add(receipt.details?.error ?? (receipt.message ? redactTokens(String(receipt.message)) : "unknown"));
        if (receipt.details?.error === "DeviceNotRegistered") {
          await ctx.runMutation(internal.pushTokens.deleteToken, { token: ticket.token });
        }
      }
      if (errors > 0 || accepted > 0) {
        const problems = [args.ticketError, errors > 0 ? `receipt:${[...codes].join(",")}` : undefined].filter(Boolean);
        await ctx.runMutation(internal.pushNotifications.recordDelivery, {
          notificationId: args.notificationId,
          pushStatus: problems.length === 0 ? "provider_accepted" : accepted === 0 ? "failed" : "partially_failed",
          pushTicketIds: args.tickets.map((t) => t.id),
          pushError: problems.length > 0 ? problems.join("; ") : undefined,
        });
      }
      return { checked: args.tickets.length, errors, accepted };
    } catch {
      return { checked: 0 };
    }
  },
});

/** Internal query to resolve a user's companion avatar gender for push actions */
export const getUserAvatarGender = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("users", args.userId);
    const user = id ? await ctx.db.get(id) : null;
    if (!user || !isStudentUserRole(user.role)) return null;
    const prefs = readStoredEmotyPreferences(user);
    return prefs?.avatarGender ?? null;
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
    avatarGender: v.optional(v.string()),
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

/**
 * Development & testing trigger: dispatches a single test notification through
 * the shared notification and Expo push-delivery pipeline.
 *
 * Restricts recipient to valid, active students/patients.
 * Generates a unique dedupe key per intentional test run.
 */
export const dispatchTestNotification = internalMutation({
  args: {
    studentId: v.string(),
    testRunId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Validate recipient exists in DB
    const id = ctx.db.normalizeId("users", args.studentId);
    const recipient = id ? await ctx.db.get(id) : null;
    if (!recipient) {
      throw new Error(`Recipient not found: ${args.studentId}`);
    }

    // 2. Validate recipient is active
    if (recipient.status === "inactive") {
      throw new Error(`Recipient is inactive: ${args.studentId}`);
    }

    // 3. Restrict to student or patient role
    if (recipient.role && recipient.role !== "student" && recipient.role !== "patient") {
      throw new Error(`Recipient must have student or patient role, found: ${recipient.role}`);
    }

    // 4. Generate unique test deduplication key per intentional run
    const runSuffix = args.testRunId?.trim() || `${Date.now()}`;
    const dedupeKey = `test_notification:${args.studentId}:${runSuffix}`;

    // 5. Reuse existing shared notification pipeline
    const { id: notificationId, created } = await createNotification(ctx, {
      recipientId: args.studentId,
      type: "notification_test",
      title: "Emotify notification test",
      message: "Your test notification arrived successfully.",
      priority: "low",
      destination: "notifications",
      dedupeKey,
      category: "operational",
    });

    return {
      dispatched: created,
      notificationId,
      dedupeKey,
      recipientId: args.studentId,
    };
  },
});
