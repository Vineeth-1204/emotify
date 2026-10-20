import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireAdmin, requireCounselorOrAdmin, assertCanAccessStudent, getAuthenticatedUser, isStudentRole } from "./authz";
import { approvedContacts, directoryEntryForCounsellor } from "./counsellorDirectory";
import { logAuditEvent } from "./audit";
import { createNotification, activeAdminIds } from "./notify";
import { moveOpenAppointmentsOnAssignmentChange } from "./appointments";

/**
 * Counsellor caseload assignments.
 *
 * A row in `counsellorAssignments` is an authorization relationship: a counsellor can
 * read and act on a student's clinical records only while an active row links them
 * (see authz.assertCanAccessStudent / getStaffScope). Rules:
 *  - a student has at most one active counsellor; assigning another ends the current row;
 *  - only admins create, change or end assignments; students and counsellors cannot;
 *  - ending a row never touches clinical records: alerts, screenings, appointments and
 *    follow-ups are linked to the student, so they move with the student to the new
 *    counsellor and their history (who did what, when) is unchanged;
 *  - inactive rows are the assignment history (assignedBy/assignedAt, endedBy/endedAt/endReason).
 *
 * Each mutation is a single Convex transaction: the active-row read and the writes commit
 * together, and concurrent changes for the same student are serialized by Convex, so two
 * requests cannot leave a student with two active counsellors.
 */

/** Largest number of students accepted by one bulk request. */
export const MAX_BULK_ASSIGNMENTS = 100;

/**
 * Caseload capacity: active students per counsellor. Enforced here on the server for every
 * assignment path (single, bulk, reassignment). The check reads the counsellor's active-caseload
 * index range in the same transaction as the insert, so concurrent assignments by two admins are
 * serialized by Convex and cannot exceed it. There is no override: to add a student to a full
 * caseload, reassign or unassign one first. (The staff directory's `maxWorkload` field is a
 * separate, unenforced planning field.)
 */
export const DEFAULT_CASELOAD_CAPACITY = 20;
/** Caseload size at which the admin views flag a counsellor as approaching capacity. */
export const NEAR_CAPACITY_THRESHOLD = 18;

export function capacityState(size: number, capacity = DEFAULT_CASELOAD_CAPACITY): "available" | "near" | "full" {
  if (size >= capacity) return "full";
  if (size >= NEAR_CAPACITY_THRESHOLD) return "near";
  return "available";
}

/** Active caseload size, read through the index range that concurrent assignments also write. */
async function activeCaseloadSize(ctx: QueryCtx | MutationCtx, counsellorId: Id<"users">) {
  const rows = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", counsellorId).eq("active", true))
    .take(DEFAULT_CASELOAD_CAPACITY + 1);
  return rows.length;
}

const OPEN_ALERT_STATUSES = new Set(["pending", "escalated", "active", "acknowledged"]);

type EndReason = "reassigned" | "unassigned" | "student_deleted" | "counsellor_deleted" | "student_deactivated" | "counsellor_deactivated";
type AssignOutcome = "assigned" | "reassigned" | "unchanged";

async function activeRowsForStudent(ctx: QueryCtx | MutationCtx, studentId: Id<"users">) {
  return await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_student_and_active", (q) => q.eq("studentId", studentId).eq("active", true))
    .collect();
}

async function endRows(ctx: MutationCtx, rows: Array<{ _id: Id<"counsellorAssignments"> }>, endedBy: Id<"users">, reason: EndReason, now: number) {
  for (const row of rows) {
    await ctx.db.patch(row._id, { active: false, endedAt: now, endedBy, endReason: reason });
  }
}

/** Validates a counsellor account as an assignment target; throws a readable error otherwise. */
async function requireAssignableCounsellor(ctx: MutationCtx, counsellorId: Id<"users">) {
  const counsellor = await ctx.db.get(counsellorId);
  if (!counsellor || counsellor.role !== "counsellor") throw new Error("Counsellor not found.");
  if (counsellor.status === "inactive") throw new Error("Counsellor account is inactive.");
  return counsellor;
}

/** Validates a student account as eligible for assignment; throws a readable error otherwise. */
async function requireAssignableStudent(ctx: MutationCtx, studentId: Id<"users">) {
  const student = await ctx.db.get(studentId);
  if (!student || !isStudentRole(student.role)) throw new Error("Student not found.");
  if (student.status === "inactive") throw new Error("Student account is inactive.");
  return student;
}

async function countOpenAlerts(ctx: QueryCtx | MutationCtx, student: { _id: Id<"users">; clerkId?: string }) {
  const keys = [String(student._id), ...(student.clerkId ? [student.clerkId] : [])];
  let open = 0;
  for (const key of keys) {
    const alerts = await ctx.db.query("alerts").withIndex("by_userId", (q) => q.eq("userId", key)).collect();
    open += alerts.filter((a) => OPEN_ALERT_STATUSES.has(a.status)).length;
  }
  return open;
}

const studentLabel = (s: { patientId?: string }) => (s.patientId ? `Student ${s.patientId}` : "A student");

/**
 * Assigns one student. All validation happens before any write, so a thrown error
 * leaves nothing behind (bulk callers rely on this to report per-student failures).
 */
async function assignOne(
  ctx: MutationCtx,
  adminId: Id<"users">,
  studentId: Id<"users">,
  counsellorId: Id<"users">,
  now: number
): Promise<{ outcome: AssignOutcome; student: any; previousCounsellorIds: Id<"users">[]; caseloadSize: number }> {
  const student = await requireAssignableStudent(ctx, studentId);
  const current = await activeRowsForStudent(ctx, studentId);

  if (current.length === 1 && current[0].counsellorId === counsellorId) {
    return { outcome: "unchanged", student, previousCounsellorIds: [], caseloadSize: await activeCaseloadSize(ctx, counsellorId) };
  }

  const size = await activeCaseloadSize(ctx, counsellorId);
  if (size >= DEFAULT_CASELOAD_CAPACITY) {
    throw new Error(`This counsellor has reached the caseload capacity of ${DEFAULT_CASELOAD_CAPACITY} students. Reassign or unassign a student first.`);
  }

  // Defensive: also repairs any legacy duplicate active rows.
  const previousCounsellorIds = current.map((r) => r.counsellorId).filter((id) => id !== counsellorId);
  await endRows(ctx, current, adminId, "reassigned", now);
  const assignmentId = await ctx.db.insert("counsellorAssignments", {
    counsellorId,
    studentId,
    assignedBy: adminId,
    assignedAt: now,
    active: true,
  });
  await logAuditEvent(
    ctx,
    String(adminId),
    previousCounsellorIds.length > 0 ? "caseload_reassigned" : "caseload_assigned",
    JSON.stringify({ studentId, counsellorId, previousCounsellorIds })
  );
  const outcome: AssignOutcome = previousCounsellorIds.length > 0 ? "reassigned" : "assigned";

  // Open appointments follow the student to the new counsellor (the previous counsellor loses
  // access with the assignment, so they must not keep the student's pending requests).
  await moveOpenAppointmentsOnAssignmentChange(ctx, studentId, counsellorId);

  // Tell the student (no names or reasons; the details are in My Counsellor).
  await createNotification(ctx, {
    recipientId: studentId,
    type: "counsellor_assigned",
    title: outcome === "reassigned" ? "Your counsellor has changed" : "You have been connected with a counsellor",
    message: "Open My Counsellor in your profile to see who will support you.",
    priority: "medium",
    destination: "my_counsellor",
    dedupeKey: `assignment:${assignmentId}`,
  });
  return { outcome, student, previousCounsellorIds, caseloadSize: size + 1 };
}

async function notify(ctx: MutationCtx, recipientId: Id<"users">, title: string, message: string, priority: string, now: number, removed = false) {
  await createNotification(ctx, {
    recipientId,
    type: removed ? "caseload_removed" : "caseload_assignment",
    title,
    message,
    priority: priority as "low" | "medium" | "high",
    destination: "home",
    dedupeKey: `caseload:${removed ? "removed" : "added"}:${now}`,
  });
}

/** Admins are told once a day per counsellor when a caseload becomes full (in-app only). */
async function notifyIfAtCapacity(ctx: MutationCtx, counsellorId: Id<"users">, size: number, now: number) {
  if (size < DEFAULT_CASELOAD_CAPACITY) return;
  const counsellor = await ctx.db.get(counsellorId);
  const day = new Date(now).toISOString().slice(0, 10);
  for (const adminId of await activeAdminIds(ctx)) {
    await createNotification(ctx, {
      recipientId: adminId,
      type: "caseload_capacity",
      title: "Caseload full",
      message: `${counsellor?.full_name || "A counsellor"} has reached the caseload capacity of ${DEFAULT_CASELOAD_CAPACITY} students.`,
      priority: "low",
      destination: "assignments",
      dedupeKey: `capacity_full:${counsellorId}:${day}`,
    });
  }
}

/**
 * Notifies the receiving counsellor (with a safety hand-over line when the new students
 * have open alerts) and every counsellor who lost students. One notification per counsellor.
 */
async function notifyCaseloadChanges(
  ctx: MutationCtx,
  counsellorId: Id<"users">,
  changed: Array<{ student: any; previousCounsellorIds: Id<"users">[] }>,
  now: number
) {
  if (changed.length === 0) return;
  let openAlerts = 0;
  for (const c of changed) openAlerts += await countOpenAlerts(ctx, c.student);

  const added = changed.length === 1 ? `${studentLabel(changed[0].student)} has been added to your caseload.` : `${changed.length} students have been added to your caseload.`;
  const handover = openAlerts > 0 ? ` ${openAlerts} open safety alert${openAlerts === 1 ? " needs" : "s need"} your review.` : "";
  await notify(ctx, counsellorId, changed.length === 1 ? "New student assigned" : "New students assigned", added + handover, openAlerts > 0 ? "high" : "medium", now);

  const removedBy = new Map<string, number>();
  for (const c of changed) for (const id of c.previousCounsellorIds) removedBy.set(String(id), (removedBy.get(String(id)) ?? 0) + 1);
  for (const [id, n] of removedBy) {
    await notify(ctx, id as Id<"users">, "Caseload updated", n === 1 ? "A student has been reassigned to another counsellor." : `${n} students have been reassigned to another counsellor.`, "low", now, true);
  }
}

/** Admin: assign (or reassign) one student to a counsellor. */
export const assign = mutation({
  args: {
    studentId: v.id("users"),
    counsellorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requireAssignableCounsellor(ctx, args.counsellorId);
    const now = Date.now();
    const result = await assignOne(ctx, admin._id, args.studentId, args.counsellorId, now);
    if (result.outcome !== "unchanged") {
      await notifyCaseloadChanges(ctx, args.counsellorId, [result], now);
      await notifyIfAtCapacity(ctx, args.counsellorId, result.caseloadSize, now);
    }
    return { success: true, outcome: result.outcome, unchanged: result.outcome === "unchanged", caseloadSize: result.caseloadSize, capacity: DEFAULT_CASELOAD_CAPACITY };
  },
});

/**
 * Admin: assign (or reassign) several students to one counsellor. Each student is
 * validated separately; failures are reported per student and do not block the others.
 */
export const assignMany = mutation({
  args: {
    studentIds: v.array(v.id("users")),
    counsellorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const unique = Array.from(new Set(args.studentIds));
    if (unique.length === 0) throw new Error("Select at least one student.");
    if (unique.length > MAX_BULK_ASSIGNMENTS) throw new Error(`Assign at most ${MAX_BULK_ASSIGNMENTS} students at a time.`);
    await requireAssignableCounsellor(ctx, args.counsellorId);

    const now = Date.now();
    const results: Array<{ studentId: Id<"users">; outcome: AssignOutcome | "failed"; error?: string }> = [];
    const changed: Array<{ student: any; previousCounsellorIds: Id<"users">[] }> = [];
    for (const studentId of unique) {
      try {
        const r = await assignOne(ctx, admin._id, studentId, args.counsellorId, now);
        results.push({ studentId, outcome: r.outcome });
        if (r.outcome !== "unchanged") changed.push(r);
      } catch (e) {
        const error = e instanceof Error ? e.message : "Could not assign this student.";
        results.push({ studentId, outcome: "failed", error });
        // Recorded for the admin exceptions view (the bulk request itself still succeeds).
        await logAuditEvent(ctx, String(admin._id), "caseload_assign_failed", JSON.stringify({ studentId, counsellorId: args.counsellorId, error }));
      }
    }
    await notifyCaseloadChanges(ctx, args.counsellorId, changed, now);
    await notifyIfAtCapacity(ctx, args.counsellorId, await activeCaseloadSize(ctx, args.counsellorId), now);

    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    const summary = { assigned: count("assigned"), reassigned: count("reassigned"), unchanged: count("unchanged"), failed: count("failed") };
    return { success: summary.failed === 0, summary, results };
  },
});

/** After a student is unassigned: open appointments go to the admin queue; tell the student. */
async function afterUnassign(ctx: MutationCtx, studentId: Id<"users">, endedAssignmentId: Id<"counsellorAssignments">) {
  await moveOpenAppointmentsOnAssignmentChange(ctx, studentId, null);
  await createNotification(ctx, {
    recipientId: studentId,
    type: "counsellor_unassigned",
    title: "Your counsellor details have changed",
    message: "You can still ask the care team for support from the Appointments screen.",
    priority: "low",
    destination: "my_counsellor",
    dedupeKey: `unassigned:${endedAssignmentId}`,
  });
}

/** Admin: end a student's active assignment. The student becomes unassigned. */
export const unassign = mutation({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const current = await activeRowsForStudent(ctx, args.studentId);
    await endRows(ctx, current, admin._id, "unassigned", now);
    if (current.length > 0) {
      await logAuditEvent(ctx, String(admin._id), "caseload_unassigned", JSON.stringify({ studentId: args.studentId, previousCounsellorIds: current.map((r) => r.counsellorId) }));
      await afterUnassign(ctx, args.studentId, current[0]._id);
    }
    return { success: true, ended: current.length };
  },
});

/** Admin: end the active assignment of several students. */
export const unassignMany = mutation({
  args: { studentIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const unique = Array.from(new Set(args.studentIds));
    if (unique.length === 0) throw new Error("Select at least one student.");
    if (unique.length > MAX_BULK_ASSIGNMENTS) throw new Error(`Update at most ${MAX_BULK_ASSIGNMENTS} students at a time.`);
    const now = Date.now();
    const results: Array<{ studentId: Id<"users">; outcome: "unassigned" | "unchanged" }> = [];
    for (const studentId of unique) {
      const current = await activeRowsForStudent(ctx, studentId);
      await endRows(ctx, current, admin._id, "unassigned", now);
      if (current.length > 0) {
        await logAuditEvent(ctx, String(admin._id), "caseload_unassigned", JSON.stringify({ studentId, previousCounsellorIds: current.map((r) => r.counsellorId) }));
        await afterUnassign(ctx, studentId, current[0]._id);
      }
      results.push({ studentId, outcome: current.length > 0 ? "unassigned" : "unchanged" });
    }
    return {
      success: true,
      summary: { unassigned: results.filter((r) => r.outcome === "unassigned").length, unchanged: results.filter((r) => r.outcome === "unchanged").length },
      results,
    };
  },
});

/**
 * Ends every active assignment that involves a user being deleted (as student or as
 * counsellor), so no active row ever points at a deleted account. History rows for other
 * students stay (inactive) because they belong to those students' records.
 */
export async function endAssignmentsForDeletedUser(ctx: MutationCtx, userId: Id<"users">, endedBy: Id<"users">) {
  const now = Date.now();
  const asStudent = await activeRowsForStudent(ctx, userId);
  await endRows(ctx, asStudent, endedBy, "student_deleted", now);
  const asCounsellor = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", userId).eq("active", true))
    .collect();
  await endRows(ctx, asCounsellor, endedBy, "counsellor_deleted", now);
  return { endedAsStudent: asStudent.length, endedAsCounsellor: asCounsellor.length };
}

/**
 * Ends every active assignment that involves a user being deactivated (as student or as
 * counsellor), so an inactive counsellor no longer retains an active caseload.
 */
export async function endAssignmentsForDeactivatedUser(ctx: MutationCtx, userId: Id<"users">, endedBy: Id<"users">) {
  const now = Date.now();
  const asStudent = await activeRowsForStudent(ctx, userId);
  await endRows(ctx, asStudent, endedBy, "student_deactivated", now);
  const asCounsellor = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", userId).eq("active", true))
    .collect();
  await endRows(ctx, asCounsellor, endedBy, "counsellor_deactivated", now);
  return { endedAsStudent: asStudent.length, endedAsCounsellor: asCounsellor.length };
}

/**
 * Staff: the counsellor currently responsible for a student (null if unassigned).
 * Staff-only: it returns internal ids. Students use getMyCounsellor.
 */
export const getForStudent = query({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);
    await assertCanAccessStudent(ctx, String(args.studentId));
    const active = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q) => q.eq("studentId", args.studentId).eq("active", true))
      .first();
    if (!active) return null;
    const counsellor = await ctx.db.get(active.counsellorId);
    return {
      assignmentId: active._id,
      counsellorId: active.counsellorId,
      counsellorName: counsellor?.full_name || "Counsellor",
      counsellorActive: !!counsellor && counsellor.status !== "inactive",
      assignedAt: active.assignedAt,
    };
  },
});

/** Active caseload sizes keyed by counsellor id (one pass over active rows). */
async function caseloadSizes(ctx: QueryCtx) {
  const active = await ctx.db.query("counsellorAssignments").withIndex("by_active", (q) => q.eq("active", true)).collect();
  const sizes = new Map<string, number>();
  for (const a of active) sizes.set(String(a.counsellorId), (sizes.get(String(a.counsellorId)) ?? 0) + 1);
  return { active, sizes };
}

/**
 * Admin: counsellor accounts with their caseload size. By default only active accounts
 * (assignment targets); `includeInactive` adds deactivated accounts for the roster view.
 */
export const listCounsellorUsers = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const counsellors = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "counsellor")).collect();
    const { sizes } = await caseloadSizes(ctx);
    return counsellors
      .filter((c) => args.includeInactive || c.status !== "inactive")
      .map((c) => ({
        _id: c._id,
        full_name: c.full_name || "Counsellor",
        email: c.email,
        mobile_number: c.mobile_number,
        status: c.status === "inactive" ? "inactive" : "active",
        caseloadSize: sizes.get(String(c._id)) ?? 0,
        capacity: DEFAULT_CASELOAD_CAPACITY,
        capacityState: capacityState(sizes.get(String(c._id)) ?? 0),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  },
});

/** Largest student roster the assignment page loads in one query. */
const ROSTER_LIMIT = 2000;
/** Rows returned to the page after filtering. */
const ROSTER_PAGE = 500;

/**
 * Admin: student roster with each student's current counsellor, plus assignment totals.
 * Filters: free-text search (name, student ID, mobile), assignment status and counsellor.
 */
export const listStudentAssignments = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("all"), v.literal("assigned"), v.literal("unassigned"))),
    counsellorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const students = await ctx.db
      .query("users")
      .withIndex("by_role_and_created_at", (q) => q.eq("role", "patient"))
      .order("desc")
      .take(ROSTER_LIMIT + 1);
    const truncated = students.length > ROSTER_LIMIT;
    const roster = students.slice(0, ROSTER_LIMIT);

    const { active } = await caseloadSizes(ctx);
    const byStudent = new Map<string, (typeof active)[number]>();
    for (const a of active) byStudent.set(String(a.studentId), a);
    const counsellorCache = new Map<string, any>();
    const counsellorOf = async (id: Id<"users">) => {
      if (!counsellorCache.has(String(id))) counsellorCache.set(String(id), await ctx.db.get(id));
      return counsellorCache.get(String(id));
    };

    const s = args.search?.trim().toLowerCase() || null;
    const rows = [];
    let assignedCount = 0;
    let inactiveCounsellorCount = 0;
    for (const u of roster) {
      const a = byStudent.get(String(u._id));
      const counsellor = a ? await counsellorOf(a.counsellorId) : null;
      const counsellorActive = !!counsellor && counsellor.status !== "inactive";
      if (a) assignedCount++;
      if (a && !counsellorActive) inactiveCounsellorCount++;

      if (args.status === "assigned" && !a) continue;
      if (args.status === "unassigned" && a) continue;
      if (args.counsellorId && (!a || a.counsellorId !== args.counsellorId)) continue;
      if (s && !(u.full_name || "").toLowerCase().includes(s) && !(u.alias || "").toLowerCase().includes(s) && !(u.patientId || "").toLowerCase().includes(s) && !(u.mobile_number || "").includes(s)) continue;

      rows.push({
        studentId: u._id,
        name: u.full_name || u.alias || "Unnamed student",
        patientId: u.patientId ?? null,
        studentStatus: u.status === "inactive" ? "inactive" : "active",
        counsellor: a
          ? { counsellorId: a.counsellorId, name: counsellor?.full_name || "Counsellor", active: counsellorActive, assignedAt: a.assignedAt }
          : null,
      });
    }

    return {
      rows: rows.slice(0, ROSTER_PAGE),
      matched: rows.length,
      summary: {
        totalStudents: roster.length,
        assigned: assignedCount,
        unassigned: roster.length - assignedCount,
        assignedToInactiveCounsellor: inactiveCounsellorCount,
      },
      truncated,
    };
  },
});

/** Admin: one counsellor's current caseload. */
export const getCounsellorRoster = query({
  args: { counsellorId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const counsellor = await ctx.db.get(args.counsellorId);
    if (!counsellor || counsellor.role !== "counsellor") throw new Error("Counsellor not found.");
    const rows = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", args.counsellorId).eq("active", true))
      .collect();
    const students = [];
    for (const a of rows) {
      const u = await ctx.db.get(a.studentId);
      if (!u) continue;
      students.push({ studentId: u._id, name: u.full_name || u.alias || "Unnamed student", patientId: u.patientId ?? null, assignedAt: a.assignedAt });
    }
    students.sort((x, y) => y.assignedAt - x.assignedAt);
    return {
      counsellor: { _id: counsellor._id, full_name: counsellor.full_name || "Counsellor", status: counsellor.status === "inactive" ? "inactive" : "active" },
      students,
    };
  },
});

/** Admin: assignment history for one student, newest first. */
export const getStudentAssignmentHistory = query({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q) => q.eq("studentId", args.studentId))
      .collect();
    const name = async (id: Id<"users"> | undefined) => (id ? (await ctx.db.get(id))?.full_name || "Former staff member" : null);
    const history = [];
    for (const r of rows) {
      history.push({
        counsellorName: await name(r.counsellorId),
        assignedAt: r.assignedAt,
        assignedByName: await name(r.assignedBy),
        active: r.active,
        endedAt: r.endedAt ?? null,
        endedByName: await name(r.endedBy),
        endReason: r.endReason ?? null,
      });
    }
    return history.sort((x, y) => y.assignedAt - x.assignedAt);
  },
});

/** Counsellor: size of my caseload (dashboard header). */
export const getMyCaseloadSize = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller || caller.role !== "counsellor") return null;
    const caseload = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", caller._id).eq("active", true))
      .collect();
    return caseload.length;
  },
});

/**
 * Student: my assigned counsellor. Identity comes only from the session; there is no
 * student argument, so a student can never read another student's assignment.
 *
 * Returns only what a student may see: the counsellor's display name, role, assignment
 * date, and each institutional contact field from the linked staff-directory entry only
 * if an admin has approved that field for students (counsellorDirectory.approvedContacts).
 * The counsellor's login mobile number, account email, ids and any clinical data are
 * never returned. Approval is read on every call, so revoking it takes effect at once.
 */
export const getMyCounsellor = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    if (!caller) return { status: "unauthenticated" as const };
    if (!isStudentRole(caller.role)) return { status: "not_student" as const };

    const active = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q) => q.eq("studentId", caller._id).eq("active", true))
      .first();
    if (!active) return { status: "unassigned" as const };

    const counsellor = await ctx.db.get(active.counsellorId);
    if (!counsellor || counsellor.role !== "counsellor") return { status: "unassigned" as const };
    if (counsellor.status === "inactive") return { status: "unavailable" as const };

    const contacts = approvedContacts(await directoryEntryForCounsellor(ctx, counsellor._id));
    return {
      status: "assigned" as const,
      counsellor: {
        displayName: counsellor.full_name || "Your counsellor",
        role: "Counsellor",
        email: contacts.email,
        phone: contacts.phone,
      },
      assignedAt: active.assignedAt,
    };
  },
});

const OPEN_APPOINTMENT_STATUSES = ["pending", "waiting", "accepted", "scheduled"] as const;

/**
 * Admin: everything that needs administrative attention in one place: unassigned students,
 * students whose counsellor is inactive, full / nearly full caseloads, open appointments with no
 * counsellor, recent failed bulk assignments and safety alerts that reached no staff.
 */
export const getAdminExceptions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const students = await ctx.db.query("users").withIndex("by_role_and_created_at", (q) => q.eq("role", "patient")).take(ROSTER_LIMIT);
    const { active, sizes } = await caseloadSizes(ctx);
    const assignedStudents = new Set(active.map((a) => String(a.studentId)));
    const counsellors = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "counsellor")).collect();
    const inactiveCounsellorIds = new Set(counsellors.filter((c) => c.status === "inactive").map((c) => String(c._id)));

    const unassignedStudents = students
      .filter((s) => s.status !== "inactive" && !assignedStudents.has(String(s._id)))
      .map((s) => ({ studentId: s._id, name: s.full_name || s.alias || "Unnamed student", patientId: s.patientId ?? null }));
    const withInactiveCounsellor = active
      .filter((a) => inactiveCounsellorIds.has(String(a.counsellorId)))
      .map((a) => ({ studentId: a.studentId, counsellorId: a.counsellorId }));
    const capacity = counsellors
      .filter((c) => c.status !== "inactive")
      .map((c) => ({ counsellorId: c._id, name: c.full_name || "Counsellor", caseloadSize: sizes.get(String(c._id)) ?? 0 }))
      .map((c) => ({ ...c, state: capacityState(c.caseloadSize) }))
      .filter((c) => c.state !== "available");

    const openWithoutCounsellor = [];
    for (const status of OPEN_APPOINTMENT_STATUSES) {
      const rows = await ctx.db.query("appointments").withIndex("by_status", (q) => q.eq("status", status)).take(500);
      for (const a of rows) {
        if (a.counsellorId || !a.date) continue;
        openWithoutCounsellor.push({ appointmentId: a._id, studentId: a.userId, date: a.date, time: a.time ?? null, status: a.status });
      }
    }

    const failures = await ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "caseload_assign_failed")).order("desc").take(20);
    const undelivered = (await ctx.db.query("alerts").withIndex("by_deliveryStatus", (q) => q.eq("deliveryStatus", "no_active_staff")).take(100)).filter(
      (a) => a.status !== "resolved"
    );

    return {
      capacity: DEFAULT_CASELOAD_CAPACITY,
      nearCapacityThreshold: NEAR_CAPACITY_THRESHOLD,
      unassignedStudents: { count: unassignedStudents.length, sample: unassignedStudents.slice(0, 20) },
      studentsWithInactiveCounsellor: { count: withInactiveCounsellor.length, sample: withInactiveCounsellor.slice(0, 20) },
      counsellorsAtOrNearCapacity: capacity,
      openAppointmentsWithoutCounsellor: { count: openWithoutCounsellor.length, sample: openWithoutCounsellor.slice(0, 20) },
      recentAssignmentFailures: failures.map((f) => {
        let detail: any = {};
        try {
          detail = JSON.parse(f.details ?? "{}");
        } catch {}
        return { at: f.timestamp, studentId: detail.studentId ?? null, counsellorId: detail.counsellorId ?? null, error: detail.error ?? "Assignment failed" };
      }),
      undeliveredSafetyAlerts: undelivered.length,
    };
  },
});
