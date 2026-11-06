/**
 * Test helpers for the screening pipeline.
 *
 * Students receive only a minimal result from submitScreeningAttempt (outcome + replayed) and
 * cannot call the staff clinical reads. Tests that need to inspect the clinical records a
 * student submission created read them straight from the database, or as a staff viewer.
 */

/** The full record of a student's most recent screening attempt, read from the database. */
export async function latestSubmission(
  t: { run: (fn: (ctx: any) => Promise<any>) => Promise<any> },
  userId: string
): Promise<{
  attemptId: any;
  triageId: any;
  followUpId: any;
  triageLevel: string;
  suicideFlag: boolean;
  psychosisFlag: boolean;
  attemptType: string;
  results: any;
  attempt: any;
}> {
  return await t.run(async (ctx) => {
    const attempt = await ctx.db
      .query("screeningAttempts")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!attempt) throw new Error(`No screening attempt for ${userId}`);
    const followUp = (await ctx.db
      .query("followUps")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect()).find((f: any) => f.attemptId === attempt._id);
    return {
      attemptId: attempt._id,
      triageId: attempt.triageId,
      followUpId: followUp?._id,
      triageLevel: attempt.triageLevel,
      suicideFlag: attempt.suicideFlag,
      psychosisFlag: attempt.psychosisFlag,
      attemptType: attempt.attemptType,
      results: attempt.results,
      attempt,
    };
  });
}

/** Creates an admin and returns a tester scoped to them, for reading staff-only clinical views. */
export async function staffViewer<T extends { run: (fn: (ctx: any) => Promise<any>) => Promise<any>; withIdentity: (i: any) => any }>(
  t: T,
  label = "test_admin_viewer"
): Promise<ReturnType<T["withIdentity"]>> {
  const adminId = await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", label))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("users", {
      clerkId: label,
      role: "admin",
      status: "active",
      created_at: Date.now(),
    });
  });
  return t.withIdentity({ subject: String(adminId) });
}
