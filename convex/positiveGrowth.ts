/**
 * Emotify Positive Growth Journey & Memory Persistence
 * Source: Emotify Project Specification & Positive Growth Path.docx
 */

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./functions";
import { assertCanAccessStudent } from "./authz";
import { logAuditEvent } from "./audit";
import { Id } from "./_generated/dataModel";

function sanitizeText(input: string): string {
  let sanitized = input.slice(0, 1000);
  sanitized = sanitized.replace(/<[^>]*>/g, ""); // Strip HTML
  return sanitized.trim();
}

/**
 * Save a 6-step Positive Growth memory entry.
 * Idempotent: Prevents duplicate writes on retry.
 */
export const savePositiveMemory = mutation({
  args: {
    userId: v.optional(v.string()),
    bestPartOfDay: v.string(), // Step 1: Positive Reflection
    strengthIdentified: v.string(), // Step 2: Strength Identification
    gratitudeResponse: v.string(), // Step 3: Gratitude Practice
    emotion: v.string(), // Step 4: Positive Emotion Awareness
    tomorrowGoal: v.string(), // Step 5: Growth Question
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const targetUserId = args.userId || identity.subject;

    // Student can only save their own positive memory
    if (targetUserId !== identity.subject) {
      await assertCanAccessStudent(ctx, targetUserId);
    }

    const cleanBestPart = sanitizeText(args.bestPartOfDay);
    const cleanStrength = sanitizeText(args.strengthIdentified);
    const cleanGratitude = sanitizeText(args.gratitudeResponse);
    const cleanEmotion = sanitizeText(args.emotion);
    const cleanTomorrow = sanitizeText(args.tomorrowGoal);

    if (!cleanBestPart || !cleanStrength || !cleanGratitude || !cleanEmotion || !cleanTomorrow) {
      throw new ConvexError("All Positive Growth reflection fields are required.");
    }

    // Idempotency: check if an identical memory was saved within the last 5 minutes or for the same sessionId
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const existing = await ctx.db
      .query("positiveMemories")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(10);

    const duplicate = existing.find(
      (m) =>
        (args.sessionId && m.sessionId === args.sessionId) ||
        (m.createdAt >= fiveMinAgo && m.bestPartOfDay === cleanBestPart && m.strengthIdentified === cleanStrength)
    );

    if (duplicate) {
      return { success: true, memoryId: duplicate._id, alreadySaved: true };
    }

    const memoryId = await ctx.db.insert("positiveMemories", {
      userId: targetUserId,
      bestPartOfDay: cleanBestPart,
      strengthIdentified: cleanStrength,
      gratitudeResponse: cleanGratitude,
      emotion: cleanEmotion,
      tomorrowGoal: cleanTomorrow,
      createdAt: Date.now(),
      sessionId: args.sessionId,
    });

    await logAuditEvent(ctx, targetUserId, "positive_memory_saved", "Student completed 6-step Positive Growth journey");

    return {
      success: true,
      memoryId,
      message: "Noticing good moments helps your mind remember your strengths. Saved to your memories! 🌟",
    };
  },
});

/**
 * Retrieve the student's saved positive memories.
 * Authoritative: Student can only view own memories; staff can view assigned student's memories.
 */
export const getPositiveMemories = query({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    const maxItems = Math.min(args.limit || 50, 100);
    const memories = await ctx.db
      .query("positiveMemories")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(maxItems);

    return memories;
  },
});

/**
 * Delete a saved positive memory.
 * Student can only delete their own memory.
 */
export const deletePositiveMemory = mutation({
  args: {
    id: v.id("positiveMemories"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");

    const memory = await ctx.db.get(args.id);
    if (!memory) throw new ConvexError("Memory not found");

    if (memory.userId !== identity.subject) {
      throw new ConvexError("Unauthorized: You can only delete your own saved memories.");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
