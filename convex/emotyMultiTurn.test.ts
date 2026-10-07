/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";
import {
  buildModularEmotyPrompt,
  determineSemanticIntent,
  enforceConversationalGuardrails,
  isUserDecliningOrSettingBoundary,
  isUserEndingConversation,
} from "./emotyIntent";
import {
  buildConversationContext,
  formatEmotyContextPrompt,
  type EmotyContext,
} from "./emotyContext";
import { classifyServerSafety, getControlledCrisisResponse } from "./emotySafety";
import { validateAndResolveAction } from "./emotyActionRouter";
import type { EmotyResponseContract } from "./emotyContract";

const modules = import.meta.glob("./**/*.ts");

function createMockContext(overrides?: Partial<EmotyContext>): EmotyContext {
  return {
    app: {
      screen: "home",
      ...overrides?.app,
    },
    user: {
      ageCohort: "19-24",
      preferredName: "Alex",
      ...overrides?.user,
    },
    conversation: {
      recentMessages: [],
      ...overrides?.conversation,
    },
    safety: {
      state: "normal",
      ...overrides?.safety,
    },
    memory: overrides?.memory,
  };
}

describe("AI-3 Step 9: Multi-Turn Dialogue Polish (MT-01 to MT-20)", () => {
  // =========================================================================
  // 1. CONTINUITY & QUESTION DYNAMICS (MT-01 to MT-04)
  // =========================================================================

  test("MT-01: Basic continuity across conversational turns", () => {
    const history = [
      { role: "user", content: "I've been really tired lately." },
      { role: "assistant", content: "I hear you. Feeling constantly exhausted is really draining." },
    ];
    const conversation = buildConversationContext(history.reverse());
    const context = createMockContext({ conversation });

    const currentMsg = "Mostly because college has been hectic.";
    const { prompt } = buildModularEmotyPrompt({
      context,
      currentUserMessage: currentMsg,
    });

    expect(prompt).toContain("I've been really tired lately.");
    expect(prompt).toContain("Mostly because college has been hectic.");
    expect(prompt).toContain("[MULTI-TURN CONVERSATIONAL DYNAMICS]");
  });

  test("MT-02: No repeated question across turns", () => {
    const history = [
      { role: "user", content: "I'm stressed about college." },
      { role: "assistant", content: "What feels most overwhelming about it right now?" },
      { role: "user", content: "My assignments are piling up." },
    ];
    const conversation = buildConversationContext(history.reverse());
    const context = createMockContext({ conversation });

    const { prompt } = buildModularEmotyPrompt({
      context,
      currentUserMessage: "My assignments are piling up.",
    });

    // The prompt contains explicit anti-repetition rules
    expect(prompt).toContain("Do NOT ask the same question again or rephrase it");
    expect(prompt).toContain("acknowledge their answer and move forward");
  });

  test("MT-03: Selective questioning allows answering without questions", () => {
    const contract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "That makes a lot of sense. Balancing heavy coursework takes a real toll on your energy.",
      action: { type: "none" },
      avatarState: "supportive",
    };

    const guarded = enforceConversationalGuardrails(contract, "My assignments are piling up.");
    // Response is valid and complete without forcing a question mark
    expect(guarded.response.includes("?")).toBe(false);
    expect(guarded.mode).toBe("emotional_support");
  });

  test("MT-04: At most one useful question per response", () => {
    const multiQuestionContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "That sounds rough. Are you getting enough sleep? What's your schedule like tomorrow?",
      action: { type: "none" },
      avatarState: "worried",
    };

    const guarded = enforceConversationalGuardrails(multiQuestionContract, "I'm so exhausted.");
    const questions = guarded.response.match(/\?/g);
    expect(questions?.length).toBe(1);
    expect(guarded.response).toContain("Are you getting enough sleep?");
    expect(guarded.response).not.toContain("schedule like tomorrow");
  });

  // =========================================================================
  // 2. USER REFUSAL & BOUNDARY RESPECT (MT-05 to MT-06)
  // =========================================================================

  test("MT-05: User says 'no' — respects refusal without alternative tools", () => {
    const userRefusal = "No, I'm okay.";
    expect(isUserDecliningOrSettingBoundary(userRefusal)).toBe(true);

    const intent = determineSemanticIntent(userRefusal);
    expect(intent.mode).toBe("emotional_support");
    expect(intent.recommendedAction).toBe("none");

    const candidateContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "Totally fine! Would you like to try journaling instead?",
      action: { type: "open_emotion_map", label: "Check In" },
      avatarState: "calm",
    };

    const guarded = enforceConversationalGuardrails(candidateContract, userRefusal);
    expect(guarded.action.type).toBe("none");
    expect(guarded.response.includes("?")).toBe(false);
  });

  test("MT-06: User says 'leave it' — respects boundary without probing", () => {
    const userBoundary = "Leave it.";
    expect(isUserDecliningOrSettingBoundary(userBoundary)).toBe(true);

    const candidateContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "Understood. Why don't you want to talk about it?",
      action: { type: "none" },
      avatarState: "calm",
    };

    const guarded = enforceConversationalGuardrails(candidateContract, userBoundary);
    expect(guarded.action.type).toBe("none");
    expect(guarded.response.includes("?")).toBe(false);
    expect(guarded.response).toContain("Understood.");
  });

  // =========================================================================
  // 3. TOPIC SHIFTS & CASUAL FLOW (MT-07 to MT-08)
  // =========================================================================

  test("MT-07: Topic shift cleanly follows new intent without dragging old distress", () => {
    const topicShiftMsg = "Anyway, what are you doing today?";
    const intent = determineSemanticIntent(topicShiftMsg);

    expect(intent.mode).toBe("casual");
    expect(intent.recommendedAction).toBe("none");
  });

  test("MT-08: Casual conversation does not inject mental-health tools", () => {
    const casualMsg = "What's up?";
    const intent = determineSemanticIntent(casualMsg);

    expect(intent.mode).toBe("casual");
    expect(intent.recommendedAction).toBe("none");

    const contract: EmotyResponseContract = {
      mode: "casual",
      response: "Hey Alex! Just here ready to chat or help with your goals today.",
      action: { type: "none" },
      avatarState: "happy",
    };

    const guarded = enforceConversationalGuardrails(contract, casualMsg);
    expect(guarded.mode).toBe("casual");
    expect(guarded.action.type).toBe("none");
  });

  // =========================================================================
  // 4. EMOTIONAL EXPRESSION VS INTERVENTION REQUEST (MT-09 to MT-10)
  // =========================================================================

  test("MT-09: Emotional statement alone does NOT trigger or prescribe an intervention", () => {
    const pureEmotion = "I'm exhausted.";
    const intent = determineSemanticIntent(pureEmotion);

    expect(intent.mode).toBe("emotional_support");
    expect(intent.recommendedAction).toBe("none");

    // Guardrail neutralizes both structured action and verbal pressure
    const pushyContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "I'm sorry to hear that. You should do a breathing exercise right now.",
      action: { type: "start_breathing", label: "Breathe" },
      avatarState: "tired",
    };

    const guarded = enforceConversationalGuardrails(pushyContract, pureEmotion);
    expect(guarded.action.type).toBe("none");
    expect(guarded.response).not.toContain("You should do a breathing exercise");
  });

  test("MT-10: Explicit intervention request is recognized as guidance", () => {
    const interventionRequest = "I'm exhausted. Give me something that might help.";
    const intent = determineSemanticIntent(interventionRequest);

    expect(intent.mode).toBe("guidance");
  });

  // =========================================================================
  // 5. PREFERENCES & OVERRIDES (MT-11 to MT-12)
  // =========================================================================

  test("MT-11: Preference usage is bounded and forbids internal meta-reference", () => {
    const context = createMockContext({
      memory: {
        preferences: [{ category: "communication_preference", key: "response_length", value: "concise" }],
      },
    });

    const { prompt } = buildModularEmotyPrompt({
      context,
      currentUserMessage: "How does the weather look?",
    });

    expect(prompt).toContain("communication_preference (response_length): concise");
    expect(prompt).toContain("Never mention internal memory mechanics");
  });

  test("MT-12: Preference overridden by current request", () => {
    const context = createMockContext({
      memory: {
        preferences: [{ category: "communication_preference", key: "response_length", value: "concise" }],
      },
    });

    const { prompt } = buildModularEmotyPrompt({
      context,
      currentUserMessage: "Explain this in detail please.",
    });

    expect(prompt).toContain("PRIORITY OVERRIDE: Current user request always overrides past preferences");
  });

  // =========================================================================
  // 6. MEMORY BOUNDARIES & CLOSING (MT-13 to MT-15)
  // =========================================================================

  test("MT-13: No hallucinated memory when information is not in context", () => {
    const { prompt } = buildModularEmotyPrompt({
      context: createMockContext(),
      currentUserMessage: "You remember what I told you last month?",
    });

    expect(prompt).toContain("No Hallucinated Memory");
    expect(prompt).toContain("explain gently that you don't have access to past conversations from that time");
  });

  test("MT-14: Conversation ending produces warm closing with no questions or tools", () => {
    const goodbyeMsg = "Thanks, that's all.";
    expect(isUserEndingConversation(goodbyeMsg)).toBe(true);

    const intent = determineSemanticIntent(goodbyeMsg);
    expect(intent.mode).toBe("casual");
    expect(intent.recommendedAction).toBe("none");

    const goodbyeContract: EmotyResponseContract = {
      mode: "casual",
      response: "Anytime! Take care of yourself today. How else can I help?",
      action: { type: "open_emotion_map", label: "Check In" },
      avatarState: "calm",
    };

    const guarded = enforceConversationalGuardrails(goodbyeContract, goodbyeMsg);
    expect(guarded.mode).toBe("casual");
    expect(guarded.action.type).toBe("none");
    expect(guarded.response.includes("?")).toBe(false);
  });

  test("MT-15: Short response ('Yeah') continues naturally without clinical alarm", () => {
    const shortResp = "Yeah.";
    const intent = determineSemanticIntent(shortResp);

    expect(intent.mode).toBe("casual");
    expect(intent.recommendedAction).toBe("none");
  });

  // =========================================================================
  // 7. CONVERSATIONAL DYNAMICS (MT-16 to MT-17)
  // =========================================================================

  test("MT-16: Contradictory turns follow the current statement", () => {
    // Earlier: "I'm fine." Later: "Actually, I'm having a rough day."
    const laterTurn = "Actually, I'm having a rough day.";
    const intent = determineSemanticIntent(laterTurn);

    expect(intent.mode).toBe("emotional_support");
  });

  test("MT-17: Multiple topics preserve ordering and chronological integrity", () => {
    const rawHistory = [
      { role: "user", content: "College is crazy." },
      { role: "assistant", content: "It sounds really intense." },
      { role: "user", content: "And my friend isn't talking to me." },
      { role: "assistant", content: "That must hurt." },
      { role: "user", content: "I also haven't slept." },
      { role: "assistant", content: "Lack of sleep makes everything heavier." },
    ];

    const context = buildConversationContext(rawHistory.reverse());
    expect(context.recentMessages).toHaveLength(6);
    expect(context.recentMessages[0].content).toBe("College is crazy.");
    expect(context.recentMessages[4].content).toBe("I also haven't slept.");
  });

  // =========================================================================
  // 8. SCOPE & SAFETY PRESERVATION (MT-18 to MT-20)
  // =========================================================================

  test("MT-18: Out-of-scope contextual exception detects distress with academic topic", () => {
    const academicWithDistress = "I can't understand Newton's laws and it's stressing me out.";
    const intent = determineSemanticIntent(academicWithDistress);

    expect(intent.mode).toBe("emotional_support");
    expect(intent.mode).not.toBe("out_of_scope");
  });

  test("MT-19: True out-of-scope request enforces lane boundary", () => {
    const pureTrivia = "Who discovered gravity?";
    const intent = determineSemanticIntent(pureTrivia);

    expect(intent.mode).toBe("out_of_scope");

    const triviaContract: EmotyResponseContract = {
      mode: "out_of_scope",
      response: "Isaac Newton discovered gravity in 1687.",
      action: { type: "none" },
      avatarState: "thinking",
    };

    const guarded = enforceConversationalGuardrails(triviaContract, pureTrivia);
    expect(guarded.response).toContain("outside my lane");
    expect(guarded.response).not.toContain("1687");
  });

  test("MT-20: Action recommendation router remains authoritative with zero execution claims", () => {
    const actionQuery = "Can you help me start a breathing exercise?";
    const resolvedAction = validateAndResolveAction(
      { type: "start_breathing", label: "Start Breathing" },
      "normal"
    );

    expect(resolvedAction.valid).toBe(true);
    if (resolvedAction.valid) {
      expect(resolvedAction.action.type).toBe("start_breathing");
    }

    // Guardrail prevents Gemini claiming it executed navigation
    const claimContract: EmotyResponseContract = {
      mode: "guidance",
      response: "I have started your breathing exercise now.",
      action: { type: "start_breathing", label: "Breathe" },
      avatarState: "breathing",
    };

    const guarded = enforceConversationalGuardrails(claimContract, actionQuery);
    expect(guarded.response).toContain("You can start your breathing exercise");
    expect(guarded.response).not.toContain("I have started");
  });
});
