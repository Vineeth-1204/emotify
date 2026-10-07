import { mutation } from "./functions";
import { v } from "convex/values";
import { hashPassword, generateTemporaryPassword } from "./authHelpers";
import { requireAdmin } from "./authz";
import { allocateNextPatientId } from "./users";
import { logAuditEvent } from "./audit";

/**
 * Admin: Enroll a new student from the dashboard.
 * The temporary password is returned exactly once and is never persisted in plain text.
 */
export const createPatient = mutation({
  args: {
    fullName: v.string(),
    dob: v.optional(v.string()),
    age: v.number(),
    gender: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    initialRiskLevel: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const fullName = args.fullName.trim();
    if (fullName.length < 2) {
      throw new Error("Full name must be at least 2 characters.");
    }

    const cleanMobile = args.phone ? args.phone.replace(/\D/g, "") : "";
    if (cleanMobile) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_mobile_number", (q) => q.eq("mobile_number", cleanMobile))
        .first();
      if (existing) {
        throw new Error("Mobile number is already registered.");
      }
    }

    const tempPassword = generateTemporaryPassword();
    const password_hash = await hashPassword(tempPassword);
    const patientId = await allocateNextPatientId(ctx);
    const now = Date.now();

    const id = await ctx.db.insert("users", {
      patientId,
      full_name: fullName,
      email: args.email?.trim() || undefined,
      mobile_number: cleanMobile || undefined,
      age: args.age > 0 ? args.age : undefined,
      gender: args.gender || undefined,
      password_hash,
      role: "patient",
      status: "active",
      is_first_login: true,
      created_at: now,
      updated_at: now,
      onboardingComplete: false,
      screeningComplete: false,
      biometricEnabled: false,
    });

    await logAuditEvent(ctx, String(admin._id), "patient_enrolled", `Enrolled patient ${patientId}`);

    return { id, patientId, tempPassword };
  },
});
