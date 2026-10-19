import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireAdmin } from "./authz";
import { logAuditEvent } from "./audit";

/**
 * Staff directory (`counsellors` table): the institution's contact details for a counsellor,
 * kept separate from the counsellor's login account (users), and linked to it by `userId`.
 *
 * Student visibility policy:
 *  - The institutional email and phone are each shown to students only when an admin has
 *    approved that field (`shareEmailWithStudents` / `sharePhoneWithStudents` === true).
 *    A missing value is "not approved".
 *  - Changing a stored value, or changing which account the entry is linked to, clears that
 *    approval: an approval covers one specific value for one specific person.
 *  - The account's login mobile number and account email are never shown to students.
 * Every write here is admin-only and audited.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 \-()]{5,19}$/;

async function requireEntry(ctx: MutationCtx, id: Id<"counsellors">) {
  const entry = await ctx.db.get(id);
  if (!entry) throw new Error("Directory entry not found.");
  return entry;
}

/**
 * Validates linking `userId` to directory entry `entryId`: the account must be a counsellor
 * account and must not already be linked to a different entry (one entry per counsellor).
 */
async function assertLinkable(ctx: MutationCtx, userId: Id<"users">, entryId: Id<"counsellors"> | null) {
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "counsellor") throw new Error("Counsellor account not found.");
  const existing = await ctx.db
    .query("counsellors")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (existing.some((e) => e._id !== entryId)) {
    throw new Error("This counsellor account is already linked to another directory entry.");
  }
  return user;
}

export function normaliseEmail(email: string) {
  const value = email.trim();
  if (value && !EMAIL_RE.test(value)) throw new Error("Enter a valid institutional email address.");
  return value;
}

export function normalisePhone(phone: string) {
  const value = phone.trim();
  if (value && !PHONE_RE.test(value)) throw new Error("Enter a valid institutional phone number.");
  return value;
}

/** The student-visible contact fields of a directory entry under the approval policy. */
export function approvedContacts(entry: Pick<Doc<"counsellors">, "email" | "phone" | "shareEmailWithStudents" | "sharePhoneWithStudents"> | null) {
  return {
    email: entry && entry.shareEmailWithStudents === true && entry.email.trim() ? entry.email.trim() : null,
    phone: entry && entry.sharePhoneWithStudents === true && entry.phone.trim() ? entry.phone.trim() : null,
  };
}

/**
 * The active directory entry for a counsellor account, or null. If legacy data links more
 * than one entry to the account, none is used (no guessing which contact details apply).
 */
export async function directoryEntryForCounsellor(ctx: QueryCtx | MutationCtx, counsellorId: Id<"users">) {
  const linked = await ctx.db
    .query("counsellors")
    .withIndex("by_userId", (q) => q.eq("userId", counsellorId))
    .collect();
  const active = linked.filter((e) => e.status === "active");
  return active.length === 1 && linked.length === 1 ? active[0] : null;
}

/** Admin: every directory entry with its linked account and what students can see. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query("counsellors").order("desc").collect();
    const linkCounts = new Map<string, number>();
    for (const e of entries) if (e.userId) linkCounts.set(String(e.userId), (linkCounts.get(String(e.userId)) ?? 0) + 1);

    const rows = [];
    for (const e of entries) {
      const account = e.userId ? await ctx.db.get(e.userId) : null;
      const caseload = e.userId
        ? (await ctx.db
            .query("counsellorAssignments")
            .withIndex("by_counsellor_and_active", (q) => q.eq("counsellorId", e.userId!).eq("active", true))
            .collect()).length
        : 0;
      rows.push({
        _id: e._id,
        name: e.name,
        role: e.role,
        status: e.status,
        email: e.email,
        phone: e.phone,
        shareEmailWithStudents: e.shareEmailWithStudents === true,
        sharePhoneWithStudents: e.sharePhoneWithStudents === true,
        studentVisible: approvedContacts(e),
        contactApprovalUpdatedAt: e.contactApprovalUpdatedAt ?? null,
        linkedAccount: account
          ? {
              _id: account._id,
              full_name: account.full_name || "Counsellor",
              status: account.status === "inactive" ? "inactive" : "active",
              isCounsellor: account.role === "counsellor",
              caseloadSize: caseload,
            }
          : null,
        duplicateLink: e.userId ? (linkCounts.get(String(e.userId)) ?? 0) > 1 : false,
      });
    }
    return rows;
  },
});

/** Admin: link a directory entry to a counsellor account. Relinking requires unlinking first. */
export const linkAccount = mutation({
  args: { entryId: v.id("counsellors"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const entry = await requireEntry(ctx, args.entryId);
    if (entry.userId === args.userId) return { success: true, unchanged: true };
    if (entry.userId) throw new Error("This entry is already linked to another account. Unlink it first.");
    await assertLinkable(ctx, args.userId, entry._id);
    await ctx.db.patch(entry._id, {
      userId: args.userId,
      // A new person: approvals given for whoever was linked before do not carry over.
      shareEmailWithStudents: false,
      sharePhoneWithStudents: false,
      contactApprovalUpdatedAt: Date.now(),
      contactApprovalUpdatedBy: admin._id,
    });
    await logAuditEvent(ctx, String(admin._id), "counsellor_directory_linked", JSON.stringify({ entryId: entry._id, userId: args.userId }));
    return { success: true, unchanged: false };
  },
});

/** Admin: remove the link between a directory entry and its account (also clears approvals). */
export const unlinkAccount = mutation({
  args: { entryId: v.id("counsellors") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const entry = await requireEntry(ctx, args.entryId);
    if (!entry.userId) return { success: true, unchanged: true };
    await ctx.db.patch(entry._id, {
      userId: undefined,
      shareEmailWithStudents: false,
      sharePhoneWithStudents: false,
      contactApprovalUpdatedAt: Date.now(),
      contactApprovalUpdatedBy: admin._id,
    });
    await logAuditEvent(ctx, String(admin._id), "counsellor_directory_unlinked", JSON.stringify({ entryId: entry._id, previousUserId: entry.userId }));
    return { success: true, unchanged: false };
  },
});

/** Admin: update the stored institutional email/phone. A changed value loses its approval. */
export const updateContact = mutation({
  args: { entryId: v.id("counsellors"), email: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const entry = await requireEntry(ctx, args.entryId);
    const email = normaliseEmail(args.email);
    const phone = normalisePhone(args.phone);
    const emailChanged = email !== entry.email;
    const phoneChanged = phone !== entry.phone;
    if (!emailChanged && !phoneChanged) return { success: true, unchanged: true };
    await ctx.db.patch(entry._id, {
      email,
      phone,
      ...(emailChanged ? { shareEmailWithStudents: false } : {}),
      ...(phoneChanged ? { sharePhoneWithStudents: false } : {}),
      contactApprovalUpdatedAt: Date.now(),
      contactApprovalUpdatedBy: admin._id,
    });
    await logAuditEvent(ctx, String(admin._id), "counsellor_directory_contact_updated", JSON.stringify({ entryId: entry._id, emailChanged, phoneChanged }));
    return { success: true, unchanged: false, approvalsCleared: { email: emailChanged && entry.shareEmailWithStudents === true, phone: phoneChanged && entry.sharePhoneWithStudents === true } };
  },
});

/** Admin: approve or revoke student visibility of one contact field. */
export const setContactVisibility = mutation({
  args: { entryId: v.id("counsellors"), field: v.union(v.literal("email"), v.literal("phone")), visible: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const entry = await requireEntry(ctx, args.entryId);
    if (args.visible) {
      if (!entry.userId) throw new Error("Link this entry to a counsellor account before sharing contact details.");
      const value = args.field === "email" ? entry.email : entry.phone;
      if (!value.trim()) throw new Error(`Add an institutional ${args.field === "email" ? "email address" : "phone number"} first.`);
    }
    await ctx.db.patch(entry._id, {
      ...(args.field === "email" ? { shareEmailWithStudents: args.visible } : { sharePhoneWithStudents: args.visible }),
      contactApprovalUpdatedAt: Date.now(),
      contactApprovalUpdatedBy: admin._id,
    });
    await logAuditEvent(
      ctx,
      String(admin._id),
      args.visible ? "counsellor_contact_approved" : "counsellor_contact_revoked",
      JSON.stringify({ entryId: entry._id, field: args.field })
    );
    return { success: true };
  },
});

/** Shared by dashboard.addCounsellor: validates an optional account link for a new entry. */
export async function validateNewEntryLink(ctx: MutationCtx, userId: Id<"users"> | undefined) {
  if (userId) await assertLinkable(ctx, userId, null);
}
