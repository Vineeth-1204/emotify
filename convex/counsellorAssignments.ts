import { v } from "convex/values";
import { mutation, query } from "./functions";
import { requireAdmin, assertCanAccessStudent, getAuthenticatedUser } from "./authz";
import { logAuditEvent } from "./audit";

/**
 * Admin: assign a student to a counsellor's caseload. A student has at most one
 * active counsellor; assigning a new one ends the previous assignment.
 */
export const assign = mutation({
  args: {
    studentId: v.id("users"),
    counsellorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const student = await ctx.db.get(args.studentId);
    if (!student || student.role !== "patient") throw new Error("Student not found.");
    const counsellor = await ctx.db.get(args.counsellorId);
    if (!counsellor || counsellor.role !== "counsellor") throw new Error("Counsellor not found.");
    if (counsellor.status === "inactive") throw new Error("Counsellor account is inactive.");

    const now = Date.now();
    const current = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q) => q.eq("studentId", args.studentId).eq("active", true))
      .collect();
    if (current.some((a) => a.counsellorId === args.counsellorId)) {
      return { success: true, unchanged: true };
    }
    for (const a of current) {
      await ctx.db.patch(a._id, { active: false, endedAt: now });
    }

    await ctx.db.insert("counsellorAssignments", {
      counsellorId: args.counsellorId,
      studentId: args.studentId,
      assignedBy: admin._id,
      assignedAt: now,
      active: true,
    });

    await ctx.db.insert("notifications", {
      recipientId: String(args.counsellorId),
      type: "caseload_assignment",
      title: "New student assigned",
      message: student.patientId
        ? `Student ${student.patientId} has been added to your caseload.`
        : "A student has been added to your caseload.",
      priority: "medium",
      read: false,
      archived: false,
      createdAt: now,
    });

    await logAuditEvent(
      ctx,
      String(admin._id),
      "caseload_assigned",
      JSON.stringify({ studentId: args.studentId, counsellorId: args.counsellorId })
    );
    return { success: true, unchanged: false };
  },
});

/** Admin: remove a student's active counsellor assignment. */
export const unassign = mutation({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const current = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q) => q.eq("studentId", args.studentId).eq("active", true))
      .collect();
    for (const a of current) {
      await ctx.db.patch(a._id, { active: false, endedAt: now });
    }
    await logAuditEvent(ctx, String(admin._id), "caseload_unassigned", JSON.stringify({ studentId: args.studentId }));
    return { success: true, ended: current.length };
  },
});

/** Staff: the counsellor currently responsible for a student (null if unassigned). */
export const getForStudent = query({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
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
      assignedAt: active.assignedAt,
    };
  },
});

/** Admin: active counsellor accounts available for assignment. */
export const listCounsellorUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const counsellors = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "counsellor"))
      .collect();
    const result = [];
    for (const c of counsellors) {
      if (c.status === "inactive") continue;
      const caseload = await ctx.db
        .query("counsellorAssignments")
        .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", c._id).eq("active", true))
        .collect();
      result.push({ _id: c._id, full_name: c.full_name || "Counsellor", email: c.email, caseloadSize: caseload.length });
    }
    return result;
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
