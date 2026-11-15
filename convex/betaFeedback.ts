import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./functions";
import { getAuthenticatedUser, requireAdmin } from "./authz";
import { checkRateLimit } from "./rateLimiter";
import { sanitizePlainText } from "./sanitizer";
import { classifyServerSafety } from "./emotySafety";

/**
 * In-app beta feedback (Profile -> Send feedback). Testers write what broke, confused them or
 * could be better; admins read it in the dashboard's Beta report.
 *
 * Feedback is not a support channel: if the text contains crisis language the app shows the
 * crisis numbers straight away and the entry is flagged at the top of the report. It does not
 * create a safety alert (alert rules are unchanged).
 */

export const FEEDBACK_CATEGORIES = ["bug", "confusing", "idea", "praise", "other"] as const;
const MAX_MESSAGE = 2000;
const MIN_MESSAGE = 3;

export const submit = mutation({
  args: {
    category: v.union(...FEEDBACK_CATEGORIES.map((c) => v.literal(c))),
    message: v.string(),
    screen: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Unauthenticated: Login required.");
    const message = sanitizePlainText(args.message).trim();
    if (message.length < MIN_MESSAGE) throw new Error("Please write a little more before sending.");
    if (message.length > MAX_MESSAGE) throw new Error(`Please keep feedback under ${MAX_MESSAGE} characters.`);
    await checkRateLimit(ctx, String(user._id), "beta_feedback", 10, 60 * 60 * 1000);

    const flagged = classifyServerSafety(message).state === "crisis";
    const short = (s: string | undefined, n: number) => (s ? sanitizePlainText(s).slice(0, n) : undefined);
    await ctx.db.insert("betaFeedback", {
      userId: String(user._id),
      role: user.role || "patient",
      category: args.category,
      message,
      screen: short(args.screen, 80),
      appVersion: short(args.appVersion, 40),
      platform: short(args.platform, 20),
      flagged,
      createdAt: Date.now(),
    });
    return { success: true, showCrisisResources: flagged };
  },
});

/** Admin: all feedback, newest first. */
export const listAll = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("betaFeedback").withIndex("by_createdAt").order("desc").paginate(args.paginationOpts);
    const page = [];
    for (const f of result.page) {
      const id = ctx.db.normalizeId("users", f.userId);
      const author = id ? await ctx.db.get(id) : null;
      page.push({
        _id: f._id,
        createdAt: f.createdAt,
        category: f.category,
        message: f.message,
        screen: f.screen ?? null,
        appVersion: f.appVersion ?? null,
        platform: f.platform ?? null,
        flagged: f.flagged,
        role: f.role,
        from: author ? `${author.full_name || author.alias || "User"}${author.patientId ? ` (Student ${author.patientId})` : ""}` : "Deleted account",
      });
    }
    return { ...result, page };
  },
});
