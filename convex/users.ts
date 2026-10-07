import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { signJwt, verifyPassword, hashPassword } from "./authHelpers";
import { logAuditEvent } from "./audit";
import { assertCanAccessStudent, requireAdmin, getAuthenticatedUser } from "./authz";

function sanitizeUser(u: any) {
  if (!u) return null;
  const { password_hash, biometricToken, temp_password, ...safeUser } = u;
  return safeUser;
}

/** Get user by ID (for compatibility with getByClerkId) */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, args.clerkId);

    let user = null;
    try {
      user = await ctx.db.get(args.clerkId as Id<"users">);
      if (user) return sanitizeUser(user);
    } catch (e) {
      // Ignore conversion error
    }

    user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return sanitizeUser(user);
  },
});

/** Required Admin Auth Helper */
async function checkAdmin(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  let user = null;
  try {
    user = await ctx.db.get(identity.subject as Id<"users">);
  } catch (e) {}
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", identity.subject))
      .first();
  }
  if (!user || user.role !== "admin") return null;
  return user;
}

/** Required Staff (Counselor or Admin) Auth Helper */
async function checkStaff(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  let user = null;
  try {
    user = await ctx.db.get(identity.subject as Id<"users">);
  } catch (e) {}
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", identity.subject))
      .first();
  }
  if (!user || (user.role !== "admin" && user.role !== "counsellor")) return null;
  return user;
}

export interface PatientCursorPayload {
  createdAt: number;
  id: string;
}

export type PaginatedPatientsResult = any[] & {
  patients: any[];
  nextCursor: string | null;
};

export function encodePatientCursor(payload: PatientCursorPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(json);
}

export function decodePatientCursor(cursorStr: string): PatientCursorPayload {
  let json = "";
  try {
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(cursorStr, "base64").toString("utf-8");
    } else {
      json = atob(cursorStr);
    }
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.createdAt !== "number" ||
      isNaN(parsed.createdAt) ||
      typeof parsed.id !== "string" ||
      parsed.id.trim() === ""
    ) {
      throw new Error("Invalid patient cursor shape");
    }
    return parsed;
  } catch (err) {
    throw new Error("Invalid cursor format");
  }
}

/** Admin/Counselor: List all patient users with deterministic cursor pagination */
export const listPatients = query({
  args: {
    search: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    paginate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const staff = await checkStaff(ctx);
    if (!staff) {
      return ((args.cursor !== undefined || args.paginate === true)
        ? { patients: [], nextCursor: null }
        : []) as any as PaginatedPatientsResult;
    }

    const effectiveLimit = Math.min(Math.max(args.limit ?? 25, 1), 50);

    let cursorObj: PatientCursorPayload | null = null;
    if (args.cursor) {
      cursorObj = decodePatientCursor(args.cursor);
    }

    const searchStr = args.search && args.search.trim() ? args.search.trim().toLowerCase() : null;

    if (!searchStr) {
      // Normal unfiltered cursor pagination: fetch strictly bounded batch
      const fetchBatchSize = effectiveLimit + 1;
      let candidateUsers = await ctx.db
        .query("users")
        .withIndex("by_role_and_created_at", (q) =>
          cursorObj
            ? q.eq("role", "patient").lte("created_at", cursorObj.createdAt)
            : q.eq("role", "patient")
        )
        .order("desc")
        .take(fetchBatchSize);

      // Fallback if records exist without created_at field
      if (candidateUsers.length === 0 && !cursorObj) {
        candidateUsers = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "patient"))
          .order("desc")
          .take(fetchBatchSize);
      }

      // Sort deterministically: created_at DESC, _id DESC
      candidateUsers.sort((a, b) => {
        const tA = a.created_at ?? a.createdAt ?? a._creationTime ?? 0;
        const tB = b.created_at ?? b.createdAt ?? b._creationTime ?? 0;
        if (tB !== tA) return tB - tA;
        return String(b._id).localeCompare(String(a._id));
      });

      const eligible = [];
      for (const u of candidateUsers) {
        const t = u.created_at ?? u.createdAt ?? u._creationTime ?? 0;
        const id = String(u._id);
        if (cursorObj) {
          if (t > cursorObj.createdAt) continue;
          if (t === cursorObj.createdAt && id.localeCompare(cursorObj.id) >= 0) continue;
        }
        eligible.push(u);
      }

      const mapped = eligible.map((u, idx) => {
        const safe = sanitizeUser(u);
        return {
          ...safe,
          patientId: u.patientId || String(101 + idx),
        };
      });

      const pageRecords = mapped.slice(0, effectiveLimit);
      const hasMore = mapped.length > effectiveLimit;

      const nextCursor =
        hasMore && pageRecords.length > 0
          ? encodePatientCursor({
              createdAt:
                pageRecords[pageRecords.length - 1].created_at ??
                pageRecords[pageRecords.length - 1].createdAt ??
                pageRecords[pageRecords.length - 1]._creationTime ??
                0,
              id: String(pageRecords[pageRecords.length - 1]._id),
            })
          : null;

      if (args.cursor !== undefined || args.paginate === true) {
        return {
          patients: pageRecords,
          nextCursor,
        } as any as PaginatedPatientsResult;
      }

      return pageRecords as any as PaginatedPatientsResult;
    }

    // Search query path: Bounded iterative indexed retrieval across candidate batches
    const BATCH_SIZE = 100;
    const MAX_SCAN_LIMIT = 1000;
    let totalScanned = 0;
    let currentCursor = cursorObj;
    const matched: any[] = [];
    let hasMore = false;

    while (totalScanned < MAX_SCAN_LIMIT) {
      let batch = await ctx.db
        .query("users")
        .withIndex("by_role_and_created_at", (q) =>
          currentCursor
            ? q.eq("role", "patient").lte("created_at", currentCursor.createdAt)
            : q.eq("role", "patient")
        )
        .order("desc")
        .take(BATCH_SIZE);

      if (batch.length === 0 && !currentCursor && totalScanned === 0) {
        batch = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "patient"))
          .order("desc")
          .take(BATCH_SIZE);
      }

      if (batch.length === 0) break;

      batch.sort((a, b) => {
        const tA = a.created_at ?? a.createdAt ?? a._creationTime ?? 0;
        const tB = b.created_at ?? b.createdAt ?? b._creationTime ?? 0;
        if (tB !== tA) return tB - tA;
        return String(b._id).localeCompare(String(a._id));
      });

      let advanced = false;
      for (const u of batch) {
        const t = u.created_at ?? u.createdAt ?? u._creationTime ?? 0;
        const id = String(u._id);

        if (currentCursor) {
          if (t > currentCursor.createdAt) continue;
          if (t === currentCursor.createdAt && id.localeCompare(currentCursor.id) >= 0) continue;
        }

        totalScanned++;
        currentCursor = { createdAt: t, id };
        advanced = true;

        const pId = (u.patientId || "").toLowerCase();
        const fn = (u.full_name || "").toLowerCase();
        const mob = u.mobile_number || "";

        if (pId.includes(searchStr) || fn.includes(searchStr) || mob.includes(searchStr)) {
          const safe = sanitizeUser(u);
          matched.push({
            ...safe,
            patientId: u.patientId || String(u._id),
          });

          if (matched.length > effectiveLimit) {
            hasMore = true;
            break;
          }
        }
      }

      if (hasMore || batch.length < BATCH_SIZE || !advanced) break;
    }

    const pageRecords = matched.slice(0, effectiveLimit);
    const nextCursor =
      hasMore && pageRecords.length > 0
        ? encodePatientCursor({
            createdAt:
              pageRecords[pageRecords.length - 1].created_at ??
              pageRecords[pageRecords.length - 1].createdAt ??
              pageRecords[pageRecords.length - 1]._creationTime ??
              0,
            id: String(pageRecords[pageRecords.length - 1]._id),
          })
        : null;

    if (args.cursor !== undefined || args.paginate === true) {
      return {
        patients: pageRecords,
        nextCursor,
      } as any as PaginatedPatientsResult;
    }

    return pageRecords as any as PaginatedPatientsResult;
  },
});

/** Staff: Dedicated bounded patient selector for appointment booking and dropdowns */
export const searchPatientSelector = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await checkStaff(ctx);
    if (!staff) return [];

    const effectiveLimit = Math.min(Math.max(args.limit ?? 50, 1), 50);
    const searchStr = args.search && args.search.trim() ? args.search.trim().toLowerCase() : null;

    if (!searchStr) {
      const candidates = await ctx.db
        .query("users")
        .withIndex("by_role_and_created_at", (q) => q.eq("role", "patient"))
        .order("desc")
        .take(effectiveLimit);

      return candidates.map((u) => ({
        _id: u._id,
        full_name: u.full_name || "Unknown Patient",
        patientId: u.patientId || String(u._id),
        mobile_number: u.mobile_number || "N/A",
        status: u.status || "active",
      }));
    }

    // Iterative search over patient role index
    const BATCH_SIZE = 100;
    const MAX_SCAN_LIMIT = 500;
    let totalScanned = 0;
    let currentCursor: PatientCursorPayload | null = null;
    const matched: any[] = [];

    while (totalScanned < MAX_SCAN_LIMIT) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_role_and_created_at", (q) =>
          currentCursor
            ? q.eq("role", "patient").lte("created_at", currentCursor.createdAt)
            : q.eq("role", "patient")
        )
        .order("desc")
        .take(BATCH_SIZE);

      if (batch.length === 0) break;

      batch.sort((a, b) => {
        const tA = a.created_at ?? a.createdAt ?? a._creationTime ?? 0;
        const tB = b.created_at ?? b.createdAt ?? b._creationTime ?? 0;
        if (tB !== tA) return tB - tA;
        return String(b._id).localeCompare(String(a._id));
      });

      let advanced = false;
      for (const u of batch) {
        const t = u.created_at ?? u.createdAt ?? u._creationTime ?? 0;
        const id = String(u._id);

        if (currentCursor) {
          if (t > currentCursor.createdAt) continue;
          if (t === currentCursor.createdAt && id.localeCompare(currentCursor.id) >= 0) continue;
        }

        totalScanned++;
        currentCursor = { createdAt: t, id };
        advanced = true;

        const fn = (u.full_name || "").toLowerCase();
        const pId = (u.patientId || "").toLowerCase();
        const mob = u.mobile_number || "";

        if (fn.includes(searchStr) || pId.includes(searchStr) || mob.includes(searchStr)) {
          matched.push({
            _id: u._id,
            full_name: u.full_name || "Unknown Patient",
            patientId: u.patientId || String(u._id),
            mobile_number: u.mobile_number || "N/A",
            status: u.status || "active",
          });

          if (matched.length >= effectiveLimit) break;
        }
      }

      if (matched.length >= effectiveLimit || batch.length < BATCH_SIZE || !advanced) break;
    }

    return matched;
  },
});

/**
 * Atomically allocates the next sequential patientId using the dedicated counters table (Priority 11 Step 5A).
 *
 * If the counter does not yet exist, initializes it from the current maximum patientId across existing users (or 100).
 * Future calls increment the counter atomically in Convex transactions, avoiding full table scans.
 */
export async function allocateNextPatientId(ctx: { db: any }): Promise<string> {
  const counterDocs = await ctx.db
    .query("counters")
    .withIndex("by_name", (q: any) => q.eq("name", "patientId"))
    .collect();

  if (counterDocs.length === 0) {
    // One-time initialization from existing users
    const allUsers = await ctx.db.query("users").collect();
    let maxId = 100;
    for (const u of allUsers) {
      if (u.patientId && !isNaN(Number(u.patientId))) {
        maxId = Math.max(maxId, Number(u.patientId));
      }
    }
    const nextValue = maxId + 1;
    await ctx.db.insert("counters", {
      name: "patientId",
      value: nextValue,
    });
    return String(nextValue);
  }

  // Defensively handle multi-record edge cases by selecting the maximum value
  let highestDoc = counterDocs[0];
  for (let i = 1; i < counterDocs.length; i++) {
    if (counterDocs[i].value > highestDoc.value) {
      highestDoc = counterDocs[i];
    }
  }

  // Deduplicate any surplus counter documents to maintain strict 1:1 invariant
  for (const doc of counterDocs) {
    if (doc._id !== highestDoc._id) {
      await ctx.db.delete(doc._id);
    }
  }

  const nextValue = highestDoc.value + 1;
  await ctx.db.patch(highestDoc._id, {
    value: nextValue,
  });
  return String(nextValue);
}

/** Get current value of patientId counter (Priority 11 Step 5A) */
export const getPatientCounter = query({
  args: {},
  handler: async (ctx) => {
    const counterDoc = await ctx.db
      .query("counters")
      .withIndex("by_name", (q: any) => q.eq("name", "patientId"))
      .first();
    return counterDoc?.value ?? null;
  },
});

/** Admin: Create a new user (patient or admin) */
export const createUser = mutation({
  args: {
    full_name: v.string(),
    mobile_number: v.string(),
    email: v.optional(v.string()),
    password: v.string(),
    status: v.string(), // "active" | "inactive"
    role: v.string(), // "admin" | "patient"
  },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", args.mobile_number))
      .first();

    if (existing) {
      throw new Error("Mobile number is already registered.");
    }

    const password_hash = await hashPassword(args.password);

    // Atomically allocate sequential patientId using dedicated counter table (only if role is patient)
    const nextPatientId = args.role === "patient" ? await allocateNextPatientId(ctx) : undefined;

    const userId = await ctx.db.insert("users", {
      patientId: nextPatientId,
      full_name: args.full_name,
      mobile_number: args.mobile_number,
      email: args.email,
      password_hash,
      role: args.role,
      status: args.status,
      is_first_login: true,
      created_at: Date.now(),
      updated_at: Date.now(),
      onboardingComplete: false,
      screeningComplete: false,
      biometricEnabled: false,
    });

    return userId;
  },
});

/** Admin: Toggle user active status */
export const toggleUserStatus = mutation({
  args: { userId: v.id("users"), status: v.string() },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // EMOT-PERF-02: Idempotent status update - avoid redundant write
    if (user.status === args.status) {
      return { success: true };
    }

    await ctx.db.patch(args.userId, {
      status: args.status,
      updated_at: Date.now(),
    });

    // If deactivated, delete all active sessions immediately to log them out
    if (args.status === "inactive") {
      const userSessions = await ctx.db
        .query("sessions")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
      for (const session of userSessions) {
        await ctx.db.delete(session._id);
      }
    }
  },
});

/** Admin: Edit user profile details */
export const editUser = mutation({
  args: {
    userId: v.id("users"),
    full_name: v.string(),
    mobile_number: v.string(),
    email: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", args.mobile_number))
      .first();

    if (existing && existing._id !== args.userId) {
      throw new Error("Mobile number is registered to another user.");
    }

    await ctx.db.patch(args.userId, {
      full_name: args.full_name,
      mobile_number: args.mobile_number,
      email: args.email,
      status: args.status,
      updated_at: Date.now(),
    });
  },
});

/** Admin: Reset user password to a random one and return the plain-text password for sharing */
export const resetPassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    // Generate a secure random 12-char alphanumeric password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let newPassword = "";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) {
      newPassword += chars[arr[i] % chars.length];
    }

    const password_hash = await hashPassword(newPassword);

    await ctx.db.patch(args.userId, {
      password_hash,
      is_first_login: true, // Force password change on next login
      temp_password: newPassword, // Stored plain-text temporarily for admin to read & share
      updated_at: Date.now(),
    });

    return { newPassword };
  },
});

/** Admin: Get the temporary plain-text password for a user (cleared after reading) */
export const getAndClearTempPassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const temp = (user as any).temp_password || null;
    // Clear the temp password after reading
    if (temp) {
      await ctx.db.patch(args.userId, { temp_password: undefined });
    }
    return temp;
  },
});


/** Complete onboarding details */
export const completeOnboarding = mutation({
  args: {
    userId: v.optional(v.string()),
    alias: v.string(),
    age: v.number(),
    campus: v.string(),
    department: v.string(),
    year: v.optional(v.string()),
    gender: v.optional(v.string()),
    consentVersion: v.string(),
    consentTimestamp: v.number(),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    mitraPreferences: v.optional(
      v.object({
        name: v.optional(v.string()),
        avatarGender: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Must be logged in to complete onboarding.");
    }

    const caller = await getAuthenticatedUser(ctx);
    const callerSubject = identity.subject;

    // Enforce ownership: Student can only complete onboarding for themselves.
    // If a different args.userId is provided, caller must be staff (counsellor or admin).
    let targetUserId = caller ? String(caller._id) : callerSubject;
    const isStaff = caller && (caller.role === "admin" || caller.role === "counsellor");

    if (args.userId) {
      const isSelf =
        args.userId === callerSubject ||
        (caller && (args.userId === String(caller._id) || args.userId === caller.clerkId));

      if (!isSelf) {
        if (!isStaff) {
          throw new Error("Unauthorized: Cannot modify another student's onboarding.");
        }
        targetUserId = args.userId;
      }
    }

    let user: any = null;
    try {
      user = await ctx.db.get(targetUserId as Id<"users">);
    } catch (e) {}
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    if (!user) throw new Error("User not found.");

    // Process optional mitraPreferences or keep existing/default
    let validatedMitra = user.mitraPreferences;
    if (args.mitraPreferences) {
      let g = (args.mitraPreferences.avatarGender || "female").toLowerCase().trim();
      if (g !== "female" && g !== "male") g = "female";

      let rawName = args.mitraPreferences.name ? args.mitraPreferences.name.replace(/[\x00-\x1F\x7F]/g, "").trim() : "Emoty";
      if (rawName.length > 30) rawName = rawName.substring(0, 30).trim();
      const n = rawName.length > 0 ? rawName : "Emoty";

      validatedMitra = {
        name: n,
        avatarGender: g,
        avatarVariant: "default",
        updatedAt: Date.now(),
      };
    } else if (!validatedMitra) {
      // Default to female + Emoty if none set
      validatedMitra = {
        name: "Emoty",
        avatarGender: "female",
        avatarVariant: "default",
        updatedAt: Date.now(),
      };
    }

    await ctx.db.patch(user._id, {
      alias: args.alias,
      age: args.age,
      campus: args.campus,
      department: args.department,
      year: args.year,
      gender: args.gender,
      consentVersion: args.consentVersion,
      consentTimestamp: args.consentTimestamp,
      emergencyContactName: args.emergencyContactName,
      emergencyContactPhone: args.emergencyContactPhone,
      onboardingComplete: true,
      mitraPreferences: validatedMitra,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

/** Get user by ID (sanitized) */
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertCanAccessStudent(ctx, String(args.userId));
    const user = await ctx.db.get(args.userId);
    return sanitizeUser(user);
  },
});

/** Get current user profile details (sanitized) */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.get(identity.subject as Id<"users">);
    return sanitizeUser(user);
  },
});

/** Toggle biometric helper */
export const toggleBiometric = mutation({
  args: { clerkId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Login required.");
    }
    const caller = await getAuthenticatedUser(ctx);
    const callerSubject = identity.subject;

    let targetUser = null;
    try {
      targetUser = await ctx.db.get(args.clerkId as Id<"users">);
    } catch (e) { }

    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
        .first();
    }

    if (!targetUser) throw new Error("User not found");

    const isSelf =
      args.clerkId === callerSubject ||
      (caller && (args.clerkId === String(caller._id) || args.clerkId === caller.clerkId || targetUser._id === caller._id));

    if (!isSelf) {
      throw new Error("Unauthorized: Cannot modify biometric settings for another user.");
    }

    await ctx.db.patch(targetUser._id, { biometricEnabled: args.enabled });
  },
});

/** Mark screening complete helper */
export const markScreeningComplete = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Login required.");
    }
    const caller = await getAuthenticatedUser(ctx);
    const callerSubject = identity.subject;

    let targetUser = null;
    try {
      targetUser = await ctx.db.get(args.clerkId as Id<"users">);
    } catch (e) { }

    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
        .first();
    }

    if (!targetUser) throw new Error("User not found");

    const isSelf =
      args.clerkId === callerSubject ||
      (caller && (args.clerkId === String(caller._id) || args.clerkId === caller.clerkId || targetUser._id === caller._id));

    if (!isSelf) {
      throw new Error("Unauthorized: Cannot update screening completion for another student.");
    }

    await ctx.db.patch(targetUser._id, { screeningComplete: true });
  },
});

async function doSeedAdmin(ctx: any) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_mobile_number", (q: any) => q.eq("mobile_number", "1234567890"))
    .first();

  if (existing) {
    return { userId: existing._id, message: "Admin already seeded" };
  }

  const password_hash = await hashPassword("adminpassword");
  const userId = await ctx.db.insert("users", {
    clerkId: "seed-admin",
    full_name: "Admin User",
    mobile_number: "1234567890",
    password_hash,
    role: "admin",
    status: "active",
    is_first_login: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    onboardingComplete: true,
    screeningComplete: true,
    biometricEnabled: false,
  });

  return { userId, message: "Admin seeded successfully." };
}

/** Seed a default admin user (Admin only) */
export const seedAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await doSeedAdmin(ctx);
  },
});

/** Internal admin seeding for backend setup / deploy scripts */
export const seedAdminInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await doSeedAdmin(ctx);
  },
});

/** Reset admin credentials from CLI */
export const resetAdminCredentials = mutation({
  args: {
    currentMobile: v.string(),
    newMobile: v.optional(v.string()),
    newPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only an authenticated admin can reset administrator credentials
    await requireAdmin(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", args.currentMobile))
      .first();

    if (!user) {
      throw new Error("Admin user not found.");
    }
    if (user.role !== "admin") {
      throw new Error("Specified user is not an admin.");
    }

    const updates: any = { updated_at: Date.now() };
    if (args.newMobile) {
      // Check if new mobile is already taken
      const existing = await ctx.db
        .query("users")
        .withIndex("by_mobile_number", (q) => q.eq("mobile_number", args.newMobile!))
        .first();
      if (existing && existing._id !== user._id) {
        throw new Error("The new mobile number is already in use.");
      }
      updates.mobile_number = args.newMobile;
    }
    if (args.newPassword) {
      updates.password_hash = await hashPassword(args.newPassword);
    }

    await ctx.db.patch(user._id, updates);
    return {
      success: true,
      message: "Admin credentials updated successfully.",
    };
  },
});

/** Update last login timestamp for the authenticated user */
export const updateLastLogin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    await ctx.db.patch(identity.subject as Id<"users">, {
      lastLoginAt: Date.now(),
    });
  },
});

/** Public Student Self-Registration */
export const registerStudent = mutation({
  args: {
    full_name: v.string(),
    mobile_number: v.string(),
    password: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fullName = args.full_name.trim();
    if (!fullName || fullName.length < 2) {
      return { error: "Please enter your full name (at least 2 characters)." };
    }

    const cleanMobile = args.mobile_number.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      return { error: "Please enter a valid 10-digit mobile number." };
    }

    if (!args.password || args.password.length < 6) {
      return { error: "Password must be at least 6 characters long." };
    }

    // Check duplicate identifier
    const existing = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", cleanMobile))
      .first();

    if (existing) {
      return { error: "This mobile number is already registered. Please sign in." };
    }

    // Hash password with bcryptjs
    const password_hash = await hashPassword(args.password);

    // Atomically allocate sequential patientId using dedicated counter table
    const nextPatientId = await allocateNextPatientId(ctx);

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      patientId: nextPatientId,
      full_name: fullName,
      alias: fullName,
      mobile_number: cleanMobile,
      email: args.email?.trim() || undefined,
      password_hash,
      role: "patient",
      status: "active",
      is_first_login: false,
      onboardingComplete: false,
      screeningComplete: false,
      biometricEnabled: false,
      created_at: now,
      updated_at: now,
    });

    await logAuditEvent(ctx, userId, "student_registered", `Student self-registered with patientId ${nextPatientId}`);

    // Generate JWT and session immediately
    const token = await signJwt({
      sub: userId,
      role: "patient",
      mobile_number: cleanMobile,
      full_name: fullName,
    });

    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("sessions", {
      userId,
      token,
      createdAt: now,
      expiresAt,
    });

    return {
      token,
      user: {
        id: userId,
        full_name: fullName,
        mobile_number: cleanMobile,
        role: "patient",
        status: "active",
        onboardingComplete: false,
        screeningComplete: false,
        is_first_login: false,
      },
    };
  },
});

/** Standard Authentication: Login */
export const login = mutation({
  args: { mobile_number: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const cleanMobile = args.mobile_number.replace(/\D/g, "");
    const user = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", cleanMobile || args.mobile_number))
      .first();

    if (!user) {
      await logAuditEvent(ctx, undefined, "failed_login", "Login attempt with non-existent mobile number");
      return { error: "Invalid mobile number or password" };
    }

    if (user.status === "inactive") {
      await logAuditEvent(ctx, user._id, "failed_login", "Login attempt for inactive user");
      return { error: "Account is inactive. Please contact administrator." };
    }

    const now = Date.now();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      const minutesLeft = Math.ceil((user.lockoutUntil - now) / 60000);
      await logAuditEvent(ctx, user._id, "login_blocked", `Blocked login attempt. Account locked for ${minutesLeft} more minutes.`);
      return { error: `Account is locked due to multiple failed login attempts. Try again in ${minutesLeft} minute(s).` };
    }

    const isValid = await verifyPassword(args.password, user.password_hash || "");
    if (!isValid) {
      const currentAttempts = (user.failedLoginAttempts || 0) + 1;
      const updates: any = { failedLoginAttempts: currentAttempts };

      let errorMsg = "Invalid mobile number or password";
      if (currentAttempts >= 5) {
        updates.lockoutUntil = now + 15 * 60000; // 15 minutes lockout
        errorMsg = "Account has been locked for 15 minutes due to 5 consecutive failed login attempts.";
        await logAuditEvent(ctx, user._id, "account_locked", "Account locked due to 5 consecutive failed logins");
      } else {
        await logAuditEvent(ctx, user._id, "failed_login", `Incorrect password. Attempt ${currentAttempts}/5.`);
      }

      await ctx.db.patch(user._id, updates);
      return { error: errorMsg };
    }

    // Reset attempts and lockout on success
    await ctx.db.patch(user._id, {
      failedLoginAttempts: 0,
      lockoutUntil: undefined,
    });

    await logAuditEvent(ctx, user._id, "login", "Successful user login");

    // Generate JWT
    const token = await signJwt({
      sub: user._id,
      role: user.role || "patient",
      mobile_number: user.mobile_number || "",
      full_name: user.full_name || "",
    });

    // Delete existing sessions to enforce single session per user
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of existingSessions) {
      await ctx.db.delete(session._id);
    }

    // Create session (expires in 30 days)
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      createdAt: Date.now(),
      expiresAt,
    });

    // Generate a cryptographically secure biometricToken for this user
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const biometricToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.patch(user._id, {
      biometricToken,
      biometricEnabled: true
    });

    return {
      token,
      biometricToken,
      user: {
        id: user._id,
        full_name: user.full_name,
        mobile_number: user.mobile_number,
        role: user.role,
        status: user.status,
        onboardingComplete: user.onboardingComplete || false,
        screeningComplete: user.screeningComplete || false,
        is_first_login: user.is_first_login || false,
      },
    };
  },
});

/** Standard Authentication: Logout */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (session) {
      await logAuditEvent(ctx, session.userId, "logout", "User logged out");
      await ctx.db.delete(session._id);
    }
    return { success: true };
  },
});

/** Standard Authentication: Validate Session */
export const validateSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      await ctx.db.delete(session._id);
      return null;
    }

    const user = await ctx.db.get(session.userId);
    if (!user || user.status === "inactive") {
      await ctx.db.delete(session._id);
      return null;
    }

    return {
      id: user._id,
      full_name: user.full_name,
      mobile_number: user.mobile_number,
      role: user.role,
      status: user.status,
      onboardingComplete: user.onboardingComplete || false,
      screeningComplete: user.screeningComplete || false,
      is_first_login: user.is_first_login || false,
    };
  },
});

/** Standard Authentication: Check Session Active (Reactive Query) */
export const checkSessionActive = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      return false;
    }

    const user = await ctx.db.get(session.userId);
    if (!user || user.status === "inactive") {
      return false;
    }

    return true;
  },
});

/** Standard Authentication: Change Password for First-time Users */
export const changePassword = mutation({
  args: { newPassword: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const userId = identity.subject as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const password_hash = await hashPassword(args.newPassword);
    await ctx.db.patch(userId, {
      password_hash,
      is_first_login: false,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

/** Standard Authentication: Biometric Login */
export const biometricLogin = mutation({
  args: { biometricToken: v.string() },
  handler: async (ctx, args) => {
    // Find user with this biometric token
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("biometricToken"), args.biometricToken))
      .first();

    if (!user) {
      return { error: "Invalid biometric credentials" };
    }

    if (user.status === "inactive") {
      return { error: "Account is inactive. Please contact administrator." };
    }

    // Generate a new 30-day JWT
    const token = await signJwt({
      sub: user._id,
      role: user.role || "patient",
      mobile_number: user.mobile_number || "",
      full_name: user.full_name || "",
    });

    // Delete existing sessions to enforce single session per user
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of existingSessions) {
      await ctx.db.delete(session._id);
    }

    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      createdAt: Date.now(),
      expiresAt,
    });

    return {
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        mobile_number: user.mobile_number,
        role: user.role,
        status: user.status,
        onboardingComplete: user.onboardingComplete || false,
        screeningComplete: user.screeningComplete || false,
        is_first_login: user.is_first_login || false,
      },
    };
  },
});

/** Daily cron helper to delete expired sessions */
export const clearExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db.query("sessions").collect();

    let count = 0;
    for (const session of expired) {
      if (session.expiresAt < now) {
        await ctx.db.delete(session._id);
        count++;
      }
    }
    console.log(`Deleted ${count} expired sessions.`);
    return { count };
  },
});

/** Admin: Delete a user and all their associated records */
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) throw new Error("Unauthorized");

    // Don't allow an admin to delete themselves
    if (args.userId === admin._id) {
      throw new Error("You cannot delete your own admin account.");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Create soft-delete entry in trash table
    await ctx.db.insert("trash", {
      itemType: "patient",
      itemId: user.patientId || String(args.userId),
      deletedData: JSON.stringify({ user }),
      deletedBy: admin.full_name || admin.email || "Admin",
      deletedAt: Date.now(),
    });

    // List of tables referencing user data:
    // 1. sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of sessions) {
      await ctx.db.delete(doc._id);
    }

    // 2. screenings
    const screenings = await ctx.db
      .query("screenings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of screenings) {
      await ctx.db.delete(doc._id);
    }

    // 3. triages
    const triages = await ctx.db
      .query("triages")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of triages) {
      await ctx.db.delete(doc._id);
    }

    // 4. alerts
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of alerts) {
      await ctx.db.delete(doc._id);
    }

    // 5. emotionLogs
    const emotionLogs = await ctx.db
      .query("emotionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of emotionLogs) {
      await ctx.db.delete(doc._id);
    }

    // 6. jpmrLogs
    const jpmrLogs = await ctx.db
      .query("jpmrLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of jpmrLogs) {
      await ctx.db.delete(doc._id);
    }

    // 7. microGoals
    const microGoals = await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of microGoals) {
      await ctx.db.delete(doc._id);
    }

    // 8. reframes
    const reframes = await ctx.db
      .query("reframes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of reframes) {
      await ctx.db.delete(doc._id);
    }

    // 9. followUps
    const followUps = await ctx.db
      .query("followUps")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of followUps) {
      await ctx.db.delete(doc._id);
    }

    // 10. wellnessProfiles
    const wellnessProfiles = await ctx.db
      .query("wellnessProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of wellnessProfiles) {
      await ctx.db.delete(doc._id);
    }

    // 11. screeningAttempts
    const attempts = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of attempts) {
      await ctx.db.delete(doc._id);
    }

    // 12. cbtSessions
    const cbtSessions = await ctx.db
      .query("cbtSessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of cbtSessions) {
      await ctx.db.delete(doc._id);
    }

    // 13. appointments
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of appointments) {
      await ctx.db.delete(doc._id);
    }

    // 14. counsellorRequests
    const counsellorRequests = await ctx.db
      .query("counsellorRequests")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.userId))
      .collect();
    for (const doc of counsellorRequests) {
      await ctx.db.delete(doc._id);
    }

    // 15. reframeLogs
    const reframeLogs = await ctx.db
      .query("reframeLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of reframeLogs) {
      await ctx.db.delete(doc._id);
    }

    // 16. companionMessages
    const companionMessages = await ctx.db
      .query("companionMessages")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of companionMessages) {
      await ctx.db.delete(doc._id);
    }

    // 17. aiCompanionLogs
    const aiCompanionLogs = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of aiCompanionLogs) {
      await ctx.db.delete(doc._id);
    }

    // 18. points
    const points = await ctx.db
      .query("points")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of points) {
      await ctx.db.delete(doc._id);
    }

    // 19. badges
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of badges) {
      await ctx.db.delete(doc._id);
    }

    // 20. streaks
    const streaks = await ctx.db
      .query("streaks")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of streaks) {
      await ctx.db.delete(doc._id);
    }

    // 21. emotionMaps
    const emotionMaps = await ctx.db
      .query("emotionMaps")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of emotionMaps) {
      await ctx.db.delete(doc._id);
    }

    // 22. dailyCheckins
    const dailyCheckins = await ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId_and_dateStr", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of dailyCheckins) {
      await ctx.db.delete(doc._id);
    }

    // 23. weeklyMissions
    const weeklyMissions = await ctx.db
      .query("weeklyMissions")
      .withIndex("by_userId_and_weekStart", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of weeklyMissions) {
      await ctx.db.delete(doc._id);
    }

    // 24. monthlyChallenges
    const monthlyChallenges = await ctx.db
      .query("monthlyChallenges")
      .withIndex("by_userId_and_monthStr", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of monthlyChallenges) {
      await ctx.db.delete(doc._id);
    }

    // 25. clinicalTimelines
    const clinicalTimelines = await ctx.db
      .query("clinicalTimelines")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of clinicalTimelines) {
      await ctx.db.delete(doc._id);
    }

    // 26. aiMonitoringLogs
    const aiMonitoringLogs = await ctx.db
      .query("aiMonitoringLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of aiMonitoringLogs) {
      await ctx.db.delete(doc._id);
    }

    // 27. notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", args.userId))
      .collect();
    for (const doc of notifications) {
      await ctx.db.delete(doc._id);
    }

    // 28. loginHistory
    const loginHistory = await ctx.db
      .query("loginHistory")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const doc of loginHistory) {
      await ctx.db.delete(doc._id);
    }

    // 29. breathingLogs
    const breathingLogs1 = await ctx.db
      .query("breathingLogs")
      .withIndex("by_userId", (q) => q.eq("userId", String(args.userId)))
      .collect();
    for (const doc of breathingLogs1) {
      await ctx.db.delete(doc._id);
    }
    if (user.clerkId && user.clerkId !== String(args.userId)) {
      const breathingLogs2 = await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", user.clerkId!))
        .collect();
      for (const doc of breathingLogs2) {
        await ctx.db.delete(doc._id);
      }
    }

    // 30. groundingLogs
    const groundingLogs1 = await ctx.db
      .query("groundingLogs")
      .withIndex("by_userId", (q) => q.eq("userId", String(args.userId)))
      .collect();
    for (const doc of groundingLogs1) {
      await ctx.db.delete(doc._id);
    }
    if (user.clerkId && user.clerkId !== String(args.userId)) {
      const groundingLogs2 = await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId", (q) => q.eq("userId", user.clerkId!))
        .collect();
      for (const doc of groundingLogs2) {
        await ctx.db.delete(doc._id);
      }
    }

    // 31. counsellors
    const allCounsellors = await ctx.db.query("counsellors").collect();
    for (const doc of allCounsellors) {
      if (
        (doc.userId && doc.userId === args.userId) ||
        (user.email && doc.email && doc.email.toLowerCase() === user.email.toLowerCase())
      ) {
        await ctx.db.delete(doc._id);
      }
    }

    // 32. Finally delete the user
    await ctx.db.delete(args.userId);

    return { success: true };
  },
});

// ==========================================
// MITRA PREFERENCES (Priority 6)
// ==========================================

/** Get persistent Mitra preferences for student (with safe female + Mitra defaults) */
export const getMitraPreferences = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        name: "Emoty",
        avatarGender: "female",
        avatarVariant: "default",
      };
    }
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    let user = null;
    try {
      user = await ctx.db.get(targetUserId as Id<"users">);
    } catch (e) {}
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }

    const prefs = user?.mitraPreferences;
    const name = prefs?.name && prefs.name.trim().length > 0 ? prefs.name.trim() : "Emoty";
    const avatarGender =
      prefs?.avatarGender === "male" || prefs?.avatarGender === "female"
        ? prefs.avatarGender
        : "female";

    return {
      name,
      avatarGender,
      avatarVariant: prefs?.avatarVariant || "default",
      updatedAt: prefs?.updatedAt,
    };
  },
});

/** Update persistent Mitra preferences for student */
export const updateMitraPreferences = mutation({
  args: {
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarGender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    let user = null;
    try {
      user = await ctx.db.get(targetUserId as Id<"users">);
    } catch (e) {}
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    if (!user) throw new Error("User not found");

    // Validate avatarGender: must be "female" or "male"
    let validatedGender = user.mitraPreferences?.avatarGender || "female";
    if (args.avatarGender !== undefined) {
      const g = args.avatarGender.toLowerCase().trim();
      if (g === "female" || g === "male") {
        validatedGender = g;
      } else {
        validatedGender = "female";
      }
    }

    // Validate and sanitize custom name (strip control characters, trim, max length 30)
    let validatedName = user.mitraPreferences?.name || "Emoty";
    if (args.name !== undefined) {
      let clean = args.name.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 30) clean = clean.substring(0, 30).trim();
      validatedName = clean.length > 0 ? clean : "Emoty";
    }

    const updatedPrefs = {
      name: validatedName,
      avatarGender: validatedGender,
      avatarVariant: "default",
      updatedAt: Date.now(),
    };

    await ctx.db.patch(user._id, {
      mitraPreferences: updatedPrefs,
    });

    return updatedPrefs;
  },
});

/** Student: Update allowed profile information (alias, age, campus, department, year, demographic gender, emergency contacts) */
export const updateStudentProfile = mutation({
  args: {
    userId: v.optional(v.string()),
    alias: v.optional(v.string()),
    age: v.optional(v.number()),
    campus: v.optional(v.string()),
    department: v.optional(v.string()),
    year: v.optional(v.string()),
    gender: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    let user = null;
    try {
      user = await ctx.db.get(targetUserId as Id<"users">);
    } catch (e) {}
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", targetUserId))
        .first();
    }
    if (!user) throw new Error("User not found");

    const patch: Record<string, any> = {
      updated_at: Date.now(),
    };

    if (args.alias !== undefined) {
      let clean = args.alias.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 50) clean = clean.substring(0, 50).trim();
      if (clean.length === 0) throw new Error("Name cannot be empty");
      patch.alias = clean;
    }

    if (args.age !== undefined) {
      if (args.age < 10 || args.age > 120 || !Number.isInteger(args.age)) {
        throw new Error("Age must be an integer between 10 and 120");
      }
      patch.age = args.age;
    }

    if (args.campus !== undefined) {
      let clean = args.campus.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 100) clean = clean.substring(0, 100).trim();
      patch.campus = clean;
    }

    if (args.department !== undefined) {
      let clean = args.department.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 100) clean = clean.substring(0, 100).trim();
      patch.department = clean;
    }

    if (args.year !== undefined) {
      let clean = args.year.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 30) clean = clean.substring(0, 30).trim();
      patch.year = clean;
    }

    if (args.gender !== undefined) {
      let clean = args.gender.replace(/[\x00-\x1F\x7F]/g, "").trim().toLowerCase();
      const validGenders = ["female", "male", "non-binary", "other", "prefer-not-to-say"];
      if (clean && !validGenders.includes(clean)) {
        throw new Error("Invalid demographic gender option");
      }
      patch.gender = clean;
    }

    if (args.emergencyContactName !== undefined) {
      let clean = args.emergencyContactName.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 100) clean = clean.substring(0, 100).trim();
      patch.emergencyContactName = clean;
    }

    if (args.emergencyContactPhone !== undefined) {
      let clean = args.emergencyContactPhone.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (clean.length > 25) clean = clean.substring(0, 25).trim();
      patch.emergencyContactPhone = clean;
    }

    await ctx.db.patch(user._id, patch);

    const changedKeys = Object.keys(patch).filter((k) => k !== "updated_at");
    await logAuditEvent(
      ctx,
      identity.subject,
      "STUDENT_PROFILE_UPDATE",
      JSON.stringify({
        targetUserId: user._id,
        updatedFields: changedKeys,
      })
    );

    return {
      success: true,
      updatedFields: changedKeys,
    };
  },
});


