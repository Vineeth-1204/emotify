import { describe, expect, test } from "vitest";
import { getCurrentEmotyAction } from "./homeEmotyAction";

const ready = {
  hasCheckedInToday: true,
  hasLoggedEmotionToday: true,
  dismissedEmotionFollowup: false,
  suggestedGoalStatus: "suggested",
  dismissedGoalFollowup: false,
};

describe("Phase 5 Home next-action priority", () => {
  test("asks for the daily check-in first", () => {
    expect(getCurrentEmotyAction({ ...ready, hasCheckedInToday: false })).toBe("checkin");
  });

  test("keeps the emotion follow-up ahead of the suggested task", () => {
    expect(getCurrentEmotyAction({ ...ready, hasLoggedEmotionToday: false })).toBe("emotion_followup");
  });

  test("shows the existing suggested goal after the emotion follow-up is complete or dismissed", () => {
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "suggested" })).toBe("goal_suggestion");
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "active" })).toBe("goal_suggestion");
  });

  test("uses the existing caught-up state when the goal is complete or deferred", () => {
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "all_completed" })).toBe("all_caught_up");
    expect(getCurrentEmotyAction({ ...ready, dismissedGoalFollowup: true })).toBe("all_caught_up");
  });
});
