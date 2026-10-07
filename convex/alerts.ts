import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutation, query } from "./functions";
import { assertCanAccessStudent, requireCounselorOrAdmin, getStaffRecipientsForStudent } from "./authz";
import type { Id } from "./_generated/dataModel";
import { checkRateLimit } from "./rateLimiter";
import { logAuditEvent } from "./audit";

const CRITICAL_ALERT_TYPES = new Set(["suicide", "suicideRisk", "psychosis", "psychosisRisk"]);

const ALERT_TITLES: Record<string, string> = {
  suicide: "Suicide risk flagged in screening",
  suicideRisk: "Suicide risk disclosed",
  psychosis: "Psychosis risk flagged in screening",
  severe: "Severe screening result",
  escalation: "Rapid score escalation",
};

/**
 * Single writer for safety alerts: inserts the alert with its source link and
 * immediately notifies every counsellor and admin. Never call ctx.db.insert("alerts")
 * directly.
 */
export async function insertSafetyAlert(
  ctx: { db: any },
  params: {
    userId: string;
    type: string;
    source: "screening" | "companion" | "cbt" | "system";
    sourceId?: string;
    attemptId?: Id<"screeningAttempts">;
    triageId?: Id<"triages">;
  }
): Promise<Id<"alerts">> {
  const now = Date.now();
  const alertId = await ctx.db.insert("alerts", {
    userId: params.userId,
    type: params.type,
    status: "pending",
    createdAt: now,
    source: params.source,
    sourceId: params.sourceId,
    attemptId: params.attemptId,
    triageId: params.triageId,
  });

  let studentLabel = "A student";
  const studentId = ctx.db.normalizeId("users", params.userId);
  if (studentId) {
    const student = await ctx.db.get(studentId);
    // Use the student ID rather than their name so no personal data lingers in staff inboxes.
    if (student?.patientId) studentLabel = `Student ${student.patientId}`;
  }

  const isCritical = CRITICAL_ALERT_TYPES.has(params.type);
  const title = ALERT_TITLES[params.type] || "Safety alert";
  const origin =
    params.source === "screening" ? "a screening" : params.source === "companion" ? "the Emoty companion" : params.source === "cbt" ? "a Think Differently (CBT) session" : "the system";

  // Admins plus the student's assigned counsellor (all counsellors if unassigned)
  const staff = await getStaffRecipientsForStudent(ctx, params.userId);
  for (const member of staff) {
    await ctx.db.insert("notifications", {
      recipientId: String(member._id),
      type: isCritical ? "critical_risk" : "safety_alert",
      title,
      message: `${studentLabel}: ${title.toLowerCase()} via ${origin}. Review immediately.`,
      priority: isCritical ? "critical" : "high",
      read: false,
      archived: false,
      createdAt: now,
    });
  }

  console.log(`[ALERT TRIGGERED] type=${params.type} source=${params.source} notified=${staff.length}`);
  return alertId;
}

/** Internal: create a new alert for the authenticated student (server-side callers only) */
export const createAlert = internalMutation({
  args: {
    userId: v.optional(v.string()),
    type: v.string(),
    source: v.optional(v.union(v.literal("screening"), v.literal("companion"), v.literal("cbt"), v.literal("system"))),
    sourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    if (!args.type || args.type.trim().length === 0) {
      throw new Error("Alert type is required.");
    }
    if (args.type.length > 100) {
      throw new Error("Alert type too long.");
    }

    return await insertSafetyAlert(ctx, {
      userId: identity.subject,
      type: args.type,
      source: args.source ?? "system",
      sourceId: args.sourceId,
    });
  },
});

/**
 * Creates a safety alert with deterministic deduplication/cooldown protection.
 * Prevents alert storms while guaranteeing timely clinical alerts.
 */
export const createSafetyAlertWithDeduplication = internalMutation({
  args: {
    type: v.string(),
    cooldownMs: v.optional(v.number()),
    source: v.optional(v.union(v.literal("companion"), v.literal("cbt"), v.literal("system"))),
    sourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    if (!args.type || args.type.trim().length === 0) {
      throw new Error("Alert type is required.");
    }

    const now = Date.now();
    const cooldown = args.cooldownMs ?? 15 * 60 * 1000; // default 15 minutes

    // Query recent pending alerts for this student
    const recentAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), args.type),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();

    if (recentAlerts.some((a) => now - a.createdAt < cooldown)) {
      console.log(`[ALERT SUPPRESSED] Duplicate ${args.type} alert suppressed under cooldown`);
      return { created: false, suppressed: true };
    }

    const alertId = await insertSafetyAlert(ctx, {
      userId,
      type: args.type,
      source: args.source ?? "system",
      sourceId: args.sourceId,
    });

    return { created: true, alertId, suppressed: false };
  },
});

/**
 * Student: record that they closed the suicide-flag emergency screen.
 * The screen stays dismissible (so students are never locked out of support tools),
 * but every dismissal is stamped on their open suicide alerts so counsellors can see it.
 */
export const recordEmergencyScreenDismissal = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "emergency_dismissal", 30, 60 * 60 * 1000);

    const now = Date.now();
    const openSuicideAlerts = (
      await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    ).filter(
      (a) => (a.type === "suicide" || a.type === "suicideRisk") && a.status !== "resolved"
    );

    for (const alert of openSuicideAlerts) {
      await ctx.db.patch(alert._id, {
        studentDismissedAt: now,
        studentDismissCount: (alert.studentDismissCount ?? 0) + 1,
      });
    }

    await logAuditEvent(
      ctx,
      userId,
      "emergency_screen_dismissed",
      `Student closed the emergency safety screen (${openSuicideAlerts.length} open suicide alert(s) stamped).`
    );

    return { recordedOnAlerts: openSuicideAlerts.length };
  },
});

/** Acknowledge an alert (Counselor or Admin only) */
export const acknowledgeAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    await assertCanAccessStudent(ctx, alert.userId);

    await ctx.db.patch(args.alertId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
  },
});

/** Get pending alerts for a user */
export const getPending = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    let user: any = null;
    try {
      user = await ctx.db.get(targetUserId as any);
    } catch {}

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q: any) => q.eq("clerkId", targetUserId))
        .first();
    }

    const searchIds = new Set<string>([targetUserId]);
    if (user) {
      if (user._id) searchIds.add(String(user._id));
      if (user.clerkId) searchIds.add(user.clerkId);
    }

    const allPending: any[] = [];
    for (const idToSearch of Array.from(searchIds)) {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();
      allPending.push(...alerts);
    }

    const seen = new Set<string>();
    return allPending
      .filter((a) => {
        const idStr = String(a._id);
        if (seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
});

/** Get all alerts for a user */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});

/** Provenance: Get safety alert along with its causal originating triage and screening attempt */
export const getAlertProvenance = query({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) return null;

    await assertCanAccessStudent(ctx, alert.userId);

    const triage = alert.triageId ? await ctx.db.get(alert.triageId) : null;
    const attempt = alert.attemptId ? await ctx.db.get(alert.attemptId) : null;

    return { alert, triage, attempt };
  },
});

/** Provenance: Get all alerts causally generated from a specific triage */
export const getTriageAlerts = query({
  args: { triageId: v.id("triages") },
  handler: async (ctx, args) => {
    const triage = await ctx.db.get(args.triageId);
    if (!triage) return [];

    await assertCanAccessStudent(ctx, triage.userId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_triageId", (q) => q.eq("triageId", triage._id))
      .collect();
  },
});

