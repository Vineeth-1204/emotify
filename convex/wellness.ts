import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent } from "./authz";

export const getProfile = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("wellnessProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .unique();
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.optional(v.string()),
    timezoneOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // 1. Fetch all relevant data for generation
    const attempts = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    let screenings: any[] = [];
    const completed = attempts.filter((a) => a.status === "completed");
    if (completed.length > 0) {
      screenings = completed.map((a) => ({
        phq9_total: a.results?.phq9?.score ?? 0,
        gad7_total: a.results?.gad7?.score ?? 0,
        pq16_total: a.results?.pq16?.score ?? 0,
        createdAt: a.completedAt || a.startedAt,
      }));
    } else {
      screenings = await ctx.db
        .query("screenings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(5);
    }

    const emotionLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);

    const microGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);

    const jpmrLogs = await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);

    // 2. Generate Profile Logic
    let personality_traits = ["Reflective personality"];
    let mood_pattern = "Mostly calm";
    let wellness_goals = ["Reduce stress"];
    let energy_pattern = "Active in evening";

    const latestScreening = screenings[0];
    const completedGoals = microGoals.filter(g => g.completed).length;

    // Mood pattern logic
    const avgIntensity = emotionLogs.length > 0 
      ? emotionLogs.reduce((acc, log) => acc + (log.preIntensity || 0), 0) / emotionLogs.length 
      : 0;
    
    if (avgIntensity > 7) mood_pattern = "Easily stressed during pressure";
    else if (avgIntensity > 4) mood_pattern = "Moderate emotional shifts";
    else mood_pattern = "Mostly calm and stable";

    // Personality traits logic
    if (jpmrLogs.length > 3) personality_traits.push("Values relaxation");
    if (completedGoals > 3) personality_traits.push("Consistent and improving");
    if (latestScreening?.gad7_total > 10) personality_traits.push("Sensitive to stress");
    if (latestScreening?.phq9_total > 15) personality_traits.push("Needs gentle support");

    // Wellness goals logic
    if (latestScreening?.phq9_total > 10) wellness_goals.push("Gentle recovery");
    if (latestScreening?.phq9_total > 5) wellness_goals.push("Improve mood");
    if (latestScreening?.gad7_total > 5) wellness_goals.push("Build daily habits");
    if (jpmrLogs.length < 2) wellness_goals.push("Improve focus");

    // Energy pattern (mock logic based on creation times)
    let morningLogs = 0;
    if (args.timezoneOffsetMinutes !== undefined) {
      // args.timezoneOffsetMinutes is JS getTimezoneOffset() in minutes (UTC - local)
      morningLogs = emotionLogs.filter(log => {
        const localTime = new Date(log.createdAt - args.timezoneOffsetMinutes! * 60000);
        const hour = localTime.getUTCHours();
        return hour >= 5 && hour < 12;
      }).length;
    } else {
      // Documented architectural dependency: Without client-provided timezone offset
      // or a user timezone database field, server runtime executes in UTC.
      morningLogs = emotionLogs.filter(log => {
        const hour = new Date(log.createdAt).getHours();
        return hour >= 5 && hour < 12;
      }).length;
    }
    if (morningLogs > 3) energy_pattern = "Morning person";
    else energy_pattern = "Evening person";

    // 3. Save or Update
    const existing = await ctx.db
      .query("wellnessProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const profileData = {
      userId,
      personality_traits,
      mood_pattern,
      wellness_goals,
      energy_pattern,
      last_updated: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, profileData);
    } else {
      await ctx.db.insert("wellnessProfiles", profileData);
    }

    return profileData;
  },
});
