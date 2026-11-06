export type TriageLevel = 'mild' | 'moderate' | 'severe' | 'suicide_flag' | 'psychosis_flag';

export interface TriageInput {
  phq9_total: number;
  gad7_total: number;
  pq16_total: number;
  phq9_item9_score: number;
}

export interface TriageResult {
  level: TriageLevel;
  suicideFlag: boolean;
  psychosisFlag: boolean;
  requiresAlert: boolean;
  alertType?: 'suicide' | 'psychosis' | 'severe';
}

/**
 * Core triage engine — implements exact clinical logic:
 *
 * IF phq9_item9 > 0        → suicide_flag
 * ELSE IF pq16 >= 6        → psychosis_flag
 * ELSE IF phq >= 15 OR gad >= 15 → severe
 * ELSE IF phq 10–14 OR gad 10–14 → moderate
 * ELSE                          → mild
 */
export function runTriage(input: TriageInput): TriageResult {
  const { phq9_total, gad7_total, pq16_total, phq9_item9_score } = input;

  // Priority 1: Suicide risk
  if (phq9_item9_score > 0) {
    return {
      level: 'suicide_flag',
      suicideFlag: true,
      psychosisFlag: false,
      requiresAlert: true,
      alertType: 'suicide',
    };
  }

  // Priority 2: Psychosis risk
  if (pq16_total >= 6) {
    return {
      level: 'psychosis_flag',
      suicideFlag: false,
      psychosisFlag: true,
      requiresAlert: true,
      alertType: 'psychosis',
    };
  }

  // Priority 3: Severe
  if (phq9_total >= 15 || gad7_total >= 15) {
    return {
      level: 'severe',
      suicideFlag: false,
      psychosisFlag: false,
      requiresAlert: true,
      alertType: 'severe',
    };
  }

  // Priority 4: Moderate
  if (
    (phq9_total >= 10 && phq9_total <= 14) ||
    (gad7_total >= 10 && gad7_total <= 14)
  ) {
    return {
      level: 'moderate',
      suicideFlag: false,
      psychosisFlag: false,
      requiresAlert: false,
    };
  }

  // Default: Mild
  return {
    level: 'mild',
    suicideFlag: false,
    psychosisFlag: false,
    requiresAlert: false,
  };
}

/** Get follow-up schedule based on triage level */
export function getFollowUpSchedule(level: TriageLevel): { type: string; intervalDays: number } {
  switch (level) {
    case 'suicide_flag':
    case 'psychosis_flag':
    case 'severe':
      return { type: 'counselor', intervalDays: 0 }; // Flagged immediately
    case 'moderate':
      return { type: 'weekly', intervalDays: 7 };
    case 'mild':
    default:
      return { type: 'monthly', intervalDays: 30 };
  }
}

/** Get human-readable triage label */
export function getTriageLabel(level: TriageLevel): string {
  switch (level) {
    case 'suicide_flag': return 'Urgent — Safety Priority';
    case 'psychosis_flag': return 'Urgent — Specialist Review';
    case 'severe': return 'Needs Attention';
    case 'moderate': return 'Moderate';
    case 'mild': return 'Mild';
    default: return 'Unknown';
  }
}

/** Get severity display level (simplified for UI) */
export function getDisplayLevel(level: TriageLevel): 'Mild' | 'Moderate' | 'Severe' {
  switch (level) {
    case 'mild': return 'Mild';
    case 'moderate': return 'Moderate';
    case 'severe':
    case 'suicide_flag':
    case 'psychosis_flag':
      return 'Severe';
  }
}
