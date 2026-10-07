export type MitraNextActionType = "checkin" | "emotion_followup" | "goal_suggestion" | "all_caught_up";

export interface MitraActionState {
  hasCheckedInToday: boolean;
  hasLoggedEmotionToday: boolean;
  dismissedEmotionFollowup: boolean;
  suggestedGoalStatus?: string | null;
  dismissedGoalFollowup: boolean;
}

/** Keeps Home's existing Phase 5 priority order in one testable decision. */
export function getCurrentMitraAction(state: MitraActionState): MitraNextActionType {
  if (!state.hasCheckedInToday) return "checkin";
  if (!state.hasLoggedEmotionToday && !state.dismissedEmotionFollowup) return "emotion_followup";
  if (state.suggestedGoalStatus && state.suggestedGoalStatus !== "all_completed" && !state.dismissedGoalFollowup) {
    return "goal_suggestion";
  }
  return "all_caught_up";
}
