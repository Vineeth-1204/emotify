/**
 * Adaptive Student Engagement Eligibility Engine
 *
 * Implements the core principle:
 *   "Send up to four engagement notifications per day, only when relevant.
 *    Never force four notifications simply to meet a quota."
 *
 * Enforces:
 *  - Student opt-in / preferences
 *  - Timezone-aware local day boundaries and quiet hours
 *  - 4 candidate windows (morning, afternoon/microgoal, evening, night)
 *  - Maximum 4 engagement notifications per local day (operational notifications exempt)
 *  - Minimum spacing between sends (default 2.5 hours)
 *  - Strict relevance: skips microgoal if no eligible goal; skips check-in/reflection if already done
 *  - Concurrency & idempotency safe via dedupe keys
 */

import type { Id } from "./_generated/dataModel";
import { readStoredEmotyPreferences } from "../common/companionName";
import {
  getMorningCheckinMessage,
  getMorningAffirmationMessage,
  getMicroGoalReminderMessage,
  getEveningReflectionMessage,
  getNightWindDownMessage,
} from "./engagementMessages";
import type { NotificationDestination } from "../common/notificationRoutes";

export type EngagementWindow = "morning" | "afternoon" | "evening" | "night";

export interface LocalTimeDetails {
  localHour: number;
  localMinute: number;
  localDateStr: string;
  startOfLocalDayMs: number;
  endOfLocalDayMs: number;
  timezone: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  window?: EngagementWindow;
  dedupeKey?: string;
  title?: string;
  message?: string;
  destination?: NotificationDestination;
  notificationType?: string;
  metadata?: Record<string, any>;
}

/**
 * Resolves local time details for a given timestamp and IANA timezone.
 * Defaults to "Asia/Kolkata" (IST), the standard institutional timezone for Emotify.
 */
export function getLocalTimeDetails(nowMs: number, timeZone = "Asia/Kolkata"): LocalTimeDetails {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    let year = "1970", month = "01", day = "01", hour = "0", minute = "0";
    for (const p of parts) {
      if (p.type === "year") year = p.value;
      if (p.type === "month") month = p.value;
      if (p.type === "day") day = p.value;
      if (p.type === "hour") hour = p.value;
      if (p.type === "minute") minute = p.value;
    }
    let h = parseInt(hour, 10);
    if (h === 24) h = 0;
    const m = parseInt(minute, 10);
    const localDateStr = `${year}-${month}-${day}`;

    // Calculate approximate start and end of local day in UTC epoch milliseconds
    const elapsedTodayMs = (h * 60 + m) * 60 * 1000;
    const startOfLocalDayMs = nowMs - elapsedTodayMs;
    const endOfLocalDayMs = startOfLocalDayMs + 24 * 60 * 60 * 1000 - 1;

    return {
      localHour: h,
      localMinute: m,
      localDateStr,
      startOfLocalDayMs,
      endOfLocalDayMs,
      timezone: timeZone,
    };
  } catch {
    // Documented explicit fallback if invalid timezone is supplied
    return getLocalTimeDetails(nowMs, "Asia/Kolkata");
  }
}

/**
 * Resolves which candidate engagement window matches the given local hour.
 * Returns null if outside all candidate windows or during quiet hours.
 */
export function resolveCandidateWindow(localHour: number, quietStart = 22, quietEnd = 7): EngagementWindow | null {
  // Quiet hours check
  if (localHour >= quietStart || localHour < quietEnd) {
    return null;
  }

  // 1. Morning window: 7:00 AM - 11:59 AM
  if (localHour >= 7 && localHour < 12) {
    return "morning";
  }
  // 2. Afternoon MicroGoal window: 12:00 PM - 4:59 PM
  if (localHour >= 12 && localHour < 17) {
    return "afternoon";
  }
  // 3. Evening reflection window: 5:00 PM - 8:59 PM
  if (localHour >= 17 && localHour < 21) {
    return "evening";
  }
  // 4. Night wind-down window: 9:00 PM - quietStart (e.g. 10:00 PM)
  if (localHour >= 21 && localHour < quietStart) {
    return "night";
  }

  return null;
}

/**
 * Evaluates whether a student is eligible for an engagement notification at the current moment,
 * and if so, constructs the tailored message and routing destination.
 */
export async function evaluateStudentEngagementEligibility(
  ctx: { db: any },
  studentId: string,
  nowMs = Date.now()
): Promise<EligibilityResult> {
  // 1. Fetch student user document
  const id = ctx.db.normalizeId("users", studentId);
  const user = id ? await ctx.db.get(id) : null;
  if (!user) {
    return { eligible: false, reason: "user_not_found" };
  }

  // Only students/patients are eligible for engagement loops (never counselors or admins)
  if (user.role && user.role !== "patient" && user.role !== "student") {
    return { eligible: false, reason: "role_not_eligible" };
  }
  if (user.status === "inactive") {
    return { eligible: false, reason: "user_inactive" };
  }

  // 2. Opt-out check
  const prefs = user.notificationPreferences;
  if (prefs?.engagementEnabled === false) {
    return { eligible: false, reason: "opted_out" };
  }

  // 3. Timezone & Quiet hours check
  const timezone = prefs?.timezone || "Asia/Kolkata";
  const quietStart = prefs?.quietHoursStart ?? 22;
  const quietEnd = prefs?.quietHoursEnd ?? 7;
  const time = getLocalTimeDetails(nowMs, timezone);

  if (time.localHour >= quietStart || time.localHour < quietEnd) {
    return { eligible: false, reason: "quiet_hours", metadata: { localHour: time.localHour, quietStart, quietEnd } };
  }

  const window = resolveCandidateWindow(time.localHour, quietStart, quietEnd);
  if (!window) {
    return { eligible: false, reason: "outside_windows", metadata: { localHour: time.localHour } };
  }

  // 4. Window Deduplication check: only one notification per candidate window per local date
  const dedupeKey = `engagement:${window}:${studentId}:${time.localDateStr}`;
  const existingForWindow = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_and_dedupe", (q: any) =>
      q.eq("recipientId", studentId).eq("dedupeKey", dedupeKey)
    )
    .first();

  if (existingForWindow) {
    return { eligible: false, reason: "already_sent_for_window", window, dedupeKey };
  }

  // 5. Daily Cap Check (max 4 per local day, operational notifications exempt)
  const maxPerDay = Math.min(Math.max(prefs?.maxPerDay ?? 4, 1), 4);
  const todayNotifs = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_and_created", (q: any) =>
      q.eq("recipientId", studentId).gte("createdAt", time.startOfLocalDayMs)
    )
    .collect();

  // ONLY count engagement notifications towards the cap!
  const todayEngagement = todayNotifs.filter(
    (n: any) => n.category === "engagement" || String(n.type).startsWith("engagement_")
  );

  if (todayEngagement.length >= maxPerDay) {
    return {
      eligible: false,
      reason: "daily_cap_reached",
      metadata: { currentCount: todayEngagement.length, maxPerDay },
    };
  }

  // 6. Minimum Spacing Check (default 2.5 hours = 150 minutes)
  const minSpacingHours = prefs?.minSpacingHours ?? 2.5;
  const minSpacingMs = minSpacingHours * 60 * 60 * 1000;
  if (todayEngagement.length > 0) {
    const latestCreated = Math.max(...todayEngagement.map((n: any) => n.createdAt));
    if (nowMs - latestCreated < minSpacingMs) {
      return {
        eligible: false,
        reason: "min_spacing",
        metadata: {
          elapsedMinutes: Math.floor((nowMs - latestCreated) / 60000),
          requiredMinutes: minSpacingHours * 60,
        },
      };
    }
  }

  // 7. Context Resolution (Name & Companion)
  const companionPrefs = readStoredEmotyPreferences(user);
  const companionName = companionPrefs?.name || "Emoty";
  const studentName = user.full_name || user.alias || "friend";
  const seed = (nowMs % 100000) + studentName.length;

  // 8. Relevancy & Adaptive Content Generation per Window
  let notificationType = `engagement_${window}`;
  let title = "";
  let message = "";
  let destination: NotificationDestination = "home";

  if (window === "morning") {
    // Check if check-in already done today
    const checkin = await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q: any) =>
        q.eq("userId", studentId).eq("dateStr", time.localDateStr)
      )
      .first();

    const recentLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId_and_createdAt", (q: any) =>
        q.eq("userId", studentId).gte("createdAt", time.startOfLocalDayMs)
      )
      .first();

    if (checkin || recentLogs) {
      // Check-in already done: send warm positive affirmation instead of badgering
      const content = getMorningAffirmationMessage({ name: studentName, companionName, seed });
      title = content.title;
      message = content.message;
      destination = "home";
    } else {
      // Check-in not yet done: invite to check in
      const content = getMorningCheckinMessage({ name: studentName, companionName, seed });
      title = content.title;
      message = content.message;
      destination = "emotion_map";
    }
  } else if (window === "afternoon") {
    // Afternoon: MicroGoal reminder
    // Must select a REAL, incomplete MicroGoal belonging to this student
    const goals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q: any) => q.eq("userId", studentId))
      .collect();

    const incompleteGoals = goals.filter(
      (g: any) =>
        !g.completed &&
        !g.skipped &&
        g.status !== "completed" &&
        g.status !== "skipped"
    );

    if (incompleteGoals.length === 0) {
      // SKIP! Never invent a fake goal
      return { eligible: false, reason: "no_eligible_microgoal", window };
    }

    // Pick most recent active goal
    const targetGoal = incompleteGoals.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
    const content = getMicroGoalReminderMessage({
      name: studentName,
      companionName,
      goalTitle: targetGoal.goalTitle || targetGoal.goal || "your goal",
      seed,
    });
    title = content.title;
    message = content.message;
    destination = "microgoals";
  } else if (window === "evening") {
    // Evening: Emotion reflection
    // Check if student logged an emotion in the evening window (after 5 PM local time)
    const fivePmLocalMs = time.startOfLocalDayMs + 17 * 60 * 60 * 1000;
    const eveningLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId_and_createdAt", (q: any) =>
        q.eq("userId", studentId).gte("createdAt", fivePmLocalMs)
      )
      .first();

    if (eveningLogs) {
      return { eligible: false, reason: "evening_reflection_already_completed", window };
    }

    const content = getEveningReflectionMessage({ name: studentName, companionName, seed });
    title = content.title;
    message = content.message;
    destination = "emotion_map";
  } else if (window === "night") {
    // Night: Wind-down / breathing
    // Check if student did breathing or grounding within the last 2 hours
    const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
    const recentBreathing = await ctx.db
      .query("breathingLogs")
      .withIndex("by_userId_and_createdAt", (q: any) =>
        q.eq("userId", studentId).gte("createdAt", twoHoursAgo)
      )
      .first();

    const recentGrounding = await ctx.db
      .query("groundingLogs")
      .withIndex("by_userId_and_createdAt", (q: any) =>
        q.eq("userId", studentId).gte("createdAt", twoHoursAgo)
      )
      .first();

    if (recentBreathing || recentGrounding) {
      return { eligible: false, reason: "night_activity_already_completed", window };
    }

    const content = getNightWindDownMessage({ name: studentName, companionName, seed });
    title = content.title;
    message = content.message;
    destination = "grounding";
  }

  return {
    eligible: true,
    window,
    dedupeKey,
    title,
    message,
    destination,
    notificationType,
    metadata: {
      localDateStr: time.localDateStr,
      localHour: time.localHour,
      timezone,
    },
  };
}
