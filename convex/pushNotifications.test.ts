import { describe, expect, test } from "vitest";
import { validatePrivacySafePushContent } from "./pushNotifications";
import { isValidPushToken } from "./pushTokens";
import { validateNotificationRoute, ALLOWED_NOTIFICATION_ROUTES } from "../common/notificationRoutes";

describe("Phase 3: Push Notification Privacy Policy", () => {
  test("neutral and supportive notification copy is accepted", () => {
    expect(
      validatePrivacySafePushContent(
        "Gentle Reminder",
        "Take a mindful moment for your daily check-in with Emoty."
      )
    ).toBe(true);

    expect(
      validatePrivacySafePushContent(
        "Time for Calm",
        "Your relaxation practice is waiting whenever you are ready."
      )
    ).toBe(true);

    expect(
      validatePrivacySafePushContent(
        "Daily Inspiration",
        "Small steps lead to peaceful moments."
      )
    ).toBe(true);
  });

  test("clinical, diagnostic, or crisis wording on lock-screens is strictly rejected", () => {
    // Diagnoses / clinical scores
    expect(validatePrivacySafePushContent("Results", "Your depression score is 16")).toBe(false);
    expect(validatePrivacySafePushContent("Notice", "Moderate anxiety disorder symptoms detected")).toBe(false);
    expect(validatePrivacySafePushContent("Alert", "Psychosis risk flagged")).toBe(false);
    expect(validatePrivacySafePushContent("Alert", "Suicide risk alert triggered")).toBe(false);
    expect(validatePrivacySafePushContent("Crisis", "Emergency crisis intervention required")).toBe(false);

    // Empty or missing
    expect(validatePrivacySafePushContent("", "Hello")).toBe(false);
    expect(validatePrivacySafePushContent("Hello", "")).toBe(false);
  });
});

describe("Phase 3: Expo Push Token Validation", () => {
  test("accepts valid Expo push token formats", () => {
    expect(isValidPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isValidPushToken("ExpoPushToken[abcdef123456_-]")).toBe(true);
    expect(isValidPushToken("  ExponentPushToken[trimmed_valid_token]  ")).toBe(true);
  });

  test("rejects invalid or malformed tokens", () => {
    expect(isValidPushToken("")).toBe(false);
    expect(isValidPushToken("random_string_12345")).toBe(false);
    expect(isValidPushToken("FCM_token_not_expo")).toBe(false);
    expect(isValidPushToken("ExponentPushToken[]")).toBe(false);
    expect(isValidPushToken(null as any)).toBe(false);
    expect(isValidPushToken(undefined as any)).toBe(false);
  });
});

describe("Phase 3: Notification Deep-Link Route Validation", () => {
  test("whitelisted in-app routes are permitted", () => {
    for (const route of ALLOWED_NOTIFICATION_ROUTES) {
      expect(validateNotificationRoute(route)).toBe(route);
    }
  });

  test("arbitrary, external, or unauthorized deep-link routes are rejected", () => {
    expect(validateNotificationRoute("https://external-malicious.com")).toBeNull();
    expect(validateNotificationRoute("/unauthorized/admin/panel")).toBeNull();
    expect(validateNotificationRoute("javascript:alert(1)")).toBeNull();
    expect(validateNotificationRoute("")).toBeNull();
    expect(validateNotificationRoute(null)).toBeNull();
    expect(validateNotificationRoute(undefined)).toBeNull();
  });
});
