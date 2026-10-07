import { describe, expect, it } from "vitest";
import { getCompanionDisplayName, DEFAULT_COMPANION_NAME } from "./companionName";

describe("companion display name", () => {
  it("defaults to Emoty as the canonical companion name", () => {
    expect(DEFAULT_COMPANION_NAME).toBe("Emoty");
    expect(getCompanionDisplayName(undefined)).toBe("Emoty");
    expect(getCompanionDisplayName(null)).toBe("Emoty");
    expect(getCompanionDisplayName("   ")).toBe("Emoty");
  });

  it("uses the configured companion name when provided by the user", () => {
    expect(getCompanionDisplayName("Bro")).toBe("Bro");
    expect(getCompanionDisplayName("Buddy")).toBe("Buddy");
    expect(getCompanionDisplayName("Broksi")).toBe("Broksi");
    expect(getCompanionDisplayName(" Luna ")).toBe("Luna");
  });
});
