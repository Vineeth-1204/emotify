/**
 * Rules for phone (push) notification setup on the device, kept free of React and Expo so they
 * can be tested.
 *
 * Before: the app explained and asked once per install. If the student tapped "Not now" (or
 * dismissed the dialog), the app never asked again and the device was never registered.
 * Now: the explanation is offered again after REOFFER_MS, or at once when the student taps
 * "Turn on" in Profile. A permanently blocked permission is never re-prompted; Profile offers
 * the phone settings instead.
 */

export type PermissionStatus = "granted" | "denied" | "undetermined";

export interface PermissionDetails {
  status: PermissionStatus;
  canAskAgain: boolean;
}

export const REOFFER_MS = 3 * 24 * 60 * 60 * 1000;
/** Re-register at most this often unless the token changed or the student asked. */
export const REGISTER_THROTTLE_MS = 10 * 60 * 1000;

export type PermissionDecision = "granted" | "ask" | "wait" | "blocked";

export function permissionDecision(input: {
  permission: PermissionDetails;
  /** When the explanation was last shown (ms), or null if never. */
  lastOfferedAt: number | null;
  now: number;
  /** The student tapped "Turn on" in Profile. */
  interactive: boolean;
}): PermissionDecision {
  const { permission, lastOfferedAt, now, interactive } = input;
  if (permission.status === "granted") return "granted";
  if (permission.status === "denied" && !permission.canAskAgain) return "blocked";
  if (interactive || lastOfferedAt === null || now - lastOfferedAt >= REOFFER_MS) return "ask";
  return "wait";
}

/** Reads the stored "last offered" value; the old "asked once" flag ("1") counts as long ago. */
export function parseOfferedAt(stored: string | null): number | null {
  if (!stored) return null;
  const n = Number(stored);
  return Number.isFinite(n) && n > 1 ? n : 0;
}

export function shouldRegister(input: {
  token: string;
  last: { token: string; at: number } | null;
  now: number;
  force: boolean;
}): boolean {
  const { token, last, now, force } = input;
  return force || !last || last.token !== token || now - last.at >= REGISTER_THROTTLE_MS;
}

/** Short, token-free description of an error for diagnostics. */
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown");
  return raw.replace(/(?:ExponentPushToken|ExpoPushToken)\[[^\]]*\]/g, "[token]").replace(/\s+/g, " ").slice(0, 120);
}

export type PhoneNotificationState = "on" | "off" | "blocked" | "not_registered" | "unknown";

/** What Profile shows for phone notifications on this device. */
export function phoneNotificationState(permission: PermissionDetails | null, deviceCount: number | null | undefined): PhoneNotificationState {
  if (!permission || deviceCount === undefined || deviceCount === null) return "unknown";
  if (permission.status !== "granted") return permission.status === "denied" && !permission.canAskAgain ? "blocked" : "off";
  return deviceCount > 0 ? "on" : "not_registered";
}

/** Plain-language key for the last test notification's delivery status (notifications.pushStatus). */
export function testResultKey(pushStatus: string | null | undefined): string {
  switch (pushStatus) {
    case "queued":
      return "sending";
    case "sent":
      return "acceptedByExpo";
    case "provider_accepted":
      return "acceptedByGoogle";
    case "partially_failed":
    case "failed":
      return "failed";
    case "mock":
      return "liveOff";
    case "no_tokens":
      return "noDevice";
    case "skipped":
      return "skipped";
    default:
      return "unknown";
  }
}
