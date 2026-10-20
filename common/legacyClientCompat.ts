/**
 * Temporary compatibility views for app builds released before the screening data-minimization
 * change. Those builds read triage.getLatest, screening.getLatest and screening.getAll for the
 * signed-in student; the server now answers a student's own call with these views instead of the
 * raw records (staff responses are unchanged).
 *
 * Rule: a legacy view never discloses more than the new minimal endpoints already give the
 * student. The level is reduced to the outcome bands of getMyResultSummary plus the booleans of
 * getMySafetyStatus; totals are those already shown (and recoverable) on Home and in the
 * student's own export. No ids, flags, item-level answers, triage ids or staff data.
 */

/** Triage levels as old builds understand them (Home shows Mild / Moderate / Severe). */
export type LegacyTriageLevel = "mild" | "moderate" | "severe" | "suicide_flag" | "force_retest";

/**
 * Old builds open the crisis screen on "suicide_flag", redirect to screening on "force_retest"
 * and treat "severe" as elevated. Psychosis is reported as "severe" (same outcome band); an
 * unknown level is reported as "moderate", never as the low-concern "mild".
 */
export function legacyTriageLevel(level: string | null | undefined): LegacyTriageLevel | null {
  if (!level) return null;
  switch (level) {
    case "suicide_flag":
    case "force_retest":
    case "severe":
    case "moderate":
    case "mild":
      return level;
    case "psychosis_flag":
      return "severe";
    default:
      return "moderate";
  }
}

/** Old builds treat a self-initiated follow-up as completable and anything else as staff-owned. */
export function legacyFollowUpSourceType(sourceType: string | null | undefined): "self_initiated" | "care_team" {
  return sourceType === "self_initiated" ? "self_initiated" : "care_team";
}
