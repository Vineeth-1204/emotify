import { describe, expect, test } from "vitest";
import { getCurrentMitraAction } from "./homeMitraAction";

const ready = {
  hasCheckedInToday: true,
  hasLoggedEmotionToday: true,
  dismissedEmotionFollowup: false,
  suggestedGoalStatus: "suggested",
  dismissedGoalFollowup: false,
};

describe("Phase 5 Home next-action priority", () => {
  test("asks for the daily check-in first", () => {
    expect(getCurrentMitraAction({ ...ready, hasCheckedInToday: false })).toBe("checkin");
  });

  test("keeps the emotion follow-up ahead of the suggested task", () => {
    expect(getCurrentMitraAction({ ...ready, hasLoggedEmotionToday: false })).toBe("emotion_followup");
  });

  test("shows the existing suggested goal after the emotion follow-up is complete or dismissed", () => {
    expect(getCurrentMitraAction({ ...ready, suggestedGoalStatus: "suggested" })).toBe("goal_suggestion");
    expect(getCurrentMitraAction({ ...ready, suggestedGoalStatus: "active" })).toBe("goal_suggestion");
  });

  test("uses the existing caught-up state when the goal is complete or deferred", () => {
    expect(getCurrentMitraAction({ ...ready, suggestedGoalStatus: "all_completed" })).toBe("all_caught_up");
    expect(getCurrentMitraAction({ ...ready, dismissedGoalFollowup: true })).toBe("all_caught_up");
  });
});
