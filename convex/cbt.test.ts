/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

describe("CBT Therapy Module State Machine", () => {
  test("CBT complete workflow: start, message exchange, reframe selection, rating, and goal completion", async () => {
    // 1. Initialize convex test with user identity
    let t = convexTest(schema, modules).withIdentity({
      subject: "user_test_patient_123",
      email: "patient@emotify.com",
      name: "John Doe",
    });
    const uid_user_test_patient_123 = await testUserId(t, "user_test_patient_123");

    // 2. Start a fresh session
    const initRes = await t.mutation(api.cbt.startSession, { forceNew: true });
    expect(initRes.resumed).toBe(false);
    expect(initRes.session).toBeDefined();
    
    const sessionId = initRes.session!._id;
    expect(initRes.session!.sessionStatus).toBe("active");
    expect(initRes.session!.currentStep).toBe("understanding");
    expect(initRes.session!.conversation).toHaveLength(1); // includes initial greeting
    expect(initRes.session!.conversation[0].role).toBe("assistant");

    // 3. Submit first message (understanding phase)
    // In mock mode, the model keeps chatting or forces transition after 3 user turns
    const submit1 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I am feeling very stressed about failing my next final exam."
    });
    expect(submit1.step).toBe("understanding");

    const sessionState1 = await t.query(api.cbt.getSession, { sessionId });
    // User message & AI reply should be appended
    expect(sessionState1!.conversation).toHaveLength(3); 
    expect(sessionState1!.conversation[1].content).toBe("I am feeling very stressed about failing my next final exam.");
    expect(sessionState1!.conversation[2].role).toBe("assistant");

    // 4. Submit second message (understanding phase, turn 2)
    const submit2 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I feel like if I fail this exam, I'm a complete failure."
    });
    expect(submit2.step).toBe("understanding");

    // 5. Submit third message (understanding phase, turn 3 -> triggers mock transition to guided discovery)
    const submit3 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "Yes, I really worry about that."
    });
    // In mock mode, third turn triggers a transition to guided_discovery
    expect(submit3.step).toBe("guided_discovery");

    const sessionState3 = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionState3!.currentStep).toBe("guided_discovery");
    expect(sessionState3!.situation).toBe("Stressful event");
    expect(sessionState3!.automaticThought).toBe("Yes, I really worry about that.");
    expect(sessionState3!.thinkingStyle).toBe("I'm being hard on myself");
    expect(sessionState3!.cbtDistortion).toBe("All-or-Nothing Thinking");
    expect(sessionState3!.challengeQuestions).toHaveLength(3);
    expect(sessionState3!.stepIndex).toBe(0);

    // 6. Guided Discovery - Answer first challenge question
    const discover1 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I don't have much solid evidence, it's just a fear."
    });
    expect(discover1.step).toBe("guided_discovery");
    
    const sessionStateGD1 = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateGD1!.stepIndex).toBe(1);
    expect(sessionStateGD1!.challengeAnswers).toHaveLength(1);

    // 7. Guided Discovery - Answer second challenge question
    const discover2 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "Well, I studied for 15 hours last week, so that is evidence against failing."
    });
    expect(discover2.step).toBe("guided_discovery");
    
    const sessionStateGD2 = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateGD2!.stepIndex).toBe(2);

    // 8. Guided Discovery - Answer third challenge question (triggers transition to reflection)
    const discover3 = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I would tell a friend that one test does not determine their worth."
    });
    expect(discover3.step).toBe("reflection"); // Asks: "Reflecting on all of this, what do you think now?"

    const sessionStateRef = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateRef!.currentStep).toBe("reflection");
    expect(sessionStateRef!.challengeAnswers).toHaveLength(3);

    // 9. Submit Reflection (triggers generation of 3 balanced thoughts)
    const reflectionSubmit = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I see that my thinking was a bit extreme. I am prepared."
    });
    expect(reflectionSubmit.step).toBe("balanced_thought");
    expect(reflectionSubmit.thoughtsOptions).toHaveLength(3);

    const sessionStateBt = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateBt!.currentStep).toBe("balanced_thought");
    expect(sessionStateBt!.balancedThoughtsOptions).toHaveLength(3);

    // 10. Select Balanced Thought and edit it
    const chosenThought = "Although this exam is important, it does not define my intelligence or future. I will do my best.";
    await t.mutation(api.cbt.selectBalancedThought, {
      sessionId,
      thought: chosenThought
    });

    const sessionStateBelief = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateBelief!.currentStep).toBe("belief");
    expect(sessionStateBelief!.balancedThought).toBe(chosenThought);

    // 11. Submit Belief Rating
    await t.mutation(api.cbt.submitBeliefRating, {
      sessionId,
      score: 80
    });

    const sessionStateEmotionAfter = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateEmotionAfter!.currentStep).toBe("emotion_after");
    expect(sessionStateEmotionAfter!.beliefScore).toBe(80);

    // 12. Submit Emotion After Rating (transitions to recovery_coach step and generates goal)
    await t.mutation(api.cbt.submitEmotionAfterRating, {
      sessionId,
      intensity: 3
    });

    const sessionStateGoal = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionStateGoal!.currentStep).toBe("recovery_coach");
    expect(sessionStateGoal!.emotionAfter).toBe(3);
    
    // Recovery Coach action recommendation is run in mock mode
    const goals = await t.action(api.cbt.recommendGoalAction, { sessionId });
    expect(goals).toBeDefined();
    expect(goals).toHaveLength(4);
    expect(goals[0].title).toBeDefined();

    // 13. Accept Recommended Goals (creates microGoal documents and completes session)
    const selectedIds = [goals[0].id, goals[1].id];
    await t.mutation(api.cbt.acceptGoal, { sessionId, selectedGoalIds: selectedIds });

    const finalSession = await t.query(api.cbt.getSession, { sessionId });
    expect(finalSession!.currentStep).toBe("completed");
    expect(finalSession!.sessionStatus).toBe("completed");
    expect(finalSession!.goalCompletion).toBe(true);

    // 14. Verify micro goals were indeed inserted for patient
    const patientGoals = await t.query(api.microGoals.getTodayGoals, { userId: uid_user_test_patient_123 });
    expect(patientGoals).toHaveLength(2);
    expect(patientGoals[0].goalTitle).toBe(goals[0].title);
    expect(patientGoals[0].cbtSessionId).toBe(sessionId);
    expect(patientGoals[1].goalTitle).toBe(goals[1].title);
    expect(patientGoals[1].cbtSessionId).toBe(sessionId);
  });

  test("CBT Safety Trigger - triggers safety mode and logs counsellor alerts", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "patient_distressed_xyz",
      email: "patient@emotify.com",
      name: "Jane Doe",
    });
    const uid_patient_distressed_xyz = await testUserId(t, "patient_distressed_xyz");

    const initRes = await t.mutation(api.cbt.startSession, { forceNew: true });
    const sessionId = initRes.session!._id;

    // Send a message triggering the safety filter
    const safetyRes = await t.action(api.cbt.submitMessage, {
      sessionId,
      content: "I cannot take this anymore, I just want to kill myself."
    });

    expect(safetyRes.step).toBe("safety_mode");

    const sessionState = await t.query(api.cbt.getSession, { sessionId });
    expect(sessionState!.sessionStatus).toBe("safety_mode");
    expect(sessionState!.currentStep).toBe("safety_mode");
    expect(sessionState!.riskFlags).toContain("suicide");

    // Verify counselor alert was created
    const alerts = await t.query(api.dashboard.getAlerts);
    expect(alerts.some(a => a.userId === uid_patient_distressed_xyz && a.type === "suicideRisk")).toBe(true);

    // Verify crisis goal overrides are recommended instead of normal behavioral activation
    const safetyGoals = await t.action(api.cbt.recommendGoalAction, { sessionId });
    expect(safetyGoals).toHaveLength(4);
    expect(safetyGoals[0].id).toBe("crisis_call");
    expect(safetyGoals[1].id).toBe("crisis_grounding");
  });
});
