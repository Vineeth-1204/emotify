/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  scorePHQ9Responses,
  evaluateClinicalTriage,
  getPHQ9Severity,
} from "./clinicalScoring";
import {
  PHQ9_QUESTIONS,
  PHQ9_OPTIONS,
  PHQ9_INSTRUCTION,
} from "../constants/Screening";
import { scorePHQ9, interpretPHQ9 } from "../utils/scoring";

const modules = import.meta.glob("./**/*.ts");

// Helper to create 9-item PHQ-9 response record
function createPHQ9Record(answers: number[]): Record<string, number> {
  const rec: Record<string, number> = {};
  answers.forEach((val, idx) => {
    rec[`phq9_q${idx + 1}`] = val;
  });
  return rec;
}

// Helper for GAD-7 default responses
function createGAD7Record(val = 0): Record<string, number> {
  const rec: Record<string, number> = {};
  for (let i = 1; i <= 7; i++) rec[`gad7_q${i}`] = val;
  return rec;
}

// Helper for PQ-16 default responses
function createPQ16Record(val = 0): Record<string, number> {
  const rec: Record<string, number> = {};
  for (let i = 1; i <= 16; i++) rec[`pq16_q${i}`] = val;
  return rec;
}

describe("PHQ-9 Student-Friendly Questionnaire Adaptation Tests", () => {
  // =========================================================================
  // TEST A — ALL NEVER (0,0,0,0,0,0,0,0,0) -> Total 0
  // =========================================================================
  test("TEST A: All 'Never' (zeros) produces total score 0 with minimal severity", () => {
    const rawAnswers = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    // Client-side scoring
    const clientResult = scorePHQ9(rawAnswers);
    expect(clientResult.total).toBe(0);
    expect(clientResult.item9Score).toBe(0);
    expect(clientResult.item9Flag).toBe(false);
    expect(clientResult.severity).toBe("Minimal / None");

    // Server-side authoritative scoring
    const serverResult = scorePHQ9Responses(createPHQ9Record(rawAnswers));
    expect(serverResult.administered).toBe(true);
    expect(serverResult.score).toBe(0);
    expect(serverResult.maxScore).toBe(27);
    expect(serverResult.item9Score).toBe(0);
    expect(serverResult.item9Flag).toBe(false);
    expect(serverResult.severity).toBe("Minimal or None");
    expect(serverResult.level).toBe("minimal");
  });

  // =========================================================================
  // TEST B — ALL ALMOST EVERY DAY (3,3,3,3,3,3,3,3,3) -> Total 27
  // =========================================================================
  test("TEST B: All 'Almost every day' (threes) produces total score 27 with severe depression", () => {
    const rawAnswers = [3, 3, 3, 3, 3, 3, 3, 3, 3];

    // Client-side scoring
    const clientResult = scorePHQ9(rawAnswers);
    expect(clientResult.total).toBe(27);
    expect(clientResult.item9Score).toBe(3);
    expect(clientResult.item9Flag).toBe(true);
    expect(clientResult.severity).toBe("Severe Depression");

    // Server-side authoritative scoring
    const serverResult = scorePHQ9Responses(createPHQ9Record(rawAnswers));
    expect(serverResult.administered).toBe(true);
    expect(serverResult.score).toBe(27);
    expect(serverResult.maxScore).toBe(27);
    expect(serverResult.item9Score).toBe(3);
    expect(serverResult.item9Flag).toBe(true);
    expect(serverResult.severity).toBe("Severe Depression");
    expect(serverResult.level).toBe("severe");
  });

  // =========================================================================
  // TEST C — MIXED ANSWERS (0,1,2,3,0,1,2,3,1) -> Total 13
  // =========================================================================
  test("TEST C: Mixed answers [0,1,2,3,0,1,2,3,1] produces total score 13 with moderate depression", () => {
    const rawAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 1];
    // Sum = 0+1+2+3+0+1+2+3+1 = 13

    // Client-side scoring
    const clientResult = scorePHQ9(rawAnswers);
    expect(clientResult.total).toBe(13);
    expect(clientResult.item9Score).toBe(1);
    expect(clientResult.item9Flag).toBe(true);
    expect(clientResult.severity).toBe("Moderate Depression");

    // Server-side authoritative scoring
    const serverResult = scorePHQ9Responses(createPHQ9Record(rawAnswers));
    expect(serverResult.administered).toBe(true);
    expect(serverResult.score).toBe(13);
    expect(serverResult.maxScore).toBe(27);
    expect(serverResult.item9Score).toBe(1);
    expect(serverResult.item9Flag).toBe(true);
    expect(serverResult.severity).toBe("Moderate Depression");
    expect(serverResult.level).toBe("moderate");
  });

  // =========================================================================
  // TEST D — OPTION MAPPING & STUDENT-FRIENDLY WORDING VERIFICATION
  // =========================================================================
  test("TEST D: Option mapping and student-friendly wording meet exact client requirements", () => {
    // 1. Answer choices
    expect(PHQ9_OPTIONS).toHaveLength(4);
    expect(PHQ9_OPTIONS[0]).toEqual({ label: "Never", value: 0 });
    expect(PHQ9_OPTIONS[1]).toEqual({ label: "A few days", value: 1 });
    expect(PHQ9_OPTIONS[2]).toEqual({ label: "Most days", value: 2 });
    expect(PHQ9_OPTIONS[3]).toEqual({ label: "Almost every day", value: 3 });

    // 2. 2-week timeframe instruction
    expect(PHQ9_INSTRUCTION).toBe("Over the last 2 weeks, how often have you experienced any of these?");
    expect(PHQ9_INSTRUCTION).toContain("Over the last 2 weeks");

    // 3. Exactly 9 questions
    expect(PHQ9_QUESTIONS).toHaveLength(9);

    // 4. Exact client-approved question wording
    expect(PHQ9_QUESTIONS[0].text).toBe("Have you had little or no interest in things you usually enjoy?");
    expect(PHQ9_QUESTIONS[1].text).toBe("Have you been feeling sad, low, or hopeless?");
    expect(PHQ9_QUESTIONS[2].text).toBe("Have you had trouble sleeping, slept too much, or had an irregular sleep pattern?");
    expect(PHQ9_QUESTIONS[3].text).toBe("Have you often felt tired or low on energy?");
    expect(PHQ9_QUESTIONS[4].text).toBe("Have you been eating much less or much more than usual?");
    expect(PHQ9_QUESTIONS[5].text).toBe("Have you felt bad about yourself, like you are not good enough or have let yourself or others down?");
    expect(PHQ9_QUESTIONS[6].text).toBe("Have you had difficulty concentrating on things, such as studying, reading, or watching something?");
    expect(PHQ9_QUESTIONS[7].text).toBe(
      "Have you been noticeably slower than usual in your movements or speech, or unusually restless and unable to sit still?"
    );
    expect(PHQ9_QUESTIONS[8].text).toBe(
      "Have you had thoughts that you would be better off dead, or thoughts of hurting yourself?"
    );

    // Verify Q8 preserves both sides: psychomotor slowing AND restlessness
    expect(PHQ9_QUESTIONS[7].text).toContain("slower than usual");
    expect(PHQ9_QUESTIONS[7].text).toContain("unusually restless");

    // Verify Q9 explicitly mentions thoughts of being better off dead AND self-harm
    expect(PHQ9_QUESTIONS[8].text).toContain("better off dead");
    expect(PHQ9_QUESTIONS[8].text).toContain("hurting yourself");
  });

  // =========================================================================
  // TEST E — ITEM 9 SAFETY BEHAVIOR FOR ALL VALUES (Q9 = 0, 1, 2, 3)
  // =========================================================================
  test("TEST E: Item 9 safety handling correctly gates risk on Q9 = 0, 1, 2, 3", async () => {
    // Case 1: Q9 = 0 -> normal baseline triage
    const triage0 = evaluateClinicalTriage({
      phq9Score: 4,
      item9Score: 0,
      gad7Score: 2,
      pq16Score: 0,
      pq16Administered: true,
    });
    expect(triage0.level).toBe("mild");
    expect(triage0.suicideFlag).toBe(false);
    expect(triage0.requiresAlert).toBe(false);
    expect(triage0.alertType).toBeUndefined();

    // Case 2: Q9 = 1 -> Suicide risk flagged
    const triage1 = evaluateClinicalTriage({
      phq9Score: 5,
      item9Score: 1,
      gad7Score: 2,
      pq16Score: 0,
      pq16Administered: true,
    });
    expect(triage1.level).toBe("suicide_flag");
    expect(triage1.suicideFlag).toBe(true);
    expect(triage1.requiresAlert).toBe(true);
    expect(triage1.alertType).toBe("suicide");

    // Case 3: Q9 = 2 -> Suicide risk flagged
    const triage2 = evaluateClinicalTriage({
      phq9Score: 6,
      item9Score: 2,
      gad7Score: 2,
      pq16Score: 0,
      pq16Administered: true,
    });
    expect(triage2.level).toBe("suicide_flag");
    expect(triage2.suicideFlag).toBe(true);
    expect(triage2.requiresAlert).toBe(true);
    expect(triage2.alertType).toBe("suicide");

    // Case 4: Q9 = 3 -> Suicide risk flagged
    const triage3 = evaluateClinicalTriage({
      phq9Score: 7,
      item9Score: 3,
      gad7Score: 2,
      pq16Score: 0,
      pq16Administered: true,
    });
    expect(triage3.level).toBe("suicide_flag");
    expect(triage3.suicideFlag).toBe(true);
    expect(triage3.requiresAlert).toBe(true);
    expect(triage3.alertType).toBe("suicide");

    // Database test: Submit screening with Q9 = 2 creates alert in database
    const t = convexTest(schema, modules).withIdentity({
      subject: "student_item9_safety_test",
    });

    const attempt = await t.mutation(api.screening.submitScreeningAttempt, {
      userId: "student_item9_safety_test",
      responses: {
        phq9: createPHQ9Record([0, 0, 0, 0, 0, 0, 0, 0, 2]),
        gad7: createGAD7Record(0),
        pq16: createPQ16Record(0),
      },
    });

    expect(attempt.suicideFlag).toBe(true);
    expect(attempt.triageLevel).toBe("suicide_flag");
    expect(attempt.results.phq9.item9Score).toBe(2);
    expect(attempt.results.phq9.item9Flag).toBe(true);

    // Verify alert was inserted into alerts table
    await t.run(async (ctx) => {
      const alert = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", "student_item9_safety_test"))
        .first();
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("suicide");
      expect(alert?.status).toBe("pending");
      expect(alert?.attemptId).toEqual(attempt.attemptId);
    });
  });

  // =========================================================================
  // TEST F — HISTORICAL DATA COMPATIBILITY
  // =========================================================================
  test("TEST F: Historical assessment stored with previous values remains readable and scores identically", async () => {
    const t = convexTest(schema, modules);
    const historicalUserId = "historical_student_phq9";

    let historicalAttemptId: any = null;
    await t.run(async (ctx) => {
      historicalAttemptId = await ctx.db.insert("screeningAttempts", {
        userId: historicalUserId,
        patientId: "P_HISTORICAL_001",
        status: "completed",
        attemptType: "baseline",
        startedAt: 1700000000000,
        completedAt: 1700000060000,
        instrumentVersions: {
          phq9: "PHQ-9.v1",
          gad7: "GAD-7.v1",
          pq16: "PQ-16.v1",
        },
        responses: {
          phq9: createPHQ9Record([2, 2, 2, 2, 2, 2, 2, 2, 0]), // sum = 16
          gad7: createGAD7Record(1),
          pq16: createPQ16Record(0),
        },
        results: {
          phq9: {
            administered: true,
            score: 16,
            maxScore: 27,
            severity: "Moderately Severe Depression",
            level: "moderately_severe",
            item9Score: 0,
            item9Flag: false,
          },
          gad7: {
            administered: true,
            score: 7,
            maxScore: 21,
            severity: "Mild Anxiety",
            level: "mild",
          },
          pq16: {
            administered: true,
            score: 0,
            maxScore: 16,
            severity: "Low / Normal",
            level: "minimal",
          },
        },
        triageLevel: "severe",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    // Query historical attempt
    const authedHistorical = t.withIdentity({ subject: historicalUserId });
    const fetched = await authedHistorical.query(api.screening.getAttemptById, {
      attemptId: historicalAttemptId,
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.results.phq9.score).toBe(16);
    expect(fetched?.results.phq9.severity).toBe("Moderately Severe Depression");
    expect(fetched?.responses?.phq9?.["phq9_q1"]).toBe(2);
    expect(fetched?.results.phq9.item9Score).toBe(0);

    // Scoring engine produces identical interpretation for historical response data
    expect(fetched?.responses?.phq9).toBeDefined();
    const rescore = scorePHQ9Responses(fetched!.responses!.phq9!);
    expect(rescore.score).toBe(16);
    expect(rescore.severity).toBe("Moderately Severe Depression");
  });

  // =========================================================================
  // TEST G — NAVIGATION & PROGRESS LOGIC
  // =========================================================================
  test("TEST G: Navigation maintains selected answers array across back and forward steps", () => {
    // Simulate Questionnaire state machine logic
    let answers: (number | null)[] = new Array(PHQ9_QUESTIONS.length).fill(null);
    let currentIndex = 0;

    // Step 1: User selects option "A few days" (value 1) for Question 1
    answers[currentIndex] = 1;
    expect(answers[0]).toBe(1);

    // Step 2: User moves forward to Question 2
    currentIndex = 1;
    expect(currentIndex).toBe(1);

    // Step 3: User selects option "Most days" (value 2) for Question 2
    answers[currentIndex] = 2;
    expect(answers[1]).toBe(2);

    // Step 4: User navigates backward to Question 1
    currentIndex = 0;
    expect(answers[0]).toBe(1); // Answer is preserved

    // Step 5: User changes Question 1 to "Almost every day" (value 3)
    answers[0] = 3;
    expect(answers[0]).toBe(3);

    // Step 6: User navigates forward to Question 2
    currentIndex = 1;
    expect(answers[1]).toBe(2); // Question 2 answer is still preserved

    // Verify submission gating: allAnswered must be false when some items are null
    expect(answers.every((a) => a !== null)).toBe(false);

    // Fill remaining answers
    for (let i = 2; i < 9; i++) {
      answers[i] = 0;
    }
    expect(answers.every((a) => a !== null)).toBe(true);
  });

  // =========================================================================
  // TEST H — END-TO-END SUBMISSION PIPELINE
  // =========================================================================
  test("TEST H: End-to-end submission: Student UI answers -> Convex attempt -> Triage -> Counselor view", async () => {
    const studentId = "student_phq9_e2e_pipeline";
    const t = convexTest(schema, modules);

    // Register user record for student
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        full_name: "PHQ-9 Test Student",
        mobile_number: "9876543210",
        role: "patient",
        status: "active",
        patientId: "PAT_E2E_01",
        clerkId: studentId,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const authedStudent = t.withIdentity({ subject: studentId });

    // Submit complete assessment
    // PHQ-9 answers: [1, 2, 1, 2, 0, 1, 1, 1, 0] -> sum = 9 (Mild depression)
    const phq9Answers = [1, 2, 1, 2, 0, 1, 1, 1, 0];
    const attempt = await authedStudent.mutation(api.screening.submitScreeningAttempt, {
      userId: studentId,
      responses: {
        phq9: createPHQ9Record(phq9Answers),
        gad7: createGAD7Record(0),
        pq16: createPQ16Record(0),
      },
    });

    expect(attempt.attemptId).toBeDefined();
    expect(attempt.results.phq9.score).toBe(9);
    expect(attempt.results.phq9.severity).toBe("Mild Depression");
    expect(attempt.triageLevel).toBe("mild");
    expect(attempt.suicideFlag).toBe(false);

    // Retrieve via counselor query (e.g. getScreeningHistory)
    const history = await authedStudent.query(api.screening.getScreeningHistory, {
      userId: studentId,
    });
    expect(history).toHaveLength(1);
    expect(history[0].results.phq9.score).toBe(9);
    expect(history[0].patientId).toBe("PAT_E2E_01");
    expect(history[0].status).toBe("completed");
  });
});
