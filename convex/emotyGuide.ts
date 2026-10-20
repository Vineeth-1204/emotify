import { v } from "convex/values";
import { mutation, query } from "./functions";
import { getSelfStudent } from "./authz";
import { CONFIRMED_STATUSES } from "../common/appointmentStatus";
import { EMOTY_DISMISSIBLE_ACTIONS, isLowMood, type EmotyGuideSignals } from "../common/homeEmotyAction";

/**
 * Signals for Emoty's next-step suggestion on Home (decided in common/homeEmotyAction.ts).
 * Student-only, for the caller's own records. Returns facts about activity (did a check-in,
 * an exercise, a reframe), never scores, notes or message text.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A reframe started within this many days counts as recent: don't suggest another. */
const REFRAME_RECENT_DAYS = 3;

/** Local "YYYY-MM-DD" -> the UTC instant that local day starts, given the device's offset. */
function localDayStart(dateStr: string, tzOffsetMinutes: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + tzOffsetMinutes * 60 * 1000;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function validDateArgs(dateStr: string, tzOffsetMinutes: number) {
  if (!DATE_RE.test(dateStr) || Number.isNaN(Date.parse(`${dateStr}T00:00:00Z`))) throw new Error("Invalid date.");
  if (!Number.isInteger(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 14 * 60) throw new Error("Invalid timezone offset.");
}

export const getMyGuideSignals = query({
  args: {
    dateStr: v.string(), // the student's local date
    tzOffsetMinutes: v.number(), // Date.prototype.getTimezoneOffset() on the device
  },
  handler: async (ctx, args): Promise<EmotyGuideSignals | null> => {
    const self = await getSelfStudent(ctx);
    if (!self) return null;
    validDateArgs(args.dateStr, args.tzOffsetMinutes);
    const dayStart = localDayStart(args.dateStr, args.tzOffsetMinutes);
    const reframeSince = dayStart - (REFRAME_RECENT_DAYS - 1) * DAY_MS;
    const canonical = String(self.user._id);

    // Check-ins: today's mood and how many of the last three days were low or heavy.
    let todayMood: string | null = null;
    let lowMoodDays = 0;
    for (let back = 0; back < 3; back++) {
      const date = shiftDate(args.dateStr, -back);
      let mood: string | null = null;
      for (const key of self.keys) {
        const row = await ctx.db
          .query("dailyCheckins")
          .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", key).eq("dateStr", date))
          .first();
        if (row) {
          mood = row.mood;
          break;
        }
      }
      if (back === 0) todayMood = mood;
      if (isLowMood(mood)) lowMoodDays++;
    }

    // Any calming exercise started today (breathing, grounding, muscle relaxation).
    let calmToolDoneToday = false;
    for (const key of self.keys) {
      if (calmToolDoneToday) break;
      const breathing = await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", key).gte("createdAt", dayStart))
        .first();
      const grounding = await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", key).gte("createdAt", dayStart))
        .first();
      const jpmr = (await ctx.db.query("jpmrLogs").withIndex("by_userId", (q) => q.eq("userId", key)).order("desc").take(5)).some(
        (l) => l.createdAt >= dayStart
      );
      calmToolDoneToday = !!breathing || !!grounding || jpmr;
    }

    // Any reframe (Think Differently session or saved reframe) in the last few days.
    let reframeDoneRecently = false;
    for (const key of self.keys) {
      if (reframeDoneRecently) break;
      const session = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId_and_timestamp", (q) => q.eq("userId", key).gte("timestamp", reframeSince))
        .first();
      const log = await ctx.db
        .query("reframeLogs")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", key).gte("createdAt", reframeSince))
        .first();
      const saved = (await ctx.db.query("reframes").withIndex("by_userId", (q) => q.eq("userId", key)).order("desc").take(3)).some(
        (r) => r.createdAt >= reframeSince
      );
      reframeDoneRecently = !!session || !!log || saved;
    }

    // A confirmed appointment today or tomorrow.
    const tomorrow = shiftDate(args.dateStr, 1);
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", self.user._id))
      .order("desc")
      .take(50);
    const confirmed = appointments.filter((a) => CONFIRMED_STATUSES.has(a.status));
    const appointmentSoon = confirmed.some((a) => a.date === args.dateStr)
      ? ("today" as const)
      : confirmed.some((a) => a.date === tomorrow)
        ? ("tomorrow" as const)
        : null;

    const dismissedRows = await ctx.db
      .query("emotyGuideDismissals")
      .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", canonical).eq("dateStr", args.dateStr))
      .take(20);

    return {
      todayMood,
      calmToolDoneToday,
      reframeDoneRecently,
      lowMoodDays,
      appointmentSoon,
      dismissed: [...new Set(dismissedRows.map((r) => r.action))],
    };
  },
});

/** "Not now": hide one suggestion for the rest of the student's local day. Idempotent. */
export const dismissNextStep = mutation({
  args: { action: v.string(), dateStr: v.string() },
  handler: async (ctx, args) => {
    const self = await getSelfStudent(ctx);
    if (!self) throw new Error("Unauthenticated: Login required.");
    if (!(EMOTY_DISMISSIBLE_ACTIONS as readonly string[]).includes(args.action)) throw new Error("Unknown suggestion.");
    validDateArgs(args.dateStr, 0);
    const userId = String(self.user._id);
    const existing = await ctx.db
      .query("emotyGuideDismissals")
      .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", userId).eq("dateStr", args.dateStr))
      .take(20);
    if (!existing.some((r) => r.action === args.action)) {
      await ctx.db.insert("emotyGuideDismissals", { userId, dateStr: args.dateStr, action: args.action, createdAt: Date.now() });
    }
    return { success: true };
  },
});
