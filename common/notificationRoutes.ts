/** Whitelist of permissible in-app navigation targets triggered by notification taps */
export const ALLOWED_NOTIFICATION_ROUTES = new Set<string>([
  "/(auth)/(tabs)",
  "/(auth)/(tabs)/tools",
  "/(auth)/tools/emotion-map",
  "/(auth)/tools/microgoals",
  "/(auth)/screening",
  "/(auth)/tools/appointments",
  "/(auth)/tools/reframe",
  "/(auth)/tools/grounding",
]);

/**
 * Validates a route provided by notification data.
 * Protects against open-redirect or unvalidated arbitrary deep-links.
 */
export function validateNotificationRoute(route?: string | null): string | null {
  if (!route || typeof route !== "string") return null;
  const clean = route.trim();
  if (ALLOWED_NOTIFICATION_ROUTES.has(clean)) {
    return clean;
  }
  return null;
}
