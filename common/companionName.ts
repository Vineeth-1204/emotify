/** Centralized Companion Name configuration */
export const DEFAULT_COMPANION_NAME = "Emoty";

/** Display name from the existing mitraPreferences.name preference. */
export function getCompanionDisplayName(preferredName?: string | null): string {
  const name = preferredName?.trim();
  return name ? name.slice(0, 30).trim() || DEFAULT_COMPANION_NAME : DEFAULT_COMPANION_NAME;
}
