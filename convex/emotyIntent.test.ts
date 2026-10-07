/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  determineSemanticIntent,
  enforceConversationalGuardrails,
  buildModularEmotyPrompt,
  EMOTY_IDENTITY_SECTION,
  EMOTY_BEHAVIOR_SECTION,
  INTENT_AND_MODE_RULES_SECTION,
  OUT_OF_SCOPE_RULES_SECTION,
  CONVERSATIONAL_STYLE_SECTION,
  SAFETY_BOUNDARY_SECTION,
  ACTION_RECOMMENDATION_RULES_SECTION,
} from "./emotyIntent";
import {
  type EmotyResponseContract,
  validateEmotyResponse,
  getSafeStructuredFallback,
  EMOTY_MODES,
  EMOTY_ACTION_TYPES,
  EMOTY_AVATAR_STATES,
} from "./emotyContract";
import { type EmotyContext } from "./emotyContext";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 3: Intent, Conversational Reasoning & Personality Foundation", () => {
  const dummyContext: EmotyContext = {
    user: {
      preferredName: "Alex",
      ageCohort: "19-24",
      language: "en",
    },
    app: {
      screen: "home",
      todayGoal: {
        title: "10-minute breathing exercise",
        status: "not_started",
      },
      currentEmotion: "stressed",
      activeActivity: "breathing",
      activeGoal: "Complete breathing before sleep",
    },
    conversation: {
      recentMessages: [
        { role: "user", content: "Hey Emoty" },
        { role: "assistant", content: "Hey Alex! How are things going today?" },
      ],
    },
    safety: {
      state: "normal",
    },
  };

  // =========================================================================
  // INTENT-01 to INTENT-10: SEMANTIC INTENT CLASSIFICATION REASONING
  // =========================================================================

  test("INTENT-01: Casual greeting -> casual", () => {
    const greetings = ["Hey", "Good morning", "Hello there", "Hi Emoty", "Yo!"];
    for (const msg of greetings) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("casual");
      expect(intent.recommendedAction).toBe("none");
    }
  });

  test("INTENT-02: Ordinary conversation -> casual", () => {
    const convos = [
      "What are you up to?",
      "That was pretty funny",
      "Thanks, I appreciate it",
      "Just chilling right now",
    ];
    for (const msg of convos) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("casual");
      expect(intent.recommendedAction).toBe("none");
    }
  });

  test("INTENT-03: Emotional expression -> emotional_support", () => {
    const emotionalShares = [
      "I'm feeling lonely.",
      "Today was horrible.",
      "I don't know why but I feel weird.",
      "I've been thinking about my friend all day and feeling sad.",
      "I feel completely exhausted and drained.",
    ];
    for (const msg of emotionalShares) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("emotional_support");
      expect(intent.recommendedAction).toBe("none");
    }
  });

  test("INTENT-04: Emotional statement with request for help -> guidance", () => {
    const requests = [
      "I'm stressed about my exam tomorrow. What should I do?",
      "I'm tired. What can help?",
      "I'm feeling so anxious, what can I do right now?",
      "I keep procrastinating because I'm anxious. Help me figure this out.",
    ];
    for (const msg of requests) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("guidance");
    }
  });

  test("INTENT-05: Practical wellbeing question -> guidance", () => {
    const wellbeingQuestions = [
      "How do I calm myself down before sleeping?",
      "What can I do when I feel overwhelmed?",
      "How can I calm my breathing right now?",
    ];
    for (const msg of wellbeingQuestions) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("guidance");
    }
  });

  test("INTENT-06: Emotify feature question -> app_assistance", () => {
    const featureQuestions = [
      "Where can I see today's goal?",
      "How do I do the breathing exercise in this app?",
      "Can I check my emotions?",
      "How does this app work?",
    ];
    for (const msg of featureQuestions) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("app_assistance");
    }
  });

  test("INTENT-07: Unrelated factual question -> out_of_scope", () => {
    const factualQuestions = [
      "Who discovered gravity?",
      "What is the capital of France?",
      "Explain quantum mechanics.",
      "What is 27 * 43?",
    ];
    for (const msg of factualQuestions) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("out_of_scope");
      expect(intent.recommendedAction).toBe("none");
    }
  });

  test("INTENT-08: Unrelated programming question -> out_of_scope", () => {
    const codingQuestions = [
      "Write me a Java program.",
      "Write a python script to parse CSV files.",
      "How do I write a quicksort algorithm in C++?",
    ];
    for (const msg of codingQuestions) {
      const intent = determineSemanticIntent(msg, dummyContext);
      expect(intent.mode).toBe("out_of_scope");
      expect(intent.recommendedAction).toBe("none");
    }
  });

  test("INTENT-09: Academic question containing emotional context -> emotional_support or guidance rather than out_of_scope", () => {
    // Academic subject + emotional distress = NOT out of scope!
    const emotionalAcademic1 = "I'm stressed because I don't understand Newton's laws.";
    const intent1 = determineSemanticIntent(emotionalAcademic1, dummyContext);
    expect(["emotional_support", "guidance"]).toContain(intent1.mode);
    expect(intent1.mode).not.toBe("out_of_scope");

    const emotionalAcademic2 = "Can you help me understand this assignment? I'm really anxious about failing.";
    const intent2 = determineSemanticIntent(emotionalAcademic2, dummyContext);
    expect(["emotional_support", "guidance"]).toContain(intent2.mode);
    expect(intent2.mode).not.toBe("out_of_scope");
  });

  test("INTENT-10: Same emotion with different intents produces different modes", () => {
    // 1. Just expressing exhaustion -> emotional_support
    const expr = determineSemanticIntent("I'm tired.", dummyContext);
    expect(expr.mode).toBe("emotional_support");

    // 2. Asking what to do about it -> guidance
    const guide1 = determineSemanticIntent("I'm tired. What should I do?", dummyContext);
    expect(guide1.mode).toBe("guidance");

    const guide2 = determineSemanticIntent("I'm tired. Give me something that might help.", dummyContext);
    expect(guide2.mode).toBe("guidance");
  });

  // =========================================================================
  // INTENT-11 to INTENT-20: GUARDRAILS, ACTIONS, CONTEXT & ARCHITECTURE
  // =========================================================================

  test("INTENT-11: Emotional statement does not automatically trigger an intervention", () => {
    // User expresses negative emotion
    const candidateContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "That sounds like a really rough day. It makes sense you feel so drained.",
      action: { type: "start_breathing" }, // Incorrectly suggested by an overzealous prompt
      avatarState: "supportive",
    };

    const guarded = enforceConversationalGuardrails(
      candidateContract,
      "I had a terrible day."
    );

    // Pure emotion expression must strip unprompted intervention to 'none'
    expect(guarded.action.type).toBe("none");
  });

  test("INTENT-12: Follow-up question is optional rather than mandatory", () => {
    // Valid natural response without any question mark
    const contractWithoutQuestion: EmotyResponseContract = {
      mode: "emotional_support",
      response: "Yeah, sounds like you need a break.",
      action: { type: "none" },
      avatarState: "calm",
    };

    const guarded = enforceConversationalGuardrails(contractWithoutQuestion, "I'm tired.");
    expect(guarded.response).toBe("Yeah, sounds like you need a break.");
    expect(guarded.response.includes("?")).toBe(false);
  });

  test("INTENT-13: More than one follow-up question is prevented", () => {
    const candidateContract: EmotyResponseContract = {
      mode: "emotional_support",
      response: "That sounds hard. What made today so difficult? Did something happen with classes?",
      action: { type: "none" },
      avatarState: "worried",
    };

    const guarded = enforceConversationalGuardrails(candidateContract, "Today was bad.");
    const questions = guarded.response.match(/\?/g);
    expect(questions).not.toBeNull();
    expect(questions!.length).toBe(1);
    expect(guarded.response).toBe("That sounds hard. What made today so difficult?");
  });

  test("INTENT-14: Out-of-scope response does not answer the unrelated question", () => {
    // If a model attempted to calculate 27 * 43 before redirecting
    const candidateContract: EmotyResponseContract = {
      mode: "out_of_scope",
      response: "27 * 43 is 1161. By the way, how are you feeling today?",
      action: { type: "none" },
      avatarState: "idle",
    };

    const guarded = enforceConversationalGuardrails(candidateContract, "What is 27 * 43?");
    expect(guarded.response).not.toContain("1161");
    expect(guarded.response).toContain("outside my lane");
    expect(guarded.action.type).toBe("none");
  });

  test("INTENT-15: Model cannot invent unavailable app features (Action type allowlist)", () => {
    const invalidActionContract = {
      mode: "app_assistance" as const,
      response: "Let me open the sleep hypnosis tracker.",
      action: { type: "open_sleep_hypnosis" as any },
      avatarState: "thinking" as const,
    };

    const validation = validateEmotyResponse(invalidActionContract);
    expect(validation.success).toBe(false);

    // If passed to guardrail fallback, action defaults to none
    const guarded = enforceConversationalGuardrails(
      { ...invalidActionContract, action: { type: "none" } },
      "Open sleep hypnosis"
    );
    expect(guarded.action.type).toBe("none");
  });

  test("INTENT-16: Model cannot claim an action was completed", () => {
    const candidateContract: EmotyResponseContract = {
      mode: "guidance",
      response: "I have started your breathing exercise now. Follow along with the rhythm.",
      action: { type: "start_breathing" },
      avatarState: "breathing",
    };

    const guarded = enforceConversationalGuardrails(candidateContract, "Help me calm down.");
    // Claim of starting the exercise is neutralized
    expect(guarded.response).not.toContain("I have started your");
    expect(guarded.response).toContain("You can start your breathing exercise");
  });

  test("INTENT-17: Client activeGoal and UI context are not treated as clinical truth", () => {
    // Context contains clientContext hinting at an activeGoal, but it is purely UI hint
    const promptData = buildModularEmotyPrompt({
      context: dummyContext,
      currentUserMessage: "What should I do right now?",
    });

    // Check that prompt separates context and does not treat UI activeGoal as a medical order
    expect(promptData.prompt).toContain("[CURRENT APP CONTEXT]");
    expect(promptData.prompt).toContain("Active goal: Complete breathing before sleep");
    expect(promptData.prompt).toContain("[SAFETY BOUNDARY]");
    expect(promptData.prompt).toContain("You are not a crisis counselor or medical authority");
  });

  test("INTENT-18: Age cohort affects permitted communication context but does not create psychological assumptions", () => {
    // Verify prompt contains age cohort rules without stereotyping
    expect(CONVERSATIONAL_STYLE_SECTION).toContain("13-18");
    expect(CONVERSATIONAL_STYLE_SECTION).toContain("19-24");
    expect(CONVERSATIONAL_STYLE_SECTION).toContain("Never stereotype or diagnose based on age cohort");

    // Total prompt with 19-24 cohort
    const promptData = buildModularEmotyPrompt({
      context: dummyContext,
      currentUserMessage: "Hey",
    });
    expect(promptData.prompt).toContain("Age cohort: 19-24");
  });

  test("INTENT-19: Structured response contract remains valid", () => {
    for (const mode of EMOTY_MODES) {
      for (const actionType of EMOTY_ACTION_TYPES) {
        const sample: EmotyResponseContract = {
          mode,
          response: "Valid test response.",
          action: { type: actionType },
          avatarState: "idle",
        };
        const validation = validateEmotyResponse(sample);
        expect(validation.success).toBe(true);
      }
    }
  });

  test("INTENT-20: Authentication, rate-limit, and security behavior remains intact", async () => {
    const t = convexTest(schema, modules);
    const uid_student_rate_limit_test = await testUserId(t, "student_rate_limit_test");

    // Unauthenticated call to generateAIResponse or createMessage must fail
    await expect(
      t.action(api.companion.generateAIResponse, {
        userMessageId: "msg_user_1",
        aiMessageId: "msg_ai_1",
        content: "Hello",
      })
    ).rejects.toThrow(/Unauthenticated/);

    // Rate limiting: 20 messages per day
    const studentUser = await t.run(async (ctx) => {
      return await ctx.db.patch(uid_student_rate_limit_test as any, {
        full_name: "Student Tester",
        role: "patient",
        createdAt: Date.now(),
      });
    });

    const studentCtx = t.withIdentity({
      subject: "student_rate_limit_test",
      issuer: "https://clerk.emotify.test",
    });

    // Seed companionRateLimits at daily limit (50 messages)
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: uid_student_rate_limit_test,
        burstCount: 1,
        burstWindowStart: Date.now(),
        dailyCount: 50,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });

    // Calling generateAIResponse when daily limit is reached must throw rate limit error
    await expect(
      studentCtx.action(api.companion.generateAIResponse, {
        userMessageId: "msg_user_over_limit",
        aiMessageId: "msg_ai_over_limit",
        content: "Another message",
      })
    ).rejects.toThrow(/limit of 50 messages/);
  });
});
