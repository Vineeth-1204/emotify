import type { Id } from "./_generated/dataModel";

export interface AuthenticatedUser {
  _id: Id<"users">;
  role: "patient" | "counsellor" | "admin" | string;
  full_name?: string;
  mobile_number?: string;
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

  // 1. Try lookup by canonical _id (identity.subject)
  let user = null;
  try {
    user = await ctx.db.get(identity.subject as Id<"users">);
  } catch (e) {
    // If subject is not an Id<"users"> (e.g. mock test string), fallback to clerkId index
  }

  // 2. Try lookup by clerkId index
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", identity.subject))
      .first();
  }

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
 * - Admin or Counselor: CAN access any student's data.
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

  const callerId = identity.subject;

  // Fast path: Caller is requesting their own data directly by their auth subject
  if (callerId === targetUserId) {
    return;
  }

  // Look up caller user document to check role & alternate identity
  const user = await getAuthenticatedUser(ctx);

  // If caller is an Admin or Counselor, access is granted
  if (user && (user.role === "admin" || user.role === "counsellor")) {
    return;
  }

  // If caller is a student, check if targetUserId matches their canonical _id or clerkId
  if (user) {
    const canonicalId = String(user._id);
    const legacyId = user.clerkId;
    if (targetUserId === canonicalId || (legacyId && targetUserId === legacyId)) {
      return;
    }
  }

  // Otherwise, student is trying to access another student's clinical data -> DENIED!
  throw new Error("Unauthorized: Students can access ONLY their own clinical data.");
}
