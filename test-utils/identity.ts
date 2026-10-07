/**
 * Test identity helpers.
 *
 * Production tokens always carry the canonical `users._id` as subject plus a live
 * session id (`sid`). Many fixtures were written with readable placeholder subjects
 * ("student_1"); these helpers model such a placeholder as a real user whose legacy
 * `clerkId` is that string, so tests exercise the same validation path as production.
 */

/** Resolves (creating if needed) the canonical users._id for a fixture subject. */
export async function resolveFixtureUserId(ctx: any, subject: string): Promise<any> {
  const direct = ctx.db.normalizeId("users", subject);
  if (direct) return direct;
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q: any) => q.eq("clerkId", subject))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("users", {
    clerkId: subject,
    role: "patient",
    status: "active",
    created_at: Date.now(),
  });
}

/** Returns a live session id for the user, creating one if needed. */
export async function ensureLiveSession(ctx: any, userId: any): Promise<any> {
  const now = Date.now();
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();
  const live = sessions.find((s: any) => s.expiresAt > now);
  if (live) return live._id;
  return await ctx.db.insert("sessions", {
    userId,
    token: "test-session",
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  });
}

/** Canonical user id (as a string) that a fixture subject authenticates as. */
export async function testUserId(
  tester: {
    run: (fn: (ctx: any) => Promise<any>) => Promise<any>;
    __resolveIdentity?: () => Promise<any>;
    __identitySubject?: string;
  },
  subject: string
): Promise<string> {
  if (tester.__resolveIdentity && tester.__identitySubject === subject) {
    // Scoped identity from the vitest harness: resolve (and cache) its session now.
    const resolved = await tester.__resolveIdentity();
    if (resolved?.subject) return String(resolved.subject);
  }
  return String(
    await tester.run(async (ctx) => {
      const userId = await resolveFixtureUserId(ctx, subject);
      await ensureLiveSession(ctx, userId);
      return userId;
    })
  );
}

/**
 * Fixture helper: put every patient on every counsellor's caseload (models the
 * pre-caseload "shared team" fixtures). Tests about caseload scoping must assign explicitly.
 */
export async function assignAllPatientsToCounsellors(tester: { run: (fn: (ctx: any) => Promise<any>) => Promise<any> }) {
  await tester.run(async (ctx) => {
    const counsellors = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "counsellor")).collect();
    const patients = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "patient")).collect();
    const admin = (await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "admin")).first()) ?? counsellors[0];
    for (const c of counsellors) {
      for (const p of patients) {
        const existing = await ctx.db
          .query("counsellorAssignments")
          .withIndex("by_student_and_active", (q: any) => q.eq("studentId", p._id).eq("active", true))
          .collect();
        if (existing.some((a: any) => a.counsellorId === c._id)) continue;
        await ctx.db.insert("counsellorAssignments", {
          counsellorId: c._id,
          studentId: p._id,
          assignedBy: admin?._id ?? c._id,
          assignedAt: Date.now(),
          active: true,
        });
      }
    }
  });
}
