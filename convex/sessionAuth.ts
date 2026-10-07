import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Server-side session validation for Emotify's custom JWTs.
 *
 * A JWT is only honoured while the session it was issued for (`sid` claim) still
 * exists, belongs to the token subject, has not expired, and the user is active.
 * Logging out, being deactivated, being deleted, or signing in elsewhere (which
 * replaces the session) therefore revokes the token immediately.
 */
export async function validateSessionIdentity(
  db: any,
  identity: { subject?: string; [key: string]: unknown } | null
): Promise<Doc<"users"> | null> {
  if (!identity || typeof identity.subject !== "string") return null;

  const userId = db.normalizeId("users", identity.subject);
  if (!userId) return null;

  const rawSid = identity.sid;
  const sessionId = typeof rawSid === "string" ? db.normalizeId("sessions", rawSid) : null;
  if (!sessionId) return null;

  const session = await db.get(sessionId);
  if (!session || session.userId !== userId || session.expiresAt <= Date.now()) return null;

  const user = await db.get(userId);
  if (!user || user.status === "inactive") return null;

  return user;
}

/** Internal: lets actions (which have no DB access) check the caller's session. */
export const isCallerSessionValid = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const user = await validateSessionIdentity(ctx.db, identity);
    return user !== null;
  },
});
