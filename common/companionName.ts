/** Centralized Companion Name configuration */
export const DEFAULT_COMPANION_NAME = "Emoty";

/** Default names from before the companion became Emoty; a stored value equal to one is shown as Emoty. */
const RETIRED_DEFAULT_NAMES = new Set(["mitra"]);

/** Display name from the student's stored companion-name preference. */
export function getCompanionDisplayName(preferredName?: string | null): string {
  const name = preferredName?.trim().slice(0, 30).trim();
  if (!name || RETIRED_DEFAULT_NAMES.has(name.toLowerCase())) return DEFAULT_COMPANION_NAME;
  return name;
}

export interface StoredEmotyPreferences {
  name: string;
  avatarGender: string;
  avatarVariant?: string;
  updatedAt?: number;
}

/**
 * Emoty preferences are stored in the `users.mitraPreferences` field. The field keeps its
 * historical name so existing documents need no data migration; read and write it only
 * through these two helpers.
 */
export function readStoredEmotyPreferences(
  user: { mitraPreferences?: StoredEmotyPreferences } | null | undefined
): StoredEmotyPreferences | undefined {
  return user?.mitraPreferences;
}

export function storedEmotyPreferencesPatch(prefs: StoredEmotyPreferences): { mitraPreferences: StoredEmotyPreferences } {
  return { mitraPreferences: prefs };
}
