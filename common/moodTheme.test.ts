import { describe, expect, test } from "vitest";
import { resolveMoodThemeKey, themeKeyForCheckinMood, themeKeyForEmotionLog } from "./moodTheme";
import { EmotionPalettes } from "../constants/Colors";
import { SECONDARY_EMOTIONS_BY_PRIMARY } from "./emotionTaxonomy";

const ALARMING = ["anger", "fearful", "disgusted"];

describe("mood theme follows the student's explicit mood", () => {
  test("daily check-in moods map to existing, gentle palettes", () => {
    expect(themeKeyForCheckinMood("good")).toBe("happy");
    expect(themeKeyForCheckinMood("calm")).toBe("calm");
    expect(themeKeyForCheckinMood("low")).toBe("sad");
    expect(themeKeyForCheckinMood("heavy")).toBe("peaceful");
    expect(themeKeyForCheckinMood(undefined)).toBeNull();
    for (const mood of ["good", "calm", "low", "heavy"]) {
      expect(EmotionPalettes[themeKeyForCheckinMood(mood)!]).toBeDefined();
    }
  });

  test("Emotion Map entries map via their primary emotion, including every secondary feeling", () => {
    expect(themeKeyForEmotionLog({ emotion: "happy" })).toBe("happy");
    expect(themeKeyForEmotionLog({ emotion: "Lonely", selectedEmotions: ["sad", "Lonely"] })).toBe("sad");
    expect(themeKeyForEmotionLog({ emotion: "Frustrated" })).toBe("peaceful");
    for (const secondaries of Object.values(SECONDARY_EMOTIONS_BY_PRIMARY)) {
      for (const s of secondaries.filter((x) => x !== "Not sure")) {
        const key = themeKeyForEmotionLog({ emotion: s });
        expect(key, s).not.toBeNull();
        expect(EmotionPalettes[key!], s).toBeDefined();
      }
    }
  });

  test("difficult moods never produce red or near-black palettes", () => {
    const inputs = [
      ...["good", "calm", "low", "heavy"].map((m) => themeKeyForCheckinMood(m)),
      ...["angry", "sad", "anger", "fearful", "disgusted", "Overwhelmed", "Hopeless"].map((e) => themeKeyForEmotionLog({ emotion: e })),
    ];
    for (const key of inputs) expect(ALARMING).not.toContain(key);
  });

  test("the most recent explicit mood wins; no mood means the default theme", () => {
    const checkin = { mood: "low", createdAt: 2_000 };
    expect(resolveMoodThemeKey({ todayCheckin: checkin, latestEmotionLog: { emotion: "happy", createdAt: 1_000 } })).toBe("sad");
    expect(resolveMoodThemeKey({ todayCheckin: checkin, latestEmotionLog: { emotion: "happy", createdAt: 3_000 } })).toBe("happy");
    expect(resolveMoodThemeKey({ todayCheckin: checkin, latestEmotionLog: null })).toBe("sad");
    expect(resolveMoodThemeKey({ todayCheckin: null, latestEmotionLog: { emotion: "calm", createdAt: 1 } })).toBe("calm");
    expect(resolveMoodThemeKey({ todayCheckin: null, latestEmotionLog: null })).toBeNull();
    expect(resolveMoodThemeKey({ todayCheckin: undefined, latestEmotionLog: undefined })).toBeNull();
  });
});
