/** Pure helpers for the in-app notification centre (unit-tested; no React Native imports). */

export type RelativeTime =
  | { key: "notifications.centre.justNow"; count: 0 }
  | { key: "notifications.centre.minutesAgo" | "notifications.centre.hoursAgo" | "notifications.centre.daysAgo"; count: number }
  | { key: "date"; count: 0 };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 min ago", "3 h ago", "2 d ago"; a week or older shows the date. */
export function relativeTime(createdAt: number, now: number): RelativeTime {
  const diff = Math.max(0, now - createdAt);
  if (diff < MINUTE) return { key: "notifications.centre.justNow", count: 0 };
  if (diff < HOUR) return { key: "notifications.centre.minutesAgo", count: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { key: "notifications.centre.hoursAgo", count: Math.floor(diff / HOUR) };
  if (diff < 7 * DAY) return { key: "notifications.centre.daysAgo", count: Math.floor(diff / DAY) };
  return { key: "date", count: 0 };
}

/** Icon per notification type (calm, never alarming for students). */
export function notificationIcon(type: string): string {
  if (type.startsWith("appointment")) return "calendar-outline";
  if (type.startsWith("counsellor") || type.startsWith("caseload")) return "person-circle-outline";
  if (type === "critical_risk" || type === "safety_alert") return "alert-circle-outline";
  return "notifications-outline";
}

/** Badge text: nothing at zero, the number up to 99, then "99+". */
export function badgeLabel(unread: { count: number; capped: boolean } | undefined | null): string | null {
  if (!unread || unread.count <= 0) return null;
  return unread.capped ? "99+" : String(unread.count);
}
