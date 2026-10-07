import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkRateLimit } from "./rateLimiter";
import { assertCanAccessStudent, getAuthenticatedUser } from "./authz";
import { sanitizePlainText } from "./sanitizer";

export const create = mutation({
  args: {
    userId: v.optional(v.string()),
    type: v.string(),
    dueDate: v.number(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    appointmentId: v.optional(v.id("appointments")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");

    let targetUserId: string;

    if (
      args.userId &&
      args.userId !== identity.subject &&
      (!caller || (args.userId !== String(caller._id) && args.userId !== caller.clerkId))
    ) {
      if (!isStaff) {
        throw new Error("Unauthorized: Cannot create follow-up for another user.");
      }
      targetUserId = args.userId;
    } else {
      targetUserId = caller ? String(caller._id) : identity.subject;
    }

    // Resolve target student to ensure existence
    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    if (!targetUser) {
      throw new Error("Target student not found.");
    }

    const canonicalTargetUserId = String(targetUser._id);
    const validStudentIds = new Set<string>([canonicalTargetUserId]);
    if (targetUser.clerkId) validStudentIds.add(targetUser.clerkId);

    await checkRateLimit(ctx, canonicalTargetUserId, "journal_write", 10, 60000);

    if (!args.type || args.type.trim().length === 0) {
      throw new Error("Type is required.");
    }

    // Appointment provenance validation
    if (args.appointmentId) {
      const appt = await ctx.db.get(args.appointmentId);
      if (!appt) {
        throw new Error("Invalid provenance: Appointment not found.");
      }
      if (!validStudentIds.has(String(appt.userId))) {
        throw new Error("Invalid provenance: Appointment does not belong to this student.");
      }
    }

    // Screening attempt provenance validation
    if (args.attemptId) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt) {
        throw new Error("Invalid provenance: Screening attempt record not found.");
      }
      if (!validStudentIds.has(attempt.userId)) {
        throw new Error("Unauthorized: Screening attempt does not belong to target student.");
      }
    }

    // Triage provenance validation
    if (args.triageId) {
      const triage = await ctx.db.get(args.triageId);
      if (!triage) {
        throw new Error("Invalid provenance: Triage record not found.");
      }
      if (!validStudentIds.has(triage.userId)) {
        throw new Error("Unauthorized: Triage record does not belong to target student.");
      }
    }

    const followUpId = await ctx.db.insert("followUps", {
      userId: canonicalTargetUserId,
      type: args.type.trim(),
      dueDate: args.dueDate,
      completed: false,
      status: "pending",
      sourceType: args.sourceType || (args.appointmentId ? "appointment" : "counselor"),
      attemptId: args.attemptId,
      triageId: args.triageId,
      appointmentId: args.appointmentId,
      notes: args.notes ? sanitizePlainText(args.notes) : undefined,
      createdAt: Date.now(),
    });

    if (isStaff) {
      await ctx.db.insert("notifications", {
        recipientId: canonicalTargetUserId,
        type: "follow_up_created",
        title: "Care Follow-up Scheduled",
        message: `A follow-up (${args.type.replace(/_/g, " ")}) has been scheduled for ${new Date(args.dueDate).toLocaleDateString()}.`,
        priority: "medium",
        read: false,
        archived: false,
        createdAt: Date.now(),
      });
    }

    return followUpId;
  },
});

export const getPending = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const targetUserId = args.userId || identity.subject;

    await assertCanAccessStudent(ctx, targetUserId);

    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    const searchIds = new Set<string>([targetUserId]);
    if (targetUser) {
      if (targetUser._id) searchIds.add(String(targetUser._id));
      if (targetUser.clerkId) searchIds.add(targetUser.clerkId);
    }

    const allFollowUps = [];
    for (const idToSearch of Array.from(searchIds)) {
      const res = await ctx.db
        .query("followUps")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .filter((q) => q.eq(q.field("completed"), false))
        .take(50);
      allFollowUps.push(...res);
    }

    const seen = new Set();
    return allFollowUps.filter((f) => {
      if (seen.has(String(f._id))) return false;
      seen.add(String(f._id));
      return true;
    });
  },
});

export const getStudentFollowUps = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");

    const targetUserId = args.userId || (caller ? String(caller._id) : identity.subject);
    await assertCanAccessStudent(ctx, targetUserId);

    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }

    const searchIds = new Set<string>([targetUserId]);
    if (targetUser) {
      if (targetUser._id) searchIds.add(String(targetUser._id));
      if (targetUser.clerkId) searchIds.add(targetUser.clerkId);
    }

    const allFollowUps = [];
    for (const idToSearch of Array.from(searchIds)) {
      const res = await ctx.db
        .query("followUps")
        .withIndex("by_userId", (q) => q.eq("userId", idToSearch))
        .order("desc")
        .take(50);
      allFollowUps.push(...res);
    }

    const seen = new Set<string>();
    const deduped = allFollowUps.filter((f) => {
      if (seen.has(String(f._id))) return false;
      seen.add(String(f._id));
      return true;
    });

    deduped.sort((a, b) => (b.dueDate ?? b.createdAt) - (a.dueDate ?? a.createdAt));

    if (!isStaff) {
      return deduped.map(({ notes, completedBy, ...safe }) => safe);
    }

    return deduped;
  },
});

export const getFollowUpById = query({
  args: { id: v.id("followUps") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const followUp = await ctx.db.get(args.id);
    if (!followUp) return null;

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");
    const isOwner =
      (caller && followUp.userId === String(caller._id)) ||
      (caller && caller.clerkId && followUp.userId === caller.clerkId) ||
      followUp.userId === identity.subject;

    if (!isStaff && !isOwner) {
      throw new Error("Unauthorized: Cannot view another student's follow-up.");
    }

    if (!isStaff) {
      const { notes, completedBy, ...safe } = followUp;
      return safe;
    }

    return followUp;
  },
});

export const listAllFollowUps = query({
  args: {
    statusFilter: v.optional(v.string()), // "all" | "pending" | "completed"
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      return [];
    }

    const followUps = await ctx.db
      .query("followUps")
      .order("desc")
      .take(100);

    const results = [];
    for (const f of followUps) {
      if (args.statusFilter === "pending" && f.completed) continue;
      if (args.statusFilter === "completed" && !f.completed) continue;

      let patient: any = null;
      try {
        patient = await ctx.db.get(f.userId as any);
      } catch {}
      if (!patient) {
        patient = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", f.userId))
          .first();
      }

      let appointmentTitle = undefined;
      if (f.appointmentId) {
        const appt = await ctx.db.get(f.appointmentId);
        appointmentTitle = appt?.title;
      }

      results.push({
        ...f,
        patientName: patient?.full_name || "Unknown Student",
        studentName: patient?.full_name || "Unknown Student",
        patientMobile: patient?.mobile_number || "N/A",
        studentPhone: patient?.mobile_number || "N/A",
        patientId: patient?.patientId || "N/A",
        appointmentTitle,
      });
    }

    return results;
  },
});

export const update = mutation({
  args: {
    id: v.id("followUps"),
    type: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      throw new Error("Unauthorized: Staff access required.");
    }

    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error("Follow-up not found");

    if (followUp.completed) {
      throw new Error("Cannot update a completed follow-up.");
    }

    const patch: any = {};
    if (args.type !== undefined) patch.type = args.type.trim();
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.notes !== undefined) patch.notes = sanitizePlainText(args.notes);

    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

export const markComplete = mutation({
  args: {
    id: v.id("followUps"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error("Follow-up not found");

    if (followUp.completed) {
      throw new Error("Follow-up is already completed.");
    }

    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("User not found");

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isOwner =
      followUp.userId === String(caller._id) ||
      (caller.clerkId && followUp.userId === caller.clerkId) ||
      followUp.userId === identity.subject;

    if (!isStaff && !isOwner) {
      throw new Error("Unauthorized: Cannot complete follow-up for another user.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      completed: true,
      status: "completed",
      completedAt: now,
      completedBy: String(caller._id),
      notes: args.notes ? sanitizePlainText(args.notes) : followUp.notes,
    });

    if (isStaff) {
      await ctx.db.insert("notifications", {
        recipientId: followUp.userId,
        type: "follow_up_completed",
        title: "Care Follow-up Completed",
        message: `Your follow-up (${followUp.type.replace(/_/g, " ")}) has been marked completed by the counselor.`,
        priority: "medium",
        read: false,
        archived: false,
        createdAt: now,
      });
    } else {
      const counsellors = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "counsellor"))
        .collect();
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      const staff = [...counsellors, ...admins];
      for (const s of staff) {
        await ctx.db.insert("notifications", {
          recipientId: String(s._id),
          type: "follow_up_completed",
          title: "Follow-up Completed by Student",
          message: `${caller.full_name || "A student"} completed their care follow-up (${followUp.type.replace(/_/g, " ")}).`,
          priority: "medium",
          read: false,
          archived: false,
          createdAt: now,
        });
      }
    }

    return { success: true };
  },
});

export const getFollowUpsByAppointmentId = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) return [];

    const caller = await getAuthenticatedUser(ctx);
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");
    const isOwner =
      caller &&
      (String(caller._id) === String(appt.userId) || (caller.clerkId && caller.clerkId === (appt.userId as any)));

    if (!isStaff && !isOwner) {
      throw new Error("Unauthorized to view follow-ups for this appointment.");
    }

    const followUps = await ctx.db
      .query("followUps")
      .withIndex("by_appointmentId", (q) => q.eq("appointmentId", args.appointmentId))
      .collect();

    if (!isStaff) {
      return followUps.map(({ notes, completedBy, ...safe }) => safe);
    }

    return followUps;
  },
});

/** Schedule follow-up based on triage level with causal provenance */
export const scheduleFollowUp = mutation({
  args: {
    userId: v.optional(v.string()),
    level: v.string(),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");
    const authSubject = identity.subject;

    if (args.userId && args.userId !== authSubject) {
      await assertCanAccessStudent(ctx, args.userId);
    }
    const targetUserId = args.userId && args.userId !== authSubject ? args.userId : authSubject;

    await checkRateLimit(ctx, targetUserId, "journal_write", 5, 60000);

    let targetUser: any = null;
    try {
      targetUser = await ctx.db.get(targetUserId as any);
    } catch {}
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    const validStudentIds = new Set<string>([targetUserId]);
    if (targetUser) {
      if (targetUser._id) validStudentIds.add(String(targetUser._id));
      if (targetUser.clerkId) validStudentIds.add(targetUser.clerkId);
    }

    if (args.attemptId) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt) {
        throw new Error("Invalid attemptId: Screening attempt record not found.");
      }
      if (!validStudentIds.has(attempt.userId)) {
        throw new Error("Unauthorized: Screening attempt does not belong to target student.");
      }
    }

    if (args.triageId) {
      const triage = await ctx.db.get(args.triageId);
      if (!triage) {
        throw new Error("Invalid triageId: Triage record not found.");
      }
      if (!validStudentIds.has(triage.userId)) {
        throw new Error("Unauthorized: Triage record does not belong to target student.");
      }
    }

    let intervalMs = 0;

    switch (args.level) {
      case "mild":
        intervalMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case "moderate":
        intervalMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "severe":
      case "suicide_flag":
      case "psychosis_flag":
        intervalMs = 2 * 24 * 60 * 60 * 1000;
        break;
      default:
        intervalMs = 14 * 24 * 60 * 60 * 1000;
    }

    const dueDate = Date.now() + intervalMs;

    return await ctx.db.insert("followUps", {
      userId: targetUserId,
      type: "screening_review",
      dueDate,
      completed: false,
      status: "pending",
      sourceType: args.attemptId ? "screening" : "counselor",
      attemptId: args.attemptId,
      triageId: args.triageId,
      appointmentId: args.appointmentId,
      createdAt: Date.now(),
    });
  },
});
