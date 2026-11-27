import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { query } from "./functions";
import { requireAdmin } from "./authz";

/**
 * Daily beta summary: who used what, errors, notification delivery, safety alerts and feedback,
 * for one local day. Counts only: no check-in moods, messages, answers or scores.
 *
 * - Dashboard (admins): Beta report page -> betaReport.getDailySummary.
 * - CLI (deployment owner): npx convex run betaReport:dailySummary '{"date":"2026-11-20"}'
 *
 * Exceptions thrown by functions are not stored in the database; see Logs in the Convex dashboard.
 * Each table is read for the day only, up to ROW_CAP rows; `truncated` lists any table that hit it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_CAP = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** India (UTC+5:30), as Date.getTimezoneOffset() reports it. */
const DEFAULT_TZ_OFFSET = -330;

/** Activities counted per user. `when` picks the timestamp that places a row in the day. */
const ACTIVITIES: Array<{ key: string; label: string; table: string; userField?: string; include?: (row: any) => boolean; when?: "completedAt" }> = [
  { key: "checkIns", label: "Daily check-in", table: "dailyCheckins" },
  { key: "emotionLogs", label: "Emotion logs", table: "emotionLogs" },
  { key: "emotionMaps", label: "Emotion map", table: "emotionMaps" },
  { key: "companionMessages", label: "Companion messages sent", table: "companionMessages", include: (r) => r.role === "user" },
  { key: "cbtSessions", label: "CBT sessions started", table: "cbtSessions" },
  { key: "reframes", label: "Reframes saved", table: "reframeLogs" },
  { key: "breathing", label: "Breathing", table: "breathingLogs" },
  { key: "grounding", label: "Grounding", table: "groundingLogs" },
  { key: "muscleRelaxation", label: "Muscle relaxation", table: "jpmrLogs" },
  { key: "microGoalsCompleted", label: "MicroGoals completed", table: "microGoals", include: (r) => r.completed === true, when: "completedAt" },
  { key: "screenings", label: "Screenings", table: "screeningAttempts" },
  { key: "appointments", label: "Appointments created", table: "appointments" },
  { key: "counsellorRequests", label: "Support requests", table: "counsellorRequests", userField: "user_id" },
  { key: "morningAffirmations", label: "Morning affirmation", table: "morningAffirmations" },
  { key: "eveningGratitudes", label: "Evening gratitude", table: "eveningGratitudes" },
  { key: "positiveMemories", label: "Positive memories", table: "positiveMemories" },
  { key: "feedback", label: "Feedback sent", table: "betaFeedback" },
];

const OPEN_ALERT_STATUSES = ["active", "pending"];

function dayWindow(date: string | undefined, tzOffsetMinutes: number | undefined) {
  const offset = tzOffsetMinutes ?? DEFAULT_TZ_OFFSET;
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) throw new Error("Invalid timezone offset.");
  let day = date;
  if (!day) day = new Date(Date.now() - offset * 60 * 1000).toISOString().slice(0, 10); // local "today"
  if (!DATE_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new Error("Invalid date.");
  const [y, m, d] = day.split("-").map(Number);
  const from = Date.UTC(y, m - 1, d) + offset * 60 * 1000;
  return { date: day, from, to: from + DAY_MS, tzOffsetMinutes: offset };
}

const inc = (map: Record<string, number>, key: string, by = 1) => {
  map[key] = (map[key] ?? 0) + by;
};

export async function buildDailySummary(ctx: { db: any }, date?: string, tzOffsetMinutes?: number) {
  const win = dayWindow(date, tzOffsetMinutes);
  const truncated: string[] = [];
  const rowsCreated = async (table: string, from = win.from) => {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_creation_time", (q: any) => q.gte("_creationTime", from).lt("_creationTime", win.to))
      .take(ROW_CAP);
    if (rows.length === ROW_CAP) truncated.push(table);
    return rows;
  };

  // ---- who used what -------------------------------------------------------------------
  const perUser = new Map<string, Record<string, number>>();
  const totals: Record<string, number> = {};
  for (const a of ACTIVITIES) {
    // Completion-based rows (MicroGoals) may have been created the day before.
    const rows = await rowsCreated(a.table, a.when ? win.from - DAY_MS : win.from);
    for (const row of rows) {
      if (a.include && !a.include(row)) continue;
      if (a.when) {
        const t = row[a.when];
        if (typeof t !== "number" || t < win.from || t >= win.to) continue;
      }
      const key = String(row[a.userField ?? "userId"] ?? "");
      if (!key) continue;
      if (!perUser.has(key)) perUser.set(key, {});
      inc(perUser.get(key)!, a.key);
      inc(totals, a.key);
    }
  }

  // Resolve user keys (canonical id or legacy clerkId) to one person each.
  const people = new Map<string, { id: string; name: string; label: string; role: string; activity: Record<string, number> }>();
  for (const [key, activity] of perUser) {
    const id = ctx.db.normalizeId("users", key);
    const user = id
      ? await ctx.db.get(id)
      : await ctx.db.query("users").withIndex("by_clerkId", (q: any) => q.eq("clerkId", key)).first();
    const personId = user ? String(user._id) : key;
    const existing = people.get(personId);
    if (existing) {
      for (const [k, n] of Object.entries(activity)) inc(existing.activity, k, n);
      continue;
    }
    people.set(personId, {
      id: personId,
      name: user?.full_name || user?.alias || "Unknown user",
      label: user?.patientId ? `Student ${user.patientId}` : user?.role === "admin" || user?.role === "counsellor" ? "Staff" : "No student ID",
      role: user?.role || "patient",
      activity: { ...activity },
    });
  }
  const users = [...people.values()]
    .map((p) => ({ ...p, total: Object.values(p.activity).reduce((s, n) => s + n, 0), featuresUsed: Object.keys(p.activity).length }))
    .sort((a, b) => b.total - a.total);
  const featureUsers: Record<string, number> = {};
  for (const u of users) for (const k of Object.keys(u.activity)) inc(featureUsers, k);

  // ---- errors ----------------------------------------------------------------------------
  const ai = await ctx.db
    .query("aiTelemetryLogs")
    .withIndex("by_timestamp", (q: any) => q.gte("timestamp", win.from).lt("timestamp", win.to))
    .take(ROW_CAP);
  if (ai.length === ROW_CAP) truncated.push("aiTelemetryLogs");
  const aiErrors: Record<string, number> = {};
  for (const r of ai) if (r.errorCode) inc(aiErrors, r.errorCode);
  const audit = await rowsCreated("auditLogs");
  const problemActions: Record<string, number> = {};
  for (const r of audit) if (/fail|error|exceeded|denied|refused/i.test(r.action)) inc(problemActions, r.action);

  // ---- notifications ---------------------------------------------------------------------
  const notes = await rowsCreated("notifications");
  const pushByStatus: Record<string, number> = {};
  const pushErrors: Record<string, number> = {};
  let read = 0;
  for (const n of notes) {
    if (n.read) read++;
    if (n.pushStatus) inc(pushByStatus, n.pushStatus);
    if (n.pushError) inc(pushErrors, n.pushError);
  }

  // ---- safety ----------------------------------------------------------------------------
  const alerts = await rowsCreated("alerts");
  const alertsByType: Record<string, number> = {};
  const alertsByStatus: Record<string, number> = {};
  const emergencyContact: Record<string, number> = {};
  for (const a of alerts) {
    inc(alertsByType, a.type);
    inc(alertsByStatus, a.status);
    if (a.externalDispatchStatus) inc(emergencyContact, a.externalDispatchStatus);
  }
  let openAlertsNow = 0;
  for (const status of OPEN_ALERT_STATUSES) {
    openAlertsNow += (await ctx.db.query("alerts").withIndex("by_status", (q: any) => q.eq("status", status)).take(500)).length;
  }
  const noRecipientAlerts = audit.filter((r: any) => r.action === "alert_delivery_failure").length;

  // ---- phone (push) registration ---------------------------------------------------------
  const allUsers = await ctx.db.query("users").take(5000);
  const studentUsers = allUsers.filter((u: any) => (!u.role || u.role === "patient" || u.role === "student") && u.status !== "inactive");
  const tokenRows = await ctx.db.query("pushTokens").take(5000);
  const withDevice = new Set(tokenRows.map((t: any) => t.userId));
  const regEvents = await ctx.db
    .query("pushRegistrationEvents")
    .withIndex("by_createdAt", (q: any) => q.gte("createdAt", win.from).lt("createdAt", win.to))
    .take(ROW_CAP);
  const registrationProblems: Record<string, number> = {};
  for (const e of regEvents) if (e.status !== "ok") inc(registrationProblems, `${e.stage}: ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`);
  const pushRegistration = {
    students: studentUsers.length,
    studentsWithDevice: studentUsers.filter((u: any) => withDevice.has(String(u._id))).length,
    studentsWithoutDevice: studentUsers
      .filter((u: any) => !withDevice.has(String(u._id)))
      .slice(0, 50)
      .map((u: any) => ({ name: u.full_name || u.alias || "Unknown", label: u.patientId ? `Student ${u.patientId}` : "No student ID" })),
    registeredToday: regEvents.filter((e: any) => e.stage === "registered" && e.status === "ok").length,
    problemsToday: registrationProblems,
  };

  // ---- feedback --------------------------------------------------------------------------
  const feedbackRows = await ctx.db
    .query("betaFeedback")
    .withIndex("by_createdAt", (q: any) => q.gte("createdAt", win.from).lt("createdAt", win.to))
    .order("desc")
    .take(200);
  const nameOf = (userId: string) => {
    const p = people.get(userId);
    return p ? `${p.name} (${p.label})` : "Unknown user";
  };
  const feedback = feedbackRows
    .map((f: any) => ({ createdAt: f.createdAt, category: f.category, message: f.message, screen: f.screen ?? null, flagged: f.flagged, from: nameOf(f.userId) }))
    .sort((a: any, b: any) => Number(b.flagged) - Number(a.flagged) || b.createdAt - a.createdAt);

  return {
    window: win,
    activity: {
      activeUsers: users.length,
      activeStudents: users.filter((u) => u.role !== "admin" && u.role !== "counsellor").length,
      labels: Object.fromEntries(ACTIVITIES.map((a) => [a.key, a.label])),
      totals,
      featureUsers,
      users,
    },
    errors: {
      ai: {
        requests: ai.length,
        geminiCalls: ai.filter((r: any) => r.geminiCalled).length,
        geminiFailures: ai.filter((r: any) => r.geminiCalled && !r.geminiSuccess).length,
        fallbacks: ai.filter((r: any) => r.fallbackUsed).length,
        rateLimited: ai.filter((r: any) => r.path === "rate_limited").length,
        byErrorCode: aiErrors,
      },
      auditProblems: problemActions,
      pushFailures: (pushByStatus.failed ?? 0) + (pushByStatus.partially_failed ?? 0),
      note: "Function exceptions are not stored in the database; check Logs in the Convex dashboard.",
    },
    notifications: { created: notes.length, read, pushByStatus, pushErrors },
    pushRegistration,
    safety: {
      alertsCreated: alerts.length,
      byType: alertsByType,
      byStatus: alertsByStatus,
      emergencyContactDispatch: emergencyContact,
      noRecipientAlerts,
      openAlertsNow,
      emergencyRequests: (await rowsCreated("counsellorRequests")).filter((r: any) => r.sourceType === "emergency_modal").length,
    },
    feedback,
    truncated: [...new Set(truncated)],
  };
}

const args = { date: v.optional(v.string()), tzOffsetMinutes: v.optional(v.number()) };

/** Admin dashboard: the daily beta summary. */
export const getDailySummary = query({
  args,
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    return buildDailySummary(ctx, a.date, a.tzOffsetMinutes);
  },
});

/** Deployment owner, from the CLI: npx convex run betaReport:dailySummary '{"date":"YYYY-MM-DD"}' */
export const dailySummary = internalQuery({
  args,
  handler: async (ctx, a) => buildDailySummary(ctx, a.date, a.tzOffsetMinutes),
});
