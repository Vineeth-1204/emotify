import { describe, expect, test } from "vitest";
import {
  getDailyCheckinNextStep,
  getEmotionMapPrimaryForDailyMood,
  validateContextualPrimary,
} from "./phase6EmotionEntry";

describe("Phase 6 daily mood to Emotion Map entry", () => {
  test.each([
    ["good", "happy"],
    ["calm", "calm"],
    ["low", "sad"],
    ["heavy", "sad"],
  ] as const)("maps %s through the existing primary taxonomy", (mood, expected) => {
    expect(getEmotionMapPrimaryForDailyMood(mood)).toBe(expected);
  });

  test("preserves Heavy as a daily mood while using Sad as its existing taxonomy entry", () => {
    expect(getEmotionMapPrimaryForDailyMood("heavy")).toBe("sad");
    expect(getEmotionMapPrimaryForDailyMood("unknown-mood")).toBeNull();
  });

  test("new check-ins continue into contextual emotion flow, while updates stay on Home", () => {
    expect(getDailyCheckinNextStep("low", false)).toEqual({
      kind: "open_emotion_flow",
      primaryEmotion: "sad",
    });
    expect(getDailyCheckinNextStep("heavy", false)).toEqual({
      kind: "open_emotion_flow",
      primaryEmotion: "sad",
    });
    expect(getDailyCheckinNextStep("good", true)).toEqual({ kind: "stay_home" });
  });

  test.each(["happy", "sad", "angry", "calm"] as const)(
    "accepts canonical contextual primary %s",
    (primary) => expect(validateContextualPrimary(primary)).toBe(primary),
  );

  test("rejects invalid or repeated route parameters so standalone flow starts at Step 1", () => {
    expect(validateContextualPrimary(undefined)).toBeNull();
    expect(validateContextualPrimary("worried")).toBeNull();
    expect(validateContextualPrimary(["sad", "happy"])).toBeNull();
  });
});
