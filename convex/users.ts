import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { signJwt, verifyPassword, hashPassword } from "./authHelpers";
import { logAuditEvent } from "./audit";

function sanitizeUser(u: any) {
  if (!u) return null;
  const { password_hash, biometricToken, temp_password, ...safeUser } = u;
  return safeUser;
}

/** Get user by ID (for compatibility with getByClerkId) */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
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
  const user = await ctx.db.get(identity.subject as Id<"users">);
  if (!user || user.role !== "admin") return null;
  return user;
}

/** Admin: List all patient users */
export const listPatients = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await checkAdmin(ctx);
    if (!admin) return [];

    let users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .collect();

    // Sort chronologically to determine sequential patient IDs if not yet set
    users.sort((a, b) => (a._creationTime || a.created_at || 0) - (b._creationTime || b.created_at || 0));

    // Assign permanent/stable patientId first, stripping password hashes and auth secrets
    let mapped = users.map((u, idx) => {
      const safe = sanitizeUser(u);
      return {
        ...safe,
        patientId: u.patientId || String(101 + idx),
      };
    });

    if (args.search) {
      const s = args.search.toLowerCase();
      mapped = mapped.filter(
        (u: any) =>
          (u.patientId || "").toLowerCase().includes(s) ||
          (u.full_name || "").toLowerCase().includes(s) ||
          (u.mobile_number || "").includes(s)
      );
    }

    return mapped;
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

    // Calculate next sequential patientId based on all existing patients
    const allUsers = await ctx.db.query("users").collect();
    let maxId = 100;
    for (const u of allUsers) {
      if (u.patientId && !isNaN(Number(u.patientId))) {
        maxId = Math.max(maxId, Number(u.patientId));
      }
    }
    const nextPatientId = String(maxId + 1);

    const userId = await ctx.db.insert("users", {
      patientId: args.role === "patient" ? nextPatientId : undefined,
      full_name: args.full_name,
      mobile_number: args.mobile_number,
      email: args.email,
      password_hash,
      temp_password: args.password,
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
  },
  handler: async (ctx, args) => {
    let user = null;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      try {
        user = await ctx.db.get(identity.subject as Id<"users">);
      } catch (e) {}
      if (!user) {
        user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
          .first();
      }
    }
    if (!user && args.userId) {
      try {
        user = await ctx.db.get(args.userId as Id<"users">);
      } catch (e) {}
      if (!user) {
        user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
          .first();
      }
    }
    if (!user) throw new Error("Unauthenticated");

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
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

/** Get user by ID (sanitized) */
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
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
    try {
      const user = await ctx.db.get(args.clerkId as Id<"users">);
      if (user) {
        await ctx.db.patch(user._id, { biometricEnabled: args.enabled });
        return;
      }
    } catch (e) { }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (user) {
      await ctx.db.patch(user._id, { biometricEnabled: args.enabled });
    }
  },
});

/** Mark screening complete helper */
export const markScreeningComplete = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.db.get(args.clerkId as Id<"users">);
      if (user) {
        await ctx.db.patch(user._id, { screeningComplete: true });
        return;
      }
    } catch (e) { }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (user) {
      await ctx.db.patch(user._id, { screeningComplete: true });
    }
  },
});

/** Seed a default admin user for testing */
export const seedAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", "1234567890"))
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

    return { userId, message: "Admin seeded successfully. Mobile: 1234567890, Password: adminpassword" };
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_mobile_number", (q) => q.eq("mobile_number", args.currentMobile))
      .first();

    if (!user) {
      throw new Error("Admin user not found with the specified mobile number.");
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
      message: `Admin credentials updated successfully. Mobile: ${args.newMobile || args.currentMobile}`,
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

    // Calculate sequential patientId based on all existing patients
    const allUsers = await ctx.db.query("users").collect();
    let maxId = 100;
    for (const u of allUsers) {
      if (u.patientId && !isNaN(Number(u.patientId))) {
        maxId = Math.max(maxId, Number(u.patientId));
      }
    }
    const nextPatientId = String(maxId + 1);

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

    // Generate a unique biometricToken for this user
    const biometricToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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

    // 11. Finally delete the user
    await ctx.db.delete(args.userId);

    return { success: true };
  },
});

