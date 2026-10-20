import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isNotificationDestination, type NotificationDestination } from "../common/notificationRoutes";

/**
 * Single writer for user notifications (see EMOTIFY_NOTIFICATION_EVENT_MATRIX.md).
 *
 *   business event -> recipients resolved by the caller (authorized for that event)
 *     -> in-app row persisted here (the record of truth, deduplicated per recipient+event)
 *     -> OS push scheduled after the row exists, with lock-screen-safe copy chosen by type.
 *
 * The in-app title/message are shown only inside the authenticated app or dashboard. The push
 * title/body never come from them: they come from PUSH_COPY, which contains no names, dates,
 * scores, clinical terms or free text, so nothing sensitive reaches a lock screen.
 */

export type PushChannel = "default" | "appointments" | "important";

export interface PushCopy {
  title: string;
  body: string;
  channelId: PushChannel;
}

/** OS push copy per notification type. `null` (or absent) = in-app only. */
export const PUSH_COPY: Record<string, PushCopy | null> = {
  // Student
  appointment_requested: null, // the student just did this in the app
  appointment_confirmed: { title: "Emotify", body: "Your appointment status has changed.", channelId: "appointments" },
  appointment_declined: { title: "Emotify", body: "Your appointment status has changed.", channelId: "appointments" },
  appointment_reschedule_proposed: { title: "Emotify", body: "Your appointment status has changed.", channelId: "appointments" },
  appointment_cancelled: { title: "Emotify", body: "Your appointment status has changed.", channelId: "appointments" },
  appointment_reconfirm_needed: { title: "Emotify", body: "Your appointment status has changed.", channelId: "appointments" },
  appointment_completed: null,
  appointment_proposed: { title: "Emotify", body: "You have a new appointment request.", channelId: "appointments" },
  appointment_transferred: null,
  counsellor_unassigned: null,
  counsellor_assigned: { title: "Emotify", body: "You have an update from Emotify.", channelId: "default" },
  // Counsellor
  appointment_request_received: { title: "Emotify", body: "You have a new appointment request.", channelId: "appointments" },
  appointment_updated: { title: "Emotify", body: "An appointment has been updated.", channelId: "appointments" },
  appointment_feedback: null,
  caseload_assignment: { title: "Emotify", body: "You have an update from Emotify.", channelId: "default" },
  caseload_removed: null,
  // Staff safety (assigned counsellor + admins, or all active counsellors + admins if unassigned)
  critical_risk: { title: "Emotify", body: "Please open Emotify to view an important update.", channelId: "important" },
  safety_alert: { title: "Emotify", body: "Please open Emotify to view an important update.", channelId: "important" },
  counsellor_request: { title: "Emotify", body: "You have a new support request.", channelId: "important" },
  counsellor_request_update: { title: "Emotify", body: "You have an update from Emotify.", channelId: "default" },
  // Admin
  appointment_needs_counsellor: { title: "Emotify", body: "An appointment request needs a counsellor.", channelId: "appointments" },
  caseload_capacity: null,
  counsellor_inactive_caseload: null,
};

export function pushCopyFor(type: string): PushCopy | null {
  return PUSH_COPY[type] ?? null;
}

export interface NotificationInput {
  recipientId: Id<"users"> | string;
  type: string;
  /** In-app text (authenticated surfaces only). Keep it free of clinical detail. */
  title: string;
  message: string;
  priority?: "low" | "medium" | "high" | "critical";
  destination?: NotificationDestination;
  relatedId?: string;
  /** Same recipient + key = same notification: repeats and retries create nothing new. */
  dedupeKey?: string;
  /** Defaults to whether the type has push copy. */
  push?: boolean;
}

/**
 * Persists one notification and, when the type warrants it, schedules OS push delivery.
 * Returns the notification id (the existing one when deduplicated) and whether it is new.
 * Must run inside a mutation (it writes and schedules in the caller's transaction).
 */
export async function createNotification(
  ctx: { db: any; scheduler?: any },
  input: NotificationInput
): Promise<{ id: Id<"notifications">; created: boolean }> {
  const recipientId = String(input.recipientId);
  if (input.dedupeKey) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_dedupe", (q: any) => q.eq("recipientId", recipientId).eq("dedupeKey", input.dedupeKey))
      .first();
    if (existing) return { id: existing._id, created: false };
  }

  // Every mutation context has a scheduler; a bare data context (e.g. a test's t.run) does not,
  // and then the in-app record is still written without a push.
  const wantsPush = (input.push ?? true) && pushCopyFor(input.type) !== null && !!ctx.scheduler;
  const now = Date.now();
  const id = await ctx.db.insert("notifications", {
    recipientId,
    type: input.type,
    title: input.title,
    message: input.message,
    priority: input.priority ?? "medium",
    read: false,
    archived: false,
    createdAt: now,
    destination: input.destination && isNotificationDestination(input.destination) ? input.destination : undefined,
    relatedId: input.relatedId,
    dedupeKey: input.dedupeKey,
    pushStatus: wantsPush ? "queued" : undefined,
  });

  // Push is scheduled only after the row exists, in the same transaction: if this mutation
  // rolls back, neither exists; if push later fails, the in-app record is still there.
  if (wantsPush) {
    await ctx.scheduler.runAfter(0, internal.pushNotifications.deliverNotification, { notificationId: id });
  }
  return { id, created: true };
}

/** Notifies several recipients about one event (deduplicated per recipient). */
export async function notifyEach(
  ctx: { db: any; scheduler?: any },
  recipientIds: Array<Id<"users"> | string>,
  input: Omit<NotificationInput, "recipientId">
): Promise<number> {
  const seen = new Set<string>();
  let created = 0;
  for (const r of recipientIds) {
    const key = String(r);
    if (seen.has(key)) continue;
    seen.add(key);
    if ((await createNotification(ctx, { ...input, recipientId: key })).created) created++;
  }
  return created;
}

/** Active admins: org-wide recipients for administrative exceptions. */
export async function activeAdminIds(ctx: { db: any }): Promise<Id<"users">[]> {
  const admins = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "admin")).collect();
  return admins.filter((a: any) => a.status !== "inactive").map((a: any) => a._id);
}

/** De-identified label used in staff notifications ("Student 101"), never the student's name. */
export async function studentLabelFor(ctx: { db: any }, studentKey: string): Promise<string> {
  const id = ctx.db.normalizeId("users", studentKey);
  const student = id ? await ctx.db.get(id) : null;
  return student?.patientId ? `Student ${student.patientId}` : "A student";
}
