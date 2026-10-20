/**
 * Centralized Clinical Scoring & Validation Module
 * 
 * Rules:
 * - Authoritative scoring is executed on the server.
 * - Does NOT trust client-submitted aggregate scores.
 * - Strictly preserves validated clinical questions, options, and thresholds.
 * - Emotify administers PHQ-9, GAD-7 and PQ-16 only. WSAS and ReQoL-10 are not part of
 *   the product and have no scoring path.
 */

export type InstrumentId = "phq9" | "gad7" | "pq16" | "pss10";

export type InstrumentStatus = "active";

export interface ClinicalSeverity {
  severity: string;
  level: "minimal" | "mild" | "moderate" | "moderately_severe" | "severe" | "critical";
  summary: string;
}

export interface InstrumentValidationResult {
  administered: boolean;
  score: number;
  maxScore: number;
  severity: string;
  level: string;
  item9Score?: number;
  item9Flag?: boolean;
  error?: string;
}

// ─── PHQ-9 (Patient Health Questionnaire - 9 items) ───
export const PHQ9_CONFIG = {
  id: "phq9" as const,
  title: "Patient Health Questionnaire (PHQ-9)",
  studentTitle: "Mood & Energy Check",
  questionCount: 9,
  minOptionValue: 0,
  maxOptionValue: 3,
  maxScore: 27,
  status: "active" as InstrumentStatus,
};

export function getPHQ9Severity(score: number): ClinicalSeverity {
  if (score >= 20) {
    return { severity: "Severe Depression", level: "severe", summary: "Severe depressive symptoms" };
  }
  if (score >= 15) {
    return { severity: "Moderately Severe Depression", level: "moderately_severe", summary: "Moderately severe depressive symptoms" };
  }
  if (score >= 10) {
    return { severity: "Moderate Depression", level: "moderate", summary: "Moderate depressive symptoms" };
  }
  if (score >= 5) {
    return { severity: "Mild Depression", level: "mild", summary: "Mild depressive symptoms" };
  }
  return { severity: "Minimal or None", level: "minimal", summary: "Minimal or no depressive symptoms" };
}

function getItemValue(
  responses: Record<string, number>,
  prefix: string,
  index: number
): number | undefined {
  return responses[String(index)] ?? responses[`q${index}`] ?? responses[`${prefix}_q${index}`];
}

export function scorePHQ9Responses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: PHQ9_CONFIG.maxScore,
      severity: "Not Administered",
      level: "minimal",
      item9Score: 0,
      item9Flag: false,
    };
  }

  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== PHQ9_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: PHQ9_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `PHQ-9 requires all ${PHQ9_CONFIG.questionCount} questions to be answered (received ${answeredKeys.length}).`,
    };
  }

  let total = 0;
  for (let i = 1; i <= PHQ9_CONFIG.questionCount; i++) {
    const val = getItemValue(responses, "phq9", i);
    if (val === undefined || typeof val !== "number" || val < 0 || val > 3 || !Number.isInteger(val)) {
      return {
        administered: false,
        score: 0,
        maxScore: PHQ9_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for PHQ-9 Question ${i}: must be an integer between 0 and 3.`,
      };
    }
    total += val;
  }

  const item9Score = getItemValue(responses, "phq9", 9) || 0;
  const item9Flag = item9Score > 0;
  const { severity, level } = getPHQ9Severity(total);

  return {
    administered: true,
    score: total,
    maxScore: PHQ9_CONFIG.maxScore,
    severity,
    level,
    item9Score,
    item9Flag,
  };
}

// ─── GAD-7 (Generalized Anxiety Disorder - 7 items) ───
export const GAD7_CONFIG = {
  id: "gad7" as const,
  title: "Generalized Anxiety Disorder (GAD-7)",
  studentTitle: "Calm & Focus Check",
  questionCount: 7,
  minOptionValue: 0,
  maxOptionValue: 3,
  maxScore: 21,
  status: "active" as InstrumentStatus,
};

export function getGAD7Severity(score: number): ClinicalSeverity {
  if (score >= 15) {
    return { severity: "Severe Anxiety", level: "severe", summary: "Severe anxiety symptoms" };
  }
  if (score >= 10) {
    return { severity: "Moderate Anxiety", level: "moderate", summary: "Moderate anxiety symptoms" };
  }
  if (score >= 5) {
    return { severity: "Mild Anxiety", level: "mild", summary: "Mild anxiety symptoms" };
  }
  return { severity: "Minimal Anxiety", level: "minimal", summary: "Minimal anxiety symptoms" };
}

export function scoreGAD7Responses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: GAD7_CONFIG.maxScore,
      severity: "Not Administered",
      level: "minimal",
    };
  }

  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== GAD7_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: GAD7_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `GAD-7 requires all ${GAD7_CONFIG.questionCount} questions to be answered (received ${answeredKeys.length}).`,
    };
  }

  let total = 0;
  for (let i = 1; i <= GAD7_CONFIG.questionCount; i++) {
    const val = getItemValue(responses, "gad7", i);
    if (val === undefined || typeof val !== "number" || val < 0 || val > 3 || !Number.isInteger(val)) {
      return {
        administered: false,
        score: 0,
        maxScore: GAD7_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for GAD-7 Question ${i}: must be an integer between 0 and 3.`,
      };
    }
    total += val;
  }

  const { severity, level } = getGAD7Severity(total);

  return {
    administered: true,
    score: total,
    maxScore: GAD7_CONFIG.maxScore,
    severity,
    level,
  };
}

// ─── PQ-16 (Prodromal Questionnaire - 16 items) ───
export const PQ16_CONFIG = {
  id: "pq16" as const,
  title: "Prodromal Questionnaire Brief (PQ-16)",
  studentTitle: "Perception & Thoughts Check",
  questionCount: 16,
  minOptionValue: 0,
  maxOptionValue: 1,
  maxScore: 16,
  psychosisThreshold: 6, // Clinical cutoff: 6 or more endorsements indicates potential prodromal risk
  status: "active" as InstrumentStatus,
};

export function getPQ16Severity(score: number): ClinicalSeverity {
  if (score >= PQ16_CONFIG.psychosisThreshold) {
    return {
      severity: "Prodromal Psychosis Risk Flagged",
      level: "critical",
      summary: "Endorsed 6 or more unusual sensory, cognitive, or perceptual experiences",
    };
  }
  return {
    severity: "Low Prodromal Risk",
    level: "minimal",
    summary: "Fewer than 6 prodromal experience endorsements",
  };
}

export function scorePQ16Responses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: PQ16_CONFIG.maxScore,
      severity: "Not Administered",
      level: "minimal",
    };
  }

  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== PQ16_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: PQ16_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `PQ-16 requires all ${PQ16_CONFIG.questionCount} questions to be answered (received ${answeredKeys.length}).`,
    };
  }

  let total = 0;
  for (let i = 1; i <= PQ16_CONFIG.questionCount; i++) {
    const val = getItemValue(responses, "pq16", i);
    if (val === undefined || typeof val !== "number" || (val !== 0 && val !== 1)) {
      return {
        administered: false,
        score: 0,
        maxScore: PQ16_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for PQ-16 Question ${i}: must be 0 (No) or 1 (Yes).`,
      };
    }
    total += val;
  }

  const { severity, level } = getPQ16Severity(total);

  return {
    administered: true,
    score: total,
    maxScore: PQ16_CONFIG.maxScore,
    severity,
    level,
  };
}

// ─── PSS-10 (Perceived Stress Scale - 10 items) ───
export const PSS10_CONFIG = {
  id: "pss10" as const,
  title: "Perceived Stress Scale (PSS-10)",
  studentTitle: "Stress & Coping Check",
  questionCount: 10,
  minOptionValue: 0,
  maxOptionValue: 4,
  maxScore: 40,
  reverseItems: [4, 5, 7, 8] as const,
  status: "active" as InstrumentStatus,
};

export function getPSS10Severity(score: number): ClinicalSeverity {
  if (score >= 27) {
    return { severity: "High Perceived Stress", level: "severe", summary: "High perceived stress symptoms" };
  }
  if (score >= 14) {
    return { severity: "Moderate Stress", level: "moderate", summary: "Moderate stress symptoms" };
  }
  return { severity: "Low Stress", level: "minimal", summary: "Low stress symptoms" };
}

export function scorePSS10Responses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: PSS10_CONFIG.maxScore,
      severity: "Not Administered",
      level: "minimal",
    };
  }

  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== PSS10_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: PSS10_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `PSS-10 requires all ${PSS10_CONFIG.questionCount} questions to be answered (received ${answeredKeys.length}).`,
    };
  }

  const reverseSet = new Set<number>([4, 5, 7, 8]);
  let total = 0;
  for (let i = 1; i <= PSS10_CONFIG.questionCount; i++) {
    const val = getItemValue(responses, "pss10", i);
    if (val === undefined || typeof val !== "number" || val < 0 || val > 4 || !Number.isInteger(val)) {
      return {
        administered: false,
        score: 0,
        maxScore: PSS10_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for PSS-10 Question ${i}: must be an integer between 0 and 4.`,
      };
    }
    const itemScore = reverseSet.has(i) ? 4 - val : val;
    total += itemScore;
  }

  const { severity, level } = getPSS10Severity(total);

  return {
    administered: true,
    score: total,
    maxScore: PSS10_CONFIG.maxScore,
    severity,
    level,
  };
}

// ─── Core Triage Classification ───
export interface AssessmentTriageResult {
  level: "mild" | "moderate" | "severe" | "suicide_flag" | "psychosis_flag";
  suicideFlag: boolean;
  psychosisFlag: boolean;
  requiresAlert: boolean;
  alertType?: "suicide" | "psychosis" | "severe";
}

export function evaluateClinicalTriage(scores: {
  phq9Score: number;
  item9Score: number;
  gad7Score: number;
  pq16Score: number;
  pq16Administered?: boolean;
  pss10Score?: number;
  pss10Administered?: boolean;
}): AssessmentTriageResult {
  // Priority 1: Suicide Risk via Item 9
  if (scores.item9Score > 0) {
    return {
      level: "suicide_flag",
      suicideFlag: true,
      psychosisFlag: false,
      requiresAlert: true,
      alertType: "suicide",
    };
  }

  // Priority 2: Psychosis Risk via PQ-16
  // MUST only trigger if PQ-16 was actually administered and reaches the clinical threshold
  if (scores.pq16Administered && scores.pq16Score >= PQ16_CONFIG.psychosisThreshold) {
    return {
      level: "psychosis_flag",
      suicideFlag: false,
      psychosisFlag: true,
      requiresAlert: true,
      alertType: "psychosis",
    };
  }

  // Priority 3: Severe Depression, Anxiety, or High Stress
  if (
    scores.phq9Score >= 15 ||
    scores.gad7Score >= 15 ||
    (scores.pss10Administered && (scores.pss10Score ?? 0) >= 27)
  ) {
    return {
      level: "severe",
      suicideFlag: false,
      psychosisFlag: false,
      requiresAlert: true,
      alertType: "severe",
    };
  }

  // Priority 4: Moderate Depression, Anxiety, or Stress
  if (
    (scores.phq9Score >= 10 && scores.phq9Score <= 14) ||
    (scores.gad7Score >= 10 && scores.gad7Score <= 14) ||
    (scores.pss10Administered && (scores.pss10Score ?? 0) >= 14 && (scores.pss10Score ?? 0) <= 26)
  ) {
    return {
      level: "moderate",
      suicideFlag: false,
      psychosisFlag: false,
      requiresAlert: false,
    };
  }

  // Default: Mild / Minimal
  return {
    level: "mild",
    suicideFlag: false,
    psychosisFlag: false,
    requiresAlert: false,
  };
}
