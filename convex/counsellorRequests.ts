import { v } from "convex/values";
import { mutation, query } from "./functions";
import { checkRateLimit } from "./rateLimiter";
import { requireCounselorOrAdmin, getAuthenticatedUser, assertCanAccessStudent, getStaffRecipientsForStudent } from "./authz";
import { sanitizePlainText } from "./sanitizer";

export const create = mutation({
  args: {
    user_id: v.optional(v.string()),
    thought_original: v.optional(v.string()),
    situation_text: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const caller = await getAuthenticatedUser(ctx);
    const canonicalUserId = caller ? String(caller._id) : identity.subject;

    // Server-authoritative identity enforcement:
    // If client provides a user_id, it must match the authenticated caller unless caller is staff.
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");
    if (args.user_id && args.user_id !== identity.subject && (!caller || (args.user_id !== String(caller._id) && args.user_id !== caller.clerkId))) {
      if (!isStaff) {
        throw new Error("Unauthorized: Cannot create counselor request for another user.");
      }
    }

    const effectiveUserId = (isStaff && args.user_id) ? args.user_id : canonicalUserId;
    if (isStaff && args.user_id) {
      await assertCanAccessStudent(ctx, args.user_id);
    }

    await checkRateLimit(ctx, effectiveUserId, "journal_write", 5, 60000);

    // Duplicate active request prevention: check for existing active request
    const searchIds = new Set<string>([effectiveUserId, identity.subject]);
    if (caller) {
      searchIds.add(String(caller._id));
      if (caller.clerkId) searchIds.add(caller.clerkId);
    }

    // Provenance validation for screening attempt and triage
    if (args.attemptId) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt) {
        throw new Error("Invalid provenance: Screening attempt not found.");
      }
      if (!searchIds.has(attempt.userId)) {
        throw new Error("Invalid provenance: Screening attempt does not belong to this student.");
      }
    }

    if (args.triageId) {
      const triage = await ctx.db.get(args.triageId);
      if (!triage) {
        throw new Error("Invalid provenance: Triage record not found.");
      }
      if (!searchIds.has(triage.userId)) {
        throw new Error("Invalid provenance: Triage record does not belong to this student.");
      }
    }

    // Duplicate active request prevention: check for existing active request
    const activeStatuses = new Set(["pending", "assigned", "scheduled"]);
    for (const uid of Array.from(searchIds)) {
      const existing = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", uid))
        .collect();

      const activeReq = existing.find((r) => activeStatuses.has(r.status || "pending"));
      if (activeReq) {
        // Return existing active request ID, do not create duplicate record or send duplicate notification
        return activeReq._id;
      }
    }

    const requestId = await ctx.db.insert("counsellorRequests", {
      user_id: effectiveUserId,
      thought_original: args.thought_original ? sanitizePlainText(args.thought_original) : undefined,
      situation_text: args.situation_text ? sanitizePlainText(args.situation_text) : undefined,
      timestamp: args.timestamp ?? Date.now(),
      status: "pending",
      sourceType: args.sourceType || "self_initiated",
      attemptId: args.attemptId,
      triageId: args.triageId,
      updatedAt: Date.now(),
    });

    // Notify admins and the student's assigned counsellor (all counsellors if unassigned)
    const allStaff = await getStaffRecipientsForStudent(ctx, effectiveUserId);
    const studentName = caller?.full_name || "A student";

    for (const staff of allStaff) {
      await ctx.db.insert("notifications", {
        recipientId: String(staff._id),
        type: "counsellor_request",
        title: "New Counselor Support Request",
        message: `${studentName} requested counselor support.`,
        priority: "medium",
        read: false,
        archived: false,
        createdAt: Date.now(),
      });
    }

    return requestId;
  },
});

export const updateStatus = mutation({
  args: {
    requestId: v.id("counsellorRequests"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Counsellor request not found");
    }
    if (request.user_id) {
      await assertCanAccessStudent(ctx, request.user_id);
    }

    const previousStatus = request.status;
    const sanitizedNotes = args.notes !== undefined ? sanitizePlainText(args.notes) : undefined;
    const isStatusSame = request.status === args.status;
    const isNotesSame = sanitizedNotes === undefined || sanitizedNotes === (request.notes || "");

    if (isStatusSame && isNotesSame) {
      return { success: true };
    }

    await ctx.db.patch(args.requestId, {
      status: args.status,
      notes: sanitizedNotes !== undefined ? sanitizedNotes : request.notes,
      updatedAt: Date.now(),
    });

    // Notify student if status has changed
    if (request.user_id && previousStatus !== args.status) {
      let title = "Counselor Request Update";
      let message = `Your counselor request status is now: ${args.status}.`;
      if (args.status === "assigned" || args.status === "scheduled") {
        title = "Counselor Request Scheduled";
        message = "A counselor has scheduled your support request.";
      } else if (args.status === "completed") {
        title = "Counselor Support Completed";
        message = "Your counselor support request has been completed.";
      } else if (args.status === "cancelled" || args.status === "dismissed") {
        title = "Counselor Request Closed";
        message = "Your counselor support request has been closed.";
      }

      await ctx.db.insert("notifications", {
        recipientId: request.user_id,
        type: "counsellor_request",
        title,
        message,
        priority: "medium",
        read: false,
        archived: false,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const getMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await getAuthenticatedUser(ctx);
    const searchIds = new Set<string>([identity.subject]);
    if (caller) {
      searchIds.add(String(caller._id));
      if (caller.clerkId) searchIds.add(caller.clerkId);
    }

    const allRequests: any[] = [];
    const seen = new Set<string>();

    for (const uid of Array.from(searchIds)) {
      const reqs = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", uid))
        .order("desc")
        .take(50);

      for (const r of reqs) {
        const idStr = String(r._id);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          allRequests.push(r);
        }
      }
    }

    allRequests.sort((a, b) => (b.timestamp ?? b._creationTime ?? 0) - (a.timestamp ?? a._creationTime ?? 0));
    return allRequests;
  },
});

export const getStudentCounsellorRequests = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(args.userId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }

    const searchIds = new Set<string>([args.userId]);
    if (targetUser) {
      searchIds.add(String(targetUser._id));
      if (targetUser.clerkId) searchIds.add(targetUser.clerkId);
    }

    const allRequests: any[] = [];
    const seen = new Set<string>();

    for (const uid of Array.from(searchIds)) {
      const reqs = await ctx.db
        .query("counsellorRequests")
        .withIndex("by_user_id", (q) => q.eq("user_id", uid))
        .order("desc")
        .take(50);

      for (const r of reqs) {
        const idStr = String(r._id);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          allRequests.push(r);
        }
      }
    }

    allRequests.sort((a, b) => (b.timestamp ?? b._creationTime ?? 0) - (a.timestamp ?? a._creationTime ?? 0));
    return allRequests;
  },
});

export const getRequestById = query({
  args: { requestId: v.id("counsellorRequests") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const request = await ctx.db.get(args.requestId);
    if (!request) return null;

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");

    if (isStaff) {
      await assertCanAccessStudent(ctx, request.user_id);
    } else {
      const isOwner =
        request.user_id === identity.subject ||
        (caller && request.user_id === String(caller._id)) ||
        (caller && caller.clerkId && request.user_id === caller.clerkId);

      if (!isOwner) {
        throw new Error("Unauthorized: Cannot view another student's counselor request.");
      }
    }

    return request;
  },
});
