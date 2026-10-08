import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PRIMARY_EMOTIONS } from "./emotionTaxonomy";
import {
  PRIMARY_EMOTION_CARD_DESCRIPTIONS,
  PRIMARY_EMOTION_CARD_MIN_HEIGHT,
  primaryEmotionCardSelectedColors,
  solidTint,
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

describe("primary emotion card selected style", () => {
  it("solidTint blends over white into an opaque colour", () => {
    expect(solidTint("#EAB308", 0)).toBe("#FFFFFF");
    expect(solidTint("#EAB308", 1)).toBe("#EAB308");
    expect(solidTint("#3B82F6", 0.08)).toMatch(/^#[0-9A-F]{6}$/);
    expect(solidTint("not-a-colour", 0.5)).toBe("#FFFFFF");
  });

  it("every emotion's selected card uses the same opaque recipe", () => {
    for (const { id, themeColor } of PRIMARY_EMOTIONS) {
      const c = primaryEmotionCardSelectedColors(themeColor);
      expect(c.borderColor, id).toBe(themeColor);
      // 6-digit hex = no alpha channel, so Android elevation cannot show through
      expect(c.backgroundColor, id).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.iconBackgroundColor, id).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("the Emotion Map cards use it, keep one elevation, and do not fade on press", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/tools/emotion-map.tsx"), "utf-8");
    expect(screen).toContain("primaryEmotionCardSelectedColors(emotion.themeColor)");
    expect(screen).not.toContain('backgroundColor: emotion.themeColor + "10"');
    const selectedStyle = screen.slice(screen.indexOf("  primaryCardSelected: {"), screen.indexOf("  primaryCardPressed: {"));
    expect(selectedStyle).not.toMatch(/shadows|elevation/);
    expect(screen).toContain("pressed && styles.primaryCardPressed");
  });
});
