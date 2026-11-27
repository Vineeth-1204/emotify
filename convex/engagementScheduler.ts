/**
 * Adaptive Student Engagement Scheduler
 *
 * Runs periodically (e.g. via crons or manual test trigger) to evaluate active students
 * against the adaptive engagement rules and dispatch timely notifications.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { createNotification } from "./notify";
import { evaluateStudentEngagementEligibility } from "./engagementEngine";

export const evaluateAndDispatchStudent = internalMutation({
  args: {
    studentId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const evaluation = await evaluateStudentEngagementEligibility(ctx, args.studentId, nowMs);

    if (!evaluation.eligible) {
      return {
        dispatched: false,
        reason: evaluation.reason,
        window: evaluation.window,
        metadata: evaluation.metadata,
      };
    }

    const { id, created } = await createNotification(ctx, {
      recipientId: args.studentId,
      type: evaluation.notificationType!,
      title: evaluation.title!,
      message: evaluation.message!,
      priority: "low",
      destination: evaluation.destination,
      dedupeKey: evaluation.dedupeKey,
      category: "engagement",
    });

    return {
      dispatched: created,
      notificationId: id,
      window: evaluation.window,
      dedupeKey: evaluation.dedupeKey,
      title: evaluation.title,
    };
  },
});

/** Bounds for one 30-minute run (well above the beta's size; see the warning below). */
const MAX_USERS_SCANNED = 5000;
const MAX_STUDENTS_PER_RUN = 1000;

export const evaluateAllEligibleStudents = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    batchLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.min(Math.max(args.batchLimit ?? MAX_STUDENTS_PER_RUN, 1), MAX_STUDENTS_PER_RUN);

    // Every active student is evaluated. (Previously only the first `limit * 2` accounts by
    // creation time were read, so students who joined later were never evaluated.)
    const allUsers = await ctx.db.query("users").take(MAX_USERS_SCANNED);
    const students = allUsers
      .filter((u: any) => (!u.role || u.role === "patient" || u.role === "student") && u.status !== "inactive")
      .slice(0, limit);
    if (allUsers.length === MAX_USERS_SCANNED || students.length === limit) {
      console.warn(`[ENGAGEMENT] student scan hit its bound (users read ${allUsers.length}, students ${students.length}); add pagination before growing further.`);
    }

    let dispatchedCount = 0;
    let skippedCount = 0;
    const details: Array<{ studentId: string; status: "dispatched" | "skipped"; reason?: string; window?: string }> = [];

    for (const student of students) {
      const studentId = String(student._id);
      const evalResult = await evaluateStudentEngagementEligibility(ctx, studentId, nowMs);

      if (!evalResult.eligible) {
        skippedCount++;
        details.push({ studentId, status: "skipped", reason: evalResult.reason, window: evalResult.window });
        continue;
      }

      const { created } = await createNotification(ctx, {
        recipientId: studentId,
        type: evalResult.notificationType!,
        title: evalResult.title!,
        message: evalResult.message!,
        priority: "low",
        destination: evalResult.destination,
        dedupeKey: evalResult.dedupeKey,
        category: "engagement",
      });

      if (created) {
        dispatchedCount++;
        details.push({ studentId, status: "dispatched", window: evalResult.window });
      } else {
        skippedCount++;
        details.push({ studentId, status: "skipped", reason: "deduplicated", window: evalResult.window });
      }
    }

    return {
      evaluatedCount: students.length,
      dispatchedCount,
      skippedCount,
      details,
    };
  },
});
