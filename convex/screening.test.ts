/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  scorePHQ9Responses,
  scoreGAD7Responses,
  scorePQ16Responses,
  scoreWSASResponses,
  scoreReQoL10Responses,
  evaluateClinicalTriage,
} from "./clinicalScoring";

const modules = import.meta.glob("./**/*.ts");

// Helper to generate full PHQ-9 responses with custom item values
function makePHQ9Responses(itemValues: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 0]): Record<string, number> {
  const res: Record<string, number> = {};
  itemValues.forEach((val, idx) => {
    res[`phq9_q${idx + 1}`] = val;
  });
  return res;
}

// Helper to generate full GAD-7 responses
function makeGAD7Responses(itemValues: number[] = [1, 1, 1, 1, 1, 1, 1]): Record<string, number> {
  const res: Record<string, number> = {};
  itemValues.forEach((val, idx) => {
    res[`gad7_q${idx + 1}`] = val;
  });
  return res;
}

// Helper to generate full PQ-16 responses
function makePQ16Responses(yesCount = 0): Record<string, number> {
  const res: Record<string, number> = {};
  for (let i = 1; i <= 16; i++) {
    res[`pq16_q${i}`] = i <= yesCount ? 1 : 0;
  }
  return res;
}

describe("Priority 3: Clinical Screening Architecture Suite", () => {
  // TEST 1: PHQ-9 answers produce correct score
  test("1. PHQ-9 answers produce correct score and severity", () => {
    const responses = makePHQ9Responses([3, 2, 2, 1, 0, 1, 2, 1, 0]); // sum = 12
    const result = scorePHQ9Responses(responses);

    expect(result.administered).toBe(true);
    expect(result.score).toBe(12);
    expect(result.maxScore).toBe(27);
    expect(result.severity).toBe("Moderate Depression");
    expect(result.level).toBe("moderate");
    expect(result.item9Score).toBe(0);
    expect(result.item9Flag).toBe(false);
  });

  // TEST 2: GAD-7 answers produce correct score
  test("2. GAD-7 answers produce correct score and severity", () => {
    const responses = makeGAD7Responses([3, 3, 2, 2, 2, 1, 2]); // sum = 15
    const result = scoreGAD7Responses(responses);

    expect(result.administered).toBe(true);
    expect(result.score).toBe(15);
    expect(result.maxScore).toBe(21);
    expect(result.severity).toBe("Severe Anxiety");
    expect(result.level).toBe("severe");
  });

  // TEST 3: PQ-16 is actually administered
  test("3. PQ-16 is actually administered and scored", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_pq16_active",
    });

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_pq16_active",
      responses: {
        phq9: makePHQ9Responses(),
        gad7: makeGAD7Responses(),
        pq16: makePQ16Responses(7), // 7 affirmative answers
      },
    });

    expect(attempt.results.pq16.administered).toBe(true);
    expect(attempt.results.pq16.score).toBe(7);
    expect(attempt.psychosisFlag).toBe(true);
    expect(attempt.triageLevel).toBe("psychosis_flag");
  });

  // TEST 4: PQ-16 is no longer hardcoded to zero
  test("4. PQ-16 is no longer hardcoded to zero in database records", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_pq16_nonzero",
    });

    await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_pq16_nonzero",
      responses: {
        phq9: makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(4), // 4 affirmative items
      },
    });

    // Check latest legacy screening mirror (consumed by counselor dashboard)
    const latestScreening = await t.query(api.screening.getLatest, {
      userId: "student_pq16_nonzero",
    });

    expect(latestScreening).toBeDefined();
    expect(latestScreening?.pq16_total).toBe(4); // MUST NOT BE 0!
    expect(latestScreening?.pq16_total).not.toBe(0);
  });

  // TEST 5: Item-level answers are persisted
  test("5. Item-level answers are persisted in screeningAttempts", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_item_level",
    });

    const phq9Items = [2, 1, 0, 3, 1, 2, 0, 1, 1];
    const gad7Items = [1, 2, 1, 0, 2, 1, 1];
    const phq9Resp = makePHQ9Responses(phq9Items);
    const gad7Resp = makeGAD7Responses(gad7Items);
    const pq16Resp = makePQ16Responses(2);

    const submission = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_item_level",
      responses: {
        phq9: phq9Resp,
        gad7: gad7Resp,
        pq16: pq16Resp,
      },
    });

    const attempt = await t.query(api.screening.getAttemptById, {
      attemptId: submission.attemptId,
    });

    expect(attempt).toBeDefined();
    expect(attempt?.responses.phq9).toEqual(phq9Resp);
    expect(attempt?.responses.gad7).toEqual(gad7Resp);
    expect(attempt?.responses.pq16).toEqual(pq16Resp);
  });

  // TEST 6: Multiple screening attempts do not overwrite each other
  test("6. Multiple screening attempts do not overwrite previous records", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_multi_attempt",
    });

    // Attempt 1: Low symptoms
    const attempt1 = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_multi_attempt",
      responses: {
        phq9: makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(0),
      },
    });

    // Attempt 2: Higher symptoms
    const attempt2 = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_multi_attempt",
      responses: {
        phq9: makePHQ9Responses([2, 2, 2, 2, 2, 1, 1, 1, 0]),
        gad7: makeGAD7Responses([1, 1, 1, 1, 1, 1, 1]),
        pq16: makePQ16Responses(1),
      },
    });

    const allAttempts = await t.query(api.screening.getAllAttempts, {
      userId: "student_multi_attempt",
    });

    expect(allAttempts).toHaveLength(2);
    expect(allAttempts[0]._id).toBe(attempt2.attemptId);
    expect(allAttempts[1]._id).toBe(attempt1.attemptId);
    expect(allAttempts[1].results.phq9.score).toBe(0);
    expect(allAttempts[0].results.phq9.score).toBe(13);
  });

  // TEST 7: Invalid question IDs are rejected
  test("7. Invalid question IDs or missing items are rejected", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_invalid_q",
    });

    // Invalid: Only 8 of 9 questions answered for PHQ-9
    const incompletePHQ9: Record<string, number> = {
      phq9_q1: 1,
      phq9_q2: 1,
      phq9_q3: 1,
      phq9_q4: 1,
      phq9_q5: 1,
      phq9_q6: 1,
      phq9_q7: 1,
      phq9_q8: 1,
      // phq9_q9 missing
    };

    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: "student_invalid_q",
        responses: {
          phq9: incompletePHQ9,
          gad7: makeGAD7Responses(),
          pq16: makePQ16Responses(),
        },
      })
    ).rejects.toThrow(/PHQ-9 requires all 9 questions/);

    // Invalid: Score out of range (value 5 when max allowed option is 3)
    const outOfRangePHQ9 = makePHQ9Responses([5, 1, 1, 1, 1, 1, 1, 1, 0]);
    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: "student_invalid_q",
        responses: {
          phq9: outOfRangePHQ9,
          gad7: makeGAD7Responses(),
          pq16: makePQ16Responses(),
        },
      })
    ).rejects.toThrow(/between 0 and 3/);
  });

  // TEST 8: Invalid instrument responses are rejected
  test("8. Invalid PQ-16 responses (e.g. non-binary) are rejected", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_invalid_pq16",
    });

    // PQ-16 only accepts 0 or 1
    const invalidPQ16 = makePQ16Responses(0);
    invalidPQ16.pq16_q1 = 3;

    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: "student_invalid_pq16",
        responses: {
          phq9: makePHQ9Responses(),
          gad7: makeGAD7Responses(),
          pq16: invalidPQ16,
        },
      })
    ).rejects.toThrow(/PQ-16 Question 1: must be 0 \(No\) or 1 \(Yes\)/);
  });

  // TEST 9: Client-submitted aggregate score cannot override backend scoring
  test("9. Backend calculates authoritative scores independently of any client assumptions", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_auth_calc",
    });

    // Answers sum to 18 (moderately severe depression)
    const responses = makePHQ9Responses([2, 2, 2, 2, 2, 2, 2, 2, 2]);

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_auth_calc",
      responses: {
        phq9: responses,
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(0),
      },
    });

    // Server authoritatively calculates total = 18 and moderately_severe band
    expect(attempt.results.phq9.score).toBe(18);
    expect(attempt.results.phq9.severity).toBe("Moderately Severe Depression");
    expect(attempt.results.phq9.level).toBe("moderately_severe");
  });

  // TEST 10: Item 9 safety signal remains available to triage
  test("10. PHQ-9 Item 9 triggers immediate suicide_flag and alert", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_item9_flag",
    });

    // Item 9 has score 2 (> 0)
    const responses = makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 2]);

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_item9_flag",
      responses: {
        phq9: responses,
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(0),
      },
    });

    expect(attempt.suicideFlag).toBe(true);
    expect(attempt.triageLevel).toBe("suicide_flag");
    expect(attempt.results.phq9.item9Flag).toBe(true);
    expect(attempt.results.phq9.item9Score).toBe(2);
  });

  // TEST 11: Missing WSAS content is not presented as a completed questionnaire
  test("11. Missing WSAS content is not presented as a completed questionnaire", () => {
    const emptyResult = scoreWSASResponses(undefined);
    expect(emptyResult.administered).toBe(false);
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.severity).toBe("Not Administered (Pending Approved Content)");
  });

  // TEST 12: Missing ReQoL content is not presented as a completed questionnaire
  test("12. Missing ReQoL-10 content is not presented as a completed questionnaire", () => {
    const emptyResult = scoreReQoL10Responses(undefined);
    expect(emptyResult.administered).toBe(false);
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.severity).toBe("Not Administered (Pending Approved Content)");
  });

  // TEST 13: Existing legacy screening records remain readable
  test("13. Legacy screening records remain fully readable", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_legacy_read",
    });

    // Insert a legacy record using legacy submitScreening
    await t.mutation(api.screening.submitScreening, {
      userId: "student_legacy_read",
      phq9_total: 8,
      gad7_total: 6,
      pq16_total: 0,
      phq9_item9_flag: false,
      phq9_item9_score: 0,
    });

    const latest = await t.query(api.screening.getLatest, {
      userId: "student_legacy_read",
    });
    expect(latest).toBeDefined();
    expect(latest?.phq9_total).toBe(8);
    expect(latest?.gad7_total).toBe(6);

    const all = await t.query(api.screening.getAll, {
      userId: "student_legacy_read",
    });
    expect(all).toHaveLength(1);
  });

  // TEST 14: Screening completion is not granted when required instruments have not actually been administered
  test("14. Screening completion is rejected when required instruments are missing", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_incomplete_screening",
    });

    // Attempting to submit without PQ-16 responses
    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: "student_incomplete_screening",
        responses: {
          phq9: makePHQ9Responses(),
          gad7: makeGAD7Responses(),
          pq16: {} as any, // Missing PQ-16
        },
      })
    ).rejects.toThrow(/PQ-16/);
  });
});
