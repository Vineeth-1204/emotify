/** Whitelist of permissible in-app navigation targets triggered by notification taps */
export const ALLOWED_NOTIFICATION_ROUTES = new Set<string>([
  "/(auth)/(tabs)",
  "/(auth)/(tabs)/tools",
  "/(auth)/(tabs)/profile",
  "/(auth)/notifications",
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
export function validateNotificationRoute(route?: unknown): string | null {
  if (!route || typeof route !== "string") return null;
  const clean = route.trim();
  if (ALLOWED_NOTIFICATION_ROUTES.has(clean)) {
    return clean;
  }
  return null;
}

/**
 * Where a notification leads. Notifications (stored rows and push payloads) carry only one of
 * these keys, never a free-form path; each client maps the key to its own allowlisted route.
 * The server re-checks access to the related record when a notification is opened.
 */
export const NOTIFICATION_DESTINATIONS = [
  "notifications",
  "appointments",
  "alerts",
  "assignments",
  "requests",
  "my_counsellor",
  "home",
] as const;
export type NotificationDestination = (typeof NOTIFICATION_DESTINATIONS)[number];

export function isNotificationDestination(value: unknown): value is NotificationDestination {
  return typeof value === "string" && (NOTIFICATION_DESTINATIONS as readonly string[]).includes(value);
}

/** Mobile app route for each destination (every value is in ALLOWED_NOTIFICATION_ROUTES). */
export const MOBILE_DESTINATION_ROUTES: Record<NotificationDestination, string> = {
  notifications: "/(auth)/notifications",
  appointments: "/(auth)/tools/appointments",
  // Staff destinations have no mobile screen: open the notification centre instead.
  alerts: "/(auth)/notifications",
  assignments: "/(auth)/notifications",
  requests: "/(auth)/tools/appointments",
  my_counsellor: "/(auth)/(tabs)/profile",
  home: "/(auth)/(tabs)",
};

/** Staff website path for each destination. */
export const DASHBOARD_DESTINATION_ROUTES: Record<NotificationDestination, string> = {
  notifications: "/notifications",
  appointments: "/sessions",
  alerts: "/alerts",
  assignments: "/assignments",
  requests: "/requests",
  my_counsellor: "/notifications",
  home: "/",
};

/**
 * The mobile route a tapped push notification may open: its destination key if valid, else a
 * legacy `route` that passes the allowlist, else nothing (the tap just opens the app).
 */
export function mobileRouteForPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { destination, route } = data as { destination?: unknown; route?: unknown };
  if (isNotificationDestination(destination)) return MOBILE_DESTINATION_ROUTES[destination];
  return validateNotificationRoute(route);
}
