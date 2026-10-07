import { describe, expect, test } from "vitest";
import {
  COMPANION_QUICK_ACTIONS,
  getQuickActionFallback,
  getQuickActionModelGuidance,
} from "./companionQuickActions";

describe("Phase 7 companion quick actions", () => {
  test("keeps all four quick actions distinguishable", () => {
    expect(COMPANION_QUICK_ACTIONS).toEqual([
      "continue_conversation",
      "breathing_support",
      "reflection",
      "gratitude",
    ]);
  });

  test("uses different action-specific fallbacks", () => {
    const replies = COMPANION_QUICK_ACTIONS.map((action) => getQuickActionFallback(action, "en"));
    expect(new Set(replies).size).toBe(4);
    expect(replies[0]).toContain("what you just shared");
    expect(replies[1]).toContain("breathing break");
    expect(replies[2]).toContain("pause and look");
    expect(replies[3]).toContain("one small thing");
  });

  test("gives the model different guidance for Breathe, Reflect, and Gratitude", () => {
    const guidance = (["breathing_support", "reflection", "gratitude"] as const).map(getQuickActionModelGuidance);
    expect(new Set(guidance).size).toBe(3);
    expect(guidance[0]).toContain("breathing activity");
    expect(guidance[1]).toContain("gentle question");
    expect(guidance[2]).toContain("appreciate");
  });

  test.each(["en", "hi", "ta", "te"])("has action-specific localized fallbacks for %s", (language) => {
    const replies = COMPANION_QUICK_ACTIONS.map((action) => getQuickActionFallback(action, language));
    expect(new Set(replies).size).toBe(4);
  });

  test("falls back to English for an unsupported language", () => {
    expect(getQuickActionFallback("gratitude", "fr")).toContain("one small thing");
  });
});
