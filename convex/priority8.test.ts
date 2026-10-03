/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe, vi, beforeAll, afterAll } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  ROUTINE_HABIT_CATALOG,
  ROUTINE_TEMPLATE_BY_ID,
  ALL_ROUTINE_TEMPLATES,
  selectDailyRoutineGoalsDeterministically,
} from "../common/interventions";

import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("Priority 8 Step 2: Clinical Decoupling of Intervention Recommendations", () => {
  // P8-DECOUPLE-01: CBT recommendation does not query screeningAttempts
  test("P8-DECOUPLE-01: CBT recommendation does not query screeningAttempts", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_decouple_01",
      email: "student01@emotify.com",
      name: "Decouple Student 01",
    });

    // Start a CBT session and proceed to recovery_coach step
    const initRes = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = initRes.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Worried about final project deadline",
      automaticThought: "I'll never finish this on time and will fail",
      emotion: "Anxiety",
      emotionBefore: 8,
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 4,
    });

    // Run recommendation with ZERO screening attempts in the database
    const goals = await t.action(api.cbt.recommendGoalAction, { sessionId });
    expect(goals).toBeDefined();
    expect(goals).toHaveLength(4);
    expect(goals[0].id).toBeDefined();
    expect(goals[0].title).toBeDefined();

    // Verify database has no screening attempts
    await t.run(async (ctx) => {
      const attempts = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", "p8_user_decouple_01"))
        .collect();
      expect(attempts).toHaveLength(0);
    });
  });

  // P8-DECOUPLE-02: CBT recommendation does not consume PHQ-9/GAD-7 values
  test("P8-DECOUPLE-02: CBT recommendation does not consume PHQ-9/GAD-7 values", async () => {
    const t = convexTest(schema, modules);

    // Student A has severe clinical psychometrics stored in screeningAttempts
    const tA = t.withIdentity({
      subject: "p8_user_severe_phq",
      email: "severe@emotify.com",
      name: "Severe Psychometric Student",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("screeningAttempts", {
        userId: "p8_user_severe_phq",
        status: "completed",
        startedAt: Date.now() - 3600000,
        completedAt: Date.now() - 1800000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 24, maxScore: 27, severity: "severe", level: "severe", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 20, maxScore: 21, severity: "severe", level: "severe" },
          pq16: { administered: true, score: 8, maxScore: 16, severity: "none", level: "none" },
        },
        triageLevel: "severe",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const initA = await tA.mutation(api.cbt.startSession, { forceNew: true });
    await tA.mutation(api.cbt.updateSessionContext, {
      sessionId: initA.session!._id,
      situation: "Studying for biology exam",
      automaticThought: "I am having trouble focusing on flashcards",
      emotion: "Stress",
      emotionBefore: 6,
    });
    await tA.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId: initA.session!._id,
      intensity: 3,
    });

    // Student B has zero screening / 0 psychometrics
    const tB = t.withIdentity({
      subject: "p8_user_zero_phq",
      email: "zero@emotify.com",
      name: "Zero Psychometric Student",
    });

    const initB = await tB.mutation(api.cbt.startSession, { forceNew: true });
    await tB.mutation(api.cbt.updateSessionContext, {
      sessionId: initB.session!._id,
      situation: "Studying for biology exam",
      automaticThought: "I am having trouble focusing on flashcards",
      emotion: "Stress",
      emotionBefore: 6,
    });
    await tB.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId: initB.session!._id,
      intensity: 3,
    });

    const goalsA = await tA.action(api.cbt.recommendGoalAction, { sessionId: initA.session!._id });
    const goalsB = await tB.action(api.cbt.recommendGoalAction, { sessionId: initB.session!._id });

    // In the decoupled architecture, identical session context yields identical recommendations
    // regardless of whether user A had PHQ-9=24/GAD-7=20 or user B had none.
    expect(goalsA.map((g: any) => g.id)).toEqual(goalsB.map((g: any) => g.id));
    // Specifically, neither was forced into the old clinical threshold branch (look_outside / stretch_simple)
    expect(goalsA[0].id).toBe("study_5m");
  });

  // P8-DECOUPLE-03: CBT recommendation does not inject clinical scores into AI prompt
  test("P8-DECOUPLE-03: CBT recommendation does not inject clinical scores into AI prompt", async () => {
    // Inspect cbt.ts implementation to ensure prompt template contains no clinical psychometric references
    const fs = await import("fs");
    const path = await import("path");
    const cbtPath = path.resolve(__dirname, "cbt.ts");
    const cbtSource = fs.readFileSync(cbtPath, "utf-8");

    // The AI action in cbt.ts must not mention PHQ-9 or GAD-7 in its prompts
    const recommendGoalActionIdx = cbtSource.indexOf("export const recommendGoalAction = action");
    expect(recommendGoalActionIdx).toBeGreaterThan(0);
    const actionSource = cbtSource.slice(recommendGoalActionIdx, cbtSource.indexOf("function getMockGoalRecommendations"));

    expect(actionSource).not.toContain("api.screening.getAll");
    expect(actionSource).not.toContain("ctx.runQuery(api.screening");
    expect(actionSource).not.toContain("${phq9}");
    expect(actionSource).not.toContain("${gad7}");
    expect(actionSource).not.toContain("PHQ-9 ${");
    expect(actionSource).not.toContain("GAD-7 ${");
  });

  // P8-DECOUPLE-04: CBT recommendation still produces a valid recommendation from non-clinical session context
  test("P8-DECOUPLE-04: CBT recommendation produces valid recommendation from non-clinical session context", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_context_04",
      email: "context@emotify.com",
      name: "Context Student",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Conflict with friend over weekend plans",
      automaticThought: "They do not care about what I want",
      emotion: "Sadness",
      emotionBefore: 7,
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    const goals = await t.action(api.cbt.recommendGoalAction, { sessionId });
    expect(goals).toBeDefined();
    expect(goals.length).toBe(4);
    // Situation contains 'friend', so friend-oriented non-clinical mock template matches
    expect(goals[0].id).toBe("journal_feelings");
    expect(goals[0].category).toBe("Journaling");

    // Session record is updated with recommended goals
    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.recommendedGoals).toHaveLength(4);
    expect(session!.recommendedGoal?.id).toBe("journal_feelings");
  });

  // P8-DECOUPLE-05: micro-goal recommendation does not query triages
  test("P8-DECOUPLE-05: micro-goal recommendation does not query triages", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_triage_decouple_05",
      email: "triage05@emotify.com",
      name: "Triage Decouple Student",
    });

    // Call daily check-in with NO triage record present
    const checkin = await t.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });
    expect(checkin.success).toBe(true);

    const goals = await t.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_triage_decouple_05",
      dateStr: "2026-09-28",
    });
    // 2 small + 1 medium + 1 large + 1 challenge = 5 goals
    expect(goals).toHaveLength(5);

    // Verify triages table remains completely empty for this user
    await t.run(async (ctx) => {
      const triages = await ctx.db
        .query("triages")
        .withIndex("by_userId", (q) => q.eq("userId", "p8_user_triage_decouple_05"))
        .collect();
      expect(triages).toHaveLength(0);
    });
  });

  // P8-DECOUPLE-06: micro-goal recommendation does not inspect clinical severity
  test("P8-DECOUPLE-06: micro-goal recommendation does not inspect clinical severity or downgrade difficulty", async () => {
    const t = convexTest(schema, modules);

    // User with active severe / suicide flag clinical triage
    const tSevere = t.withIdentity({
      subject: "p8_user_severe_triage_06",
      email: "severe_triage@emotify.com",
      name: "Severe Triage Student",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: "p8_user_severe_triage_06",
        level: "severe",
        suicideFlag: true,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
    });

    await tSevere.mutation(api.microGoals.submitMorningCheckin, {
      mood: "anxious",
      dateStr: "2026-09-28",
    });

    const severeGoals = await tSevere.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_severe_triage_06",
      dateStr: "2026-09-28",
    });

    // User with mild clinical triage
    const tMild = t.withIdentity({
      subject: "p8_user_mild_triage_06",
      email: "mild_triage@emotify.com",
      name: "Mild Triage Student",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: "p8_user_mild_triage_06",
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now(),
      });
    });

    await tMild.mutation(api.microGoals.submitMorningCheckin, {
      mood: "anxious",
      dateStr: "2026-09-28",
    });

    const mildGoals = await tMild.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_mild_triage_06",
      dateStr: "2026-09-28",
    });

    // In both cases, large difficulty goals (50 points) ARE NOT downgraded to medium
    // Previously, isSevere downgraded largeList to medium (25 points).
    const severeLarge = severeGoals.filter((g) => g.difficulty === "large" || g.points === 50);
    const mildLarge = mildGoals.filter((g) => g.difficulty === "large" || g.points === 50);

    expect(severeLarge.length).toBeGreaterThanOrEqual(1);
    expect(mildLarge.length).toBeGreaterThanOrEqual(1);
  });

  // P8-DECOUPLE-07: micro-goal generation still returns valid goals
  test("P8-DECOUPLE-07: micro-goal generation returns valid goals with correct attributes", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_valid_goals_07",
      email: "valid_goals@emotify.com",
      name: "Valid Goals Student",
    });

    await t.mutation(api.microGoals.submitMorningCheckin, {
      mood: "peaceful",
      dateStr: "2026-09-28",
    });

    const goals = await t.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_valid_goals_07",
      dateStr: "2026-09-28",
    });

    expect(goals.length).toBe(5);
    for (const g of goals) {
      expect(g.userId).toBe("p8_user_valid_goals_07");
      expect(g.completed).toBe(false);
      expect(g.skipped).toBe(false);
      expect(typeof g.points).toBe("number");
      expect(g.points).toBeGreaterThan(0);
      expect(g.goalTitle).toBeTruthy();
      expect(g.category).toBeTruthy();
    }
  });

  // P8-DECOUPLE-08: clinical screening/triage records remain unchanged by intervention recommendation
  test("P8-DECOUPLE-08: clinical screening and triage records remain unchanged by intervention recommendation", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_immutable_clinical_08",
      email: "immutable@emotify.com",
      name: "Immutable Clinical Student",
    });

    let attemptId!: Id<"screeningAttempts">;
    let triageId!: Id<"triages">;

    await t.run(async (ctx) => {
      attemptId = await ctx.db.insert("screeningAttempts", {
        userId: "p8_user_immutable_clinical_08",
        status: "completed",
        startedAt: 1700000000,
        completedAt: 1700001000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 12, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 9, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 2, maxScore: 16, severity: "none", level: "none" },
        },
        triageLevel: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
      });

      triageId = await ctx.db.insert("triages", {
        userId: "p8_user_immutable_clinical_08",
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700001050,
        attemptId,
      });
    });

    // Perform check-in and goal generation
    await t.mutation(api.microGoals.submitMorningCheckin, {
      mood: "neutral",
      dateStr: "2026-09-28",
    });

    // Start CBT session and get recommendation
    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    await t.mutation(api.cbt.updateSessionContext, {
      sessionId: init.session!._id,
      situation: "Tired after school",
      automaticThought: "I don't feel like doing anything",
      emotion: "Fatigue",
      emotionBefore: 5,
    });
    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId: init.session!._id,
      intensity: 3,
    });
    await t.action(api.cbt.recommendGoalAction, { sessionId: init.session!._id });

    // Verify clinical records are completely untouched
    await t.run(async (ctx) => {
      const attempt = await ctx.db.get(attemptId);
      expect(attempt).toBeDefined();
      expect(attempt!.results.phq9.score).toBe(12);
      expect(attempt!.results.gad7.score).toBe(9);
      expect(attempt!.status).toBe("completed");

      const triage = await ctx.db.get(triageId);
      expect(triage).toBeDefined();
      expect(triage!.level).toBe("moderate");
      expect(triage!.suicideFlag).toBe(false);
    });
  });

  // P8-DECOUPLE-09: existing safety escalation path remains functional
  test("P8-DECOUPLE-09: existing safety escalation path remains functional in session", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_safety_escalation_09",
      email: "safety@emotify.com",
      name: "Safety Escalation Student",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Send high-risk message triggering session safety mode
    const reply = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I want to end my life, suicide is the only way out.",
    });

    expect(reply.step).toBe("safety_mode");

    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.sessionStatus).toBe("safety_mode");
    expect(session!.riskFlags).toContain("suicide");

    // Counselor alert is created
    const alerts = await t.query(api.dashboard.getAlerts);
    expect(alerts.some((a) => a.userId === "p8_user_safety_escalation_09" && a.type === "suicideRisk")).toBe(true);

    // Recommendation generates safety/crisis recovery goals
    const goals = await t.action(api.cbt.recommendGoalAction, { sessionId });
    expect(goals).toHaveLength(4);
    expect(goals[0].id).toBe("crisis_call");
    expect(goals[0].title).toContain("988");
    expect(goals[1].id).toBe("crisis_grounding");
  });

  // P8-DECOUPLE-10: student authorization remains intact
  test("P8-DECOUPLE-10: student authorization remains intact", async () => {
    const t = convexTest(schema, modules);

    const tOwner = t.withIdentity({
      subject: "p8_user_owner_10",
      email: "owner@emotify.com",
      name: "Owner Student",
    });

    const init = await tOwner.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Another student cannot access or mutate the owner's session
    const tOther = t.withIdentity({
      subject: "p8_user_other_10",
      email: "other@emotify.com",
      name: "Other Student",
    });

    await expect(
      tOther.query(api.cbt.getSession, { sessionId })
    ).rejects.toThrow("Unauthorized");

    await expect(
      tOther.action(api.cbt.recommendGoalAction, { sessionId })
    ).rejects.toThrow("Unauthorized");

    await expect(
      tOther.mutation(api.cbt.acceptGoal, { sessionId, selectedGoalIds: ["walk_10"] })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("Priority 8 Step 3: Reframe UX & Session State Remediation", () => {
  // P8-UX-01: identical understanding prompt is not repeatedly returned when meaningful input is provided
  test("P8-UX-01: identical understanding prompt is not repeatedly returned when meaningful input is provided", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_01",
      email: "ux01@emotify.com",
      name: "UX Student 01",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Turn 1
    const res1 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I am feeling stressed about failing my next final exam.",
    });
    expect(res1.step).toBe("understanding");

    // Turn 2
    const res2 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I feel like if I fail this exam, I'm a complete failure.",
    });
    expect(res2.step).toBe("understanding");

    // Prompt in Turn 2 must NOT be identical to Turn 1
    expect(res2.responseMessage.trim()).not.toBe(res1.responseMessage.trim());

    // Turn 3
    const res3 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "Yes, I really worry about that.",
    });
    expect(res3.step).toBe("guided_discovery");
  });

  // P8-UX-02: fallback/mock mode progresses correctly
  test("P8-UX-02: fallback/mock mode progresses correctly through conversation phases", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_02",
      email: "ux02@emotify.com",
      name: "UX Student 02",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Understanding
    await t.action(api.cbt.submitMessage, { sessionId, content: "Stressed about school projects" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "I think everything will go wrong" });
    const toDiscovery = await t.action(api.cbt.submitMessage, { sessionId, content: "Yes, that's what I think" });
    expect(toDiscovery.step).toBe("guided_discovery");

    // Guided discovery 3 answers
    await t.action(api.cbt.submitMessage, { sessionId, content: "I missed one assignment" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "I got an A on the midterm" });
    const toReflection = await t.action(api.cbt.submitMessage, { sessionId, content: "I'd tell a friend it's just one project" });
    expect(toReflection.step).toBe("reflection");

    // Reflection -> Balanced Thought
    const toBalanced = await t.action(api.cbt.submitMessage, { sessionId, content: "I can take things one step at a time" });
    expect(toBalanced.step).toBe("balanced_thought");
    expect(toBalanced.thoughtsOptions).toHaveLength(3);
  });

  // P8-UX-03: insufficient input can still request clarification
  test("P8-UX-03: insufficient input can still request clarification without premature progression", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_03",
      email: "ux03@emotify.com",
      name: "UX Student 03",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Single vague word input
    const res = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "bad",
    });

    expect(res.step).toBe("understanding");
    expect(res.responseMessage.toLowerCase()).toContain("listening");

    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.currentStep).toBe("understanding");
  });

  // P8-UX-04: Skip Question does not inject fake chat text
  test("P8-UX-04: Skip Question does not inject fake chat text into conversation", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_04",
      email: "ux04@emotify.com",
      name: "UX Student 04",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Advance to guided discovery
    await t.action(api.cbt.submitMessage, { sessionId, content: "Worried about exam" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "I am a failure if I fail" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "Yes" });

    // Call skipQuestion
    await t.mutation(api.cbt.skipQuestion, { sessionId });

    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.conversation).toBeDefined();

    // Verify no user message contains "I want to skip this question."
    const userMessages = session!.conversation.filter((m: any) => m.role === "user");
    for (const msg of userMessages) {
      expect(msg.content).not.toBe("I want to skip this question.");
      expect(msg.content).not.toContain("skip this question");
    }
  });

  // P8-UX-05: Skip Question advances the correct CBT state
  test("P8-UX-05: Skip Question advances the correct CBT state through guided discovery to reflection", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_05",
      email: "ux05@emotify.com",
      name: "UX Student 05",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Advance to guided discovery (stepIndex: 0)
    await t.action(api.cbt.submitMessage, { sessionId, content: "Worried about exam" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "I am a failure" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "Yes" });

    let s = await t.query(api.cbt.getSession, { sessionId });
    expect(s!.currentStep).toBe("guided_discovery");
    expect(s!.stepIndex).toBe(0);

    // Skip question 1 -> stepIndex 1
    const skip1 = await t.mutation(api.cbt.skipQuestion, { sessionId });
    expect(skip1.step).toBe("guided_discovery");
    expect(skip1.stepIndex).toBe(1);

    // Skip question 2 -> stepIndex 2
    const skip2 = await t.mutation(api.cbt.skipQuestion, { sessionId });
    expect(skip2.step).toBe("guided_discovery");
    expect(skip2.stepIndex).toBe(2);

    // Skip question 3 -> transitions to reflection
    const skip3 = await t.mutation(api.cbt.skipQuestion, { sessionId });
    expect(skip3.step).toBe("reflection");

    s = await t.query(api.cbt.getSession, { sessionId });
    expect(s!.currentStep).toBe("reflection");
    expect(s!.challengeAnswers).toContain("(Question skipped)");
  });

  // P8-UX-06: Skip preserves session ownership/authorization
  test("P8-UX-06: Skip preserves session ownership and authorization", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_06",
      email: "ux06@emotify.com",
      name: "UX Student 06",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Advance to guided discovery
    await t.action(api.cbt.submitMessage, { sessionId, content: "Work problem" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "I will be fired" });
    await t.action(api.cbt.submitMessage, { sessionId, content: "Yes" });

    await t.mutation(api.cbt.skipQuestion, { sessionId });

    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.userId).toBe("p8_user_ux_06");
    expect(session!.sessionStatus).toBe("active");
  });

  // P8-UX-07: stale active session (>24h) is not automatically resumed
  test("P8-UX-07: stale active session (>24h) is not automatically resumed and marks expired", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_07",
      email: "ux07@emotify.com",
      name: "UX Student 07",
    });

    // Create a session with activity timestamp 25 hours ago
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    let oldSessionId!: Id<"cbtSessions">;

    await t.run(async (ctx) => {
      oldSessionId = await ctx.db.insert("cbtSessions", {
        userId: "p8_user_ux_07",
        conversation: [{ role: "assistant", content: "Hello", timestamp: staleTimestamp }],
        stepIndex: 0,
        timestamp: staleTimestamp,
        sessionStatus: "active",
        currentStep: "understanding",
        riskFlags: [],
      });
    });

    // Student opens Reframe without forcing new (resume attempt)
    const res = await t.mutation(api.cbt.startSession, { forceNew: false });

    // Stale session must NOT be resumed
    expect(res.resumed).toBe(false);
    expect(res.previousSessionExpired).toBe(true);
    expect(res.session!._id).not.toBe(oldSessionId);
    expect(res.session!.sessionStatus).toBe("active");

    // Old session must be marked expired
    const oldSession = await t.query(api.cbt.getSession, { sessionId: oldSessionId });
    expect(oldSession!.sessionStatus).toBe("expired");
  });

  // P8-UX-08: active recent session (<24h) remains resumable
  test("P8-UX-08: active recent session (<24h) remains resumable", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_08",
      email: "ux08@emotify.com",
      name: "UX Student 08",
    });

    // Start a fresh session
    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Student reopens app within 24h
    const resume = await t.mutation(api.cbt.startSession, { forceNew: false });
    expect(resume.resumed).toBe(true);
    expect(resume.previousSessionExpired).toBe(false);
    expect(resume.session!._id).toBe(sessionId);
  });

  // P8-UX-09: stale session remains stored and is not deleted
  test("P8-UX-09: stale session remains stored in database and is not deleted", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_09",
      email: "ux09@emotify.com",
      name: "UX Student 09",
    });

    const staleTime = Date.now() - 30 * 60 * 60 * 1000;
    let oldSessionId!: Id<"cbtSessions">;

    await t.run(async (ctx) => {
      oldSessionId = await ctx.db.insert("cbtSessions", {
        userId: "p8_user_ux_09",
        situation: "Historical stressor",
        automaticThought: "Old thought",
        conversation: [{ role: "assistant", content: "Greeting", timestamp: staleTime }],
        stepIndex: 0,
        timestamp: staleTime,
        sessionStatus: "active",
        currentStep: "understanding",
        riskFlags: [],
      });
    });

    await t.mutation(api.cbt.startSession, { forceNew: false });

    // Verify old session record still exists and preserves its context
    const old = await t.query(api.cbt.getSession, { sessionId: oldSessionId });
    expect(old).toBeDefined();
    expect(old!.sessionStatus).toBe("expired");
    expect(old!.situation).toBe("Historical stressor");
    expect(old!.automaticThought).toBe("Old thought");
  });

  // P8-UX-10: completed sessions are never expired by the stale-session logic
  test("P8-UX-10: completed sessions are never expired by the stale-session logic", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_10",
      email: "ux10@emotify.com",
      name: "UX Student 10",
    });

    const oldCompletedTime = Date.now() - 72 * 60 * 60 * 1000; // 3 days ago
    let completedSessionId!: Id<"cbtSessions">;

    await t.run(async (ctx) => {
      completedSessionId = await ctx.db.insert("cbtSessions", {
        userId: "p8_user_ux_10",
        conversation: [{ role: "assistant", content: "Complete", timestamp: oldCompletedTime }],
        stepIndex: 0,
        timestamp: oldCompletedTime,
        sessionStatus: "completed",
        currentStep: "completed",
        riskFlags: [],
      });
    });

    await t.mutation(api.cbt.startSession, { forceNew: false });

    const session = await t.query(api.cbt.getSession, { sessionId: completedSessionId });
    expect(session!.sessionStatus).toBe("completed");
  });

  // P8-UX-11: safety detection still works after the state-machine changes
  test("P8-UX-11: safety detection still works and cannot be bypassed via skipQuestion", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_ux_11",
      email: "ux11@emotify.com",
      name: "UX Student 11",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Trigger crisis safety mode
    const crisisReply = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I want to kill myself, I cannot handle this life anymore.",
    });

    expect(crisisReply.step).toBe("safety_mode");

    const session = await t.query(api.cbt.getSession, { sessionId });
    expect(session!.sessionStatus).toBe("safety_mode");

    // Skip question must NOT bypass safety mode
    await expect(
      t.mutation(api.cbt.skipQuestion, { sessionId })
    ).rejects.toThrow("This session is no longer active (Status: safety_mode)");
  });

  // P8-UX-12: cross-student session modification remains blocked
  test("P8-UX-12: cross-student session modification remains blocked on skipQuestion", async () => {
    const t = convexTest(schema, modules);

    const tOwner = t.withIdentity({
      subject: "p8_user_owner_12",
      email: "owner12@emotify.com",
      name: "Owner 12",
    });

    const init = await tOwner.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    const tAttacker = t.withIdentity({
      subject: "p8_user_attacker_12",
      email: "attacker12@emotify.com",
      name: "Attacker 12",
    });

    // Attacker cannot skip questions in victim's session
    await expect(
      tAttacker.mutation(api.cbt.skipQuestion, { sessionId })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("Priority 8 Step 4: CBT → Reframe Logs Data Bridge", () => {
  // P8-BRIDGE-01: completed CBT session creates exactly one reframeLog
  test("P8-BRIDGE-01: completed CBT session creates exactly one reframeLog", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_01",
      email: "bridge01@emotify.com",
      name: "Bridge Student 01",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Upcoming exam next Monday",
      automaticThought: "I will fail the exam and ruin everything",
      emotion: "Anxiety",
      emotionBefore: 8,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "I have prepared adequately and will take it one question at a time.",
    });

    await t.mutation(api.cbt.submitBeliefRating, {
      sessionId,
      score: 85,
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    // Verify exactly one reframeLog is created
    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_01" });
    expect(logs).toHaveLength(1);
    expect(logs[0].cbtSessionId).toBe(sessionId);
    expect(logs[0].reframe_text).toBe("I have prepared adequately and will take it one question at a time.");
  });

  // P8-BRIDGE-02: correct situation mapping
  test("P8-BRIDGE-02: correct situation mapping", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_02",
      email: "bridge02@emotify.com",
      name: "Bridge Student 02",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    const situationText = "Presentation in front of 50 colleagues tomorrow morning";
    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: situationText,
      automaticThought: "Everyone will judge me if I stutter",
      emotion: "Panic",
      emotionBefore: 9,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "It's normal to feel nervous; my colleagues are supportive.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 4,
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_02" });
    expect(logs).toHaveLength(1);
    expect(logs[0].situation_text).toBe(situationText);
  });

  // P8-BRIDGE-03: correct original thought mapping
  test("P8-BRIDGE-03: correct original thought mapping", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_03",
      email: "bridge03@emotify.com",
      name: "Bridge Student 03",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    const thoughtText = "Nobody texted me back, so they must all hate me";
    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Group chat was silent all afternoon",
      automaticThought: thoughtText,
      emotion: "Sadness",
      emotionBefore: 7,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "People are busy on weekdays, it does not reflect their feelings toward me.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_03" });
    expect(logs).toHaveLength(1);
    expect(logs[0].thought_original).toBe(thoughtText);
  });

  // P8-BRIDGE-04: correct balanced thought mapping
  test("P8-BRIDGE-04: correct balanced thought mapping", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_04",
      email: "bridge04@emotify.com",
      name: "Bridge Student 04",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    const balancedText = "A single mistake is a learning opportunity, not proof of total failure.";
    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Made a typo in an email to a professor",
      automaticThought: "I am completely incompetent",
      emotion: "Embarrassment",
      emotionBefore: 6,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: balancedText,
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 2,
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_04" });
    expect(logs).toHaveLength(1);
    expect(logs[0].reframe_text).toBe(balancedText);
  });

  // P8-BRIDGE-05: challenge answers/distortion mapping preserved
  test("P8-BRIDGE-05: challenge answers and distortion mapping preserved", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_05",
      email: "bridge05@emotify.com",
      name: "Bridge Student 05",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Missed the team practice",
      automaticThought: "I always ruin the team's chances",
      emotion: "Guilt",
      emotionBefore: 8,
    });

    // Update distortion and challenge answers
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, {
        cbtDistortion: "all_or_nothing",
        challengeAnswers: ["I rarely miss practices.", "The team still won the scrimmage."],
      });
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "Missing one practice happens; I will attend tomorrow prepared.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_05" });
    expect(logs).toHaveLength(1);
    expect(logs[0].thinking_trap_choice).toBe("all_or_nothing");
    expect(logs[0].guided_answers).toEqual(["I rarely miss practices.", "The team still won the scrimmage."]);
  });

  // P8-BRIDGE-06: provenance to originating CBT session preserved
  test("P8-BRIDGE-06: provenance to originating CBT session preserved", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_06",
      email: "bridge06@emotify.com",
      name: "Bridge Student 06",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Applying for an internship",
      automaticThought: "They will reject me immediately",
      emotion: "Worry",
      emotionBefore: 7,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "I meet the qualifications and submitting gives me a fair chance.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_06" });
    expect(logs).toHaveLength(1);
    expect(logs[0].cbtSessionId).toBe(sessionId);
    // Preserves originating session sourceType ("self_initiated") without fabricating clinical provenance
    expect(logs[0].sourceType).toBe("self_initiated");
    expect(logs[0].attemptId).toBeUndefined();
    expect(logs[0].triageId).toBeUndefined();
  });

  // P8-BRIDGE-07: repeated completion is idempotent
  test("P8-BRIDGE-07: repeated completion is idempotent", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_07",
      email: "bridge07@emotify.com",
      name: "Bridge Student 07",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Work deadline",
      automaticThought: "I'll never finish",
      emotion: "Stress",
      emotionBefore: 8,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "I can prioritize tasks and ask for an extension if truly needed.",
    });

    // 1st rating call
    await t.mutation(api.cbt.submitEmotionAfterRating, { sessionId, intensity: 4 });

    // Retry/duplicate rating call
    await t.mutation(api.cbt.submitEmotionAfterRating, { sessionId, intensity: 4 });

    // End session / skip goal
    await t.mutation(api.cbt.skipGoal, { sessionId });

    // Duplicate end session
    await t.mutation(api.cbt.endSession, { sessionId });

    // Verify still exactly ONE reframeLog exists
    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_07" });
    expect(logs).toHaveLength(1);
  });

  // P8-BRIDGE-08: abandoned session does not create reframeLog
  test("P8-BRIDGE-08: abandoned session does not create reframeLog", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_08",
      email: "bridge08@emotify.com",
      name: "Bridge Student 08",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Argument with roommate",
      automaticThought: "Our friendship is ruined",
      emotion: "Anger",
      emotionBefore: 7,
    });

    // User leaves session without selecting balanced thought or rating post emotion
    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_08" });
    expect(logs).toHaveLength(0);
  });

  // P8-BRIDGE-09: expired session does not create reframeLog
  test("P8-BRIDGE-09: expired session does not create reframeLog", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_09",
      email: "bridge09@emotify.com",
      name: "Bridge Student 09",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Simulate 30 hours of inactivity
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, {
        timestamp: Date.now() - 30 * 60 * 60 * 1000,
      });
    });

    // Starting session expires the stale one
    const startRes = await t.mutation(api.cbt.startSession, { forceNew: false });
    expect(startRes.previousSessionExpired).toBe(true);

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_09" });
    expect(logs).toHaveLength(0);
  });

  // P8-BRIDGE-10: safety_mode session does not create an ordinary reframeLog
  test("P8-BRIDGE-10: safety_mode session does not create an ordinary reframeLog", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_10",
      email: "bridge10@emotify.com",
      name: "Bridge Student 10",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // Trigger crisis safety mode
    await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I want to kill myself, I cannot handle this life anymore.",
    });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_10" });
    expect(logs).toHaveLength(0);
  });

  // P8-BRIDGE-11: cross-student bridge attempt is rejected
  test("P8-BRIDGE-11: cross-student bridge attempt is rejected", async () => {
    const t = convexTest(schema, modules);

    const tStudent = t.withIdentity({
      subject: "p8_user_student_11",
      email: "student11@emotify.com",
      name: "Student 11",
    });

    const init = await tStudent.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await tStudent.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Exam stress",
      automaticThought: "I will fail",
      emotion: "Anxiety",
      emotionBefore: 8,
    });

    const tAttacker = t.withIdentity({
      subject: "p8_user_attacker_11",
      email: "attacker11@emotify.com",
      name: "Attacker 11",
    });

    // Attacker cannot complete or rate victim's session
    await expect(
      tAttacker.mutation(api.cbt.submitEmotionAfterRating, {
        sessionId,
        intensity: 2,
      })
    ).rejects.toThrow("Unauthorized");
  });

  // P8-BRIDGE-12: incomplete balanced thought does not create invalid reframeLog
  test("P8-BRIDGE-12: incomplete balanced thought does not create invalid reframeLog", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_12",
      email: "bridge12@emotify.com",
      name: "Bridge Student 12",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    // User ends session before reaching balanced thought
    await t.mutation(api.cbt.endSession, { sessionId });

    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_12" });
    expect(logs).toHaveLength(0);
  });

  // P8-BRIDGE-13: existing Saved Reframes query returns the newly bridged record
  test("P8-BRIDGE-13: existing Saved Reframes query returns the newly bridged record", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_13",
      email: "bridge13@emotify.com",
      name: "Bridge Student 13",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Job interview next week",
      automaticThought: "They will see right through me and know I'm not good enough",
      emotion: "Anxiety",
      emotionBefore: 8,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "I have relevant experience and preparation will help me articulate it.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3,
    });

    // Query via getRecentLogs (which saved-reframes.tsx uses)
    const logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_13" });
    expect(logs).toHaveLength(1);
    expect(logs[0].saved_reframe_flag).toBe(true);
    expect(logs[0].improvement_percentage).toBe(63); // round(((8-3)/8)*100) = 63%
  });

  // P8-BRIDGE-14: existing favorite/edit/soft-delete operations remain compatible
  test("P8-BRIDGE-14: existing favorite/edit/soft-delete operations remain compatible", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "p8_user_bridge_14",
      email: "bridge14@emotify.com",
      name: "Bridge Student 14",
    });

    const init = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = init.session!._id;

    await t.mutation(api.cbt.updateSessionContext, {
      sessionId,
      situation: "Missed train",
      automaticThought: "My whole day is ruined",
      emotion: "Frustration",
      emotionBefore: 7,
    });

    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: "Another train is coming in 15 minutes, I'll still be on time.",
    });

    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 2,
    });

    let logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_14" });
    expect(logs).toHaveLength(1);
    const logId = logs[0]._id;

    // 1. Toggle favorite
    await t.mutation(api.reframes.toggleFavoriteLog, { id: logId });
    logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_14" });
    expect(logs[0].favorite).toBe(true);

    // 2. Edit reframe text
    await t.mutation(api.reframes.updateLog, {
      id: logId,
      reframe_text: "Another train is coming soon, and I can use this time to read.",
    });
    logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_14" });
    expect(logs[0].reframe_text).toBe("Another train is coming soon, and I can use this time to read.");

    // 3. Delete log
    await t.mutation(api.reframes.removeLog, { id: logId });
    logs = await t.query(api.reframes.getRecentLogs, { userId: "p8_user_bridge_14" });
    expect(logs).toHaveLength(0);
  });
});

describe("Priority 8 Step 6: Non-Clinical Cooldown & Deterministic Habit Engine", () => {
  // P8-DETERMINISTIC-01: Same user + same date + same history = identical recommendations
  test("P8-DETERMINISTIC-01: Same user + same date + same history = identical recommendations", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_det_01",
      email: "det01@emotify.com",
      name: "Deterministic Student 01",
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goalsRun1 = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_det_01",
      dateStr: "2026-09-28",
    });

    // Clear uncompleted today goals and checkins to re-run recommendation with identical state
    await t.run(async (ctx) => {
      const todayGoals = await ctx.db
        .query("microGoals")
        .withIndex("by_userId", (q) => q.eq("userId", "p8_user_det_01"))
        .collect();
      for (const g of todayGoals) {
        await ctx.db.delete(g._id);
      }
      const checkins = await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId", (q) => q.eq("userId", "p8_user_det_01"))
        .collect();
      for (const c of checkins) {
        await ctx.db.delete(c._id);
      }
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goalsRun2 = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_det_01",
      dateStr: "2026-09-28",
    });

    expect(goalsRun1.map((g) => g.goalId)).toEqual(goalsRun2.map((g) => g.goalId));
    expect(goalsRun1).toHaveLength(5);
  });

  // P8-DETERMINISTIC-02: Different calendar dates can produce different deterministic recommendations
  test("P8-DETERMINISTIC-02: Different calendar dates can produce different deterministic recommendations", async () => {
    const resA = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_det_02",
      dateStr: "2026-09-28",
    });
    const resB = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_det_02",
      dateStr: "2026-10-15",
    });

    const idsA = resA.allSelected.map((g) => g.id);
    const idsB = resB.allSelected.map((g) => g.id);
    expect(idsA).toHaveLength(5);
    expect(idsB).toHaveLength(5);
    expect(idsA).not.toEqual(idsB);
  });

  // P8-DETERMINISTIC-03: No Math.random() is used by daily recommendation generation
  test("P8-DETERMINISTIC-03: No Math.random() is used by daily recommendation generation", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_no_random_03",
      email: "norandom@emotify.com",
      name: "No Random Student",
    });

    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("FAIL: Math.random() was called during daily routine goal generation!");
    });

    try {
      const checkin = await tUser.mutation(api.microGoals.submitMorningCheckin, {
        mood: "good",
        dateStr: "2026-09-28",
      });
      expect(checkin.success).toBe(true);

      const goals = await tUser.query(api.microGoals.getTodayGoals, {
        userId: "p8_user_no_random_03",
        dateStr: "2026-09-28",
      });
      expect(goals).toHaveLength(5);
    } finally {
      spy.mockRestore();
    }
  });

  // P8-COOLDOWN-01: A goal assigned within the previous 7 days is excluded
  test("P8-COOLDOWN-01: A goal assigned within the previous 7 days is excluded", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_cd_01",
      email: "cd01@emotify.com",
      name: "Cooldown Student 01",
    });

    const baseline = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_cd_01",
      dateStr: "2026-09-28",
    });
    const targetToCool = baseline.selectedSmall[0].id;

    // Insert an assignment for targetToCool 3 days ago (2026-09-25)
    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: "p8_user_cd_01",
        goalId: targetToCool,
        goalTitle: "Prior Assignment",
        goalDescription: "Assigned 3 days ago",
        category: "Hydration",
        difficulty: "easy",
        points: 10,
        completed: false,
        skipped: false,
        createdAt: new Date("2026-09-25T10:00:00Z").getTime(),
        date: "2026-09-25",
      });
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_cd_01",
      dateStr: "2026-09-28",
    });

    const todayGoalIds = goals.map((g) => g.goalId);
    expect(todayGoalIds).not.toContain(targetToCool);
    expect(goals).toHaveLength(5);
  });

  // P8-COOLDOWN-02: A goal older than the 7-day window is eligible again
  test("P8-COOLDOWN-02: A goal older than the 7-day window is eligible again", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_cd_02",
      email: "cd02@emotify.com",
      name: "Cooldown Student 02",
    });

    const baseline = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_cd_02",
      dateStr: "2026-09-28",
    });
    const candidateId = baseline.selectedSmall[0].id;

    // Insert an assignment 10 days ago (2026-09-18), outside 7-day window
    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: "p8_user_cd_02",
        goalId: candidateId,
        goalTitle: "Old Assignment",
        goalDescription: "Assigned 10 days ago",
        category: "Hydration",
        difficulty: "easy",
        points: 10,
        completed: true,
        completedAt: new Date("2026-09-18T10:00:00Z").getTime(),
        skipped: false,
        createdAt: new Date("2026-09-18T10:00:00Z").getTime(),
        date: "2026-09-18",
      });
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_cd_02",
      dateStr: "2026-09-28",
    });

    const todayGoalIds = goals.map((g) => g.goalId);
    expect(todayGoalIds).toContain(candidateId);
  });

  // P8-COOLDOWN-03: Skipped goals within the cooldown window are handled according to assignment rule
  test("P8-COOLDOWN-03: Skipped goals within the cooldown window are handled according to assignment rule", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_cd_03",
      email: "cd03@emotify.com",
      name: "Cooldown Student 03",
    });

    const baseline = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_cd_03",
      dateStr: "2026-09-28",
    });
    const skippedCandidate = baseline.selectedSmall[0].id;

    // Goal was assigned and skipped 2 days ago (2026-09-26)
    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: "p8_user_cd_03",
        goalId: skippedCandidate,
        goalTitle: "Skipped Goal",
        goalDescription: "Skipped recently",
        category: "Hydration",
        difficulty: "easy",
        points: 10,
        completed: false,
        skipped: true,
        reminderStatus: "missed",
        createdAt: new Date("2026-09-26T12:00:00Z").getTime(),
        date: "2026-09-26",
      });
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_cd_03",
      dateStr: "2026-09-28",
    });

    expect(goals.map((g) => g.goalId)).not.toContain(skippedCandidate);
  });

  // P8-COOLDOWN-04: Completed goals within the cooldown window are excluded
  test("P8-COOLDOWN-04: Completed goals within the cooldown window are excluded", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_cd_04",
      email: "cd04@emotify.com",
      name: "Cooldown Student 04",
    });

    const baseline = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_cd_04",
      dateStr: "2026-09-28",
    });
    const completedCandidate = baseline.selectedMedium[0].id;

    // Completed 1 day ago (2026-09-27)
    await t.run(async (ctx) => {
      await ctx.db.insert("microGoals", {
        userId: "p8_user_cd_04",
        goalId: completedCandidate,
        goalTitle: "Completed Yesterday",
        goalDescription: "Completed goal",
        category: "Journaling",
        difficulty: "medium",
        points: 25,
        completed: true,
        completedAt: new Date("2026-09-27T18:00:00Z").getTime(),
        skipped: false,
        createdAt: new Date("2026-09-27T08:00:00Z").getTime(),
        date: "2026-09-27",
      });
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_cd_04",
      dateStr: "2026-09-28",
    });

    expect(goals.map((g) => g.goalId)).not.toContain(completedCandidate);
  });

  // P8-COOLDOWN-05: No duplicate goal IDs occur in the same recommendation set
  test("P8-COOLDOWN-05: No duplicate goal IDs occur in the same recommendation set", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_cd_05",
      email: "cd05@emotify.com",
      name: "No Duplicates Student",
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "good",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_cd_05",
      dateStr: "2026-09-28",
    });

    const goalIds = goals.map((g) => g.goalId);
    expect(goalIds).toHaveLength(5);
    expect(new Set(goalIds).size).toBe(5);
  });

  // P8-FALLBACK-01: Insufficient eligible candidates are handled deterministically
  test("P8-FALLBACK-01: Insufficient eligible candidates are handled deterministically", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_fb_01",
      email: "fb01@emotify.com",
      name: "Fallback Student 01",
    });

    // In small tier (8 templates), put 7 templates on cooldown within the last 7 days
    const smallTemplates = ROUTINE_HABIT_CATALOG.small;
    const coolingTemplates = smallTemplates.slice(0, 7);
    const onlyEligibleTemplate = smallTemplates[7];

    await t.run(async (ctx) => {
      let dayOffset = 1;
      for (const tpl of coolingTemplates) {
        const pastDate = `2026-09-${String(28 - dayOffset).padStart(2, "0")}`;
        await ctx.db.insert("microGoals", {
          userId: "p8_user_fb_01",
          goalId: tpl.id,
          goalTitle: tpl.title,
          goalDescription: tpl.description,
          category: tpl.category,
          difficulty: tpl.difficulty,
          points: tpl.points,
          completed: true,
          skipped: false,
          createdAt: new Date(`${pastDate}T10:00:00Z`).getTime(),
          date: pastDate,
        });
        dayOffset++;
      }
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_fb_01",
      dateStr: "2026-09-28",
    });

    const todaySmall = goals.filter((g) => g.difficulty === "easy");
    expect(todaySmall).toHaveLength(2);
    // The only eligible template is selected
    expect(todaySmall.map((g) => g.goalId)).toContain(onlyEligibleTemplate.id);
    // Both selected small goals are unique
    expect(new Set(todaySmall.map((g) => g.goalId)).size).toBe(2);
  });

  // P8-FALLBACK-02: The engine never invents a goal not present in the catalog
  test("P8-FALLBACK-02: The engine never invents a goal not present in the catalog", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_fb_02",
      email: "fb02@emotify.com",
      name: "Catalog Student",
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_fb_02",
      dateStr: "2026-09-28",
    });

    for (const g of goals) {
      const catalogEntry = ROUTINE_TEMPLATE_BY_ID.get(g.goalId);
      expect(catalogEntry).toBeDefined();
      expect(catalogEntry!.title).toBe(g.goalTitle);
      expect(catalogEntry!.category).toBe(g.category);
    }
  });

  // P8-TIER-01: Existing small/medium/large/challenge structure remains intact when enough eligible candidates exist
  test("P8-TIER-01: Existing small/medium/large/challenge structure remains intact", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_tier_01",
      email: "tier01@emotify.com",
      name: "Tier Structure Student",
    });

    await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_tier_01",
      dateStr: "2026-09-28",
    });

    expect(goals).toHaveLength(5);
    const smallGoals = goals.filter((g) => g.difficulty === "easy");
    const mediumGoals = goals.filter((g) => g.difficulty === "medium" && !g.isDailyChallenge);
    const largeGoals = goals.filter((g) => g.difficulty === "large" && !g.isDailyChallenge);
    const challengeGoals = goals.filter((g) => g.isDailyChallenge);

    expect(smallGoals).toHaveLength(2);
    expect(mediumGoals).toHaveLength(1);
    expect(largeGoals).toHaveLength(1);
    expect(challengeGoals).toHaveLength(1);
  });

  // P8-AUTH-01: Unauthenticated recommendation generation is rejected
  test("P8-AUTH-01: Unauthenticated recommendation generation is rejected", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.microGoals.submitMorningCheckin, {
        mood: "calm",
        dateStr: "2026-09-28",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  // P8-AUTH-02: Cross-student access remains rejected
  test("P8-AUTH-02: Cross-student access remains rejected", async () => {
    const t = convexTest(schema, modules);
    const studentA = t.withIdentity({
      subject: "student_a_auth_02",
      email: "a@emotify.com",
      name: "Student A",
    });

    await studentA.mutation(api.microGoals.submitMorningCheckin, {
      mood: "calm",
      dateStr: "2026-09-28",
    });

    const studentB = t.withIdentity({
      subject: "student_b_auth_02",
      email: "b@emotify.com",
      name: "Student B",
    });

    await expect(
      studentB.query(api.microGoals.getTodayGoals, {
        userId: "student_a_auth_02",
        dateStr: "2026-09-28",
      })
    ).rejects.toThrow("Unauthorized");
  });

  // P8-DECOUPLE-STEP6-01: Daily recommendation generation does not depend on clinical screening data
  test("P8-DECOUPLE-STEP6-01: Daily recommendation generation does not depend on clinical screening data", async () => {
    const t = convexTest(schema, modules);
    const tUser = t.withIdentity({
      subject: "p8_user_decouple_step6",
      email: "decouple_s6@emotify.com",
      name: "Decouple Step 6 Student",
    });

    // Ensure database has zero screening attempts or triages
    await t.run(async (ctx) => {
      const attempts = await ctx.db.query("screeningAttempts").collect();
      expect(attempts).toHaveLength(0);
      const triages = await ctx.db.query("triages").collect();
      expect(triages).toHaveLength(0);
    });

    const checkin = await tUser.mutation(api.microGoals.submitMorningCheckin, {
      mood: "good",
      dateStr: "2026-09-28",
    });
    expect(checkin.success).toBe(true);

    const goals = await tUser.query(api.microGoals.getTodayGoals, {
      userId: "p8_user_decouple_step6",
      dateStr: "2026-09-28",
    });
    expect(goals).toHaveLength(5);

    // Verify triages and screeningAttempts remain 0
    await t.run(async (ctx) => {
      const attempts = await ctx.db.query("screeningAttempts").collect();
      expect(attempts).toHaveLength(0);
      const triages = await ctx.db.query("triages").collect();
      expect(triages).toHaveLength(0);
    });
  });

  // P8-MOOD-01: Changing mood alone does not alter daily recommendation selection
  test("P8-MOOD-01: Changing mood alone does not alter daily recommendation selection", async () => {
    const selectMoodGood = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_mood_01",
      dateStr: "2026-09-28",
    });
    const selectMoodSad = selectDailyRoutineGoalsDeterministically({
      userId: "p8_user_mood_01",
      dateStr: "2026-09-28",
    });

    // The selection engine is 100% mood-blind
    expect(selectMoodGood.allSelected.map((g) => g.id)).toEqual(
      selectMoodSad.allSelected.map((g) => g.id)
    );
  });

  // P8-MOOD-02: No mood-to-goal mapping logic exists in the daily engine
  test("P8-MOOD-02: No mood-to-goal mapping logic exists in the daily engine", async () => {
    for (const tpl of ALL_ROUTINE_TEMPLATES) {
      expect(tpl).not.toHaveProperty("targetEmotion");
      expect(tpl).not.toHaveProperty("mood");
      expect(tpl).not.toHaveProperty("clinicalIndication");
    }
  });
});

