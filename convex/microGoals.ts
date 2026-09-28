import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { logAuditEvent } from "./audit";
import type { Id } from "./_generated/dataModel";
import { assertCanAccessStudent } from "./authz";

// ==========================================
// 1. GOAL ENGINE & RECOMMENDATION TEMPLATES
// ==========================================

export interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  points: number; // legacy points
  category: string;
  difficulty: "easy" | "medium" | "very_small" | "large";
  whyItHelps: string;
  estimatedTime: string;
}

const TEMPLATES: Record<string, GoalTemplate[]> = {
  small: [
    { id: "water", title: "Drink a glass of water", description: "Stay hydrated to improve focus and alertness.", points: 10, category: "Hydration", difficulty: "easy", whyItHelps: "Hydration keeps your mind and body active.", estimatedTime: "1 min" },
    { id: "stretch_5", title: "Stretch for 5 minutes", description: "Do a few gentle body stretches.", points: 10, category: "Exercise", difficulty: "easy", whyItHelps: "Stretching releases physical tension accumulated from stress.", estimatedTime: "5 mins" },
    { id: "breathe", title: "Take 3 deep belly breaths", description: "Take slow, deep belly breaths to calm down.", points: 10, category: "Breathing", difficulty: "easy", whyItHelps: "Deep breathing lowers your heart rate and activates calm.", estimatedTime: "3 mins" },
    { id: "outside_brief", title: "Stand by an open window", description: "Stand outside or look at the sky for a moment.", points: 10, category: "Mindfulness", difficulty: "easy", whyItHelps: "Natural sunlight regulates sleep and raises serotonin.", estimatedTime: "5 mins" },
    { id: "music", title: "Listen to calming music", description: "Play some of your favorite relaxing music.", points: 10, category: "Relaxation", difficulty: "easy", whyItHelps: "Music activates neural pathways associated with pleasure.", estimatedTime: "5 mins" },
    { id: "gratitude_1", title: "Write one gratitude entry", description: "Jot down one thing you are grateful for today.", points: 10, category: "Gratitude", difficulty: "easy", whyItHelps: "Expressing gratitude rewires the brain to focus on safety.", estimatedTime: "2 mins" },
    { id: "dim_screens", title: "Dim screen brightness", description: "Reduce screen glare to prepare your eyes.", points: 10, category: "Sleep", difficulty: "easy", whyItHelps: "Low blue-light exposure supports natural sleep cycles.", estimatedTime: "1 min" },
    { id: "wash_face", title: "Splash face with cold water", description: "Splash cold water on your face.", points: 10, category: "Self Care", difficulty: "easy", whyItHelps: "Cool water stimulates the vagus nerve and aids alertness.", estimatedTime: "1 min" }
  ],
  medium: [
    { id: "journal_5", title: "Journal for 5 minutes", description: "Write down your current thoughts and feelings.", points: 25, category: "Journaling", difficulty: "medium", whyItHelps: "Journaling brings awareness to your emotional state.", estimatedTime: "5 mins" },
    { id: "breathe_478", title: "Practice 4-7-8 breathing", description: "Practice the 4-7-8 breathing technique for 3 minutes.", points: 25, category: "Breathing", difficulty: "medium", whyItHelps: "Rhythmic breathing provides an instant physiological pause.", estimatedTime: "3 mins" },
    { id: "nutrition_fruit", title: "Eat a healthy fruit or snack", description: "Eat a serving of fresh fruit or nuts.", points: 25, category: "Nutrition", difficulty: "medium", whyItHelps: "Nourishing your body supports emotional regulation.", estimatedTime: "10 mins" },
    { id: "study_review", title: "Review notes from one class", description: "Open a notebook and read over a single page.", points: 25, category: "Study Balance", difficulty: "medium", whyItHelps: "Reviewing a single page makes academic progress feel doable.", estimatedTime: "10 mins" },
    { id: "doodle_5", title: "Doodle or sketch for 5 mins", description: "Doodle or sketch on a piece of paper.", points: 25, category: "Creativity", difficulty: "medium", whyItHelps: "Creative expression relaxes the brain and improves focus.", estimatedTime: "5 mins" },
    { id: "friend_msg", title: "Message a friend", description: "Send a quick check-in message to a friend.", points: 25, category: "Social Connection", difficulty: "medium", whyItHelps: "Social connection counteracts isolating tendencies.", estimatedTime: "2 mins" }
  ],
  large: [
    { id: "jpmr_full", title: "Practice guided JPMR", description: "Do a quick guided muscle relaxation block.", points: 50, category: "Relaxation", difficulty: "large", whyItHelps: "JPMR systematically reduces deep muscle tension.", estimatedTime: "15 mins" },
    { id: "walk_20", title: "Walk outdoors for 20 minutes", description: "Go for a brisk walk around your neighborhood.", points: 50, category: "Exercise", difficulty: "large", whyItHelps: "Gentle aerobic exercise decreases stress hormones.", estimatedTime: "20 mins" },
    { id: "meditate_15", title: "15-minute body scan meditation", description: "Complete a 15-minute body scan mindfulness track.", points: 50, category: "Mindfulness", difficulty: "large", whyItHelps: "Mindfulness strengthens emotional resilience.", estimatedTime: "15 mins" },
    { id: "friend_call", title: "Call a family member/friend", description: "Call a loved one for a quick catch-up.", points: 50, category: "Social Connection", difficulty: "large", whyItHelps: "Verbal conversations foster a deep sense of belonging.", estimatedTime: "20 mins" },
    { id: "cook_healthy", title: "Cook a fresh healthy meal", description: "Prepare a nourishing meal using fresh ingredients.", points: 50, category: "Nutrition", difficulty: "large", whyItHelps: "Healthy eating promotes holistic physical and mental health.", estimatedTime: "30 mins" },
    { id: "hobby_30", title: "Spend 30 mins on a hobby", description: "Focus on a creative project or hobby you enjoy.", points: 50, category: "Creativity", difficulty: "large", whyItHelps: "Engaging in hobbies builds identity and reduces pressure.", estimatedTime: "30 mins" }
  ],
  challenge: [
    { id: "steps_5k", title: "Walk 5,000 steps today", description: "Hit 5,000 steps on your pedometer/phone tracker.", points: 75, category: "Exercise", difficulty: "large", whyItHelps: "Staying active releases dopamine and supports focus.", estimatedTime: "Daily" },
    { id: "detox_2h", title: "No social media for 2 hours", description: "Avoid browsing social media applications for a solid 2 hours.", points: 75, category: "Digital Detox", difficulty: "medium", whyItHelps: "Disconnecting from feeds lowers comparison anxiety.", estimatedTime: "2 hours" },
    { id: "water_2l", title: "Drink 2 liters of water", description: "Make sure you drink a full 2 liters of fluids today.", points: 75, category: "Hydration", difficulty: "medium", whyItHelps: "Optimal hydration maintains cell energy levels.", estimatedTime: "Daily" },
    { id: "sleep_11", title: "Sleep before 11:00 PM", description: "Wind down and turn off lights before 11:00 PM tonight.", points: 75, category: "Sleep", difficulty: "large", whyItHelps: "Early sleep cycles optimize deep REM restorative recovery.", estimatedTime: "Night" }
  ]
};

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
  // Get latest clinical triage level
  const triage = await ctx.db
    .query("triages")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();
  const triageLevel = triage?.level || "mild";
  const isSevere = triageLevel === "severe" || triageLevel === "suicide_flag" || triageLevel === "psychosis_flag";
  const isModerate = triageLevel === "moderate";

  // Adapt lists based on clinical severity
  let smallList = [...TEMPLATES.small];
  let mediumList = [...TEMPLATES.medium];
  let largeList = [...TEMPLATES.large];
  let challengeList = [...TEMPLATES.challenge];

  // If severe, ease difficulty: large goals become medium, medium goals become small
  if (isSevere) {
    smallList = [...TEMPLATES.small];
    mediumList = [...TEMPLATES.small]; // downgrade medium to small
    largeList = [...TEMPLATES.medium]; // downgrade large to medium
  }

  // Shuffle selections using seeded or dynamic random
  const shuffle = (arr: any[]) => arr.sort(() => 0.5 - Math.random());

  const selectedSmall = shuffle(smallList).slice(0, 2);
  const selectedMedium = shuffle(mediumList).slice(0, 1);
  const selectedLarge = shuffle(largeList).slice(0, 1);
  const selectedChallenge = shuffle(challengeList).slice(0, 1);

  const todayStr =
    dateStr && isValidCheckinDateStr(dateStr)
      ? dateStr
      : new Date().toISOString().split("T")[0];

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
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const uncompletedToday = todayGoals.filter(
      (g) =>
        g.createdAt >= startOfDay.getTime() &&
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
