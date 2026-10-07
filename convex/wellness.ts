import { v } from "convex/values";
import { query, mutation } from "./functions";
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
    const authSubject = identity.subject;

    // Student can only update their own profile; staff can update for an authorized student
    if (args.userId && args.userId !== authSubject) {
      await assertCanAccessStudent(ctx, args.userId);
    }
    const userId = (args.userId && args.userId !== authSubject) ? args.userId : authSubject;

    await checkRateLimit(ctx, userId, "journal_write", 5, 60000);

    // 1. Fetch non-clinical telemetry and behavioral records
    // NOTE: Clinical screening (PHQ-9, GAD-7, PQ-16) and triage records are STRICTLY EXCLUDED.
    // Standardized clinical scores MUST NOT be used to infer personality traits, archetypes, or wellness goals.
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

    // 2. Generate Non-Diagnostic Wellness Summary
    let personality_traits = ["Self-reflective"];
    let mood_pattern = "Mostly calm and stable";
    let wellness_goals = ["Build daily habits", "Practice mindfulness"];
    let energy_pattern = "Evening person";

    const completedGoals = microGoals.filter((g) => g.completed).length;

    // Mood pattern logic: non-clinical descriptive summary of logged emotional intensity
    const avgIntensity = emotionLogs.length > 0 
      ? emotionLogs.reduce((acc, log) => acc + (log.preIntensity || log.intensity || 0), 0) / emotionLogs.length 
      : 0;
    
    if (avgIntensity > 7) mood_pattern = "Expressive emotional intensity";
    else if (avgIntensity > 4) mood_pattern = "Moderate emotional shifts";
    else mood_pattern = "Mostly calm and stable";

    // Personality traits logic: derived purely from positive behavioral habit engagement
    if (jpmrLogs.length > 3) personality_traits.push("Values relaxation");
    if (completedGoals > 3) personality_traits.push("Consistent and improving");

    // Wellness goals logic: non-clinical, behavioral habit orientation
    if (jpmrLogs.length < 2) wellness_goals.push("Explore relaxation");
    if (completedGoals > 0) wellness_goals.push("Maintain daily momentum");

    // Energy pattern (local-time calculation based on creation times)
    let morningLogs = 0;
    if (args.timezoneOffsetMinutes !== undefined) {
      morningLogs = emotionLogs.filter((log) => {
        const localTime = new Date(log.createdAt - args.timezoneOffsetMinutes! * 60000);
        const hour = localTime.getUTCHours();
        return hour >= 5 && hour < 12;
      }).length;
    } else {
      morningLogs = emotionLogs.filter((log) => {
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

