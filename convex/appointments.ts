import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { assertCanAccessStudent, getAuthenticatedUser } from "./authz";

/** Create an appointment (Admin only) with conflict check */
export const createAppointment = mutation({
  args: {
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    description: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
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
      if (appt.status !== "scheduled") return false;
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
      description: args.description,
      status: "scheduled",
      sourceType: args.sourceType || "counselor",
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: Date.now(),
    });

    return appointmentId;
  },
});

/** List all appointments with patient details joined (Admin/Counselor) */
export const listAllAppointments = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    // Limit query to last 7 days of appointments up to future ones, and take max 100
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_startTime", (q) => q.gte("startTime", sevenDaysAgo))
      .take(100);
    const results = [];

    for (const appt of appointments) {
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

/** Cancel an appointment (Admin only) */
export const cancelAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller || caller.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.appointmentId, {
      status: "cancelled",
    });

    return { success: true };
  },
});

/** Delete an appointment request completely (Admin or User who created it) */
export const deleteAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller) throw new Error("User not found");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    // Only Admin or the owning patient can delete
    if (caller.role !== "admin" && appt.userId !== caller._id) {
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
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) {
      throw new Error("Unauthorized: Staff access required.");
    }
    return await ctx.db.query("appointments").collect();
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller) throw new Error("User not found");

    if (args.createdBy === "admin" && caller.role !== "admin") {
      throw new Error("Unauthorized: Admin access required.");
    }

    if (args.createdBy === "user" && args.userId !== caller._id) {
      throw new Error("Unauthorized: Users can only create appointments for themselves.");
    }

    const appointmentId = await ctx.db.insert("appointments", {
      userId: args.userId,
      title: args.title,
      createdBy: args.createdBy,
      patientName: args.createdBy === "admin" ? args.patientName : caller.full_name,
      date: args.date,
      time: args.time,
      reason: args.reason,
      status: "pending",
      sourceType: args.sourceType || (args.createdBy === "admin" ? "counselor" : "self_initiated"),
      attemptId: args.attemptId,
      triageId: args.triageId,
      createdAt: Date.now(),
    });

    return appointmentId;
  },
});

export const updateAppointmentStatus = mutation({
  args: {
    appointmentId: v.id("appointments"),
    status: v.string(), // "accepted" | "rejected" | "completed"
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    // Only allow receiver to accept/reject if it's pending/waiting
    // E.g. if createdBy=user, admin can accept/reject.
    // If createdBy=admin, user can accept/reject.
    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller) throw new Error("User not found");

    const isCallerAdmin = caller.role === "admin";
    
    // In completed phase, anyone can mark it complete (usually user)
    if (args.status !== "completed") {
      if (appt.createdBy === "user" && !isCallerAdmin && appt.status === "pending") {
         throw new Error("Unauthorized: Receiver must accept/reject.");
      }
      if (appt.createdBy === "admin" && isCallerAdmin && appt.status === "pending") {
         throw new Error("Unauthorized: Receiver must accept/reject.");
      }
    }

    if (args.status === "rejected" && !args.rejectionReason) {
      throw new Error("Rejection reason is required.");
    }

    const patch: any = {
      status: args.status,
      rejectionReason: args.rejectionReason,
    };

    if (args.status === "accepted" && appt.status === "waiting" && appt.rescheduleTime && appt.rescheduleDate) {
      patch.time = appt.rescheduleTime;
      patch.date = appt.rescheduleDate;
      patch.rescheduleTime = undefined;
      patch.rescheduleDate = undefined;
      patch.rescheduledBy = undefined;
    }

    await ctx.db.patch(args.appointmentId, patch);

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    // Same-day validation
    if (appt.date && args.newDate !== appt.date) {
      // Auto-reject if not same day
      await ctx.db.patch(args.appointmentId, {
        status: "rejected",
        rejectionReason: "Reschedule requests must be completed on the same day.",
      });
      return { success: false, reason: "Not same day. Auto-rejected." };
    }

    const caller = await ctx.db.get(identity.subject as Id<"users">);
    if (!caller) throw new Error("User not found");

    await ctx.db.patch(args.appointmentId, {
      status: "waiting",
      rescheduleTime: args.newTime,
      rescheduleDate: args.newDate,
      rescheduledBy: caller.role === "admin" ? "admin" : "user",
    });

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    const patch: any = {
      status: "completed",
      attended: args.attended,
      isFeedbackCompleted: true,
    };

    if (args.attended === "yes") {
      patch.rating = args.rating;
      patch.feedback = args.feedback;
    } else {
      patch.feedback = args.reason;
    }

    await ctx.db.patch(args.appointmentId, patch);
    return { success: true };
  },
});

export const listAllTwoWayAppointments = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return [];

    const appointments = await ctx.db.query("appointments").collect();
    
    return appointments
      .filter(a => a.date && a.time)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listAllTwoWayAppointmentsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return { page: [], isDone: true, continueCursor: "" };

    const results = await ctx.db.query("appointments")
      .order("desc")
      .paginate(args.paginationOpts);
    
    return {
      ...results,
      page: results.page.filter(a => a.date && a.time)
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

    return {
      ...results,
      page: results.page.filter(a => a.date && a.time)
    };
  },
});

