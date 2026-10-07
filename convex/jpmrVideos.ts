import { mutation, query } from "./functions";
import { v } from "convex/values";
import { requireAdmin } from "./authz";

/** Clear all existing JPMR video records and storage files (Admin only) */
export const clearAllJpmrVideos = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("jpmrVideos").collect();
    for (const item of existing) {
      try {
        await ctx.storage.delete(item.storageId);
      } catch (e) {
        console.error("Storage delete warning:", e);
      }
      await ctx.db.delete(item._id);
    }
    return { clearedCount: existing.length };
  },
});

/** Generate an upload URL for uploading files to Convex Storage (Admin only) */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save video record after uploading file to Convex Storage (Admin only) */
export const saveVideoRecord = mutation({
  args: {
    stepIndex: v.number(),
    title: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("jpmrVideos")
      .withIndex("by_stepIndex", (q) => q.eq("stepIndex", args.stepIndex))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("jpmrVideos", {
      stepIndex: args.stepIndex,
      title: args.title,
      storageId: args.storageId,
      createdAt: Date.now(),
    });
  },
});

/** Query all uploaded video URLs mapped by step index */
export const getJpmrVideos = query({
  args: {},
  handler: async (ctx) => {
    const videos = await ctx.db.query("jpmrVideos").collect();
    const result: Record<number, string> = {};

    for (const v of videos) {
      const url = await ctx.storage.getUrl(v.storageId);
      if (url) {
        result[v.stepIndex] = url;
      }
    }
    return result;
  },
});
