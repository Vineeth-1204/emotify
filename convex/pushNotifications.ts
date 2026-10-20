import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const FORBIDDEN_LOCKSCREEN_TERMS =
  /depress|anxiety disorder|psychos|suicid|risk|score|symptom|severe|crisis|emergency|attempt|diagnos/i;

/**
 * Validates that push notification content is privacy-safe.
 * Lock-screen messages must never expose clinical scores, symptoms, risk labels, or diagnoses.
 */
export function validatePrivacySafePushContent(title: string, body: string): boolean {
  if (!title || !body) return false;
  if (FORBIDDEN_LOCKSCREEN_TERMS.test(title) || FORBIDDEN_LOCKSCREEN_TERMS.test(body)) {
    return false;
  }
  return true;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  channelId?: string;
  data?: Record<string, any>;
  priority?: "default" | "normal" | "high";
}

/**
 * Server-side Action: Dispatches privacy-safe mobile push notifications via the Expo Push API.
 * Automatically prunes dead / unregistered device tokens.
 */
export const sendPushNotification = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    channelId: v.optional(v.string()), // "default" | "reminders"
  },
  handler: async (ctx, args) => {
    // 1. Content Privacy Check
    if (!validatePrivacySafePushContent(args.title, args.body)) {
      throw new Error(
        "Push notification content violates privacy policy: contains sensitive mental-health, diagnostic, or clinical wording."
      );
    }

    // 2. Retrieve user tokens
    const tokens: string[] = await ctx.runQuery(internal.pushTokens.getTokensForUser, {
      userId: args.userId,
    });

    if (!tokens || tokens.length === 0) {
      return { status: "no_tokens", sentCount: 0 };
    }

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: args.title,
      body: args.body,
      sound: "default",
      channelId: args.channelId || "default",
      data: args.data || {},
      priority: "high",
    }));

    // In local test or mock mode
    if (process.env.NODE_ENV === "test" || !process.env.EXPO_PUSH_LIVE) {
      console.log(`[PUSH MOCK] Sent ${messages.length} push notifications to user ${args.userId}:`, {
        title: args.title,
        body: args.body,
        data: args.data,
      });
      return { status: "mock_delivered", sentCount: messages.length, mock: true };
    }

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        throw new Error(`Expo Push API error ${response.status}: ${await response.text()}`);
      }

      const result: any = await response.json();
      const tickets = result.data || [];

      let failedCount = 0;
      let successCount = 0;

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token = tokens[i];
        if (ticket.status === "error") {
          failedCount++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            // Prune dead token
            await ctx.runMutation(internal.pushTokens.deleteToken, { token });
          }
        } else {
          successCount++;
        }
      }

      return {
        status: "delivered",
        sentCount: tokens.length,
        successCount,
        failedCount,
      };
    } catch (err: any) {
      console.error("[PUSH ERROR] Failed to deliver push notifications:", err);
      return {
        status: "delivery_failed",
        sentCount: tokens.length,
        error: String(err?.message || err),
      };
    }
  },
});
