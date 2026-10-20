/**
 * Avatar Notification Configuration & Resolution
 *
 * Authoritative mapping between student companion preferences and push notification avatars.
 * Supports both boy and girl Emotify characters and enforces safe fallbacks when preferences
 * are missing, unrecognized, or for staff roles (counsellor/admin).
 */
import { readStoredEmotyPreferences, type StoredEmotyPreferences } from "./companionName";

export type AvatarCharacterId = "boy" | "girl";

/**
 * Resolves avatar character ID from stored preference gender string.
 * Supports 'male' | 'female' as stored in users.mitraPreferences.avatarGender,
 * as well as 'boy' | 'girl'. Fails closed to null if unrecognized or absent.
 */
export function resolveAvatarCharacterId(
  gender: string | null | undefined
): AvatarCharacterId | null {
  if (!gender || typeof gender !== "string") return null;
  const normalized = gender.toLowerCase().trim();
  if (normalized === "male" || normalized === "boy") return "boy";
  if (normalized === "female" || normalized === "girl") return "girl";
  return null;
}

/**
 * Resolves avatar character for a user document.
 * Returns null if the user is not a student (e.g. counsellor or admin)
 * or if no companion preference is configured.
 */
export function resolveUserAvatarCharacter(
  user: { role?: string; mitraPreferences?: StoredEmotyPreferences } | null | undefined
): AvatarCharacterId | null {
  if (!user) return null;
  // Non-student roles (counsellor, admin) receive standard app icon notifications
  if (user.role && user.role !== "student") return null;
  const prefs = readStoredEmotyPreferences(user);
  return resolveAvatarCharacterId(prefs?.avatarGender);
}

/**
 * Constructs the public notification avatar image URL for Expo Push / FCM.
 * Returns null if no character is selected or if no base URL is available.
 */
export function getNotificationAvatarUrl(
  character: AvatarCharacterId | null | undefined,
  baseUrl?: string | null
): string | null {
  if (!character) return null;
  const rawBase =
    baseUrl !== undefined
      ? baseUrl
      : process.env.AVATAR_NOTIFICATION_BASE_URL || process.env.CONVEX_SITE_URL;
  const base = (rawBase || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/avatar/${character}.jpg`;
}
