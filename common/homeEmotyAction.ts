/**
 * Emoty's next step on Home: one suggestion at a time, decided by fixed rules (no AI).
 *
 * Priority (first match wins):
 *   1. checkin              - no check-in today
 *   2. emotion_followup     - checked in, no emotion explored today
 *   3. calm_tool            - today's check-in was low/heavy and no calming exercise today
 *   4. reframe              - low/heavy check-ins on 2+ of the last 3 days, no reframe in 3 days
 *   5. goal_suggestion      - Emoty's micro-goal for today is waiting
 *   6. appointment_reminder - a confirmed appointment today or tomorrow
 *   7. all_caught_up
 * Steps 2-6 can be put off with "Not now" for the rest of the day.
 * Safety: when the student's safety status is elevated or in crisis, the guide adds no new
 * suggestions (3, 4, 6); Home's existing support options and Phase 5 behaviour stay as they were.
 */
export type EmotyNextActionType =
  | "checkin"
  | "emotion_followup"
  | "calm_tool"
  | "reframe"
  | "goal_suggestion"
  | "appointment_reminder"
  | "all_caught_up";

export type EmotyCalmTool = "breathing" | "grounding";

/** Signals from the server (convex/emotyGuide.ts getMyGuideSignals). */
export interface EmotyGuideSignals {
  todayMood: string | null;
  calmToolDoneToday: boolean;
  reframeDoneRecently: boolean;
  /** Days among today and the two before with a low or heavy check-in. */
  lowMoodDays: number;
  appointmentSoon: "today" | "tomorrow" | null;
  /** Actions put off with "Not now" today. */
  dismissed: string[];
}

export interface EmotyHomeActionState {
  hasCheckedInToday: boolean;
  hasLoggedEmotionToday: boolean;
  dismissedEmotionFollowup: boolean;
  suggestedGoalStatus?: string | null;
  dismissedGoalFollowup: boolean;
  /** Absent (or still loading): only the original Phase 5 steps are considered. */
  guide?: EmotyGuideSignals | null;
  /** Elevated support or crisis: no new suggestions. */
  safetyElevated?: boolean;
}

export interface EmotyNextStep {
  action: EmotyNextActionType;
  tool?: EmotyCalmTool;
}

/** Actions a student may put off for the day. The server accepts only these. */
export const EMOTY_DISMISSIBLE_ACTIONS: readonly EmotyNextActionType[] = [
  "emotion_followup",
  "calm_tool",
  "reframe",
  "goal_suggestion",
  "appointment_reminder",
];

/** Check-in moods (current and legacy values) that count as a low or heavy day. */
const LOW_MOODS = new Set(["low", "sad", "heavy", "worried"]);
const HEAVY_MOODS = new Set(["heavy", "worried"]);

export function isLowMood(mood: string | null | undefined): boolean {
  return !!mood && LOW_MOODS.has(mood);
}

/** Heavy days get grounding (steadying); low days get paced breathing. */
export function calmToolFor(mood: string | null | undefined): EmotyCalmTool {
  return mood && HEAVY_MOODS.has(mood) ? "grounding" : "breathing";
}

/** Screens each step opens. */
export const EMOTY_STEP_ROUTES = {
  breathing: "/(auth)/tools/breathing",
  grounding: "/(auth)/tools/grounding",
  reframe: "/(auth)/tools/reframe",
  appointments: "/(auth)/tools/appointments",
} as const;

export function getEmotyNextStep(state: EmotyHomeActionState): EmotyNextStep {
  const guide = state.guide ?? null;
  const dismissed = new Set(guide?.dismissed ?? []);
  const newSuggestions = !!guide && !state.safetyElevated;

  if (!state.hasCheckedInToday) return { action: "checkin" };
  if (!state.hasLoggedEmotionToday && !state.dismissedEmotionFollowup && !dismissed.has("emotion_followup")) {
    return { action: "emotion_followup" };
  }
  if (newSuggestions && isLowMood(guide.todayMood) && !guide.calmToolDoneToday && !dismissed.has("calm_tool")) {
    return { action: "calm_tool", tool: calmToolFor(guide.todayMood) };
  }
  if (newSuggestions && guide.lowMoodDays >= 2 && !guide.reframeDoneRecently && !dismissed.has("reframe")) {
    return { action: "reframe" };
  }
  if (
    state.suggestedGoalStatus &&
    state.suggestedGoalStatus !== "all_completed" &&
    !state.dismissedGoalFollowup &&
    !dismissed.has("goal_suggestion")
  ) {
    return { action: "goal_suggestion" };
  }
  if (newSuggestions && guide.appointmentSoon && !dismissed.has("appointment_reminder")) {
    return { action: "appointment_reminder" };
  }
  return { action: "all_caught_up" };
}

/** Keeps Home's existing Phase 5 priority order in one testable decision. */
export function getCurrentEmotyAction(state: EmotyHomeActionState): EmotyNextActionType {
  return getEmotyNextStep(state).action;
}
