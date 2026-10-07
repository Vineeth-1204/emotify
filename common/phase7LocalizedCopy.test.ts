import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import hi from "../i18n/locales/hi.json";
import ta from "../i18n/locales/ta.json";
import te from "../i18n/locales/te.json";

const locales = [en, hi, ta, te] as const;

describe("Phase 7 localized student-facing copy", () => {
  it.each(locales)("uses personalized companion and emotion-feature labels", (copy) => {
    expect(copy.tools.howImFeelingTitle).toBeTruthy();
    expect(copy.tools.howImFeelingTitle).not.toMatch(/emotion\s*map/i);
    expect(copy.tools.companionNameTitle).toContain("{{companionName}}");
    expect(copy.tools.companionNameDesc).toContain("{{companionName}}");
    expect(copy.home.goalSuggestedCopy).toContain("{{companionName}}");
    expect(copy.profile.companionPersonalizedSubtitle).not.toMatch(/AI\s+companion/i);
    expect(copy.companion.emergencyBannerSupportDesc).toContain("{{name}}");
  });

  it("uses short, non-system copy for the completed daily check-in", () => {
    for (const copy of locales) {
      expect(copy.home.checkInCompactTitle).toBeTruthy();
      expect(copy.home.checkInMoodToday).toContain("{{mood}}");
    }
    expect(en.home.checkInMoodToday).not.toMatch(/logged|recorded|submitted/i);
  });
});
