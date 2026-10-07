import { v } from "convex/values";
import { query } from "./functions";

export const generatePositiveMessage = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const microGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    const emotionLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(3);

    const jpmrLogs = await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);

    // Default messages
    const generalMessages = [
      "You're doing great — small steps matter.",
      "Nice progress today, keep going.",
      "You showed up for yourself — that’s important.",
      "Even trying today is a win.",
    ];

    // Priority 1: Recent Goal Completion
    if (microGoals.length > 0 && microGoals[0].completed) {
      return {
        message: "Great job completing your goal today!",
        type: "success",
        context: "goal"
      };
    }

    // Priority 2: Emotional Improvement
    if (emotionLogs.length > 0) {
      const latest = emotionLogs[0];
      if (latest.preIntensity && latest.postIntensity && latest.postIntensity < latest.preIntensity) {
        return {
          message: "You’re learning to manage your feelings better.",
          type: "improvement",
          context: "emotion"
        };
      }
    }

    // Priority 3: JPMR Usage
    if (jpmrLogs.length > 0) {
      const lastJpmr = jpmrLogs[0];
      const now = Date.now();
      if (now - lastJpmr.createdAt < 1000 * 60 * 60 * 2) { // Within 2 hours
        return {
          message: "Taking time to relax is a powerful choice.",
          type: "relaxation",
          context: "jpmr"
        };
      }
    }

    // Priority 4: Goal Skipping (Mocked as lack of completion in recent goals)
    if (microGoals.length > 0 && !microGoals[0].completed) {
      return {
        message: "It’s okay — tomorrow is a fresh start.",
        type: "support",
        context: "goal_skip"
      };
    }

    // Default random positive message
    return {
      message: generalMessages[Math.floor(Math.random() * generalMessages.length)],
      type: "general",
      context: "routine"
    };
  },
});
