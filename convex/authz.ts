import type { Id } from "./_generated/dataModel";

export interface AuthenticatedUser {
  _id: Id<"users">;
  role: "patient" | "counsellor" | "admin" | string;
  full_name?: string;
  mobile_number?: string;
  email?: string;
  status?: string;
  clerkId?: string;
  patientId?: string;
}

/**
 * Get current authenticated user document if exists, or null.
 */
export async function getAuthenticatedUser(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }
): Promise<AuthenticatedUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !identity.subject) return null;

  // The token subject is always the canonical users._id (see users.login/signJwt).
  // Legacy clerkId values are NOT accepted as an authentication subject.
  const userId = ctx.db.normalizeId("users", identity.subject);
  if (!userId) return null;
  const user = await ctx.db.get(userId);

  return user;
}

/**
 * Require an authenticated caller. Throws "Unauthenticated" if no session.
 */
export async function requireAuthenticated(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }
): Promise<{ identity: any; user: AuthenticatedUser | null }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: Login required.");
  }
  const user = await getAuthenticatedUser(ctx);
  return { identity, user };
}

/**
 * Require Admin role. Throws "Unauthorized" if caller is not an admin.
 */
export async function requireAdmin(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }
): Promise<AuthenticatedUser> {
  const { user } = await requireAuthenticated(ctx);
  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized: Administrative access required.");
  }
  return user;
}

/**
 * Require Counselor or Admin role. Throws "Unauthorized" if caller is a student.
 */
export async function requireCounselorOrAdmin(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }
): Promise<AuthenticatedUser> {
  const { user } = await requireAuthenticated(ctx);
  if (!user || (user.role !== "admin" && user.role !== "counsellor")) {
    throw new Error("Unauthorized: Counselor or Admin access required.");
  }
  return user;
}

/**
 * Assert that caller is authorized to access the given target student's clinical data:
 * - Admin: CAN access any student's data.
 * - Counselor: CAN access ONLY students in their active caseload (counsellorAssignments).
 * - Student: CAN access ONLY their own data (where targetUserId matches their own _id or clerkId).
 * - Unauthorized: Throws "Unauthorized: Students can access ONLY their own clinical data."
 */
export async function assertCanAccessStudent(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any },
  targetUserId: string
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: Login required to access clinical data.");
  }

  // Fast path: Caller is requesting their own data directly by their auth subject
  if (identity.subject === targetUserId) {
    return;
  }

  const user = await getAuthenticatedUser(ctx);

  if (user && user.role === "admin") {
    return;
  }

  if (user && user.role === "counsellor") {
    const student = await resolveStudentUser(ctx, targetUserId);
    if (student && (await isAssignedCounsellor(ctx, user._id, student._id))) {
      return;
    }
    throw new Error("Unauthorized: This student is not in your caseload.");
  }

  // Student: their canonical _id or legacy clerkId alias
  if (user) {
    const canonicalId = String(user._id);
    const legacyId = user.clerkId;
    if (targetUserId === canonicalId || (legacyId && targetUserId === legacyId)) {
      return;
    }
  }

  throw new Error("Unauthorized: Students can access ONLY their own clinical data.");
}

/** Resolves a student user from a canonical users._id or a legacy clerkId alias. */
export async function resolveStudentUser(ctx: { db: any }, userKey: string): Promise<any | null> {
  if (!userKey) return null;
  const id = ctx.db.normalizeId("users", userKey);
  if (id) return await ctx.db.get(id);
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q: any) => q.eq("clerkId", userKey))
    .first();
}

/** True if the counsellor has an active caseload assignment for the student. */
export async function isAssignedCounsellor(ctx: { db: any }, counsellorId: Id<"users">, studentId: Id<"users">): Promise<boolean> {
  const assignments = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_student_and_active", (q: any) => q.eq("studentId", studentId).eq("active", true))
    .collect();
  return assignments.some((a: any) => a.counsellorId === counsellorId);
}

export interface StaffScope {
  /** null = every student (admin); otherwise the caller's caseload. */
  studentIds: Set<string> | null;
  /** Canonical ids AND legacy clerkIds of in-scope students, for matching stored userId strings. */
  studentKeys: Set<string> | null;
  caller: AuthenticatedUser;
}

/**
 * Staff scope for list/aggregate endpoints. Admins see all students; counsellors see
 * only their active caseload. Returns null for non-staff callers.
 */
export async function getStaffScope(
  ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }
): Promise<StaffScope | null> {
  const caller = await getAuthenticatedUser(ctx);
  if (!caller || (caller.role !== "admin" && caller.role !== "counsellor")) return null;
  if (caller.role === "admin") return { studentIds: null, studentKeys: null, caller };

  const assignments = await ctx.db
    .query("counsellorAssignments")
    .withIndex("by_counsellor_and_active", (q: any) => q.eq("counsellorId", caller._id).eq("active", true))
    .collect();
  const studentIds = new Set<string>();
  const studentKeys = new Set<string>();
  for (const a of assignments) {
    const student = await ctx.db.get(a.studentId);
    if (!student) continue;
    studentIds.add(String(student._id));
    studentKeys.add(String(student._id));
    if (student.clerkId) studentKeys.add(student.clerkId);
  }
  return { studentIds, studentKeys, caller };
}

/** True if a stored userId string belongs to a student within the scope. */
export function scopeIncludes(scope: StaffScope, userKey: string | undefined | null): boolean {
  if (!userKey) return false;
  return scope.studentKeys === null || scope.studentKeys.has(String(userKey));
}

/**
 * Staff recipients for notifications about a student: all admins plus the student's
 * assigned counsellor(s). If no counsellor is assigned, every active counsellor is
 * included so nothing is missed.
 */
export async function getStaffRecipientsForStudent(ctx: { db: any }, studentKey: string | undefined | null): Promise<any[]> {
  const admins = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "admin")).collect();
  let counsellors: any[] = [];
  const student = studentKey ? await resolveStudentUser(ctx, String(studentKey)) : null;
  if (student) {
    const assignments = await ctx.db
      .query("counsellorAssignments")
      .withIndex("by_student_and_active", (q: any) => q.eq("studentId", student._id).eq("active", true))
      .collect();
    for (const a of assignments) {
      const c = await ctx.db.get(a.counsellorId);
      if (c) counsellors.push(c);
    }
  }
  if (counsellors.length === 0) {
    counsellors = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "counsellor")).collect();
  }
  return [...admins, ...counsellors].filter((u) => u.status !== "inactive");
}
