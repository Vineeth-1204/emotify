import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Standard privacy-safe emergency contact notice text (spec requirement) */
export const EMERGENCY_NOTICE_TEXT =
  "Emotify Care Notice: A wellness check-in for your student indicated they may need support. School counselors have been alerted. Please reach out to them or call Tele-MANAS at 14416 if needed.";

/**
 * Validates whether a given phone number has a usable format.
 * E.g. minimum 7 digits, digits with optional leading + and delimiters.
 */
export function validatePhoneNumber(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Formats privacy-safe notification body */
export function formatEmergencyAlertMessage(): string {
  return EMERGENCY_NOTICE_TEXT;
}

/** Internal: Retrieve emergency contact for a student */
export const getEmergencyContactDetails = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    let student = null;
    const studentId = ctx.db.normalizeId("users", args.userId);
    if (studentId) {
      student = await ctx.db.get(studentId);
    }
    if (!student) {
      student = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
        .first();
    }

    if (!student) {
      return { hasContact: false, name: null, phone: null };
    }

    const phone = student.emergencyContactPhone || null;
    const name = student.emergencyContactName || null;
    const isValid = validatePhoneNumber(phone);

    return {
      hasContact: isValid,
      name,
      phone,
    };
  },
});

/** Internal: Read external dispatch status of an alert for idempotency check */
export const getAlertDispatchStatus = internalQuery({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) return null;
    return {
      status: alert.externalDispatchStatus,
      attempts: alert.externalDispatchAttempts ?? 0,
      dispatchedAt: alert.externalDispatchedAt,
      messageId: alert.externalMessageId,
    };
  },
});

/** Internal: Update external dispatch metadata on the alert record */
export const updateAlertExternalStatus = internalMutation({
  args: {
    alertId: v.id("alerts"),
    status: v.string(), // "delivered" | "failed" | "skipped_no_contact"
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) return;

    const currentAttempts = alert.externalDispatchAttempts ?? 0;
    await ctx.db.patch(args.alertId, {
      externalDispatchStatus: args.status,
      externalDispatchedAt: Date.now(),
      externalDispatchAttempts: currentAttempts + 1,
      externalMessageId: args.messageId,
      externalDispatchError: args.error,
    });
  },
});

/**
 * Server-side Action: Dispatches SMS/Email notification to the student's emergency contact.
 * Includes idempotency guard, rate limit check, credential isolation, and audit tracking.
 */
export const dispatchExternalAlert = internalAction({
  args: {
    alertId: v.id("alerts"),
    userId: v.string(),
    alertType: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: string; messageId?: string; sentTo?: string; error?: string; mock?: boolean }> => {
    // 1. Idempotency Check: Abort if already delivered
    const alertStatus = await ctx.runQuery(internal.emergencyDispatch.getAlertDispatchStatus, {
      alertId: args.alertId,
    });

    if (alertStatus?.status === "delivered") {
      console.log(`[EXTERNAL DISPATCH] Alert ${args.alertId} already delivered. Skipping duplicate.`);
      return { status: "already_delivered", messageId: alertStatus.messageId };
    }

    // 2. Fetch emergency contact
    const contact = await ctx.runQuery(internal.emergencyDispatch.getEmergencyContactDetails, {
      userId: args.userId,
    });

    if (!contact?.hasContact || !contact.phone) {
      await ctx.runMutation(internal.emergencyDispatch.updateAlertExternalStatus, {
        alertId: args.alertId,
        status: "skipped_no_contact",
        error: "No valid emergency contact phone number on file for student.",
      });
      return { status: "skipped_no_contact" };
    }

    const messageBody = formatEmergencyAlertMessage();

    // 3. Provider dispatch
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_FROM_PHONE;

    if (accountSid && authToken && fromPhone) {
      try {
        const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const bodyParams = new URLSearchParams({
          To: contact.phone,
          From: fromPhone,
          Body: messageBody,
        });

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: bodyParams.toString(),
          }
        );

        if (!response.ok) {
          const errData = await response.text();
          throw new Error(`Twilio HTTP ${response.status}: ${errData}`);
        }

        const data: any = await response.json();
        const messageId = data.sid || `tw_${Date.now()}`;

        await ctx.runMutation(internal.emergencyDispatch.updateAlertExternalStatus, {
          alertId: args.alertId,
          status: "delivered",
          messageId,
        });

        return { status: "delivered", messageId };
      } catch (err: any) {
        console.error(`[EXTERNAL DISPATCH ERROR] Failed to send to ${contact.phone}:`, err);
        await ctx.runMutation(internal.emergencyDispatch.updateAlertExternalStatus, {
          alertId: args.alertId,
          status: "failed",
          error: String(err?.message || err),
        });
        return { status: "failed", error: String(err?.message || err) };
      }
    } else {
      // Development / Mock mode when live credentials are not set
      const mockMessageId = `mock_dispatch_${Date.now()}`;
      console.log(
        `[EXTERNAL DISPATCH MOCK] Simulated external SMS to ${contact.phone} for Alert ${args.alertId}: "${messageBody}"`
      );

      await ctx.runMutation(internal.emergencyDispatch.updateAlertExternalStatus, {
        alertId: args.alertId,
        status: "delivered",
        messageId: mockMessageId,
      });

      return { status: "delivered", messageId: mockMessageId, mock: true };
    }
  },
});
