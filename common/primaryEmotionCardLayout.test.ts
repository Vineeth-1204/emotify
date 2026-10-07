import { describe, expect, it } from "vitest";
import { PRIMARY_EMOTIONS } from "./emotionTaxonomy";
import {
  PRIMARY_EMOTION_CARD_DESCRIPTIONS,
  PRIMARY_EMOTION_CARD_MIN_HEIGHT,
} from "./primaryEmotionCardLayout";

describe("primary emotion card layout content", () => {
  it("covers each canonical primary emotion with concise plain-language copy", () => {
    expect(Object.keys(PRIMARY_EMOTION_CARD_DESCRIPTIONS).sort()).toEqual(
      PRIMARY_EMOTIONS.map(({ id }) => id).sort(),
    );
    expect(Object.values(PRIMARY_EMOTION_CARD_DESCRIPTIONS).every((text) => text.length <= 24)).toBe(true);
  });

  it("uses one consistent minimum card height", () => {
    expect(PRIMARY_EMOTION_CARD_MIN_HEIGHT).toBeGreaterThanOrEqual(160);
  });
});
