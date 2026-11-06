import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./functions";
import { assertCanAccessStudent, getAuthenticatedUser } from "./authz";
import type { Id } from "./_generated/dataModel";
import { isNotificationDestination, type NotificationDestination } from "../common/notificationRoutes";

/**
 * In-app notification centre (mobile app and staff dashboard). Every function acts only on the
 * caller's own notifications; identity comes from the session, never from an argument.
 * Rows are the record of truth: dismissing an OS notification never removes them.
 */

const UNREAD_COUNT_CAP = 99;
const MARK_ALL_BATCH = 200;

/** Keys the caller's notifications may be stored under (canonical id; legacy clerkId rows). */
function recipientKeys(user: { _id: Id<"users">; clerkId?: string }): string[] {
  return [String(user._id), ...(user.clerkId ? [user.clerkId] : [])];
}

function view(n: any) {
  return {
    _id: n._id as Id<"notifications">,
    type: n.type as string,
    title: n.title as string,
    message: n.message as string,
    priority: n.priority as string,
    read: n.read as boolean,
    createdAt: n.createdAt as number,
    destination: (isNotificationDestination(n.destination) ? n.destination : null) as NotificationDestination | null,
  };
}

/** My notifications, newest first, paginated. */
export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_created", (q) => q.eq("recipientId", String(user._id)))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.filter((n) => !n.archived).map(view) };
  },
});

/** Unread count for the badge (capped; the badge shows "99+"). */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) return { count: 0, capped: false };
    let count = 0;
    for (const key of recipientKeys(user)) {
      const rows = await ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_read", (q) => q.eq("recipientId", key).eq("read", false))
        .take(UNREAD_COUNT_CAP + 1);
      count += rows.filter((n) => !n.archived).length;
    }
    return { count: Math.min(count, UNREAD_COUNT_CAP), capped: count > UNREAD_COUNT_CAP };
  },
});

async function requireOwnNotification(ctx: any, notificationId: Id<"notifications">) {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Unauthenticated: Login required.");
  const n = await ctx.db.get(notificationId);
  // Same error whether it does not exist or belongs to someone else: no existence oracle.
  if (!n || !recipientKeys(user).includes(n.recipientId)) throw new Error("Notification not found.");
  return { user, n };
}

/** Mark one of my notifications read. Idempotent. */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { n } = await requireOwnNotification(ctx, args.notificationId);
    if (!n.read) await ctx.db.patch(n._id, { read: true, readAt: Date.now() });
    return { success: true };
  },
});

/** Mark all my notifications read (in batches; `remaining` says whether to call again). */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Unauthenticated: Login required.");
    const now = Date.now();
    let budget = MARK_ALL_BATCH;
    let remaining = false;
    for (const key of recipientKeys(user)) {
      if (budget === 0) {
        remaining = true;
        break;
      }
      const rows = await ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_read", (q) => q.eq("recipientId", key).eq("read", false))
        .take(budget + 1);
      const batch = rows.slice(0, budget);
      for (const n of batch) await ctx.db.patch(n._id, { read: true, readAt: now });
      budget -= batch.length;
      if (rows.length > batch.length) remaining = true;
    }
    return { updated: MARK_ALL_BATCH - budget, remaining };
  },
});

/**
 * Open one of my notifications: marks it read and returns where the caller may go now.
 * Access to the related record is re-checked at open time (it may have changed since the
 * notification was sent, e.g. after a reassignment); otherwise the notification centre opens.
 */
export const openNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { user, n } = await requireOwnNotification(ctx, args.notificationId);
    if (!n.read) await ctx.db.patch(n._id, { read: true, readAt: Date.now() });

    const destination: NotificationDestination = isNotificationDestination(n.destination) ? n.destination : "notifications";
    const isStaff = user.role === "admin" || user.role === "counsellor";
    const fallback = { destination: "notifications" as NotificationDestination };

    if ((destination === "alerts" || destination === "requests") && !isStaff) return fallback;
    if (destination === "assignments" && user.role !== "admin") return fallback;

    if (destination === "appointments" && n.relatedId) {
      const apptId = ctx.db.normalizeId("appointments", n.relatedId);
      const appt = apptId ? await ctx.db.get(apptId) : null;
      if (!appt) return fallback;
      if (isStaff) {
        try {
          await assertCanAccessStudent(ctx, String(appt.userId));
        } catch {
          return fallback;
        }
        if (user.role === "counsellor" && appt.counsellorId && appt.counsellorId !== user._id) return fallback;
      } else if (appt.userId !== user._id) {
        return fallback;
      }
    }
    return { destination };
  },
});
