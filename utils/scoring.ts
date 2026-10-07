/**
 * Client-side clinical scoring and interpretation helpers.
 * Note: Authoritative scoring and triage are validated and performed server-side in Convex.
 */

export interface SeverityResult {
  severity: string;
  level: "mild" | "moderate" | "severe" | "suicide_flag" | "psychosis_flag";
}

/** Interpret PHQ-9 total score into clinical severity band */
export function interpretPHQ9(total: number): SeverityResult {
  if (total <= 4) return { severity: "Minimal / None", level: "mild" };
  if (total <= 9) return { severity: "Mild Depression", level: "mild" };
  if (total <= 14) return { severity: "Moderate Depression", level: "moderate" };
  if (total <= 19) return { severity: "Moderately Severe Depression", level: "severe" };
  return { severity: "Severe Depression", level: "severe" };
}

/** Interpret GAD-7 total score into clinical severity band */
export function interpretGAD7(total: number): SeverityResult {
  if (total <= 4) return { severity: "Minimal Anxiety", level: "mild" };
  if (total <= 9) return { severity: "Mild Anxiety", level: "mild" };
  if (total <= 14) return { severity: "Moderate Anxiety", level: "moderate" };
  return { severity: "Severe Anxiety", level: "severe" };
}

/** Interpret PQ-16 total score (>= 6 indicates prodromal psychosis risk) */
export function interpretPQ16(total: number): SeverityResult {
  if (total >= 6) return { severity: "Elevated Psychosis Risk", level: "psychosis_flag" };
  if (total >= 3) return { severity: "Low-Moderate Symptoms", level: "mild" };
  return { severity: "Low / Normal", level: "mild" };
}

/** Calculate PHQ-9 total and item 9 flag */
export function scorePHQ9(answers: number[]): { total: number; item9Score: number; item9Flag: boolean; severity: string } {
  const total = answers.reduce((sum, val) => sum + val, 0);
  const item9Score = answers[8] ?? 0;
  const { severity } = interpretPHQ9(total);
  return { total, item9Score, item9Flag: item9Score > 0, severity };
}

/** Calculate GAD-7 total */
export function scoreGAD7(answers: number[]): { total: number; severity: string } {
  const total = answers.reduce((sum, val) => sum + val, 0);
  const { severity } = interpretGAD7(total);
  return { total, severity };
}

/** Calculate PQ-16 total (count of "Yes" endorsements) */
export function scorePQ16(answers: number[]): { total: number; severity: string } {
  const total = answers.reduce((sum, val) => sum + val, 0);
  const { severity } = interpretPQ16(total);
  return { total, severity };
}
