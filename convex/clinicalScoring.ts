/**
 * Centralized Clinical Scoring & Validation Module
 * 
 * Rules:
 * - Authoritative scoring is executed on the server.
 * - Does NOT trust client-submitted aggregate scores.
 * - Strictly preserves validated clinical questions, options, and thresholds.
 * - Marks missing instruments (WSAS, ReQoL-10) as PENDING_APPROVED_CONTENT without inventing clinical text.
 */

export type InstrumentId = "phq9" | "gad7" | "pq16" | "wsas" | "reqol10";

export type InstrumentStatus = "active" | "pending_approved_content";

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

// ─── WSAS (Work and Social Adjustment Scale - 5 items) ───
// Awaiting verified approved text. Configured as PENDING_APPROVED_CONTENT.
export const WSAS_CONFIG = {
  id: "wsas" as const,
  title: "Work and Social Adjustment Scale (WSAS)",
  studentTitle: "Daily Functioning Check",
  questionCount: 5,
  minOptionValue: 0,
  maxOptionValue: 8,
  maxScore: 40,
  status: "pending_approved_content" as InstrumentStatus,
};

export function getWSASSeverity(score: number): ClinicalSeverity {
  if (score >= 21) {
    return { severity: "Severe Functional Impairment", level: "severe", summary: "Significant disruption to work and social activities" };
  }
  if (score >= 10) {
    return { severity: "Significant Functional Impairment", level: "moderate", summary: "Moderate functional impairment" };
  }
  return { severity: "Low or No Impairment", level: "minimal", summary: "Low or subclinical impairment" };
}

export function scoreWSASResponses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: WSAS_CONFIG.maxScore,
      severity: "Not Administered (Pending Approved Content)",
      level: "minimal",
    };
  }

  // If approved content is pending, validate provided structure
  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== WSAS_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: WSAS_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `WSAS requires all ${WSAS_CONFIG.questionCount} questions to be answered.`,
    };
  }

  let total = 0;
  for (let i = 1; i <= WSAS_CONFIG.questionCount; i++) {
    const val = getItemValue(responses, "wsas", i);
    if (val === undefined || typeof val !== "number" || val < 0 || val > 8) {
      return {
        administered: false,
        score: 0,
        maxScore: WSAS_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for WSAS Question ${i}: must be between 0 and 8.`,
      };
    }
    total += val;
  }

  const { severity, level } = getWSASSeverity(total);
  return { administered: true, score: total, maxScore: WSAS_CONFIG.maxScore, severity, level };
}

// ─── ReQoL-10 (Recovering Quality of Life - 10 items) ───
// Awaiting verified approved text. Configured as PENDING_APPROVED_CONTENT.
export const REQOL10_CONFIG = {
  id: "reqol10" as const,
  title: "Recovering Quality of Life (ReQoL-10)",
  studentTitle: "Quality of Life Check",
  questionCount: 10,
  minOptionValue: 0,
  maxOptionValue: 4,
  maxScore: 40,
  status: "pending_approved_content" as InstrumentStatus,
};

export function getReQoL10Severity(score: number): ClinicalSeverity {
  if (score < 24) {
    return { severity: "Below Population Norm", level: "moderate", summary: "Quality of life score below standard clinical benchmark" };
  }
  return { severity: "Within Population Norm", level: "minimal", summary: "Good quality of life benchmark" };
}

export function scoreReQoL10Responses(responses?: Record<string, number>): InstrumentValidationResult {
  if (!responses || Object.keys(responses).length === 0) {
    return {
      administered: false,
      score: 0,
      maxScore: REQOL10_CONFIG.maxScore,
      severity: "Not Administered (Pending Approved Content)",
      level: "minimal",
    };
  }

  const answeredKeys = Object.keys(responses);
  if (answeredKeys.length !== REQOL10_CONFIG.questionCount) {
    return {
      administered: false,
      score: 0,
      maxScore: REQOL10_CONFIG.maxScore,
      severity: "Incomplete",
      level: "minimal",
      error: `ReQoL-10 requires all ${REQOL10_CONFIG.questionCount} questions to be answered.`,
    };
  }

  let total = 0;
  for (let i = 1; i <= REQOL10_CONFIG.questionCount; i++) {
    const val = responses[String(i)];
    if (val === undefined || typeof val !== "number" || val < 0 || val > 4) {
      return {
        administered: false,
        score: 0,
        maxScore: REQOL10_CONFIG.maxScore,
        severity: "Invalid Responses",
        level: "minimal",
        error: `Invalid response for ReQoL-10 Question ${i}: must be between 0 and 4.`,
      };
    }
    total += val;
  }

  const { severity, level } = getReQoL10Severity(total);
  return { administered: true, score: total, maxScore: REQOL10_CONFIG.maxScore, severity, level };
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

  // Priority 3: Severe Depression or Anxiety
  if (scores.phq9Score >= 15 || scores.gad7Score >= 15) {
    return {
      level: "severe",
      suicideFlag: false,
      psychosisFlag: false,
      requiresAlert: true,
      alertType: "severe",
    };
  }

  // Priority 4: Moderate Depression or Anxiety
  if (
    (scores.phq9Score >= 10 && scores.phq9Score <= 14) ||
    (scores.gad7Score >= 10 && scores.gad7Score <= 14)
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
