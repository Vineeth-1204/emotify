import { v } from "convex/values";
import { mutation, query } from "./functions";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanAccessStudent,
  getAuthenticatedUser,
  getStaffScope,
  scopeIncludes,
  isStudentRole,
  requireCounselorOrAdmin,
  type AuthenticatedUser,
} from "./authz";
import { sanitizePlainText } from "./sanitizer";
import { logAuditEvent } from "./audit";
import { createNotification, notifyEach, activeAdminIds, studentLabelFor } from "./notify";
import {
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  CONFIRMED_STATUSES,
  allowedActions,
  appointmentSlotKey,
  appointmentStatusLabel,
  awaitingResponseFrom,
  canTakeAction,
  validateAppointmentSlot,
  type AppointmentAction,
} from "../common/appointmentStatus";

/**
 * Appointments: student <-> their assigned counsellor (admins organisation-wide).
 * Lifecycle and who may do what: common/appointmentStatus.ts (allowedActions is enforced here).
 * Every transition checks the caller's role and the student's CURRENT assignment on the server,
 * records status history, and notifies only the other party (see
 * EMOTIFY_NOTIFICATION_EVENT_MATRIX.md). Function names and arguments are unchanged so the
 * dashboard and older app builds keep working.
 */

const ALLOWED_TARGET_STATUSES = new Set(["accepted", "rejected", "completed", "cancelled"]);
/** Open requests a student may have at once (protects counsellors from accidental floods). */
export const MAX_OPEN_STUDENT_REQUESTS = 3;
const REQUEST_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_TEXT = 500;
const HISTORY_LIMIT = 50;

type ActorRole = "student" | "counsellor" | "admin" | "system";

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

/** Screening attempt and triage links must belong to the student the appointment is for. */
async function validateClinicalProvenance(
  ctx: any,
  targetUserId: Id<"users">,
  attemptId: Id<"screeningAttempts"> | undefined,
  triageId: Id<"triages"> | undefined
) {
  if (!attemptId && !triageId) return;
  const target = await ctx.db.get(targetUserId);
  const keys = new Set<string>([String(targetUserId), ...(target?.clerkId ? [target.clerkId] : [])]);
  if (attemptId) {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt || !keys.has(attempt.userId)) {
      throw new Error("Invalid provenance: Screening attempt does not belong to this student.");
    }
  }
  if (triageId) {
    const triage = await ctx.db.get(triageId);
    if (!triage || !keys.has(triage.userId)) {
      throw new Error("Invalid provenance: Triage record does not belong to this student.");
    }
  }
}

/** The student's currently assigned, active counsellor (null if unassigned or inactive). */
export async function assignedCounsellorId(ctx: { db: any }, studentId: Id<"users">): Promise<Id<"users"> | null> {
  const row = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_student_and_active", (q: any) => q.eq("studentId", studentId).eq("active", true))
    .first();
  if (!row) return null;
  const counsellor = await ctx.db.get(row.counsellorId);
  return counsellor && counsellor.status !== "inactive" ? row.counsellorId : null;
}

/** Staff responsible for an appointment: its counsellor if active, else every active admin. */
async function staffRecipientsFor(ctx: { db: any }, appt: any): Promise<Id<"users">[]> {
  const counsellorId = appt.counsellorId ?? (await assignedCounsellorId(ctx, appt.userId));
  if (counsellorId) {
    const c = await ctx.db.get(counsellorId);
    if (c && c.status !== "inactive") return [counsellorId];
  }
  return await activeAdminIds(ctx);
}

interface Actor {
  user: AuthenticatedUser;
  side: "student" | "staff";
  role: ActorRole;
}

/**
 * Who is acting on this appointment, or throws. Staff need the student in their CURRENT caseload
 * (admins: any student); a counsellor also needs the appointment to be with them when it names a
 * counsellor. Students only act on their own appointments.
 */
async function actorFor(ctx: any, appt: any): Promise<Actor> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Unauthenticated");
  if (user.role === "admin" || user.role === "counsellor") {
    await assertCanAccessStudent(ctx, String(appt.userId));
    if (user.role === "counsellor" && appt.counsellorId && appt.counsellorId !== user._id) {
      throw new Error("Unauthorized: This appointment is with another counsellor.");
    }
    return { user, side: "staff", role: user.role };
  }
  if (isStudentRole(user.role) && appt.userId === user._id) {
    return { user, side: "student", role: "student" };
  }
  throw new Error("Unauthorized: Cannot access or modify another user's appointment.");
}

function requireAction(appt: any, actor: Actor, action: AppointmentAction) {
  if (canTakeAction(appt, actor.side, action)) return;
  if ((action === "accept" || action === "decline") && (appt.status === "pending" || appt.status === "waiting")) {
    throw new Error("Unauthorized: Receiver must accept/reject.");
  }
  if (action === "complete" && actor.side === "student") {
    throw new Error("Unauthorized: Only your counsellor can mark an appointment completed.");
  }
  throw new Error(`Invalid transition: Cannot ${action.replace("_", " ")} an appointment in status ${appt.status}.`);
}

function historyEntry(status: string, actorRole: ActorRole, event: string) {
  return { status, at: Date.now(), actorRole, event };
}

function withHistory(appt: any, entry: ReturnType<typeof historyEntry>) {
  return [...(appt.statusHistory ?? []), entry].slice(-HISTORY_LIMIT);
}

/** Another confirmed appointment holds this counsellor's slot. */
async function slotTaken(ctx: any, counsellorId: Id<"users"> | undefined, slotKey: string | null, excludeId?: Id<"appointments">) {
  if (!counsellorId || !slotKey) return false;
  const rows = await ctx.db
    .query("appointments")
    .withIndex("by_counsellor_and_slot", (q: any) => q.eq("counsellorId", counsellorId).eq("slotKey", slotKey))
    .take(20);
  return rows.some((r: any) => r._id !== excludeId && CONFIRMED_STATUSES.has(r.status));
}

const dateTime = (appt: any) => (appt.date && appt.time ? `${appt.date} at ${appt.time}` : "the scheduled time");

/**
 * Notifications for one appointment event. Only the other party is notified; text inside the
 * app may include the date/time, lock-screen push copy never does (notify.PUSH_COPY).
 * Dedupe: one notification per recipient per transition (history length makes the key unique).
 */
async function notifyAppointmentEvent(ctx: any, appt: any, event: string, by: ActorRole) {
  const n = (appt.statusHistory?.length ?? 0) + 1;
  const base = { destination: "appointments" as const, relatedId: String(appt._id) };
  const key = (who: string) => `appt:${appt._id}:${event}:${n}:${who}`;
  const toStudent = (type: string, title: string, message: string) =>
    createNotification(ctx, { ...base, recipientId: appt.userId, type, title, message, dedupeKey: key("student") });
  const toStaff = async (type: string, title: string, message: string) => {
    const recipients = await staffRecipientsFor(ctx, appt);
    await notifyEach(ctx, recipients, { ...base, type, title, message, dedupeKey: key("staff") });
  };
  const student = await studentLabelFor(ctx, String(appt.userId));
  const fromStudent = by === "student";

  switch (event) {
    case "requested": {
      const hasCounsellor = !!appt.counsellorId;
      await toStudent(
        "appointment_requested",
        "Request sent",
        hasCounsellor
          ? `Your request for ${dateTime(appt)} has been sent to your counsellor.`
          : `Your request for ${dateTime(appt)} has been sent to the care team, who will connect you with a counsellor.`
      );
      if (hasCounsellor) {
        await toStaff("appointment_request_received", "New appointment request", `${student} requested an appointment on ${dateTime(appt)}.`);
      } else {
        await notifyEach(ctx, await activeAdminIds(ctx), {
          ...base,
          type: "appointment_needs_counsellor",
          title: "Appointment request needs a counsellor",
          message: `${student} requested an appointment on ${dateTime(appt)} but has no assigned counsellor.`,
          priority: "high",
          dedupeKey: key("admin"),
        });
      }
      return;
    }
    case "proposed":
      return toStudent("appointment_proposed", "New appointment suggested", `Your counsellor suggested an appointment on ${dateTime(appt)}. Open Appointments to reply.`);
    case "confirmed":
      return fromStudent
        ? toStaff("appointment_updated", "Appointment confirmed", `${student} confirmed the appointment on ${dateTime(appt)}.`)
        : toStudent("appointment_confirmed", "Appointment confirmed", `Your appointment on ${dateTime(appt)} is confirmed.`);
    case "declined":
      return fromStudent
        ? toStaff("appointment_updated", "Appointment declined", `${student} declined the appointment on ${dateTime(appt)}.`)
        : toStudent("appointment_declined", "Appointment declined", "Your counsellor could not make this time. You can request another time from Appointments.");
    case "reschedule_proposed":
      return fromStudent
        ? toStaff("appointment_updated", "New time requested", `${student} asked to move the appointment to ${appt.rescheduleDate} at ${appt.rescheduleTime}.`)
        : toStudent("appointment_reschedule_proposed", "New time suggested", `A new time has been suggested: ${appt.rescheduleDate} at ${appt.rescheduleTime}.`);
    case "cancelled":
      return fromStudent
        ? toStaff("appointment_updated", "Appointment cancelled", `${student} cancelled the appointment on ${dateTime(appt)}.`)
        : toStudent("appointment_cancelled", "Appointment cancelled", `Your appointment on ${dateTime(appt)} has been cancelled.`);
    case "completed":
      return toStudent("appointment_completed", "Appointment completed", "Your appointment has been marked completed. You can share feedback from Appointments.");
    case "feedback":
      return toStaff("appointment_feedback", "Session feedback received", `${student} shared feedback about the appointment on ${dateTime(appt)}.`);
  }
}

/** Applies one transition: patch, history, provenance sync, notifications. */
async function applyTransition(
  ctx: any,
  appt: any,
  actor: Actor,
  status: string,
  event: string,
  extra: Record<string, unknown> = {}
) {
  const now = Date.now();
  const updated = { ...appt, ...extra, status };
  await ctx.db.patch(appt._id, {
    ...extra,
    status,
    updatedAt: now,
    statusHistory: withHistory(appt, historyEntry(status, actor.role, event)),
  });

  // Provenance synchronization with counsellorRequests (avoid redundant write if status already matches)
  if (appt.counsellorRequestId && (status === "accepted" || status === "completed")) {
    const cr = await ctx.db.get(appt.counsellorRequestId);
    const target = status === "accepted" ? "scheduled" : "completed";
    if (cr && cr.status !== target) await ctx.db.patch(appt.counsellorRequestId, { status: target, updatedAt: now });
  }

  await notifyAppointmentEvent(ctx, updated, event, actor.role);
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
    await validateClinicalProvenance(ctx, args.userId, args.attemptId, args.triageId);

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

    const counsellorId = caller.role === "counsellor" ? caller._id : (await assignedCounsellorId(ctx, args.userId)) ?? undefined;
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
      counsellorId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      statusHistory: [historyEntry("scheduled", caller.role as ActorRole, "scheduled")],
    });

    if (args.counsellorRequestId) {
      await ctx.db.patch(args.counsellorRequestId, {
        status: "scheduled",
        updatedAt: Date.now(),
      });
    }

    await createNotification(ctx, {
      recipientId: args.userId,
      type: "appointment_confirmed",
      title: "Appointment scheduled",
      message: "A session has been scheduled with a counsellor.",
      destination: "appointments",
      relatedId: String(appointmentId),
      dedupeKey: `appt:${appointmentId}:scheduled`,
    });

    return appointmentId;
  },
});

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
    const sorted = appointments.sort((a, b) => {
      if (a.startTime === undefined || b.startTime === undefined) return 0;
      return a.startTime - b.startTime;
    });
    return (await isStaffCaller(ctx)) ? sorted : sorted.map(withoutInternalLinks);
  },
});

/** Cancel an appointment (Staff or Student Owner) */

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




async function isStaffCaller(ctx: any) {
  const user = await getAuthenticatedUser(ctx);
  return !!user && (user.role === "admin" || user.role === "counsellor");
}

/** A student's own appointment row without internal clinical links or workflow keys. */
function withoutInternalLinks<T extends Record<string, any>>(a: T) {
  const { attemptId: _a, triageId: _t, counsellorId: _c, requestKey: _k, slotKey: _s, ...rest } = a;
  return { ...rest, statusLabel: appointmentStatusLabel(a as any, "student"), actions: allowedActions(a as any, "student") };
}

// --- Two-Way Appointment System Methods ---

/**
 * Create an appointment request.
 *  - Student (createdBy "user"): only for themselves, addressed to their CURRENT assigned
 *    counsellor (derived here; the client cannot choose a counsellor). With no counsellor the
 *    request goes to the admin queue. Duplicate submissions (same requestKey, or the same open
 *    slot) return the existing appointment; at most MAX_OPEN_STUDENT_REQUESTS open requests.
 *  - Staff (createdBy "admin"): a counsellor for a student in their caseload, or an admin for any
 *    student, proposes a time; the student answers it.
 */
export const createAppointmentRequest = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"), // Target patient (the caller themself when a student creates it)
    // Kept for client compatibility; authority comes from the caller's role, and this must match it.
    createdBy: v.union(v.literal("admin"), v.literal("user")),
    patientName: v.optional(v.string()), // required if admin creates
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // 12-hour AM/PM
    reason: v.string(),
    sourceType: v.optional(v.string()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    counsellorRequestId: v.optional(v.id("counsellorRequests")),
    /** Client idempotency key: retries of the same request return the same appointment. */
    requestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    // Authority is derived from the authenticated role, never from the client's createdBy:
    //  - staff (admin, or a counsellor for a student in their caseload) propose as "admin";
    //  - a student requests only for their own account, as "user";
    //  - any other caller, or a createdBy that does not match the caller's role, is refused.
    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    if (isStaff) {
      if (args.createdBy !== "admin") {
        throw new Error("Unauthorized: Staff propose appointments as staff (createdBy \"admin\").");
      }
      await assertCanAccessStudent(ctx, String(args.userId));
    } else if (isStudentRole(caller.role)) {
      if (args.createdBy !== "user") {
        throw new Error("Unauthorized: Admin access required.");
      }
      if (args.userId !== caller._id) {
        throw new Error("Unauthorized: Users can only create appointments for themselves.");
      }
    } else {
      throw new Error("Unauthorized: This account cannot create appointments.");
    }

    if (args.requestKey !== undefined && !REQUEST_KEY_RE.test(args.requestKey)) {
      throw new Error("Invalid request key.");
    }
    if (args.requestKey) {
      const replay = await ctx.db
        .query("appointments")
        .withIndex("by_userId_and_requestKey", (q) => q.eq("userId", args.userId).eq("requestKey", args.requestKey))
        .first();
      if (replay) return replay._id;
    }

    const now = Date.now();
    const slotError = validateAppointmentSlot(args.date, args.time, now);
    if (slotError) throw new Error(slotError);
    const slotKey = appointmentSlotKey(args.date, args.time)!;
    const title = sanitizePlainText(args.title).slice(0, 120).trim();
    if (!title) throw new Error("Please add a short title.");

    // Provenance validation
    if (args.counsellorRequestId) {
      await validateCounsellorRequestProvenance(ctx, args.counsellorRequestId, args.userId);
    }
    await validateClinicalProvenance(ctx, args.userId, args.attemptId, args.triageId);

    const counsellorId = caller.role === "counsellor" ? caller._id : (await assignedCounsellorId(ctx, args.userId)) ?? undefined;

    if (!isStaff) {
      const mine = await ctx.db.query("appointments").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(200);
      const duplicate = mine.find((a) => a.slotKey === slotKey && OPEN_STATUSES.has(a.status));
      if (duplicate) return duplicate._id;
      const openRequests = mine.filter((a) => a.createdBy === "user" && (a.status === "pending" || a.status === "waiting"));
      if (openRequests.length >= MAX_OPEN_STUDENT_REQUESTS) {
        throw new Error(`You already have ${MAX_OPEN_STUDENT_REQUESTS} requests waiting for a reply. Please wait for an answer or withdraw one first.`);
      }
    }
    if (await slotTaken(ctx, counsellorId, slotKey)) {
      throw new Error("That time is not available. Please choose another time.");
    }

    const role: ActorRole = isStaff ? (caller.role as ActorRole) : "student";
    const appointmentId = await ctx.db.insert("appointments", {
      userId: args.userId,
      title,
      createdBy: args.createdBy,
      patientName: isStaff ? args.patientName : (caller.full_name || "Student"),
      date: args.date.trim(),
      time: args.time.trim(),
      reason: sanitizePlainText(args.reason).slice(0, MAX_TEXT),
      status: "pending",
      sourceType: args.sourceType || (isStaff ? "counselor" : "self_initiated"),
      attemptId: args.attemptId,
      triageId: args.triageId,
      counsellorRequestId: args.counsellorRequestId,
      counsellorId,
      requestKey: args.requestKey,
      slotKey,
      createdAt: now,
      updatedAt: now,
      statusHistory: [historyEntry("pending", role, isStaff ? "proposed" : "requested")],
    });

    if (isStaff && args.counsellorRequestId) {
      await ctx.db.patch(args.counsellorRequestId, { status: "scheduled", updatedAt: now });
    }

    const created = await ctx.db.get(appointmentId);
    await notifyAppointmentEvent(ctx, { ...created, statusHistory: [] }, isStaff ? "proposed" : "requested", role);
    return appointmentId;
  },
});

/** Accept, decline, cancel or (staff only) complete an appointment. */
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

    const actor = await actorFor(ctx, appt);

    // Idempotent status update - avoid redundant write and duplicate notifications
    if (appt.status === args.status) {
      return { success: true };
    }

    if (args.status === "accepted") {
      requireAction(appt, actor, "accept");
      const extra: Record<string, unknown> = {};
      let slotKey = appt.slotKey;
      if (appt.status === "waiting" && appt.rescheduleTime && appt.rescheduleDate) {
        slotKey = appointmentSlotKey(appt.rescheduleDate, appt.rescheduleTime) ?? undefined;
        Object.assign(extra, { date: appt.rescheduleDate, time: appt.rescheduleTime, rescheduleDate: undefined, rescheduleTime: undefined, rescheduledBy: undefined, slotKey });
      }
      const counsellorId = appt.counsellorId ?? (await assignedCounsellorId(ctx, appt.userId)) ?? undefined;
      if (await slotTaken(ctx, counsellorId, slotKey ?? null, appt._id)) {
        throw new Error("That time is no longer available. Please propose another time.");
      }
      if (counsellorId && !appt.counsellorId) extra.counsellorId = counsellorId;
      await applyTransition(ctx, appt, actor, "accepted", "confirmed", extra);
    } else if (args.status === "rejected") {
      requireAction(appt, actor, "decline");
      if (!args.rejectionReason || !args.rejectionReason.trim()) {
        throw new Error("Rejection reason is required.");
      }
      await applyTransition(ctx, appt, actor, "rejected", "declined", {
        rejectionReason: sanitizePlainText(args.rejectionReason).slice(0, MAX_TEXT),
      });
    } else if (args.status === "completed") {
      requireAction(appt, actor, "complete");
      await applyTransition(ctx, appt, actor, "completed", "completed");
    } else {
      requireAction(appt, actor, "cancel");
      await applyTransition(ctx, appt, actor, "cancelled", "cancelled");
    }
    return { success: true };
  },
});

/** Propose a new time. Either party may; the other party then accepts or declines it. */
export const requestReschedule = mutation({
  args: {
    appointmentId: v.id("appointments"),
    newTime: v.string(), // 12-hour AM/PM
    newDate: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (TERMINAL_STATUSES.has(appt.status)) {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }

    const actor = await actorFor(ctx, appt);
    requireAction(appt, actor, "propose_time");

    const slotError = validateAppointmentSlot(args.newDate, args.newTime, Date.now());
    if (slotError) throw new Error(slotError);
    const newSlot = appointmentSlotKey(args.newDate, args.newTime);
    const counsellorId = appt.counsellorId ?? (await assignedCounsellorId(ctx, appt.userId)) ?? undefined;
    if (await slotTaken(ctx, counsellorId, newSlot, appt._id)) {
      throw new Error("That time is not available. Please choose another time.");
    }

    await applyTransition(ctx, appt, actor, "waiting", "reschedule_proposed", {
      rescheduleTime: args.newTime.trim(),
      rescheduleDate: args.newDate.trim(),
      rescheduledBy: actor.side === "staff" ? "admin" : "user",
    });
    return { success: true };
  },
});

/**
 * Staff: mark a confirmed appointment completed (with attendance).
 * Student: share feedback about their own confirmed or completed appointment. Students never
 * change the status; older app builds that call this to "complete" a session have their
 * feedback recorded and the counsellor completes the appointment.
 */
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

    if (TERMINAL_STATUSES.has(appt.status) && appt.status !== "completed") {
      throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
    }
    if (args.attended !== "yes" && args.attended !== "no") throw new Error("attended must be 'yes' or 'no'.");
    if (args.rating !== undefined && (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5)) {
      throw new Error("rating must be a whole number from 1 to 5.");
    }

    const actor = await actorFor(ctx, appt);
    const text = args.attended === "yes" ? args.feedback : args.reason;
    const feedbackPatch: Record<string, unknown> = {
      rating: args.attended === "yes" ? args.rating : undefined,
      feedback: text ? sanitizePlainText(text).slice(0, MAX_TEXT) : undefined,
    };

    if (actor.side === "staff") {
      if (appt.status === "completed") {
        throw new Error(`Appointment is in a terminal state (${appt.status}) and cannot be modified.`);
      }
      requireAction(appt, actor, "complete");
      await applyTransition(ctx, appt, actor, "completed", "completed", { attended: args.attended, isFeedbackCompleted: true, ...feedbackPatch });
      return { success: true, statusChanged: true };
    }

    requireAction(appt, actor, "feedback");
    const now = Date.now();
    await ctx.db.patch(appt._id, {
      ...feedbackPatch,
      attended: appt.attended ?? args.attended,
      isFeedbackCompleted: true,
      updatedAt: now,
      statusHistory: withHistory(appt, historyEntry(appt.status, "student", "feedback")),
    });
    await notifyAppointmentEvent(ctx, appt, "feedback", "student");
    return { success: true, statusChanged: false };
  },
});

/** Cancel an appointment (Staff or Student Owner). A student cancelling a request withdraws it. */
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

    const actor = await actorFor(ctx, appt);
    requireAction(appt, actor, "cancel");
    await applyTransition(ctx, appt, actor, "cancelled", "cancelled");
    return { success: true };
  },
});

/**
 * Remove an appointment.
 *  - Student: withdraws their own open request (kept as "cancelled"; records are not deleted).
 *  - Admin: permanently deletes the record (audited), e.g. a duplicate entered by mistake.
 */
export const deleteAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("Unauthenticated");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt) throw new Error("Appointment not found");

    if (caller.role === "admin") {
      await ctx.db.delete(args.appointmentId);
      await logAuditEvent(ctx, String(caller._id), "appointment_deleted", JSON.stringify({ appointmentId: args.appointmentId, studentId: appt.userId, status: appt.status }));
      return { success: true, deleted: true };
    }
    if (!(isStudentRole(caller.role) && appt.userId === caller._id)) {
      throw new Error("Unauthorized to delete this appointment.");
    }
    if (TERMINAL_STATUSES.has(appt.status)) {
      // Already closed: nothing to withdraw; the record stays as the student's history.
      return { success: true, deleted: false };
    }
    const actor = await actorFor(ctx, appt);
    await applyTransition(ctx, appt, actor, "cancelled", "cancelled");
    return { success: true, deleted: false };
  },
});

/** Fields a student may see about their own appointment (no internal links or staff fields). */
function studentView(a: any, counsellorName: string | null) {
  return {
    _id: a._id as Id<"appointments">,
    _creationTime: a._creationTime as number,
    title: a.title as string | undefined,
    reason: a.reason as string | undefined,
    date: a.date as string | undefined,
    time: a.time as string | undefined,
    status: a.status as string,
    statusLabel: appointmentStatusLabel(a, "student"),
    createdBy: a.createdBy as string | undefined,
    rescheduledBy: a.rescheduledBy as string | undefined,
    rescheduleDate: a.rescheduleDate as string | undefined,
    rescheduleTime: a.rescheduleTime as string | undefined,
    rejectionReason: a.rejectionReason as string | undefined,
    rating: a.rating as number | undefined,
    feedback: a.feedback as string | undefined,
    attended: a.attended as string | undefined,
    isFeedbackCompleted: a.isFeedbackCompleted as boolean | undefined,
    counsellorRequestId: a.counsellorRequestId as Id<"counsellorRequests"> | undefined,
    sourceType: a.sourceType as string | undefined,
    createdAt: a.createdAt as number,
    counsellorName,
    actions: allowedActions(a, "student"),
  };
}

/** Student: my appointments, newest first (paginated). */
export const listMyAppointments = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user || !isStudentRole(user.role)) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const names = new Map<string, string | null>();
    const page = [];
    for (const a of result.page) {
      if (!a.date || !a.time) continue;
      const key = a.counsellorId ? String(a.counsellorId) : "";
      if (key && !names.has(key)) names.set(key, ((await ctx.db.get(a.counsellorId!)) as any)?.full_name ?? null);
      page.push(studentView(a, key ? names.get(key) ?? null : null));
    }
    return { ...result, page };
  },
});

/**
 * Staff: appointments with filters. Admins see the whole organisation; a counsellor sees only
 * appointments with them for students currently in their caseload (filters cannot widen this).
 */
export const listAppointments = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.string()),
    counsellorId: v.optional(v.id("users")),
    studentId: v.optional(v.id("users")),
    date: v.optional(v.string()),
    when: v.optional(v.union(v.literal("upcoming"), v.literal("past"), v.literal("all"))),
    needsCounsellor: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCounselorOrAdmin(ctx);
    const scope = (await getStaffScope(ctx))!;
    const isAdmin = caller.role === "admin";
    if (args.studentId) await assertCanAccessStudent(ctx, String(args.studentId));

    const counsellorFilter = isAdmin ? args.counsellorId : caller._id;
    let q;
    if (args.studentId) q = ctx.db.query("appointments").withIndex("by_userId", (r) => r.eq("userId", args.studentId!));
    else if (counsellorFilter) q = ctx.db.query("appointments").withIndex("by_counsellorId", (r) => r.eq("counsellorId", counsellorFilter));
    else if (args.status) q = ctx.db.query("appointments").withIndex("by_status", (r) => r.eq("status", args.status!));
    else q = ctx.db.query("appointments");
    const result = await q.order("desc").paginate(args.paginationOpts);

    const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cache = new Map<string, any>();
    const userOf = async (id: Id<"users"> | undefined) => {
      if (!id) return null;
      if (!cache.has(String(id))) cache.set(String(id), await ctx.db.get(id));
      return cache.get(String(id));
    };
    const page = [];
    for (const a of result.page) {
      if (!scopeIncludes(scope, String(a.userId))) continue;
      if (!isAdmin && a.counsellorId !== caller._id) continue;
      if (counsellorFilter && a.counsellorId !== counsellorFilter) continue;
      if (args.status && a.status !== args.status) continue;
      if (args.date && a.date !== args.date) continue;
      if (args.needsCounsellor && (a.counsellorId || !OPEN_STATUSES.has(a.status))) continue;
      const upcoming = OPEN_STATUSES.has(a.status) && (!a.date || a.date >= today);
      if (args.when === "upcoming" && !upcoming) continue;
      if (args.when === "past" && upcoming) continue;
      const student = await userOf(a.userId);
      const counsellor = await userOf(a.counsellorId);
      page.push({
        _id: a._id,
        studentId: a.userId,
        studentName: student?.full_name || student?.alias || "Student",
        patientId: student?.patientId ?? null,
        counsellorId: a.counsellorId ?? null,
        counsellorName: counsellor?.full_name ?? null,
        counsellorActive: counsellor ? counsellor.status !== "inactive" : null,
        title: a.title,
        reason: a.reason,
        date: a.date ?? (a.startTime ? new Date(a.startTime).toISOString().slice(0, 10) : undefined),
        time: a.time,
        status: a.status,
        statusLabel: appointmentStatusLabel(a, "staff"),
        awaiting: awaitingResponseFrom(a),
        createdBy: a.createdBy,
        rescheduledBy: a.rescheduledBy,
        rescheduleDate: a.rescheduleDate,
        rescheduleTime: a.rescheduleTime,
        rejectionReason: a.rejectionReason,
        attended: a.attended,
        rating: a.rating,
        feedback: a.feedback,
        counsellorRequestId: a.counsellorRequestId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt ?? a.createdAt,
        statusHistory: a.statusHistory ?? [],
        actions: allowedActions(a, "staff"),
      });
    }
    return { ...result, page };
  },
});

/**
 * When a student's counsellor changes, their open appointments follow them:
 *  - to the new counsellor: re-addressed to them and set back to "requested" so the new
 *    counsellor confirms the time (a confirmation by the previous counsellor does not bind them);
 *  - no counsellor (unassigned): kept as they are, without a counsellor, and admins are told.
 * The previous counsellor loses access with the assignment, so they never keep these requests.
 */
export async function moveOpenAppointmentsOnAssignmentChange(ctx: MutationCtx, studentId: Id<"users">, newCounsellorId: Id<"users"> | null) {
  const rows = await ctx.db.query("appointments").withIndex("by_userId", (q) => q.eq("userId", studentId)).order("desc").take(200);
  const label = await studentLabelFor(ctx, String(studentId));
  for (const a of rows) {
    if (!OPEN_STATUSES.has(a.status)) continue;
    if (newCounsellorId && a.counsellorId === newCounsellorId) continue;
    const wasConfirmed = CONFIRMED_STATUSES.has(a.status);
    const base = { destination: "appointments" as const, relatedId: String(a._id) };
    if (newCounsellorId) {
      await ctx.db.patch(a._id, {
        counsellorId: newCounsellorId,
        status: "pending",
        createdBy: "user",
        rescheduleDate: undefined,
        rescheduleTime: undefined,
        rescheduledBy: undefined,
        updatedAt: Date.now(),
        statusHistory: withHistory(a, historyEntry("pending", "system", "reassigned")),
      });
      await createNotification(ctx, {
        ...base,
        recipientId: newCounsellorId,
        type: "appointment_request_received",
        title: "Appointment request transferred to you",
        message: `${label} has an appointment request for ${dateTime(a)} that now needs your reply.`,
        dedupeKey: `appt:${a._id}:reassigned:${newCounsellorId}`,
      });
      await createNotification(ctx, {
        ...base,
        recipientId: studentId,
        type: wasConfirmed ? "appointment_reconfirm_needed" : "appointment_transferred",
        title: wasConfirmed ? "Your appointment needs to be reconfirmed" : "Your request has a new counsellor",
        message: wasConfirmed
          ? `Your appointment on ${dateTime(a)} has moved to your new counsellor, who will confirm it.`
          : `Your request for ${dateTime(a)} has been passed to your new counsellor.`,
        dedupeKey: `appt:${a._id}:reassigned_student:${newCounsellorId}`,
      });
    } else {
      if (!a.counsellorId) continue;
      await ctx.db.patch(a._id, {
        counsellorId: undefined,
        updatedAt: Date.now(),
        statusHistory: withHistory(a, historyEntry(a.status, "system", "counsellor_unassigned")),
      });
      await notifyEach(ctx, await activeAdminIds(ctx), {
        ...base,
        type: "appointment_needs_counsellor",
        title: "Appointment needs a counsellor",
        message: `${label} has an open appointment on ${dateTime(a)} and no assigned counsellor.`,
        priority: "high",
        dedupeKey: `appt:${a._id}:unassigned:${a.statusHistory?.length ?? 0}`,
      });
    }
  }
}

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

    return isStaff ? appt : withoutInternalLinks(appt);
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

    const rows = appointments
      .filter(a => a.date && a.time)
      .sort((a, b) => b.createdAt - a.createdAt);
    return (await isStaffCaller(ctx)) ? rows : rows.map(withoutInternalLinks);
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

    const staff = await isStaffCaller(ctx);
    return {
      ...results,
      page: staff ? normalizedPage : normalizedPage.map(withoutInternalLinks),
    };
  },
});


/**
 * One-off maintenance after deploying the counsellor workflow: link existing OPEN appointments
 * to the student's current counsellor so they appear in that counsellor's appointment list.
 * Closed history is left as it is. Batched and safe to re-run:
 *   npx convex run appointments:backfillCounsellorIds '{}'
 */
export const backfillCounsellorIds = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("appointments").paginate({ cursor: args.cursor ?? null, numItems: 200 });
    let linked = 0;
    for (const a of page.page) {
      if (a.counsellorId || !OPEN_STATUSES.has(a.status)) continue;
      const counsellorId = await assignedCounsellorId(ctx, a.userId);
      if (!counsellorId) continue;
      await ctx.db.patch(a._id, { counsellorId, slotKey: a.slotKey ?? (a.date && a.time ? appointmentSlotKey(a.date, a.time) ?? undefined : undefined) });
      linked++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.appointments.backfillCounsellorIds, { cursor: page.continueCursor });
    }
    return { linked, done: page.isDone };
  },
});
