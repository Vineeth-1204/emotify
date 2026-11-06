/**
 * Student-facing presentation of a completed screening (PHQ-9, GAD-7, PQ-16).
 *
 * This module ONLY chooses wording and next steps. It never scores, triages or alerts:
 *  - the authoritative triage level is computed on the server (clinicalScoring.evaluateClinicalTriage)
 *    inside screening.submitScreeningAttempt, which also creates any safety alert, the follow-up and
 *    the staff notifications in the same transaction, before the student sees anything;
 *  - this mapping reads that stored level and can only change what the student reads.
 *
 * Outcomes (one per existing triage level; no new thresholds):
 *   mild                      -> "steady"            neutral, encouraging; support still offered
 *   moderate                  -> "support"           support recommended
 *   severe, psychosis_flag    -> "priority_support"  speaking with a counsellor soon is recommended
 *   suicide_flag              -> "immediate_safety"  existing crisis guidance and actions, shown first
 * An unknown level is never shown as "steady": it falls back to "support".
 * A missing result is not an outcome at all (the screen shows a loading, offline or error state).
 *
 * Copy avoids diagnoses, scores, severity labels and blame. The immediate-safety body keeps the
 * existing approved crisis sentence used by the emergency screen.
 */

export type ScreeningOutcome = "steady" | "support" | "priority_support" | "immediate_safety";

export type ScreeningAction =
  | "home"
  | "tools"
  | "counsellor"
  | "call_emergency"
  | "call_helpline"
  | "more_support";

export interface ScreeningOutcomeView {
  outcome: ScreeningOutcome;
  /** i18n keys under screening.result.<outcome>.* */
  headingKey: string;
  bodyKeys: string[];
  primary: ScreeningAction;
  secondary: ScreeningAction[];
  /** Emoty expression for the result card. Never alarming. */
  emotyMood: "listening" | "encouraging" | "concerned";
  /** Show the quiet "if you ever feel unsafe" helpline line under the actions. */
  showSafetyFooter: boolean;
}

const LEVEL_TO_OUTCOME: Record<string, ScreeningOutcome> = {
  mild: "steady",
  moderate: "support",
  severe: "priority_support",
  psychosis_flag: "priority_support",
  suicide_flag: "immediate_safety",
};

/** Maps the stored triage level of a completed attempt to a presentation outcome. */
export function outcomeForTriageLevel(level: string | null | undefined): ScreeningOutcome | null {
  if (!level) return null;
  return LEVEL_TO_OUTCOME[level] ?? "support";
}

const VIEWS: Record<ScreeningOutcome, Omit<ScreeningOutcomeView, "outcome">> = {
  steady: {
    headingKey: "screening.result.steady.heading",
    bodyKeys: ["screening.result.steady.body"],
    primary: "home",
    secondary: ["tools", "counsellor"],
    emotyMood: "encouraging",
    showSafetyFooter: true,
  },
  support: {
    headingKey: "screening.result.support.heading",
    bodyKeys: ["screening.result.support.body"],
    primary: "counsellor",
    secondary: ["tools", "home"],
    emotyMood: "listening",
    showSafetyFooter: true,
  },
  priority_support: {
    headingKey: "screening.result.prioritySupport.heading",
    bodyKeys: ["screening.result.prioritySupport.body"],
    primary: "counsellor",
    secondary: ["tools", "home"],
    emotyMood: "listening",
    showSafetyFooter: true,
  },
  immediate_safety: {
    headingKey: "screening.result.immediateSafety.heading",
    bodyKeys: ["screening.result.immediateSafety.body", "screening.result.immediateSafety.bodyHelpline"],
    primary: "call_emergency",
    secondary: ["call_helpline", "more_support"],
    emotyMood: "concerned",
    showSafetyFooter: false, // crisis contacts are already the main actions
  },
};

export function screeningOutcomeView(outcome: ScreeningOutcome): ScreeningOutcomeView {
  return { outcome, ...VIEWS[outcome] };
}

/** i18n key for each action's button label. */
export const ACTION_LABEL_KEYS: Record<ScreeningAction, string> = {
  home: "screening.result.actions.home",
  tools: "screening.result.actions.tools",
  counsellor: "screening.result.actions.counsellor",
  call_emergency: "screening.result.actions.callEmergency",
  call_helpline: "screening.result.actions.callHelpline",
  more_support: "screening.result.actions.moreSupport",
};

/**
 * The counsellor button reads "Talk to a counsellor" for support and "Connect with a counsellor"
 * when speaking with someone soon is recommended.
 */
export function counsellorLabelKey(outcome: ScreeningOutcome): string {
  return outcome === "priority_support" ? "screening.result.actions.connectCounsellor" : ACTION_LABEL_KEYS.counsellor;
}

export type ResultSummary =
  | { status: "unauthenticated" }
  | { status: "none" }
  | { status: "ready"; outcome: ScreeningOutcome; completedAt: number };

export type ResultScreenState =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "missing" }
  | { kind: "ready"; view: ScreeningOutcomeView };

/**
 * What the results screen shows. A result that has not arrived, could not be loaded or does not
 * exist is never presented as an outcome (and so never as the low-concern "steady" message).
 */
export function resultScreenState(
  summary: ResultSummary | undefined,
  connection: { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number }
): ResultScreenState {
  if (summary === undefined) {
    const offline = !connection.isWebSocketConnected && (connection.hasEverConnected || connection.connectionRetries > 0);
    return offline ? { kind: "offline" } : { kind: "loading" };
  }
  if (summary.status !== "ready") return { kind: "missing" };
  return { kind: "ready", view: screeningOutcomeView(summary.outcome) };
}
