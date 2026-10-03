import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
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

    return goals.filter((g) => g.createdAt >= startOfDay && g.createdAt < endOfDay);
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
    if (!identity) return { completedCount: 0, pointsEarned: 0, completionRate: 0, totalCount: 0 };
    const userId = identity.subject;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const allGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const recentGoals = allGoals.filter((g) => g.createdAt >= sevenDaysAgo);
    const completed = recentGoals.filter((g) => g.completed);

    const pointsEarned = completed.reduce((sum, g) => sum + (g.xpAwarded || g.points), 0);
    const totalCount = recentGoals.length;
    const completionRate = totalCount > 0 ? (completed.length / totalCount) * 100 : 0;

    return {
      completedCount: completed.length,
      pointsEarned,
      completionRate,
      totalCount,
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
  args: { id: Id<"microGoals">; feelingAfter: string; dateStr?: string }
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const userId = identity.subject;

  const goal = await ctx.db.get(args.id);
  if (!goal) throw new Error("Goal not found");

  if (goal.userId !== userId) {
    throw new Error("Unauthorized");
  }

  if (goal.completed) return { success: false, message: "Goal already completed." };

  // 1. Mark complete & save feeling
  await ctx.db.patch(args.id, {
    completed: true,
    completedAt: Date.now(),
    feelingAfter: args.feelingAfter,
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
// 6. PHASE 4: MITRA-LED MICROGOAL ORCHESTRATION
// ==========================================

export const getMitraSuggestedGoal = query({
  args: {
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

    const todayGoals = allUserGoals.filter((g) => g.createdAt >= startOfDay && g.createdAt < endOfDay);

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
  },
});

export const acceptMitraGoal = mutation({
  args: {
    goalId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

    const todayGoals = allUserGoals.filter((g) => g.createdAt >= startOfDay && g.createdAt < endOfDay);

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
  },
});

export const skipMitraGoal = mutation({
  args: {
    id: v.optional(v.id("microGoals")),
    goalId: v.optional(v.string()),
    dateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
  },
});

