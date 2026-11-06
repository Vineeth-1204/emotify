/**
 * Caseload capacity (20 active students per counsellor), enforced on the server for every
 * assignment path, safe under concurrent assignments; admin visibility of exceptions.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_CASELOAD_CAPACITY, capacityState } from "./counsellorAssignments";

const modules = import.meta.glob("./**/*.ts");

async function setup(studentCount = DEFAULT_CASELOAD_CAPACITY + 3) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    const students = [];
    for (let i = 0; i < studentCount; i++) students.push(await user({ full_name: `Student ${i}`, role: "patient", patientId: String(700 + i) }));
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      admin2: await user({ full_name: "Admin 2", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      students,
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  const fill = async (counsellorId: string, students: string[]) => {
    const res: any = await as(ids.admin).mutation(api.counsellorAssignments.assignMany, { studentIds: students as any, counsellorId: counsellorId as any });
    return res;
  };
  const activeFor = (counsellorId: string) =>
    t.run(async (ctx) => (await ctx.db.query("counsellorAssignments").collect()).filter((a) => a.active && a.counsellorId === counsellorId).length);
  return { t, ...ids, as, fill, activeFor };
}

describe("capacity is enforced on the server", () => {
  test("capacity states", () => {
    expect(DEFAULT_CASELOAD_CAPACITY).toBe(20);
    expect(capacityState(0)).toBe("available");
    expect(capacityState(17)).toBe("available");
    expect(capacityState(18)).toBe("near");
    expect(capacityState(20)).toBe("full");
  });

  test("single assignment beyond 20 is refused; nothing is written", async () => {
    const { as, admin, counsellorA, students, fill, activeFor } = await setup();
    await fill(counsellorA, students.slice(0, 20));
    expect(await activeFor(counsellorA)).toBe(20);
    await expect(as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[20] as any, counsellorId: counsellorA as any })).rejects.toThrow(/caseload capacity of 20/);
    expect(await activeFor(counsellorA)).toBe(20);
    // Re-assigning a student who is already in the caseload is "unchanged", not refused.
    const res: any = await as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[0] as any, counsellorId: counsellorA as any });
    expect(res.outcome).toBe("unchanged");
  });

  test("bulk assignment stops at the limit and reports (and records) each refusal", async () => {
    const { t, counsellorA, students, fill, activeFor } = await setup();
    const res = await fill(counsellorA, students.slice(0, 23));
    expect(res.summary).toMatchObject({ assigned: 20, failed: 3 });
    expect(res.results.filter((r: any) => r.outcome === "failed").every((r: any) => /capacity/.test(r.error))).toBe(true);
    expect(await activeFor(counsellorA)).toBe(20);
    const failures = await t.run(async (ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "caseload_assign_failed")).collect());
    expect(failures).toHaveLength(3);
  });

  test("reassignment to a full counsellor is refused; freeing a place allows it", async () => {
    const { as, admin, counsellorA, counsellorB, students, fill, activeFor } = await setup();
    await fill(counsellorA, students.slice(0, 20));
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[20] as any, counsellorId: counsellorB as any });
    await expect(as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[20] as any, counsellorId: counsellorA as any })).rejects.toThrow(/capacity/);
    // Moving one of A's students to B frees a place for the reassignment.
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[0] as any, counsellorId: counsellorB as any });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[20] as any, counsellorId: counsellorA as any });
    expect(await activeFor(counsellorA)).toBe(20);
    expect(await activeFor(counsellorB)).toBe(1);
  });

  test("two admins assigning at the same time cannot exceed the limit", async () => {
    const { as, admin, admin2, counsellorA, students, fill, activeFor } = await setup();
    await fill(counsellorA, students.slice(0, 19));
    const results = await Promise.allSettled([
      as(admin).mutation(api.counsellorAssignments.assign, { studentId: students[19] as any, counsellorId: counsellorA as any }),
      as(admin2).mutation(api.counsellorAssignments.assign, { studentId: students[20] as any, counsellorId: counsellorA as any }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await activeFor(counsellorA)).toBe(20);
  });

  test("assignment notifies the student and counsellor; a full caseload notifies admins once a day", async () => {
    const { t, admin, admin2, counsellorA, students, fill } = await setup();
    await fill(counsellorA, students.slice(0, 20));
    const notes = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notes.filter((n) => n.type === "counsellor_assigned").map((n) => n.recipientId).sort()).toEqual(students.slice(0, 20).map(String).sort());
    expect(notes.filter((n) => n.type === "caseload_assignment" && n.recipientId === counsellorA)).toHaveLength(1);
    const capacityNotes = notes.filter((n) => n.type === "caseload_capacity");
    expect(capacityNotes.map((n) => n.recipientId).sort()).toEqual([admin, admin2].sort());
    expect(capacityNotes[0].pushStatus).toBeUndefined(); // in-app only
    // Student copy names no counsellor and contains no clinical detail.
    const studentNote = notes.find((n) => n.type === "counsellor_assigned")!;
    expect(studentNote.message).not.toMatch(/Counsellor A/);
  });

  test("admin views report caseload, capacity and exceptions; counsellors and students cannot read them", async () => {
    const { as, admin, counsellorA, students, fill } = await setup();
    await fill(counsellorA, students.slice(0, 19));
    const list: any[] = await as(admin).query(api.counsellorAssignments.listCounsellorUsers, {});
    expect(list.find((c) => c._id === counsellorA)).toMatchObject({ caseloadSize: 19, capacity: 20, capacityState: "near" });
    const ex: any = await as(admin).query(api.counsellorAssignments.getAdminExceptions, {});
    expect(ex.unassignedStudents.count).toBe(students.length - 19);
    expect(ex.counsellorsAtOrNearCapacity.map((c: any) => [c.name, c.state])).toEqual([["Counsellor A", "near"]]);
    await expect(as(counsellorA).query(api.counsellorAssignments.getAdminExceptions, {})).rejects.toThrow(/Admin/);
    await expect(as(students[0]).query(api.counsellorAssignments.getAdminExceptions, {})).rejects.toThrow(/Admin/);
  });
});
