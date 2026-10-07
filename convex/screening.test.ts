/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  scorePHQ9Responses,
  scoreGAD7Responses,
  scorePQ16Responses,
  evaluateClinicalTriage,
} from "./clinicalScoring";
import * as clinicalScoring from "./clinicalScoring";

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
    const uid_student_pq16_active = await testUserId(t, "student_pq16_active");

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_pq16_active,
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
    const uid_student_pq16_nonzero = await testUserId(t, "student_pq16_nonzero");

    await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_pq16_nonzero,
      responses: {
        phq9: makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(4), // 4 affirmative items
      },
    });

    // Check latest legacy screening mirror (consumed by counselor dashboard)
    const latestScreening = await t.query(api.screening.getLatest, {
      userId: uid_student_pq16_nonzero,
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
    const uid_student_item_level = await testUserId(t, "student_item_level");

    const phq9Items = [2, 1, 0, 3, 1, 2, 0, 1, 1];
    const gad7Items = [1, 2, 1, 0, 2, 1, 1];
    const phq9Resp = makePHQ9Responses(phq9Items);
    const gad7Resp = makeGAD7Responses(gad7Items);
    const pq16Resp = makePQ16Responses(2);

    const submission = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_item_level,
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
    const uid_student_multi_attempt = await testUserId(t, "student_multi_attempt");

    // Attempt 1: Low symptoms
    const attempt1 = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_multi_attempt,
      responses: {
        phq9: makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
        pq16: makePQ16Responses(0),
      },
    });

    // Attempt 2: Higher symptoms
    const attempt2 = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_multi_attempt,
      responses: {
        phq9: makePHQ9Responses([2, 2, 2, 2, 2, 1, 1, 1, 0]),
        gad7: makeGAD7Responses([1, 1, 1, 1, 1, 1, 1]),
        pq16: makePQ16Responses(1),
      },
    });

    const allAttempts = await t.query(api.screening.getAllAttempts, {
      userId: uid_student_multi_attempt,
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
    const uid_student_invalid_q = await testUserId(t, "student_invalid_q");

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
        userId: uid_student_invalid_q,
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
        userId: uid_student_invalid_q,
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
    const uid_student_invalid_pq16 = await testUserId(t, "student_invalid_pq16");

    // PQ-16 only accepts 0 or 1
    const invalidPQ16 = makePQ16Responses(0);
    invalidPQ16.pq16_q1 = 3;

    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: uid_student_invalid_pq16,
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
    const uid_student_auth_calc = await testUserId(t, "student_auth_calc");

    // Answers sum to 18 (moderately severe depression)
    const responses = makePHQ9Responses([2, 2, 2, 2, 2, 2, 2, 2, 2]);

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_auth_calc,
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
    const uid_student_item9_flag = await testUserId(t, "student_item9_flag");

    // Item 9 has score 2 (> 0)
    const responses = makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 2]);

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: uid_student_item9_flag,
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

  // TEST 11: WSAS and ReQoL-10 are not part of Emotify and have no scoring path
  test("11. WSAS and ReQoL-10 have no server-side scoring functions", () => {
    const exported = Object.keys(clinicalScoring).join(" ").toLowerCase();
    expect(exported).not.toMatch(/wsas|reqol/);
  });

  // TEST 12: Submissions carrying WSAS / ReQoL-10 responses are rejected outright
  test("12. Screening submission rejects WSAS and ReQoL-10 responses", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "student_retired_instruments" });
    const uid = await testUserId(t, "student_retired_instruments");
    const base = {
      phq9: makePHQ9Responses([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      gad7: makeGAD7Responses([0, 0, 0, 0, 0, 0, 0]),
      pq16: makePQ16Responses(0),
    };
    const wsas = { wsas_q1: 8, wsas_q2: 8, wsas_q3: 8, wsas_q4: 8, wsas_q5: 8 };
    await expect(
      t.mutation(api.screening.submitScreeningAttempt, { userId: uid, responses: { ...base, wsas } as any })
    ).rejects.toThrow();
    await expect(
      t.mutation(api.screening.submitScreeningAttempt, { userId: uid, responses: { ...base, reqol10: { reqol10_q1: 4 } } as any })
    ).rejects.toThrow();

    const ok: any = await t.mutation(api.screening.submitScreeningAttempt, { userId: uid, responses: base });
    expect(Object.keys(ok.results).sort()).toEqual(["gad7", "phq9", "pq16"]);
    const stored = await t.run(async (ctx) => ctx.db.get(ok.attemptId));
    expect(Object.keys((stored as any).instrumentVersions).sort()).toEqual(["gad7", "phq9", "pq16"]);
    expect(Object.keys((stored as any).results).sort()).toEqual(["gad7", "phq9", "pq16"]);
    expect(Object.keys((stored as any).responses).sort()).toEqual(["gad7", "phq9", "pq16"]);
  });

  // TEST 13: Existing legacy screening records remain readable
  test("13. Legacy screening records remain fully readable", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_legacy_read",
    });
    const uid_student_legacy_read = await testUserId(t, "student_legacy_read");

    // Seed a historical legacy record directly (the legacy writer has been removed)
    await t.run(async (ctx) => {
      await ctx.db.insert("screenings", {
        userId: uid_student_legacy_read,
        phq9_total: 8,
        gad7_total: 6,
        pq16_total: 0,
        phq9_item9_flag: false,
        phq9_item9_score: 0,
        createdAt: Date.now(),
      });
    });

    const latest = await t.query(api.screening.getLatest, {
      userId: uid_student_legacy_read,
    });
    expect(latest).toBeDefined();
    expect(latest?.phq9_total).toBe(8);
    expect(latest?.gad7_total).toBe(6);

    const all = await t.query(api.screening.getAll, {
      userId: uid_student_legacy_read,
    });
    expect(all).toHaveLength(1);
  });

  // TEST 14: Screening completion is not granted when required instruments have not actually been administered
  test("14. Screening completion is rejected when required instruments are missing", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_incomplete_screening",
    });
    const uid_student_incomplete_screening = await testUserId(t, "student_incomplete_screening");

    // Attempting to submit without PQ-16 responses
    await expect(
      t.mutation(api.screening.submitScreeningAttempt, {
        userId: uid_student_incomplete_screening,
        responses: {
          phq9: makePHQ9Responses(),
          gad7: makeGAD7Responses(),
          pq16: {} as any, // Missing PQ-16
        },
      })
    ).rejects.toThrow(/PQ-16/);
  });

  // TEST 15: Canonical user identity and patientId resolution in submitScreeningAttempt
  test("15. Canonical user identity resolves patientId authoritatively from users._id without clerkId", async () => {
    const t = convexTest(schema, modules);

    // Register a modern student via registerStudent
    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Rahul Verma",
      mobile_number: "9811223344",
      password: "Password123!",
      email: "rahul@campus.edu",
    });

    const studentId = regRes.user!.id;
    const dbUser = await t.withIdentity({ subject: studentId }).query(api.users.getByClerkId, { clerkId: studentId });
    const expectedPatientId = dbUser?.patientId;
    expect(expectedPatientId).toBeDefined();

    // Authenticate as this student
    const authedT = t.withIdentity({
      subject: studentId,
    });

    const attempt = await authedT.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses([1, 1, 1, 1, 1, 1, 1, 1, 0]),
        gad7: makeGAD7Responses([1, 1, 1, 1, 1, 1, 1]),
        pq16: makePQ16Responses(2),
      },
    });

    expect(attempt.attemptId).toBeDefined();

    // Retrieve attempt directly and check identity fields
    const savedAttempt = await authedT.query(api.screening.getAttemptById, {
      attemptId: attempt.attemptId,
    });

    expect(savedAttempt).toBeDefined();
    expect(savedAttempt?.userId).toBe(studentId);
    expect(savedAttempt?.patientId).toBe(expectedPatientId);

    // Also verify screening mirror contains canonical userId
    const mirror = await authedT.query(api.screening.getLatest, {
      userId: studentId,
    });
    expect(mirror).toBeDefined();
    expect(mirror?.userId).toBe(studentId);
    expect(mirror?.attemptId).toBe(String(attempt.attemptId));
  });

  // TEST 16: Isolation - Student A cannot resolve to Student B and missing patientId does not guess
  test("16. Student A cannot resolve to Student B, and missing patientId does not cause guessing", async () => {
    const t = convexTest(schema, modules);

    // Register Student A
    const regA = await t.mutation(api.users.registerStudent, {
      full_name: "Student Alpha",
      mobile_number: "9100000001",
      password: "Password123!",
    });
    const userA = await t.withIdentity({ subject: regA.user!.id }).query(api.users.getByClerkId, { clerkId: regA.user!.id });

    // Register Student B
    const regB = await t.mutation(api.users.registerStudent, {
      full_name: "Student Beta",
      mobile_number: "9200000002",
      password: "Password123!",
    });
    const userB = await t.withIdentity({ subject: regB.user!.id }).query(api.users.getByClerkId, { clerkId: regB.user!.id });

    const authedA = t.withIdentity({ subject: regA.user!.id });
    const attemptA = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(),
        gad7: makeGAD7Responses(),
        pq16: makePQ16Responses(0),
      },
    });

    const savedA = await authedA.query(api.screening.getAttemptById, {
      attemptId: attemptA.attemptId,
    });
    expect(savedA?.userId).toBe(regA.user!.id);
    expect(savedA?.patientId).toBe(userA?.patientId);
    expect(savedA?.patientId).not.toBe(userB?.patientId);

    // Test a user without patientId: ensure patientId is undefined (never guessed)
    const authedUnknown = t.withIdentity({ subject: "non_existent_user_id" });
    const uid_non_existent_user_id = await testUserId(authedUnknown, "non_existent_user_id");
    const attemptUnknown = await authedUnknown.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(),
        gad7: makeGAD7Responses(),
        pq16: makePQ16Responses(0),
      },
    });

    const savedUnknown = await authedUnknown.query(api.screening.getAttemptById, {
      attemptId: attemptUnknown.attemptId,
    });
    expect(savedUnknown?.userId).toBe(uid_non_existent_user_id);
    expect(savedUnknown?.patientId).toBeUndefined();
  });

  // TEST 17: Canonical users._id is preferred over clerkId
  test("17. Canonical users._id is prioritized over clerkId", async () => {
    const t = convexTest(schema, modules);

    // Insert a user with both _id and clerkId
    let studentId = "";
    await t.run(async (ctx) => {
      studentId = await ctx.db.insert("users", {
        full_name: "Dual Identity User",
        mobile_number: "9333333333",
        role: "patient",
        status: "active",
        patientId: "199",
        clerkId: "legacy_clerk_199",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const authedT = t.withIdentity({ subject: studentId });
    const attempt = await authedT.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makePHQ9Responses(),
        gad7: makeGAD7Responses(),
        pq16: makePQ16Responses(0),
      },
    });

    const saved = await authedT.query(api.screening.getAttemptById, {
      attemptId: attempt.attemptId,
    });
    expect(saved?.userId).toBe(studentId); // Canonical ID stored, NOT clerkId
    expect(saved?.patientId).toBe("199");
  });
});
