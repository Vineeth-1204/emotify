import { describe, expect, test } from "vitest";
import {
  PSS10_CONFIG,
  getPSS10Severity,
  scorePSS10Responses,
  evaluateClinicalTriage,
} from "./clinicalScoring";
import { interpretPSS10, scorePSS10 } from "../utils/scoring";

describe("PSS-10 Authoritative Clinical Scoring", () => {
  test("instrument configuration complies with specification", () => {
    expect(PSS10_CONFIG.questionCount).toBe(10);
    expect(PSS10_CONFIG.minOptionValue).toBe(0);
    expect(PSS10_CONFIG.maxOptionValue).toBe(4);
    expect(PSS10_CONFIG.maxScore).toBe(40);
    expect(PSS10_CONFIG.reverseItems).toEqual([4, 5, 7, 8]);
  });

  test("minimum stress (all normal=0, all reverse=4) scores 0 (Low Stress)", () => {
    // Normal items: 1, 2, 3, 6, 9, 10 = 0
    // Reverse items: 4, 5, 7, 8 = 4 (reversed: 4 - 4 = 0)
    const responses: Record<string, number> = {
      pss10_q1: 0,
      pss10_q2: 0,
      pss10_q3: 0,
      pss10_q4: 4,
      pss10_q5: 4,
      pss10_q6: 0,
      pss10_q7: 4,
      pss10_q8: 4,
      pss10_q9: 0,
      pss10_q10: 0,
    };
    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(true);
    expect(result.score).toBe(0);
    expect(result.severity).toBe("Low Stress");
    expect(result.level).toBe("minimal");
  });

  test("maximum stress (all normal=4, all reverse=0) scores 40 (High Perceived Stress)", () => {
    // Normal items: 6 * 4 = 24
    // Reverse items: 4 * (4 - 0) = 16
    // Total = 40
    const responses: Record<string, number> = {
      pss10_q1: 4,
      pss10_q2: 4,
      pss10_q3: 4,
      pss10_q4: 0,
      pss10_q5: 0,
      pss10_q6: 4,
      pss10_q7: 0,
      pss10_q8: 0,
      pss10_q9: 4,
      pss10_q10: 4,
    };
    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(true);
    expect(result.score).toBe(40);
    expect(result.severity).toBe("High Perceived Stress");
    expect(result.level).toBe("severe");
  });

  test("all-zero responses correctly evaluates reverse items to score 16 (Moderate Stress)", () => {
    // 6 normal * 0 = 0. 4 reverse * (4 - 0) = 16. Total = 16.
    const responses: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) responses[`pss10_q${i}`] = 0;
    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(true);
    expect(result.score).toBe(16);
    expect(result.severity).toBe("Moderate Stress");
    expect(result.level).toBe("moderate");
  });

  test("all-four responses correctly evaluates reverse items to score 24 (Moderate Stress)", () => {
    // 6 normal * 4 = 24. 4 reverse * (4 - 4) = 0. Total = 24.
    const responses: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) responses[`pss10_q${i}`] = 4;
    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(true);
    expect(result.score).toBe(24);
    expect(result.severity).toBe("Moderate Stress");
    expect(result.level).toBe("moderate");
  });

  test("cutoff boundary 13 vs 14 distinguishes Low from Moderate", () => {
    expect(getPSS10Severity(13).severity).toBe("Low Stress");
    expect(getPSS10Severity(13).level).toBe("minimal");

    expect(getPSS10Severity(14).severity).toBe("Moderate Stress");
    expect(getPSS10Severity(14).level).toBe("moderate");
  });

  test("cutoff boundary 26 vs 27 distinguishes Moderate from High Perceived Stress", () => {
    expect(getPSS10Severity(26).severity).toBe("Moderate Stress");
    expect(getPSS10Severity(26).level).toBe("moderate");

    expect(getPSS10Severity(27).severity).toBe("High Perceived Stress");
    expect(getPSS10Severity(27).level).toBe("severe");
  });

  test("incomplete responses fail validation", () => {
    const responses: Record<string, number> = {
      pss10_q1: 2,
      pss10_q2: 2,
      pss10_q3: 2,
      // Missing items 4 to 10
    };
    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(false);
    expect(result.error).toContain("PSS-10 requires all 10 questions");
  });

  test("invalid response value out of 0-4 range fails validation", () => {
    const responses: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) responses[`pss10_q${i}`] = 2;
    responses.pss10_q5 = 5; // Invalid!

    const result = scorePSS10Responses(responses);
    expect(result.administered).toBe(false);
    expect(result.error).toContain("must be an integer between 0 and 4");
  });

  test("empty or unadministered responses returns clean unadministered result", () => {
    const result = scorePSS10Responses(undefined);
    expect(result.administered).toBe(false);
    expect(result.score).toBe(0);
    expect(result.severity).toBe("Not Administered");
  });
});

describe("Client-side PSS-10 Scoring Helpers", () => {
  test("client interpretPSS10 matches clinical thresholds", () => {
    expect(interpretPSS10(0).severity).toBe("Low Stress");
    expect(interpretPSS10(13).severity).toBe("Low Stress");
    expect(interpretPSS10(14).severity).toBe("Moderate Stress");
    expect(interpretPSS10(26).severity).toBe("Moderate Stress");
    expect(interpretPSS10(27).severity).toBe("High Perceived Stress");
    expect(interpretPSS10(40).severity).toBe("High Perceived Stress");
  });

  test("client scorePSS10 reverses items 4, 5, 7, 8 properly", () => {
    // 0-indexed: 3, 4, 6, 7 are reversed
    const allZero = new Array(10).fill(0);
    expect(scorePSS10(allZero).total).toBe(16);

    const allFour = new Array(10).fill(4);
    expect(scorePSS10(allFour).total).toBe(24);
  });
});

describe("Triage Integration with PSS-10", () => {
  test("High PSS-10 (>=27) promotes triage to severe and requires alert", () => {
    const triage = evaluateClinicalTriage({
      phq9Score: 4,
      item9Score: 0,
      gad7Score: 4,
      pq16Score: 0,
      pq16Administered: false,
      pss10Score: 28,
      pss10Administered: true,
    });
    expect(triage.level).toBe("severe");
    expect(triage.requiresAlert).toBe(true);
    expect(triage.alertType).toBe("severe");
  });

  test("Item 9 suicide flag always takes precedence over PSS-10", () => {
    const triage = evaluateClinicalTriage({
      phq9Score: 5,
      item9Score: 1,
      gad7Score: 3,
      pq16Score: 0,
      pq16Administered: false,
      pss10Score: 35,
      pss10Administered: true,
    });
    expect(triage.level).toBe("suicide_flag");
    expect(triage.suicideFlag).toBe(true);
    expect(triage.alertType).toBe("suicide");
  });
});
