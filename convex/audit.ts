import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { MutationCtx } from "./_generated/server";

export const logEvent = internalMutation({
  args: {
    userId: v.optional(v.string()),
    action: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: args.action,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

export async function logAuditEvent(
  ctx: { db: any } | MutationCtx,
  userId: string | undefined,
  action: string,
  details?: string
) {
  await ctx.db.insert("auditLogs", {
    userId,
    action,
    details,
    timestamp: Date.now(),
  });
}
