import { v } from "convex/values";
import { mutation, query } from "./functions";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { assertCanAccessStudent, getAuthenticatedUser, getStaffScope, scopeIncludes, getStaffRecipientsForStudent } from "./authz";
import { sanitizePlainText } from "./sanitizer";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "rejected"]);
const ALLOWED_TARGET_STATUSES = new Set(["accepted", "rejected", "completed", "cancelled"]);

async function notifyStaff(
  ctx: any,
  studentKey: string,
  type: string,
  title: string,
  message: string
) {
  // Admins plus the student's assigned counsellor (all counsellors if unassigned)
  const recipients = await getStaffRecipientsForStudent(ctx, studentKey);
  const now = Date.now();
  for (const staff of recipients) {
    await ctx.db.insert("notifications", {
      recipientId: String(staff._id),
      type,
      title,
      message,
      priority: "medium",
      read: false,
      archived: false,
      createdAt: now,
    });
  }
}

async function notifyStudent(
  ctx: any,
  studentUserId: Id<"users">,
  type: string,
  title: string,
  message: string
) {
  await ctx.db.insert("notifications", {
    recipientId: String(studentUserId),
    type,
    title,
    message,
    priority: "medium",
    read: false,
    archived: false,
    createdAt: Date.now(),
  });
}

async function validateCounsellorRequestProvenance(
  ctx: any,
  counsellorRequestId: Id<"counsellorRequests"> | undefined,
  targetUserId: Id<"users">
) {
  if (!counsellorRequestId) return null;

  const reqDoc = await ctx.db.get(counsellorRequestId);
  if (!reqDoc) {
    throw new Error("Invalid provenance: Counselor request not found.");
  }

  const targetPatient = await ctx.db.get(targetUserId);
  const validUserIds = new Set<string>([String(targetUserId)]);
  if (targetPatient?.clerkId) validUserIds.add(targetPatient.clerkId);

  if (!validUserIds.has(reqDoc.user_id)) {
    throw new Error("Invalid provenance: Counselor request does not belong to this student.");
  }

  return reqDoc;
}

/** Create an appointment (Admin/Counselor) with conflict check and provenance */
export const createAppointment = mutation({
  args: {
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    description: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    counsellorRequestId: v.optional(v.id("counsellorRequests")),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");
    if (caller.role !== "admin" && caller.role !== "counsellor") {
      throw new Error("Unauthorized: Admin access required.");
    }
    await assertCanAccessStudent(ctx, String(args.userId));

    if (args.startTime >= args.endTime) {
      throw new Error("Invalid time range: Start time must be before end time.");
    }

    const MAX_DURATION = 4 * 60 * 60 * 1000; // 4 hours in ms
    if (args.endTime - args.startTime > MAX_DURATION) {
      throw new Error("Invalid slot: Sessions cannot exceed 4 hours.");
    }

    // Provenance validation
    if (args.counsellorRequestId) {
      await validateCounsellorRequestProvenance(ctx, args.counsellorRequestId, args.userId);
    }

    // slot conflict validation - prevent double booking
    // Only search appointments starting up to 4 hours before the requested start time, up to the end time
    const activeAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_startTime", (q) =>
        q
          .gte("startTime", args.startTime - MAX_DURATION)
          .lt("startTime", args.endTime)
      )
      .collect();

    const overlap = activeAppointments.some((appt) => {
      if (appt.status !== "scheduled" && appt.status !== "accepted") return false;
      if (appt.startTime === undefined || appt.endTime === undefined) return false;
      // Overlap formula: (startA < endB) && (endA > startB)
      return args.startTime < appt.endTime && args.endTime > appt.startTime;
    });

    if (overlap) {
      throw new Error("Conflict: This slot is already booked by another appointment.");
    }

    const appointmentId = await ctx.db.insert("appointments", {
      userId: args.userId,
      startTime: args.startTime,
      endTime: args.endTime,
      description: args.description ? sanitizePlainText(args.description) : undefined,
      status: "scheduled",
      sourceType: args.sourceType || "counselor",
      attemptId: args.attemptId,
      triageId: args.triageId,
      counsellorRequestId: args.counsellorRequestId,
      createdAt: Date.now(),
    });

    if (args.counsellorRequestId) {
      await ctx.db.patch(args.counsellorRequestId, {
        status: "scheduled",
        updatedAt: Date.now(),
      });
    }

    await notifyStudent(
      ctx,
      args.userId,
      "appointment_scheduled",
      "Appointment Scheduled",
      "A session has been scheduled with a counselor."
    );

    return appointmentId;
  },
});

/** List all appointments with patient details joined (Admin/Counselor) */
export const listAllAppointments = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getStaffScope(ctx);
    if (!scope) return [];

    // Limit query to last 7 days of appointments up to future ones, and take max 100
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_startTime", (q) => q.gte("startTime", sevenDaysAgo))
      .take(100);
    const results = [];

    for (const appt of appointments) {
      if (!scopeIncludes(scope, String(appt.userId))) continue;
      const patient = await ctx.db.get(appt.userId);
      results.push({
        ...appt,
        patientName: patient?.full_name || "Unknown Patient",
        patientPhone: patient?.mobile_number || "N/A",
      });
    }

    // Sort by startTime ascending
    return results.sort((a, b) => {
      if (a.startTime === undefined || b.startTime === undefined) return 0;
      return a.startTime - b.startTime;
    });
  },
});

/** Retrieve appointments for the authenticated patient */
export const getPatientAppointments = query({
  args: { userId: v.string() }, // Clerk userId or subject ID
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    let dbUser = await ctx.db.get(args.userId as Id<"users">);
    if (!dbUser) {
      dbUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }
    if (!dbUser) return [];

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", dbUser!._id))
      .take(50);

    // Sort by startTime ascending
    return appointments.sort((a, b) => {
      if (a.startTime === undefined || b.startTime === undefined) return 0;
      return a.startTime - b.startTime;
    });
  },
});

/** Cancel an appointment (Staff or Student Owner) */
export const cancelAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (TERMINAL_STATUSES.has(appt.status)) {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    if (!isStaff && !isStudentOwner) {
      throw new Error("Unauthorized: Cannot cancel another user's appointment.");
    }

    // Counsellors may only act on students in their caseload

    if (isStaff) await assertCanAccessStudent(ctx, String(appt.userId));

    await ctx.db.patch(args.appointmentId, {
      status: "cancelled",
    });

    if (isStaff) {
      await notifyStudent(
        ctx,
        appt.userId,
        "appointment_cancelled",
        "Appointment Cancelled",
        "Your appointment has been cancelled by the counselor."
      );
    } else {
      await notifyStaff(
        ctx,
        String(appt.userId),
        "appointment_cancelled",
        "Appointment Cancelled by Student",
        `${caller.full_name || "A student"} has cancelled their appointment.`
      );
    }

    return { success: true };
  },
});

/** Delete an appointment request completely (Admin or User who created it) */
export const deleteAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    // Only Admin or the owning patient can delete
    if (caller.role !== "admin" && !isStudentOwner) {
      throw new Error("Unauthorized to delete this appointment.");
    }

    await ctx.db.delete(args.appointmentId);
    return { success: true };
  },
});

/** Update an appointment (Admin only) with conflict check */
export const updateAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller || caller.role !== "admin") {
      throw new Error("Unauthorized: Admin access required.");
    }

    if (args.startTime >= args.endTime) {
      throw new Error("Invalid time range: Start time must be before end time.");
    }

    const MAX_DURATION = 4 * 60 * 60 * 1000; // 4 hours in ms
    if (args.endTime - args.startTime > MAX_DURATION) {
      throw new Error("Invalid slot: Sessions cannot exceed 4 hours.");
    }

    // slot conflict validation - prevent double booking
    // Only search appointments starting up to 4 hours before the requested start time, up to the end time
    const activeAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_startTime", (q) =>
        q
          .gte("startTime", args.startTime - MAX_DURATION)
          .lt("startTime", args.endTime)
      )
      .collect();

    const overlap = activeAppointments.some((appt) => {
      if (appt._id === args.appointmentId) return false; // skip self
      if (appt.status !== "scheduled") return false;
      if (appt.startTime === undefined || appt.endTime === undefined) return false;
      // Overlap formula: (startA < endB) && (endA > startB)
      return args.startTime < appt.endTime && args.endTime > appt.startTime;
    });

    if (overlap) {
      throw new Error("Conflict: This slot is already booked by another appointment.");
    }

    await ctx.db.patch(args.appointmentId, {
      userId: args.userId,
      startTime: args.startTime,
      endTime: args.endTime,
      description: args.description,
    });

    return { success: true };
  },
});

export const tempGetAppointments = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await getStaffScope(ctx);
    if (!scope) {
      throw new Error("Unauthorized: Staff access required.");
    }
    const maxLimit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db.query("appointments").order("desc").take(maxLimit);
    return rows.filter((a) => scopeIncludes(scope, String(a.userId)));
  }
});

// --- Two-Way Appointment System Methods ---

export const createAppointmentRequest = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"), // Target patient (can be caller if created by user)
    createdBy: v.string(), // "admin" | "user"
    patientName: v.optional(v.string()), // required if admin creates
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // 12-hour AM/PM
    reason: v.string(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    counsellorRequestId: v.optional(v.id("counsellorRequests")),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const isStaff = caller.role === "admin" || caller.role === "counsellor";

    if (args.createdBy === "admin" && !isStaff) {
      throw new Error("Unauthorized: Admin access required.");
    }
    if (args.createdBy === "admin") {
      await assertCanAccessStudent(ctx, String(args.userId));
    }

    if (args.createdBy === "user") {
      const isSelf =
        args.userId === caller._id ||
        (caller.clerkId && (args.userId as any) === caller.clerkId);
      if (!isSelf) {
        throw new Error("Unauthorized: Users can only create appointments for themselves.");
      }
    }

    // Provenance validation
    if (args.counsellorRequestId) {
      await validateCounsellorRequestProvenance(ctx, args.counsellorRequestId, args.userId);
    }

    const appointmentId = await ctx.db.insert("appointments", {
      userId: args.userId,
      title: args.title,
      createdBy: args.createdBy,
      patientName: args.createdBy === "admin" ? args.patientName : (caller.full_name || "Student"),
      date: args.date,
      time: args.time,
      reason: sanitizePlainText(args.reason),
      status: "pending",
      sourceType: args.sourceType || (args.createdBy === "admin" ? "counselor" : "self_initiated"),
      attemptId: args.attemptId,
      triageId: args.triageId,
      counsellorRequestId: args.counsellorRequestId,
      createdAt: Date.now(),
    });

    if (args.createdBy === "admin") {
      if (args.counsellorRequestId) {
        await ctx.db.patch(args.counsellorRequestId, {
          status: "scheduled",
          updatedAt: Date.now(),
        });
      }
      await notifyStudent(
        ctx,
        args.userId,
        "appointment_scheduled",
        "Appointment Proposed",
        `A counselor has proposed an appointment on ${args.date} at ${args.time}.`
      );
    } else {
      await notifyStaff(
        ctx,
        String(args.userId),
        "appointment_request",
        "New Appointment Request",
        `${caller.full_name || "A student"} requested an appointment on ${args.date} at ${args.time}.`
      );
    }

    return appointmentId;
  },
});

export const updateAppointmentStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: v.string(), // "accepted" | "rejected" | "completed" | "cancelled"
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (TERMINAL_STATUSES.has(appt.status)) {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }

    if (!ALLOWED_TARGET_STATUSES.has(args.status)) {
      throw new Error(`Invalid status transition: target status '${args.status}' is not recognized.`);
    }

    // EMOT-PERF-02: Idempotent status update - avoid redundant write and duplicate notifications
    if (appt.status === args.status) {
      return { success: true };
    }

    const isCallerStaff = caller.role === "admin" || caller.role === "counsellor";
    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    // Non-staff callers (students) may only interact with their own appointments
    if (!isCallerStaff && !isStudentOwner) {
      throw new Error("Unauthorized: Cannot access or modify another user's appointment.");
    }
    // Counsellors may only act on students in their caseload
    if (isCallerStaff) await assertCanAccessStudent(ctx, String(appt.userId));

    // State transition rules:
    if (args.status === "accepted") {
      if (appt.status !== "pending" && appt.status !== "waiting") {
        throw new Error(`Invalid transition: Cannot accept appointment from status ${appt.status}.`);
      }
      if (appt.status === "pending") {
        if (appt.createdBy === "user" && !isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
        if (appt.createdBy === "admin" && isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
      }
      if (appt.status === "waiting") {
        if (appt.rescheduledBy === "user" && !isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
        if (appt.rescheduledBy === "admin" && isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
      }
    } else if (args.status === "rejected") {
      if (appt.status !== "pending" && appt.status !== "waiting") {
        throw new Error(`Invalid transition: Cannot reject appointment from status ${appt.status}.`);
      }
      if (!args.rejectionReason || !args.rejectionReason.trim()) {
        throw new Error("Rejection reason is required.");
      }
      if (appt.status === "pending") {
        if (appt.createdBy === "user" && !isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
        if (appt.createdBy === "admin" && isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
      }
      if (appt.status === "waiting") {
        if (appt.rescheduledBy === "user" && !isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
        if (appt.rescheduledBy === "admin" && isCallerStaff) {
          throw new Error("Unauthorized: Receiver must accept/reject.");
        }
      }
    } else if (args.status === "completed") {
      if (appt.status !== "accepted" && appt.status !== "scheduled") {
        throw new Error(`Invalid transition: Cannot complete appointment from status ${appt.status}.`);
      }
      if (!isCallerStaff && !isStudentOwner) {
        throw new Error("Unauthorized: Cannot complete another user's appointment.");
      }
    } else if (args.status === "cancelled") {
      if (!isCallerStaff && !isStudentOwner) {
        throw new Error("Unauthorized: Cannot cancel another user's appointment.");
      }
    }

    const patch: any = {
      status: args.status,
      rejectionReason: args.rejectionReason ? sanitizePlainText(args.rejectionReason) : undefined,
    };

    if (args.status === "accepted" && appt.status === "waiting" && appt.rescheduleTime && appt.rescheduleDate) {
      patch.time = appt.rescheduleTime;
      patch.date = appt.rescheduleDate;
      patch.rescheduleTime = undefined;
      patch.rescheduleDate = undefined;
      patch.rescheduledBy = undefined;
    }

    await ctx.db.patch(args.appointmentId, patch);

    // Provenance synchronization with counsellorRequests (avoid redundant write if status already matches)
    if (appt.counsellorRequestId) {
      const cr = await ctx.db.get(appt.counsellorRequestId);
      if (cr) {
        const targetCrStatus = args.status === "accepted" ? "scheduled" : args.status === "completed" ? "completed" : null;
        if (targetCrStatus && cr.status !== targetCrStatus) {
          await ctx.db.patch(appt.counsellorRequestId, {
            status: targetCrStatus,
            updatedAt: Date.now(),
          });
        }
      }
    }

    // Notifications
    if (args.status === "accepted") {
      if (isCallerStaff) {
        await notifyStudent(
          ctx,
          appt.userId,
          "appointment_accepted",
          "Appointment Accepted",
          `Your appointment on ${appt.date || "scheduled date"} at ${appt.time || "scheduled time"} has been confirmed.`
        );
      } else {
        await notifyStaff(
          ctx,
          String(appt.userId),
          "appointment_accepted",
          "Appointment Confirmed by Student",
          `${caller.full_name || "Student"} confirmed the appointment on ${appt.date || "scheduled date"} at ${appt.time || "scheduled time"}.`
        );
      }
    } else if (args.status === "rejected") {
      if (isCallerStaff) {
        await notifyStudent(
          ctx,
          appt.userId,
          "appointment_rejected",
          "Appointment Declined",
          `Your appointment request was declined: ${args.rejectionReason}`
        );
      } else {
        await notifyStaff(
          ctx,
          String(appt.userId),
          "appointment_rejected",
          "Appointment Declined by Student",
          `${caller.full_name || "Student"} declined the appointment. Reason: ${args.rejectionReason}`
        );
      }
    } else if (args.status === "completed") {
      await notifyStudent(
        ctx,
        appt.userId,
        "appointment_completed",
        "Appointment Completed",
        `Your consultation on ${appt.date || "recent session"} has been marked completed.`
      );
    } else if (args.status === "cancelled") {
      if (isCallerStaff) {
        await notifyStudent(
          ctx,
          appt.userId,
          "appointment_cancelled",
          "Appointment Cancelled",
          "Your appointment has been cancelled by the counselor."
        );
      } else {
        await notifyStaff(
          ctx,
          String(appt.userId),
          "appointment_cancelled",
          "Appointment Cancelled by Student",
          `${caller.full_name || "A student"} has cancelled their appointment.`
        );
      }
    }

    return { success: true };
  },
});

export const requestReschedule = mutation({
  args: {
    appointmentId: v.id("appointments"),
    newTime: v.string(), // 12-hour AM/PM
    newDate: v.string(), // YYYY-MM-DD (must be same day)
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (TERMINAL_STATUSES.has(appt.status)) {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    if (!isStaff && !isStudentOwner) {
      throw new Error("Unauthorized: Cannot reschedule another user's appointment.");
    }

    // Counsellors may only act on students in their caseload

    if (isStaff) await assertCanAccessStudent(ctx, String(appt.userId));

    if (appt.status !== "pending" && appt.status !== "accepted" && appt.status !== "scheduled" && appt.status !== "waiting") {
      throw new Error(`Invalid transition: Cannot reschedule appointment in status ${appt.status}.`);
    }

    // Same-day validation
    if (appt.date && args.newDate !== appt.date) {
      await ctx.db.patch(args.appointmentId, {
        status: "rejected",
        rejectionReason: "Reschedule requests must be completed on the same day.",
      });

      if (isStaff) {
        await notifyStudent(
          ctx,
          appt.userId,
          "appointment_rejected",
          "Reschedule Request Declined",
          "Reschedule requests must be on the same day."
        );
      } else {
        await notifyStaff(
          ctx,
          String(appt.userId),
          "appointment_rejected",
          "Reschedule Request Auto-Rejected",
          "A reschedule request was auto-rejected because it was not on the same day."
        );
      }

      return { success: false, reason: "Not same day. Auto-rejected." };
    }

    const rescheduledBy = isStaff ? "admin" : "user";

    await ctx.db.patch(args.appointmentId, {
      status: "waiting",
      rescheduleTime: args.newTime,
      rescheduleDate: args.newDate,
      rescheduledBy,
    });

    if (isStaff) {
      await notifyStudent(
        ctx,
        appt.userId,
        "appointment_rescheduled",
        "Appointment Reschedule Proposed",
        `A new time has been proposed: ${args.newDate} at ${args.newTime}.`
      );
    } else {
      await notifyStaff(
        ctx,
        String(appt.userId),
        "appointment_rescheduled",
        "Reschedule Requested by Student",
        `${caller.full_name || "A student"} requested to reschedule to ${args.newDate} at ${args.newTime}.`
      );
    }

    return { success: true };
  },
});

export const completeAppointment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    attended: v.string(), // "yes" | "no"
    rating: v.optional(v.number()),
    feedback: v.optional(v.string()),
    reason: v.optional(v.string()), // if not attended
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (TERMINAL_STATUSES.has(appt.status)) {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    if (!isStaff && !isStudentOwner) {
      throw new Error("Unauthorized: Cannot complete another user's appointment.");
    }

    // Counsellors may only act on students in their caseload

    if (isStaff) await assertCanAccessStudent(ctx, String(appt.userId));

    if (appt.status !== "accepted" && appt.status !== "scheduled" && appt.status !== "waiting") {
      throw new Error(`Invalid transition: Cannot complete appointment in status ${appt.status}.`);
    }

    const patch: any = {
      status: "completed",
      attended: args.attended,
      isFeedbackCompleted: true,
    };

    if (args.attended === "yes") {
      patch.rating = args.rating;
      patch.feedback = args.feedback ? sanitizePlainText(args.feedback) : undefined;
    } else {
      patch.feedback = args.reason ? sanitizePlainText(args.reason) : undefined;
    }

    await ctx.db.patch(args.appointmentId, patch);

    // Provenance sync (avoid redundant write)
    if (appt.counsellorRequestId) {
      const cr = await ctx.db.get(appt.counsellorRequestId);
      if (cr && cr.status !== "completed") {
        await ctx.db.patch(appt.counsellorRequestId, {
          status: "completed",
          updatedAt: Date.now(),
        });
      }
    }

    await notifyStudent(
      ctx,
      appt.userId,
      "appointment_completed",
      "Appointment Completed",
      `Your consultation on ${appt.date || "recent session"} has been marked completed.`
    );

    return { success: true };
  },
});

export const getAppointmentByCounsellorRequestId = query({
  args: { counsellorRequestId: v.id("counsellorRequests") },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) return null;

    const appt = await ctx.db
      .query("appointments")
      .withIndex("by_counsellorRequestId", (q) => q.eq("counsellorRequestId", args.counsellorRequestId))
      .first();

    if (!appt) return null;

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isStudentOwner =
      caller._id === appt.userId ||
      (caller.clerkId && caller.clerkId === (appt.userId as any));

    if (!isStaff && !isStudentOwner) {
      throw new Error("Unauthorized to view this appointment.");
    }

    // Counsellors may only act on students in their caseload

    if (isStaff) await assertCanAccessStudent(ctx, String(appt.userId));

    return appt;
  },
});

export const listAllTwoWayAppointments = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getStaffScope(ctx);
    if (!scope) return [];

    const appointments = await ctx.db
      .query("appointments")
      .order("desc")
      .take(200);

    return appointments
      .filter(a => a.date && a.time && scopeIncludes(scope, String(a.userId)))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listAllTwoWayAppointmentsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const scope = await getStaffScope(ctx);
    if (!scope) return { page: [], isDone: true, continueCursor: "" };

    const results = await ctx.db.query("appointments")
      .order("desc")
      .paginate(args.paginationOpts);

    const normalizedPage = results.page.filter((a) => scopeIncludes(scope, String(a.userId))).map((a) => {
      let date = a.date;
      let time = a.time;
      if (!date || !time) {
        const refTime = a.startTime || a.createdAt;
        if (refTime) {
          const d = new Date(refTime);
          if (!date) {
            date = d.toISOString().split("T")[0];
          }
          if (!time) {
            time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
        }
      }
      return {
        ...a,
        date: date || "Unscheduled",
        time: time || "N/A",
      };
    });

    return {
      ...results,
      page: normalizedPage,
    };
  },
});

export const getTwoWayAppointmentsForPatient = query({
  args: { userId: v.string() }, // Clerk userId
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    let dbUser = await ctx.db.get(args.userId as Id<"users">);
    if (!dbUser) {
      dbUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }
    if (!dbUser) return [];

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", dbUser!._id))
      .collect();

    return appointments
      .filter(a => a.date && a.time)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getTwoWayAppointmentsForPatientPaginated = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator }, // Clerk userId
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.userId);

    let dbUser = await ctx.db.get(args.userId as Id<"users">);
    if (!dbUser) {
      dbUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }
    if (!dbUser) return { page: [], isDone: true, continueCursor: "" };

    const results = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", dbUser!._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const normalizedPage = results.page.map((a) => {
      let date = a.date;
      let time = a.time;
      if (!date || !time) {
        const refTime = a.startTime || a.createdAt;
        if (refTime) {
          const d = new Date(refTime);
          if (!date) {
            date = d.toISOString().split("T")[0];
          }
          if (!time) {
            time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
        }
      }
      return {
        ...a,
        date: date || "Unscheduled",
        time: time || "N/A",
      };
    });

    return {
      ...results,
      page: normalizedPage,
    };
  },
});

