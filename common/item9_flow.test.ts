import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { outcomeForTriageLevel } from "./screeningOutcome";

const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../i18n/locales/en.json"), "utf-8"));
const screeningResultCode = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/screening-result.tsx"), "utf-8");

describe("Phase 1: Item 9 Safety Protocol and Trusted Adult Flow", () => {
  test("suicide_flag triage level maps directly to immediate_safety presentation outcome", () => {
    expect(outcomeForTriageLevel("suicide_flag")).toBe("immediate_safety");
  });

  test("Item 9 trusted-adult dialogue wording matches specification verbatim", () => {
    const trusted = en.screening.result.trustedAdult;
    expect(trusted.question).toBe(
      "Thank you for being honest with us — that's really brave. Sometimes big feelings can feel really hard to carry. A caring adult will reach out to talk with you very soon. Right now, is there a grown-up nearby you trust — like a parent, teacher, or family member?"
    );
    expect(trusted.yesButton).toBe("Yes, I can talk to someone");
    expect(trusted.needHelpButton).toBe("I need help finding someone");
    expect(trusted.calmBridge).toBe("While we figure out the next step together, would you like to try a calm activity right now?");
    expect(trusted.calmBridgeYes).toBe("Yes, let's try something");
    expect(trusted.calmBridgeNo).toBe("Not right now");
    expect(trusted.declined).toBe("That's totally okay. The calm tools will be here whenever you're ready — no rush at all. 🌿");
  });

  test("trusted adult dialogue copy contains no punitive or clinical jargon", () => {
    const trusted = en.screening.result.trustedAdult;
    const text = Object.values(trusted).join(" ");
    const FORBIDDEN = /suicid|emergency|crisis|danger|self-harm|abnormal|locked|failed|punish|fault/i;
    expect(text).not.toMatch(FORBIDDEN);
  });

  test("screening-result.tsx wires the trusted adult buttons and calm bridge without dead-ends", () => {
    expect(screeningResultCode).toContain("trustedAdult.question");
    expect(screeningResultCode).toContain("trustedAdult.yesButton");
    expect(screeningResultCode).toContain("trustedAdult.needHelpButton");
    expect(screeningResultCode).toContain("trustedAdult.calmBridge");
    expect(screeningResultCode).toContain("trustedAdult.calmBridgeYes");
    expect(screeningResultCode).toContain("trustedAdult.calmBridgeNo");
    expect(screeningResultCode).toContain("trustedAdult.declined");
    expect(screeningResultCode).toContain("/(auth)/tools/emotion-map");
  });
});
