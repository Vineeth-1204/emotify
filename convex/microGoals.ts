import { v, ConvexError, type ObjectType } from "convex/values";
import { internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { checkRateLimit } from "./rateLimiter";
import { logAuditEvent } from "./audit";
import type { Id } from "./_generated/dataModel";
import { assertCanAccessStudent } from "./authz";

// ==========================================
// 1. GOAL ENGINE & RECOMMENDATION TEMPLATES
// ==========================================

import {
  GoalTemplate,
  TEMPLATES,
  ROUTINE_HABIT_CATALOG,
  selectDailyRoutineGoalsDeterministically,
  type AssignedGoalRecord,
} from "../common/interventions";

export type { GoalTemplate };
export { TEMPLATES, ROUTINE_HABIT_CATALOG };

import {
  selectDailyMicroGoals,
  SYMPTOM_DEFINITIONS,
  MICROGOALS_CATALOGUE,
  COMPLETION_REINFORCEMENTS,
  GENTLE_NUDGES,
  WEEKLY_MODELING_MESSAGES,
  type StudentGoalHistoryItem,
} from "../common/symptomMicroGoals";
import { insertSafetyAlert } from "./alerts";


// ==========================================
// 2. HELPER: STREAK FREEZE & ACCOUNT LEVEL
// ==========================================

export function getLevelForXp(xp: number): number {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 450) return 3;
  if (xp < 700) return 4;
  if (xp < 1000) return 5;
  if (xp < 1400) return 6;
  if (xp < 1900) return 7;
  if (xp < 2500) return 8;
  if (xp < 3200) return 9;
  return 10;
}

function isValidCheckinDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return false;
  }
  // Max allowed future: up to 1 day ahead of UTC to account for timezones up to UTC+14
  const maxAllowedFuture = new Date();
  maxAllowedFuture.setUTCDate(maxAllowedFuture.getUTCDate() + 1);
  const maxDateStr = maxAllowedFuture.toISOString().split("T")[0];
  return dateStr <= maxDateStr;
}

function getPreviousDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, "0");
  const prevD = String(date.getDate()).padStart(2, "0");
  return `${prevY}-${prevM}-${prevD}`;
}

function getMondayDateStr(now: Date): string {
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function ensureWeeklyMission(ctx: any, userId: string, now: Date) {
  const weekStart = getMondayDateStr(now);

  const mission = await ctx.db
    .query("weeklyMissions")
    .withIndex("by_userId_and_weekStart", (q: any) => q.eq("userId", userId).eq("weekStart", weekStart))
    .first();

  if (!mission) {
    const id = await ctx.db.insert("weeklyMissions", {
      userId,
      weekStart,
      goalCountTarget: 18,
      goalCountCurrent: 0,
      jpmrTarget: 2,
      jpmrCurrent: 0,
      journalTarget: 5,
      journalCurrent: 0,
      completed: false,
      xpReward: 500,
      coinsReward: 100,
    });
    return (await ctx.db.get(id))!;
  }
  return mission;
}

async function ensureMonthlyChallenge(ctx: any, userId: string, now: Date) {
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const challenge = await ctx.db
    .query("monthlyChallenges")
    .withIndex("by_userId_and_monthStr", (q: any) => q.eq("userId", userId).eq("monthStr", monthStr))
    .first();

  if (!challenge) {
    const id = await ctx.db.insert("monthlyChallenges", {
      userId,
      monthStr,
      goalCountTarget: 70,
      goalCountCurrent: 0,
      streakTarget: 20,
      streakCurrent: 0,
      journalTarget: 20,
      journalCurrent: 0,
      completed: false,
      badgeRewardId: `monthly_${monthStr}`,
      badgeRewardName: `${now.toLocaleString('default', { month: 'long' })} Champion`,
    });
    return (await ctx.db.get(id))!;
  }
  return challenge;
}

// Check and resolve streak status dynamically, applying monthly freeze if needed
async function checkAndFreezeStreak(
  ctx: any,
  userId: string,
  clientDateStr?: string
): Promise<{ currentStreak: number; longestStreak: number; frozen: boolean }> {
  const streak = await ctx.db
    .query("streaks")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();

  if (!streak) {
    return { currentStreak: 0, longestStreak: 0, frozen: false };
  }

  const todayStr =
    clientDateStr && isValidCheckinDateStr(clientDateStr)
      ? clientDateStr
      : new Date().toISOString().split("T")[0];

  if (streak.lastCompletionDate === todayStr || streak.streakFrozenToday) {
    return { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak, frozen: !!streak.streakFrozenToday };
  }

  const yesterdayStr = getPreviousDateStr(todayStr);

  if (streak.lastCompletionDate === yesterdayStr) {
    return { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak, frozen: false };
  }

  // Streak broken! Check for streak freeze
  const user = await ctx.db.get(userId as Id<"users">);
  const now = Date.now();
  const currentMonth = new Date().getMonth(); // 0-11
  const currentYear = new Date().getFullYear();

  let freezeAvailable = true;
  if (user && user.lastStreakFreezeUsed) {
    const lastFreezeDate = new Date(user.lastStreakFreezeUsed);
    if (lastFreezeDate.getMonth() === currentMonth && lastFreezeDate.getFullYear() === currentYear) {
      freezeAvailable = false;
    }
  }

  if (freezeAvailable) {
    // Automatically apply a streak freeze to save the user's streak!
    await ctx.db.patch(userId as Id<"users">, { lastStreakFreezeUsed: now });
    await ctx.db.patch(streak._id, {
      streakFrozenToday: true,
      lastCompletionDate: yesterdayStr, // push completion date to yesterday so it connects
    });
    await logAuditEvent(ctx, userId, "streak_frozen", "Streak automatically preserved using monthly Streak Freeze");
    return { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak, frozen: true };
  } else {
    // No freezes left, reset streak
    await ctx.db.patch(streak._id, {
      currentStreak: 0,
      streakFrozenToday: false,
    });
    return { currentStreak: 0, longestStreak: streak.longestStreak, frozen: false };
  }
}

// ==========================================
// 3. SERVICE: RECOMMENDATION ENGINE
// ==========================================

async function generateRecommendedGoals(ctx: any, userId: string, mood: string, dateStr?: string) {
  // Goal templates list (standard non-clinical recommendation)
  // NOTE: Clinical triage levels (mild/moderate/severe/flags) and screening scores
  // are strictly excluded to preserve medical domain separation (P8-F02).
  // NOTE: args.mood is preserved for signature compatibility but intentionally unused (P8-MOOD-01).

  const todayStr =
    dateStr && isValidCheckinDateStr(dateStr)
      ? dateStr
      : new Date().toISOString().split("T")[0];

  // Fetch non-clinical assignment history for 7-day cooldown
  const allUserGoals = await ctx.db
    .query("microGoals")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  const assignedHistory: AssignedGoalRecord[] = allUserGoals.map((g: any) => ({
    goalId: g.goalId || g.id,
    createdAt: g.createdAt,
    date: g.date,
  }));

  const {
    selectedSmall,
    selectedMedium,
    selectedLarge,
    selectedChallenge,
  } = selectDailyRoutineGoalsDeterministically({
    userId,
    dateStr: todayStr,
    assignedHistory,
    cooldownDays: 7,
  });

  // Store in database
  const insertedIds = [];

  // Helper to insert a goal
  const insertGoal = async (g: GoalTemplate, isChallenge = false, isOptional = false) => {
    return await ctx.db.insert("microGoals", {
      userId,
      goalId: g.id,
      goalTitle: g.title,
      goalDescription: g.description,
      category: g.category,
      difficulty: g.difficulty,
      points: g.points, // legacy
      completed: false,
      skipped: false,
      createdAt: Date.now(),
      sourceType: isChallenge ? "challenge" : "routine",
      goal: g.title, // legacy compatibility
      date: todayStr, // legacy compatibility
      isDailyChallenge: isChallenge,
      reminderStatus: "scheduled",
      snoozeCount: 0,
      xpAwarded: g.points, // maps point value to XP
      coinsAwarded: g.points, // maps point value to Coins
    });
  };

  for (const g of selectedSmall) {
    insertedIds.push(await insertGoal(g));
  }
  for (const g of selectedMedium) {
    insertedIds.push(await insertGoal(g));
  }
  for (const g of selectedLarge) {
    insertedIds.push(await insertGoal(g, false, true));
  }
  for (const g of selectedChallenge) {
    insertedIds.push(await insertGoal(g, true));
  }

  return insertedIds;
}

// ==========================================
// 4. API QUERIES
// ==========================================

export const getTodayGoals = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    let startOfDay: number;
    let endOfDay: number;

    if (args.dateStr && isValidCheckinDateStr(args.dateStr)) {
      const [y, m, d] = args.dateStr.split("-").map(Number);
      startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    }

    const goals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    return goals.filter((g) => (args.dateStr ? g.date === args.dateStr : (g.createdAt >= startOfDay && g.createdAt < endOfDay)));
  },
});

export const getUserGoals = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});

export const getTodayCheckin = query({
  args: { dateStr: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const todayStr =
      args.dateStr && isValidCheckinDateStr(args.dateStr)
        ? args.dateStr
        : new Date().toISOString().split("T")[0];
    return await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", userId).eq("dateStr", todayStr))
      .first();
  },
});

export const getGoalHistory = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});

export const getWeeklySummary = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { completedCount: 0, pointsEarned: 0, completionRate: 0, totalCount: 0, skippedCount: 0, avgIntensityDrop: 0, reflectionMessage: "" };
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const allGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const recentGoals = allGoals.filter((g) => g.createdAt >= sevenDaysAgo);
    const completed = recentGoals.filter((g) => g.completed);
    const skipped = recentGoals.filter((g) => g.skipped);

    const pointsEarned = completed.reduce((sum, g) => sum + (g.points || g.xpAwarded || 1), 0);
    const totalCount = recentGoals.length;
    const completionRate = totalCount > 0 ? (completed.length / totalCount) * 100 : 0;

    const drops = completed.map((g) => g.intensityDrop).filter((d): d is number => typeof d === "number");
    const avgIntensityDrop = drops.length > 0 ? Number((drops.reduce((a, b) => a + b, 0) / drops.length).toFixed(1)) : 0;

    const reflectionMessage = completed.length > 0
      ? `This week you tried ${completed.length} calm activities and earned ${pointsEarned} Calm Points! Here's how your mood and worry have been trending. 📈`
      : "Start your calm journey with one small step today.";

    return {
      completedCount: completed.length,
      skippedCount: skipped.length,
      pointsEarned,
      completionRate,
      totalCount,
      avgIntensityDrop,
      reflectionMessage,
    };
  },
});

export const getWeeklyMission = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const now = new Date();
    const weekStart = getMondayDateStr(now);

    const mission = await ctx.db
      .query("weeklyMissions")
      .withIndex("by_userId_and_weekStart", (q) => q.eq("userId", userId).eq("weekStart", weekStart))
      .first();

    return mission;
  },
});

export const getMonthlyChallenge = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const challenge = await ctx.db
      .query("monthlyChallenges")
      .withIndex("by_userId_and_monthStr", (q) => q.eq("userId", userId).eq("monthStr", monthStr))
      .first();

    return challenge;
  },
});

export const getBadges = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    return await ctx.db
      .query("badges")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getPoints = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const userId = identity.subject;

    // Fetch user profile metrics
    const user = await ctx.db.get(userId as Id<"users">);
    return user?.coins || 0;
  },
});

export const getStreak = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { currentStreak: 0, longestStreak: 0, frozen: false };
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    const record = await ctx.db
      .query("streaks")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .first();

    if (!record) {
      return { currentStreak: 0, longestStreak: 0, frozen: false };
    }

    const todayStr =
      args.dateStr && isValidCheckinDateStr(args.dateStr)
        ? args.dateStr
        : new Date().toISOString().split("T")[0];

    if (record.lastCompletionDate === todayStr || record.streakFrozenToday) {
      return { currentStreak: record.currentStreak, longestStreak: record.longestStreak, frozen: !!record.streakFrozenToday };
    }

    const yesterdayStr = getPreviousDateStr(todayStr);

    if (record.lastCompletionDate === yesterdayStr) {
      return { currentStreak: record.currentStreak, longestStreak: record.longestStreak, frozen: false };
    }

    // Otherwise, the streak is broken (since last completion was before yesterday)
    // We don't mutate here (since this is a query), but we return 0 for currentStreak.
    return { currentStreak: 0, longestStreak: record.longestStreak, frozen: false };
  },
});

// For backward compatibility (legacy screens)
export const getByDate = query({
  args: { userId: v.optional(v.string()), date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    const goals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return goals.filter((g) => g.date === args.date || g.goalTitle !== undefined);
  },
});

export const getTotalPoints = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const userId = identity.subject;

    const user = await ctx.db.get(userId as Id<"users">);
    return user?.xp || 0; // Maps XP to points for compatibility
  },
});

export const getGamificationStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const user = await ctx.db.get(userId as Id<"users">);
    if (!user) return null;
    const xp = user.xp || 0;
    const calculatedLevel = getLevelForXp(xp);
    const level = Math.max(user.level || 1, calculatedLevel);
    const coins = user.coins || 0;

    return { xp, level, coins };
  },
});

// ==========================================
// 5. API MUTATIONS
// ==========================================

export const submitMorningCheckin = mutation({
  args: {
    mood: v.string(),
    dateStr: v.optional(v.string()),
    allowUpdate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    if (args.dateStr) {
      if (!isValidCheckinDateStr(args.dateStr)) {
        throw new Error("Invalid check-in date: Date must be a valid calendar date (YYYY-MM-DD) and cannot be in the future.");
      }
    }

    const todayStr = args.dateStr || new Date().toISOString().split("T")[0];

    // Check if checkin already exists for today
    const existing = await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", userId).eq("dateStr", todayStr))
      .first();

    if (existing) {
      if (args.allowUpdate) {
        await ctx.db.patch(existing._id, { mood: args.mood });
        return { success: true, updated: true, checkinId: existing._id };
      }
      return { success: false, message: "Already checked in today." };
    }

    await ctx.db.insert("dailyCheckins", {
      userId,
      dateStr: todayStr,
      mood: args.mood,
      createdAt: Date.now(),
    });

    // Clear uncompleted today goals first if user re-checks in or to refresh
    let startOfDayTime: number;
    if (todayStr && isValidCheckinDateStr(todayStr)) {
      const [y, m, d] = todayStr.split("-").map(Number);
      startOfDayTime = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    } else {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      startOfDayTime = startOfDay.getTime();
    }

    const todayGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const uncompletedToday = todayGoals.filter(
      (g) =>
        g.createdAt >= startOfDayTime &&
        !g.completed &&
        !g.skipped &&
        !g.cbtSessionId &&
        g.category?.toLowerCase() !== "cbt" &&
        !g.category?.toLowerCase()?.includes("cbt")
    );
    for (const g of uncompletedToday) {
      await ctx.db.delete(g._id);
    }

    // Call goal recommendation engine
    const insertedIds = await generateRecommendedGoals(ctx, userId, args.mood, todayStr);

    // Check and resolve streak freezes/resets in DB
    await checkAndFreezeStreak(ctx, userId, todayStr);

    // Ensure weekly and monthly missions exist
    const now = new Date();
    await ensureWeeklyMission(ctx, userId, now);
    await ensureMonthlyChallenge(ctx, userId, now);

    await logAuditEvent(ctx, userId, "checkin", `Morning check-in: ${args.mood}. Generated ${insertedIds.length} personalized goals.`);

    return { success: true };
  },
});

export const scheduleGoalRelative = mutation({
  args: {
    id: v.id("microGoals"),
    offsetMinutes: v.number(), // offset in minutes (e.g. 10, 30, 60)
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const scheduledTime = Date.now() + args.offsetMinutes * 60000;
    await ctx.db.patch(args.id, {
      scheduledTime,
      reminderStatus: "scheduled",
      skipped: false,
    });
  },
});

export const snoozeGoal = mutation({
  args: {
    id: v.id("microGoals"),
    snoozeMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const snoozeCount = (goal.snoozeCount || 0) + 1;
    const scheduledTime = Date.now() + args.snoozeMinutes * 60000;
    await ctx.db.patch(args.id, {
      scheduledTime,
      snoozeCount,
      reminderStatus: "snoozed",
    });
  },
});

async function completeGoalWithFeelingHelper(
  ctx: any,
  args: { id: Id<"microGoals">; feelingAfter: string; dateStr?: string; postIntensity?: number }
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const userId = identity.subject;

  const goal = await ctx.db.get(args.id);
  if (!goal) throw new Error("Goal not found");

  if (goal.userId !== userId) {
    throw new Error("Unauthorized");
  }

  if (goal.completed) return { success: false, message: "Goal already completed.", alreadyCompleted: true };

  const postInt = args.postIntensity;
  const preInt = goal.preIntensity;
  let intensityDrop: number | undefined = undefined;
  if (typeof postInt === "number" && typeof preInt === "number") {
    intensityDrop = preInt - postInt;
  }

  // 1. Mark complete & save feeling & pre/post intensity
  await ctx.db.patch(args.id, {
    completed: true,
    completedAt: Date.now(),
    feelingAfter: args.feelingAfter,
    postIntensity: postInt,
    intensityDrop,
    reminderStatus: "completed",
  });

  // 2. Award XP and Coins
  const user = await ctx.db.get(userId as Id<"users">);
  const xpAward = goal.xpAwarded || 10;
  const coinsAward = goal.coinsAwarded || 10;

  let newXp = (user?.xp || 0) + xpAward;
  let newCoins = (user?.coins || 0) + coinsAward;
  let currentLevel = user?.level || 1;
  let levelUp = false;

  const newCalculatedLevel = getLevelForXp(newXp);
  if (newCalculatedLevel > currentLevel) {
    currentLevel = newCalculatedLevel;
    levelUp = true;
  }

  // Check for perfect day bonus
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const allTodayGoals = await ctx.db
    .query("microGoals")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  const todayGoals = allTodayGoals.filter((g: any) => g.createdAt >= startOfDay.getTime());
  const uncompletedCount = todayGoals.filter((g: any) => !g.completed && !g.skipped && g._id !== args.id).length;

  let perfectDayBonus = false;
  if (uncompletedCount === 0 && todayGoals.length > 0) {
    perfectDayBonus = true;
    newXp += 100;
    newCoins += 100;
  }

  await ctx.db.patch(userId as Id<"users">, {
    xp: newXp,
    coins: newCoins,
    level: currentLevel,
  });

  const todayStr =
    args.dateStr && isValidCheckinDateStr(args.dateStr)
      ? args.dateStr
      : new Date().toISOString().split("T")[0];

  // 3. Update Streaks
  await checkAndFreezeStreak(ctx, userId, todayStr);

  const streakRecord = await ctx.db
    .query("streaks")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();

  const todayCompletedCount = todayGoals.filter((g: any) => g.completed || g._id === args.id).length;
  let currentStreak = 1;
  let longestStreak = 1;

  if (streakRecord) {
    if (todayCompletedCount >= 2 && streakRecord.lastCompletionDate !== todayStr) {
      // Increment streak once 2 goals completed today
      const yesterdayStr = getPreviousDateStr(todayStr);

      if (streakRecord.lastCompletionDate === yesterdayStr) {
        currentStreak = streakRecord.currentStreak + 1;
      } else {
        currentStreak = 1;
      }
      longestStreak = Math.max(streakRecord.longestStreak, currentStreak);

      await ctx.db.patch(streakRecord._id, {
        currentStreak,
        longestStreak,
        lastCompletionDate: todayStr,
        streakFrozenToday: false, // reset freeze flag
      });
    } else {
      currentStreak = streakRecord.currentStreak;
      longestStreak = streakRecord.longestStreak;
    }
  } else {
    if (todayCompletedCount >= 2) {
      await ctx.db.insert("streaks", {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastCompletionDate: todayStr,
        freezeCount: 1,
        streakFrozenToday: false,
      });
    }
  }

  // 4. Update Weekly Missions and Monthly Challenges progress
  // JPMR Category checks
  const isJpmr = goal.category.toLowerCase() === "relaxation" && goal.goalId === "jpmr_full";
  // Journal category checks
  const isJournal = goal.category.toLowerCase() === "journaling";

  // Weekly Mission Update
  const weekly = await ensureWeeklyMission(ctx, userId, new Date());

  if (weekly && !weekly.completed) {
    const updatedGoals = weekly.goalCountCurrent + 1;
    const updatedJpmr = isJpmr ? weekly.jpmrCurrent + 1 : weekly.jpmrCurrent;
    const updatedJournal = isJournal ? weekly.journalCurrent + 1 : weekly.journalCurrent;

    const completed =
      updatedGoals >= weekly.goalCountTarget &&
      updatedJpmr >= weekly.jpmrTarget &&
      updatedJournal >= weekly.journalTarget;

    await ctx.db.patch(weekly._id, {
      goalCountCurrent: updatedGoals,
      jpmrCurrent: updatedJpmr,
      journalCurrent: updatedJournal,
      completed,
    });

    if (completed) {
      // Award weekly mission rewards
      const freshUser = await ctx.db.get(userId as Id<"users">);
      const newXp = (freshUser?.xp || 0) + weekly.xpReward;
      const newLevel = getLevelForXp(newXp);
      await ctx.db.patch(userId as Id<"users">, {
        xp: newXp,
        coins: (freshUser?.coins || 0) + weekly.coinsReward,
        level: newLevel,
      });
      await logAuditEvent(ctx, userId, "weekly_mission_complete", `Completed weekly mission! Awarded +${weekly.xpReward} XP, +${weekly.coinsReward} Coins.`);
    }
  }

  // Monthly Challenge Update
  const monthly = await ensureMonthlyChallenge(ctx, userId, new Date());

  if (monthly && !monthly.completed) {
    const updatedGoals = monthly.goalCountCurrent + 1;
    const updatedJournal = isJournal ? monthly.journalCurrent + 1 : monthly.journalCurrent;
    const streakTarget = monthly.streakTarget;

    const completed =
      updatedGoals >= monthly.goalCountTarget &&
      currentStreak >= streakTarget &&
      updatedJournal >= monthly.journalTarget;

    await ctx.db.patch(monthly._id, {
      goalCountCurrent: updatedGoals,
      streakCurrent: currentStreak,
      journalCurrent: updatedJournal,
      completed,
    });

    if (completed) {
      // Award badge
      await ctx.db.insert("badges", {
        userId,
        badgeId: monthly.badgeRewardId,
        badgeName: monthly.badgeRewardName,
        earnedAt: Date.now(),
      });
      await logAuditEvent(ctx, userId, "monthly_challenge_complete", `Completed monthly challenge! Awarded badge: ${monthly.badgeRewardName}`);
    }
  }

  // 5. Award Badges
  const existingBadges = await ctx.db
    .query("badges")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  const hasBadge = (badgeId: string) => existingBadges.some((b: any) => b.badgeId === badgeId);

  const awardBadge = async (badgeId: string, badgeName: string) => {
    if (!hasBadge(badgeId)) {
      await ctx.db.insert("badges", {
        userId,
        badgeId,
        badgeName,
        earnedAt: Date.now(),
      });
      await logAuditEvent(ctx, userId, "badge_earned", `Earned badge: ${badgeName}`);
    }
  };

  const totalCompleted = allTodayGoals.filter((g: any) => g.completed).length + 1;

  if (totalCompleted >= 1) await awardBadge("first_step", "First Step");
  if (currentStreak >= 3) await awardBadge("beginner_streak", "Beginner Streak");
  if (currentStreak >= 7) await awardBadge("consistent", "Consistent");
  if (currentStreak >= 14) await awardBadge("strong_mind", "Strong Mind");
  if (currentStreak >= 30) await awardBadge("habit_builder", "Habit Builder");
  if (newCoins >= 100) await awardBadge("calm_builder", "Calm Builder");

  return {
    success: true,
    xpAward,
    coinsAward,
    levelUp,
    perfectDayBonus,
    newLevel: currentLevel,
  };
}

export const completeGoalWithFeeling = mutation({
  args: {
    id: v.id("microGoals"),
    feelingAfter: v.string(),
    dateStr: v.optional(v.string()),
    postIntensity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await completeGoalWithFeelingHelper(ctx, args);
  },
});

export const skipGoal = mutation({
  args: { id: v.id("microGoals") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { skipped: true, reminderStatus: "missed" });
  },
});

// Legacy backward-compatibility mutation wrappers
export const createGoal = mutation({
  args: {
    userId: v.optional(v.string()),
    goalId: v.string(),
    goalTitle: v.string(),
    goalDescription: v.string(),
    category: v.string(),
    difficulty: v.string(),
    points: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    const todayStr =
      args.dateStr && isValidCheckinDateStr(args.dateStr)
        ? args.dateStr
        : new Date().toISOString().split("T")[0];
    return await ctx.db.insert("microGoals", {
      userId,
      goalId: args.goalId,
      goalTitle: args.goalTitle,
      goalDescription: args.goalDescription,
      category: args.category,
      difficulty: args.difficulty,
      points: args.points,
      completed: false,
      skipped: false,
      createdAt: Date.now(),
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      goal: args.goalTitle,
      date: todayStr,
      reminderStatus: "scheduled",
      isDailyChallenge: false,
      xpAwarded: args.points,
      coinsAwarded: args.points,
    });
  },
});

export const scheduleGoal = mutation({
  args: {
    id: v.id("microGoals"),
    scheduledTime: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { scheduledTime: args.scheduledTime, reminderStatus: "scheduled" });
  },
});

export const completeGoal = mutation({
  args: {
    id: v.id("microGoals"),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Redirect to default feeling mutation logic
    const res = await completeGoalWithFeelingHelper(ctx, { id: args.id, feelingAfter: "same", dateStr: args.dateStr });
    return res;
  },
});

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    goalId: v.string(),
    goal: v.string(),
    points: v.number(),
    date: v.string(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    return await ctx.db.insert("microGoals", {
      userId,
      goalId: args.goalId,
      goalTitle: args.goal,
      goalDescription: "Small wellness activation goal",
      category: "Mindfulness",
      difficulty: "easy",
      points: args.points,
      completed: false,
      skipped: false,
      createdAt: Date.now(),
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      goal: args.goal,
      date: args.date,
      reminderStatus: "scheduled",
      xpAwarded: args.points,
      coinsAwarded: args.points,
    });
  },
});

export const markComplete = mutation({
  args: { id: v.id("microGoals") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    if (goal.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await completeGoalWithFeelingHelper(ctx, { id: args.id, feelingAfter: "same" });
  },
});

// ==========================================
// 6. PHASE 4: EMOTY-LED MICROGOAL ORCHESTRATION
// ==========================================

const getEmotySuggestedGoalArgs = {
  dateStr: v.optional(v.string()),
};

async function getEmotySuggestedGoalHandler(ctx: QueryCtx, args: ObjectType<typeof getEmotySuggestedGoalArgs>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const userId = identity.subject;

  const todayStr =
    args.dateStr && isValidCheckinDateStr(args.dateStr)
      ? args.dateStr
      : new Date().toISOString().split("T")[0];

  let startOfDay: number;
  let endOfDay: number;
  if (todayStr && isValidCheckinDateStr(todayStr)) {
    const [y, m, d] = todayStr.split("-").map(Number);
    startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  } else {
    const now = new Date();
    startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  }

  const allUserGoals = await ctx.db
    .query("microGoals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const todayGoals = allUserGoals.filter((g) => (args.dateStr ? g.date === todayStr : (g.createdAt >= startOfDay && g.createdAt < endOfDay)));

  // 1. If an active uncompleted and unskipped goal exists for today in DB:
  const activeGoal = todayGoals.find((g) => !g.completed && !g.skipped);
  if (activeGoal) {
    return {
      persisted: true,
      _id: activeGoal._id,
      goalId: activeGoal.goalId || (activeGoal as any).id || "water",
      goalTitle: activeGoal.goalTitle || (activeGoal as any).goal || "Drink a glass of water",
      goalDescription: activeGoal.goalDescription || "",
      category: activeGoal.category,
      difficulty: activeGoal.difficulty,
      points: activeGoal.points || activeGoal.xpAwarded || 10,
      completed: false,
      skipped: false,
      status: "active" as const,
    };
  }

  // 2. If all today's goals are completed:
  const completedGoals = todayGoals.filter((g) => g.completed);
  if (todayGoals.length > 0 && completedGoals.length === todayGoals.length) {
    const lastCompleted = completedGoals[completedGoals.length - 1];
    return {
      persisted: true,
      _id: lastCompleted._id,
      goalId: lastCompleted.goalId || (lastCompleted as any).id || "water",
      goalTitle: lastCompleted.goalTitle || (lastCompleted as any).goal || "Drink a glass of water",
      goalDescription: lastCompleted.goalDescription || "",
      category: lastCompleted.category,
      difficulty: lastCompleted.difficulty,
      points: lastCompleted.points || lastCompleted.xpAwarded || 10,
      completed: true,
      skipped: false,
      status: "all_completed" as const,
    };
  }

  // 3. Otherwise, deterministically select today's small routine goal from the catalog:
  const assignedHistory: AssignedGoalRecord[] = allUserGoals.map((g: any) => ({
    goalId: g.goalId || g.id,
    createdAt: g.createdAt,
    date: g.date,
  }));

  const { selectedSmall } = selectDailyRoutineGoalsDeterministically({
    userId,
    dateStr: todayStr,
    assignedHistory,
    cooldownDays: 7,
  });

  const template = selectedSmall[0];
  if (!template) return null;

  return {
    persisted: false,
    goalId: template.id,
    goalTitle: template.title,
    goalDescription: template.description,
    category: template.category,
    difficulty: template.difficulty,
    points: template.points,
    whyItHelps: template.whyItHelps,
    estimatedTime: template.estimatedTime,
    completed: false,
    skipped: false,
    status: "suggested" as const,
  };
}

export const getEmotySuggestedGoal = query({ args: getEmotySuggestedGoalArgs, handler: getEmotySuggestedGoalHandler });

/** @deprecated Pre-Emoty name kept so installed app versions keep working. Remove once every client uses `getEmotySuggestedGoal`. */
export const getMitraSuggestedGoal = query({ args: getEmotySuggestedGoalArgs, handler: getEmotySuggestedGoalHandler });

const acceptEmotyGoalArgs = {
  goalId: v.optional(v.string()),
  dateStr: v.optional(v.string()),
};

async function acceptEmotyGoalHandler(ctx: MutationCtx, args: ObjectType<typeof acceptEmotyGoalArgs>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  const userId = identity.subject;

  const todayStr =
    args.dateStr && isValidCheckinDateStr(args.dateStr)
      ? args.dateStr
      : new Date().toISOString().split("T")[0];

  let startOfDay: number;
  let endOfDay: number;
  if (todayStr && isValidCheckinDateStr(todayStr)) {
    const [y, m, d] = todayStr.split("-").map(Number);
    startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  } else {
    const now = new Date();
    startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  }

  const allUserGoals = await ctx.db
    .query("microGoals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const todayGoals = allUserGoals.filter((g) => (args.dateStr ? g.date === todayStr : (g.createdAt >= startOfDay && g.createdAt < endOfDay)));

  // If a matching goal is already in DB for today:
  if (args.goalId) {
    const existingMatch = todayGoals.find((g: any) => (g.goalId === args.goalId || g._id === args.goalId) && !g.completed && !g.skipped);
    if (existingMatch) {
      return {
        id: existingMatch._id,
        goalId: existingMatch.goalId,
        goalTitle: existingMatch.goalTitle,
        goalDescription: existingMatch.goalDescription,
        points: existingMatch.points,
        category: existingMatch.category,
      };
    }
  }

  // If any active uncompleted goal exists:
  const activeGoal = todayGoals.find((g: any) => !g.completed && !g.skipped);
  if (activeGoal) {
    return {
      id: activeGoal._id,
      goalId: activeGoal.goalId,
      goalTitle: activeGoal.goalTitle,
      goalDescription: activeGoal.goalDescription,
      points: activeGoal.points,
      category: activeGoal.category,
    };
  }

  // Otherwise, generate today's standard recommended goals via existing deterministic engine:
  const insertedIds = await generateRecommendedGoals(ctx, userId, "okay", todayStr);
  const firstGoal = (await ctx.db.get(insertedIds[0])) as any;
  if (!firstGoal) throw new ConvexError("Failed to initialize recommended goal");
  return {
    id: firstGoal._id,
    goalId: firstGoal.goalId,
    goalTitle: firstGoal.goalTitle,
    goalDescription: firstGoal.goalDescription,
    points: firstGoal.points,
    category: firstGoal.category,
  };
}

export const acceptEmotyGoal = mutation({ args: acceptEmotyGoalArgs, handler: acceptEmotyGoalHandler });

/** @deprecated Pre-Emoty name kept so installed app versions keep working. Remove once every client uses `acceptEmotyGoal`. */
export const acceptMitraGoal = mutation({ args: acceptEmotyGoalArgs, handler: acceptEmotyGoalHandler });

const skipEmotyGoalArgs = {
  id: v.optional(v.id("microGoals")),
  goalId: v.optional(v.string()),
  dateStr: v.optional(v.string()),
};

async function skipEmotyGoalHandler(ctx: MutationCtx, args: ObjectType<typeof skipEmotyGoalArgs>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  const userId = identity.subject;

  if (args.id) {
    const goal = await ctx.db.get(args.id);
    if (!goal) throw new ConvexError("Goal not found");
    if (goal.userId !== userId) throw new ConvexError("Unauthorized");
    await ctx.db.patch(args.id, { skipped: true, reminderStatus: "missed" });
    return { success: true, message: "No problem. We can try something else later." };
  }

  // If goal is referenced by goalId
  if (args.goalId) {
    const todayStr =
      args.dateStr && isValidCheckinDateStr(args.dateStr)
        ? args.dateStr
        : new Date().toISOString().split("T")[0];

    let startOfDay: number;
    let endOfDay: number;
    if (todayStr && isValidCheckinDateStr(todayStr)) {
      const [y, m, d] = todayStr.split("-").map(Number);
      startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    }

    const allUserGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const todayGoals = allUserGoals.filter((g) => g.createdAt >= startOfDay && g.createdAt < endOfDay);
    const match = todayGoals.find((g: any) => g.goalId === args.goalId && !g.completed && !g.skipped);
    if (match) {
      if (match.userId !== userId) throw new ConvexError("Unauthorized");
      await ctx.db.patch(match._id, { skipped: true, reminderStatus: "missed" });
    }
  }

  return { success: true, message: "No problem. We can try something else later." };
}

export const skipEmotyGoal = mutation({ args: skipEmotyGoalArgs, handler: skipEmotyGoalHandler });

/** @deprecated Pre-Emoty name kept so installed app versions keep working. Remove once every client uses `skipEmotyGoal`. */
export const skipMitraGoal = mutation({ args: skipEmotyGoalArgs, handler: skipEmotyGoalHandler });

// ==========================================
// 6. PHASE 6: SYMPTOM-BASED MICROGOAL ENGINE
// ==========================================

export async function getStudentSymptomProfile(ctx: any, userId: string): Promise<{
  symptoms: Array<{ key: string; score: number }>;
  todaySeverityAnchor: string;
}> {
  const latestAttempt = await ctx.db
    .query("screeningAttempts")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();

  const symptoms: Array<{ key: string; score: number }> = [];

  if (latestAttempt && latestAttempt.responses) {
    const phq = latestAttempt.responses.phq9 || {};
    const gad = latestAttempt.responses.gad7 || {};

    const getVal = (record: Record<string, number>, keyNum: number) => {
      return record[String(keyNum)] ?? record[`q${keyNum}`] ?? record[`phq9_q${keyNum}`] ?? record[`gad7_q${keyNum}`] ?? 0;
    };

    symptoms.push({ key: "low_interest", score: getVal(phq, 1) });
    symptoms.push({ key: "low_mood", score: getVal(phq, 2) });
    symptoms.push({ key: "sleep_difficulties", score: getVal(phq, 3) });
    symptoms.push({ key: "fatigue", score: getVal(phq, 4) });
    symptoms.push({ key: "appetite_changes", score: getVal(phq, 5) });
    symptoms.push({ key: "low_self_esteem", score: getVal(phq, 6) });
    symptoms.push({ key: "concentration_difficulties", score: getVal(phq, 7) });
    symptoms.push({ key: "restlessness_slowed", score: getVal(phq, 8) });
    symptoms.push({ key: "self_harm", score: getVal(phq, 9) });

    symptoms.push({ key: "nervousness", score: getVal(gad, 1) });
    symptoms.push({ key: "uncontrollable_worry", score: getVal(gad, 2) });
    symptoms.push({ key: "excessive_worry", score: getVal(gad, 3) });
    symptoms.push({ key: "trouble_relaxing", score: getVal(gad, 4) });
    symptoms.push({ key: "restlessness", score: getVal(gad, 5) });
    symptoms.push({ key: "irritability", score: getVal(gad, 6) });
    symptoms.push({ key: "fear", score: getVal(gad, 7) });
  }

  const recentEmotion = await ctx.db
    .query("emotionLogs")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();

  let todaySeverityAnchor = "Some";
  if (recentEmotion) {
    if (recentEmotion.preIntensity) {
      todaySeverityAnchor =
        recentEmotion.preIntensity >= 7 ? "Overwhelming" : recentEmotion.preIntensity >= 5 ? "A lot" : recentEmotion.preIntensity >= 3 ? "Some" : "A little";
    }
    const emotionStr = (recentEmotion.emotion || recentEmotion.strongestEmotion || "").toLowerCase();
    if (emotionStr.includes("lonel")) symptoms.push({ key: "loneliness", score: 3 });
    if (emotionStr.includes("burnout") || emotionStr.includes("exhaust")) symptoms.push({ key: "burnout", score: 3 });
    if (emotionStr.includes("study") || emotionStr.includes("exam") || emotionStr.includes("academic")) symptoms.push({ key: "academic_stress", score: 3 });
    if (emotionStr.includes("hopeless")) symptoms.push({ key: "hopelessness", score: 3 });
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const todayCheckin = await ctx.db
    .query("dailyCheckins")
    .withIndex("by_userId_and_dateStr", (q: any) => q.eq("userId", userId).eq("dateStr", todayStr))
    .first();

  if (todayCheckin) {
    const m = todayCheckin.mood.toLowerCase();
    if (m === "low" || m === "sad") symptoms.push({ key: "low_mood", score: 2 });
    if (m === "stressed" || m === "worried") symptoms.push({ key: "nervousness", score: 2 });
    if (m === "tired") symptoms.push({ key: "fatigue", score: 2 });
    if (m === "frustrated") symptoms.push({ key: "irritability", score: 2 });
  }

  if (symptoms.length === 0) {
    symptoms.push({ key: "low_mood", score: 1 });
    symptoms.push({ key: "nervousness", score: 1 });
  }

  return { symptoms, todaySeverityAnchor };
}

/**
 * Generate 3 personalized Symptom-Based MicroGoals (Must Do, Feel Better, Grow Stronger).
 * Enforces server-side limit of strictly max 3 goals per day per student.
 */
export const generateSymptomMicroGoals = mutation({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
    intensityAnchor: v.optional(v.string()),
    forceRegenerate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const todayStr = args.dateStr && isValidCheckinDateStr(args.dateStr) ? args.dateStr : new Date().toISOString().split("T")[0];

    // Enforce 3-goal daily limit server-side
    const allUserGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const todayGoals = allUserGoals.filter((g) => g.date === todayStr);

    if (todayGoals.length >= 3 && !args.forceRegenerate) {
      return {
        alreadyGenerated: true,
        safetyOverride: false,
        goals: todayGoals.slice(0, 3),
      };
    }

    const { symptoms, todaySeverityAnchor } = await getStudentSymptomProfile(ctx, targetUserId);
    const anchor = args.intensityAnchor || todaySeverityAnchor;

    const history: StudentGoalHistoryItem[] = allUserGoals.map((g) => ({
      goalId: g.goalId,
      createdAt: g.createdAt,
      completed: !!g.completed,
      skipped: !!g.skipped,
      preIntensity: g.preIntensity,
      postIntensity: g.postIntensity,
      intensityDrop: g.intensityDrop,
    }));

    const dateHash = todayStr.split("-").reduce((acc, part) => acc + Number(part), 0);

    const selection = selectDailyMicroGoals({
      studentId: targetUserId,
      symptoms,
      todaySeverityAnchor: anchor,
      history,
      cooldownDays: 3,
      explorationRate: 0.10,
      daySeed: dateHash,
    });

    if (selection.safetyOverride) {
      return {
        safetyOverride: true,
        dialogueMessage: selection.dialogueMessage,
        goals: [],
      };
    }

    if (selection.hopelessnessAlertTriggered) {
      await insertSafetyAlert(ctx, {
        userId: targetUserId,
        type: "hopelessness",
        source: "system",
      });
    }

    if (args.forceRegenerate) {
      for (const g of todayGoals.filter((g) => !g.completed && !g.skipped)) {
        await ctx.db.delete(g._id);
      }
    }

    const preIntensityVal = anchor === "Overwhelming" ? 8 : anchor === "A lot" ? 6 : anchor === "Some" ? 4 : 2;

    const insertedGoals = [];
    for (const res of selection.selectedGoals) {
      const id = await ctx.db.insert("microGoals", {
        userId: targetUserId,
        goalId: res.goal.id,
        goalTitle: res.goal.title,
        goalDescription: res.goal.description,
        category: res.goal.category,
        difficulty: res.goal.difficulty || "easy",
        points: 1, // +1 Calm Point standard
        completed: false,
        skipped: false,
        createdAt: Date.now(),
        slot: res.slot,
        symptomCategory: res.symptomKey,
        intensityGroup: res.intensityGroup,
        dialogueMessage: res.dialogue,
        date: todayStr,
        sourceType: "symptom_engine",
        preIntensity: preIntensityVal,
        reminderStatus: "scheduled",
        snoozeCount: 0,
        xpAwarded: 1,
        coinsAwarded: 1,
      });
      const inserted = await ctx.db.get(id);
      insertedGoals.push(inserted);
    }

    return {
      safetyOverride: false,
      dialogueMessage: selection.dialogueMessage,
      goals: insertedGoals,
    };
  },
});

/**
 * Retrieve today's 3 Symptom-Based MicroGoals.
 */
export const getTodaySymptomGoals = query({
  args: {
    userId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { goals: [], safetyOverride: false, dialogueMessage: "" };
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const todayStr = args.dateStr && isValidCheckinDateStr(args.dateStr) ? args.dateStr : new Date().toISOString().split("T")[0];

    // Check if safety override applies
    const { symptoms } = await getStudentSymptomProfile(ctx, targetUserId);
    const selfHarm = symptoms.find((s) => s.key === "self_harm" && s.score > 0);
    if (selfHarm) {
      return {
        goals: [],
        safetyOverride: true,
        dialogueMessage: SYMPTOM_DEFINITIONS.self_harm.dialogue,
      };
    }

    const allGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const todayGoals = allGoals.filter((g) => g.date === todayStr);
    const primaryDialogue = todayGoals.find((g) => g.dialogueMessage)?.dialogueMessage || "";

    return {
      goals: todayGoals.slice(0, 3),
      safetyOverride: false,
      dialogueMessage: primaryDialogue,
    };
  },
});

/**
 * Complete a Symptom MicroGoal with post-intensity and feeling.
 * Idempotent: Awards +1 Calm Point once.
 */
export const completeSymptomGoal = mutation({
  args: {
    id: v.id("microGoals"),
    feelingAfter: v.string(),
    postIntensity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const userId = identity.subject;

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new ConvexError("Goal not found");
    if (goal.userId !== userId) throw new ConvexError("Unauthorized");

    if (goal.completed) {
      return {
        success: true,
        alreadyCompleted: true,
        message: "Goal already completed.",
        calmPointsAwarded: 0,
      };
    }

    const preInt = goal.preIntensity ?? 5;
    const postInt = args.postIntensity;
    let intensityDrop: number | undefined = undefined;
    if (typeof postInt === "number") {
      intensityDrop = preInt - postInt;
    }

    await ctx.db.patch(args.id, {
      completed: true,
      completedAt: Date.now(),
      feelingAfter: args.feelingAfter,
      postIntensity: postInt,
      intensityDrop,
      reminderStatus: "completed",
    });

    // Award +1 Calm Point (points table + user record)
    const user = await ctx.db.get(userId as Id<"users">);
    if (user) {
      await ctx.db.patch(userId as Id<"users">, {
        coins: (user.coins || 0) + 1,
        xp: (user.xp || 0) + 1,
      });
    }

    const reinforcement = COMPLETION_REINFORCEMENTS[Math.floor(Math.random() * COMPLETION_REINFORCEMENTS.length)];

    await logAuditEvent(ctx, userId, "microgoal_completed", `Completed goal: ${goal.goalTitle}. +1 Calm Point.`);

    return {
      success: true,
      calmPointsAwarded: 1,
      intensityDrop,
      reinforcementMessage: reinforcement,
    };
  },
});

/**
 * Skip a Symptom MicroGoal penalty-free.
 */
export const skipSymptomGoal = mutation({
  args: { id: v.id("microGoals") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const userId = identity.subject;

    const goal = await ctx.db.get(args.id);
    if (!goal) throw new ConvexError("Goal not found");
    if (goal.userId !== userId) throw new ConvexError("Unauthorized");

    await ctx.db.patch(args.id, {
      skipped: true,
      reminderStatus: "missed",
    });

    const nudge = GENTLE_NUDGES[Math.floor(Math.random() * GENTLE_NUDGES.length)];
    return {
      success: true,
      nudgeMessage: nudge,
    };
  },
});

/**
 * Weekly MicroGoal summary with intensity trends and modeling message.
 */
export const getSymptomWeeklySummary = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        goalsAssigned: 0,
        goalsCompleted: 0,
        goalsSkipped: 0,
        calmPointsEarned: 0,
        avgIntensityDrop: 0,
        reflectionMessage: "Take one small step today to begin.",
        modelingMessage: WEEKLY_MODELING_MESSAGES[0],
      };
    }
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const recent = allGoals.filter((g) => g.createdAt >= sevenDaysAgo);
    const completed = recent.filter((g) => g.completed);
    const skipped = recent.filter((g) => g.skipped);

    const calmPointsEarned = completed.reduce((sum, g) => sum + (g.points || 1), 0);
    const drops = completed.map((g) => g.intensityDrop).filter((d): d is number => typeof d === "number");
    const avgIntensityDrop = drops.length > 0 ? Number((drops.reduce((a, b) => a + b, 0) / drops.length).toFixed(1)) : 0;

    const reflectionMessage = completed.length > 0
      ? `This week you tried ${completed.length} calm activities and earned ${calmPointsEarned} Calm Points! Here's how your mood and worry have been trending. 📈`
      : "You haven't completed any goals yet this week. No pressure — one tiny action is all it takes.";

    return {
      goalsAssigned: recent.length,
      goalsCompleted: completed.length,
      goalsSkipped: skipped.length,
      calmPointsEarned,
      avgIntensityDrop,
      reflectionMessage,
      modelingMessage: WEEKLY_MODELING_MESSAGES[0],
    };
  },
});

