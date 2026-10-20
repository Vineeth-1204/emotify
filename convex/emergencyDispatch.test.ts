import { describe, expect, test } from "vitest";
import {
  EMERGENCY_NOTICE_TEXT,
  validatePhoneNumber,
  formatEmergencyAlertMessage,
} from "./emergencyDispatch";

describe("Phase 2: Emergency Contact External Dispatch", () => {
  test("privacy-safe message contains no clinical scores, screening answers or diagnostic labels", () => {
    const text = formatEmergencyAlertMessage();
    expect(text).toBe(EMERGENCY_NOTICE_TEXT);
    const FORBIDDEN = /suicid|depression|gad-7|phq-9|score|triage|psychos|attempt|diagnosis|cut-off/i;
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).toContain("Tele-MANAS");
    expect(text).toContain("14416");
    expect(text).toContain("Emotify Care Notice");
  });

  test("phone number validator accepts valid formats and rejects invalid ones", () => {
    expect(validatePhoneNumber("9811223344")).toBe(true);
    expect(validatePhoneNumber("+919811223344")).toBe(true);
    expect(validatePhoneNumber("+1-800-555-0199")).toBe(true);
    expect(validatePhoneNumber("(555) 234-5678")).toBe(true);

    expect(validatePhoneNumber(null)).toBe(false);
    expect(validatePhoneNumber(undefined)).toBe(false);
    expect(validatePhoneNumber("")).toBe(false);
    expect(validatePhoneNumber("123")).toBe(false); // Too short
    expect(validatePhoneNumber("phone_number")).toBe(false);
  });
});
