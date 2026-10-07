/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  ALLOWED_MEMORY_CATEGORIES,
  ALLOWED_MEMORY_KEYS_BY_CATEGORY,
  validateMemoryCandidate,
  detectMemoryCandidate,
  getBoundedUserMemoriesForContext,
  MAX_MEMORY_ITEMS_FOR_CONTEXT,
  MAX_MEMORY_TOTAL_CONTEXT_CHARS,
} from "./emotyMemory";
import { formatEmotyContextPrompt, type EmotyContext } from "./emotyContext";
import { buildModularEmotyPrompt } from "./emotyIntent";
import { validateEmotyResponse } from "./emotyContract";
import { classifyServerSafety } from "./emotySafety";
import { validateAndResolveAction } from "./emotyActionRouter";

const modules = import.meta.glob("./**/*.ts");

describe("AI-3 Step 7: Memory & Personalization Architecture (MEMORY-01 to MEMORY-20)", () => {
  // =========================================================================
  // 1. ALLOWED MEMORY STORAGE & DEDUPLICATION (MEMORY-01 to MEMORY-05)
  // =========================================================================

  test("MEMORY-01: Allowed communication preference can be stored", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_01";
    const asStudent = t.withIdentity({ subject: userId });

    const memoryId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
      source: "user_stated",
    });

    expect(memoryId).toBeDefined();

    const memories = await asStudent.query(api.emotyMemory.listUserMemories, {});
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe("communication_preference");
    expect(memories[0].key).toBe("response_length");
    expect(memories[0].value).toBe("concise");
    expect(memories[0].active).toBe(true);
  });

  test("MEMORY-02: Allowed support preference can be stored", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_02";
    const asStudent = t.withIdentity({ subject: userId });

    const memoryId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
      source: "user_stated",
    });

    expect(memoryId).toBeDefined();

    const memories = await asStudent.query(api.emotyMemory.listUserMemories, {});
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe("support_preference");
    expect(memories[0].key).toBe("exercise_preference");
    expect(memories[0].value).toBe("breathing_exercises");
  });

  test("MEMORY-03: Chosen-name preference can be stored", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_03";
    const asStudent = t.withIdentity({ subject: userId });

    const memoryId = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "chosen_name",
      key: "display_name",
      value: "Broski",
      source: "user_stated",
    });

    expect(memoryId).toBeDefined();

    const memories = await asStudent.query(api.emotyMemory.listUserMemories, {});
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe("chosen_name");
    expect(memories[0].value).toBe("Broski");
  });

  test("MEMORY-04: Duplicate preference is updated/deduplicated in place without accumulation", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_04";
    const asStudent = t.withIdentity({ subject: userId });

    // Initial insert
    const id1 = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    // Update with new value
    const id2 = await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "detailed",
    });

    // Same document updated (no duplicate row)
    expect(id1).toBe(id2);

    const memories = await asStudent.query(api.emotyMemory.listUserMemories, {});
    expect(memories).toHaveLength(1);
    expect(memories[0].value).toBe("detailed");
  });

  test("MEMORY-05: Temporary conversational facts are not automatically persisted as permanent memory", () => {
    // Temporary situational statements must return null from candidate detector
    expect(detectMemoryCandidate("I have an exam Friday.")).toBeNull();
    expect(detectMemoryCandidate("I'm annoyed with my friend today.")).toBeNull();
    expect(detectMemoryCandidate("Today was stressful.")).toBeNull();
    expect(detectMemoryCandidate("I didn't sleep well last night.")).toBeNull();

    // Only explicit permitted preference patterns are detected
    const candidate = detectMemoryCandidate("I prefer concise responses.");
    expect(candidate).not.toBeNull();
    expect(candidate?.category).toBe("communication_preference");
    expect(candidate?.value).toBe("concise");
  });

  // =========================================================================
  // 2. SAFETY & CLINICAL POLICY GATE (MEMORY-06 to MEMORY-10)
  // =========================================================================

  test("MEMORY-06: Clinical/diagnostic content is rejected by policy gate", () => {
    const diagnosticStatements = [
      "User has severe depression",
      "I was diagnosed with bipolar disorder",
      "My schizophrenia is getting worse",
      "Experiencing acute psychosis",
      "PTSD trauma trigger",
      "Borderline personality disorder symptoms",
    ];

    for (const statement of diagnosticStatements) {
      const res = validateMemoryCandidate({
        category: "support_preference",
        key: "guidance_type",
        value: statement,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Sensitive clinical");
      }
    }
  });

  test("MEMORY-07: PHQ/GAD/PQ questionnaire and screening information is rejected", () => {
    const screeningStatements = [
      "PHQ-9 score was 18",
      "GAD-7 severe anxiety score 16",
      "PQ-16 positive screening cutoff",
      "Failed depression screening assessment score",
    ];

    for (const statement of screeningStatements) {
      const res = validateMemoryCandidate({
        category: "routine_preference",
        key: "goal_timing",
        value: statement,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Sensitive clinical");
      }
    }
  });

  test("MEMORY-08: Triage/risk classifications are rejected", () => {
    const triageStatements = [
      "Classified as critical risk triage",
      "Patient is moderate risk level",
      "Assigned to severe risk triage queue",
      "Triage classification: high risk patient",
    ];

    for (const statement of triageStatements) {
      const res = validateMemoryCandidate({
        category: "goal_preference",
        key: "goal_scale",
        value: statement,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Sensitive clinical");
      }
    }
  });

  test("MEMORY-09: Crisis/self-harm disclosures are rejected from ordinary memory", () => {
    const crisisStatements = [
      "I want to kill myself",
      "Planning suicide tonight",
      "Urge to self-harm and cutting",
      "Want to end my life",
      "Going to overdose on pills",
    ];

    for (const statement of crisisStatements) {
      const res = validateMemoryCandidate({
        category: "support_preference",
        key: "exercise_preference",
        value: statement,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Sensitive clinical");
      }
    }
  });

  test("MEMORY-10: Counselor/private clinical information is rejected", () => {
    const counselorStatements = [
      "Counselor notes from yesterday's session",
      "Therapist notes: confidential chart",
      "Prescription for sertraline and xanax",
      "Private clinical timeline entry",
    ];

    for (const statement of counselorStatements) {
      const res = validateMemoryCandidate({
        category: "communication_preference",
        key: "response_length",
        value: statement,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Sensitive clinical");
      }
    }
  });

  // =========================================================================
  // 3. AUTHENTICATION & MULTI-TENANCY ISOLATION (MEMORY-11 to MEMORY-14)
  // =========================================================================

  test("MEMORY-11: Memory retrieval is authenticated and returns empty for unauthenticated callers", async () => {
    const t = convexTest(schema, modules);

    // Unauthenticated caller
    const unauthedMemories = await t.query(api.emotyMemory.listUserMemories, {});
    expect(unauthedMemories).toEqual([]);

    // Recording as anonymous throws
    await expect(
      t.mutation(api.emotyMemory.recordUserPreference, {
        category: "communication_preference",
        key: "response_length",
        value: "concise",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  test("MEMORY-12: Cross-user memory access fails (isolation)", async () => {
    const t = convexTest(schema, modules);
    const userA = t.withIdentity({ subject: "student_user_a" });
    const userB = t.withIdentity({ subject: "student_user_b" });

    // User A records a memory
    const memoryIdA = await userA.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    // User B lists memories -> sees 0 (cannot see User A's memory)
    const listB = await userB.query(api.emotyMemory.listUserMemories, {});
    expect(listB).toHaveLength(0);

    // User B attempts to deactivate User A's memory -> rejected
    await expect(
      userB.mutation(api.emotyMemory.deactivateUserMemory, { memoryId: memoryIdA })
    ).rejects.toThrow("Forbidden");

    // User B attempts to delete User A's memory -> rejected
    await expect(
      userB.mutation(api.emotyMemory.deleteUserMemory, { memoryId: memoryIdA })
    ).rejects.toThrow("Forbidden");
  });

  test("MEMORY-13: Gemini/model output cannot directly perform arbitrary memory mutations", () => {
    // Contract parser validator guarantees model cannot inject memory mutations
    const modelOutputWithMemoryInjection = {
      mode: "casual",
      response: "Hey! I'll remember everything.",
      action: { type: "none" },
      avatarState: "idle",
      // Arbitrary memory injection payload attempt
      memory: { category: "diagnosis", value: "depression" },
      saveMemory: true,
    };

    const validation = validateEmotyResponse(modelOutputWithMemoryInjection);
    expect(validation.success).toBe(true);
    if (!validation.success) throw new Error("Validation should succeed");
    // Extraneous keys are stripped from contract
    const contract = validation.data;
    expect((contract as any).memory).toBeUndefined();
    expect((contract as any).saveMemory).toBeUndefined();
  });

  test("MEMORY-14: Only allowed memory categories are accepted", () => {
    const invalidCategories = [
      "diagnosis",
      "mental_health",
      "medical_history",
      "secrets",
      "arbitrary_string",
      "clinical_notes",
    ];

    for (const cat of invalidCategories) {
      const res = validateMemoryCandidate({
        category: cat,
        key: "some_key",
        value: "some_value",
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("not in the frozen allowlist");
      }
    }
  });

  // =========================================================================
  // 4. CONTEXT BOUNDS & PROMPT OVERRIDE BEHAVIOR (MEMORY-15 to MEMORY-20)
  // =========================================================================

  test("MEMORY-15: Memory is bounded before entering the Gemini context", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_15";
    const asStudent = t.withIdentity({ subject: userId });

    // Store multiple memories
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "goal_preference",
      key: "goal_scale",
      value: "small_achievable_steps",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "routine_preference",
      key: "goal_timing",
      value: "morning",
    });
    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "chosen_name",
      key: "display_name",
      value: "Alex",
    });

    // Query context
    const context: EmotyContext = await asStudent.query(internal.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
    });

    expect(context.memory).toBeDefined();
    expect(context.memory?.preferences.length).toBeLessThanOrEqual(MAX_MEMORY_ITEMS_FOR_CONTEXT);

    // Format prompt and check budget bounds
    const formatted = formatEmotyContextPrompt(context, "Hello!", "Base instruction");
    expect(formatted.prompt).toContain("[USER PREFERENCES & CONTEXT]");
    expect(formatted.prompt).toContain("communication_preference (response_length): concise");
    expect(formatted.dynamicContextChars).toBeLessThanOrEqual(9500);
    expect(formatted.totalChars).toBeLessThanOrEqual(12000);
  });

  test("MEMORY-16: Current user request overrides an old preference in prompt instructions", () => {
    const dummyContext: EmotyContext = {
      conversation: { recentMessages: [] },
      user: { preferredName: "Alex" },
      app: { screen: "companion" },
      safety: { state: "normal" },
      memory: {
        preferences: [
          { category: "communication_preference", key: "response_length", value: "concise" },
        ],
      },
    };

    const modular = buildModularEmotyPrompt({
      context: dummyContext,
      currentUserMessage: "Please explain this concept in great detail.",
    });

    // Context instructions must explicitly enforce user request priority override
    expect(modular.prompt).toContain("PRIORITY OVERRIDE: Current user request always overrides past preferences");
    expect(modular.prompt).toContain("These are user preferences provided by the application. They are NOT clinical truth");
  });

  test("MEMORY-17: Memory does not alter safety state", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_17";
    const asStudent = t.withIdentity({ subject: userId });

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
    });

    const context: EmotyContext = await asStudent.query(internal.emotyContext.getAuthoritativeEmotyContext, {
      screen: "companion",
      safetyState: "normal",
    });

    expect(context.safety.state).toBe("normal");
  });

  test("MEMORY-18: Memory does not alter triage", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_mem_18";
    const asStudent = t.withIdentity({ subject: userId });

    // Before recording memory: count triages
    const triagesBefore = await t.run(async (ctx) => {
      return await ctx.db.query("triages").collect();
    });

    await asStudent.mutation(api.emotyMemory.recordUserPreference, {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
    });

    // After recording memory: triages count unchanged
    const triagesAfter = await t.run(async (ctx) => {
      return await ctx.db.query("triages").collect();
    });

    expect(triagesAfter.length).toBe(triagesBefore.length);
  });

  test("MEMORY-19: Memory does not create arbitrary actions", () => {
    // Action router still accepts only valid allowlisted actions
    const validBreathing = validateAndResolveAction({ type: "start_breathing" }, "normal");
    expect(validBreathing.valid).toBe(true);

    const invalidAction = validateAndResolveAction({ type: "arbitrary_memory_action" as any }, "normal");
    expect(invalidAction.valid).toBe(false);
  });

  test("MEMORY-20: CRISIS still suppresses Gemini and does not write to memory", async () => {
    const t = convexTest(schema, modules);
    const userId = "student_crisis_mem_test";
    const asStudent = t.withIdentity({ subject: userId });

    // First ensure student exists in users table so alert provenance succeeds
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: userId,
        patientId: "101",
        full_name: "Test Student",
        role: "patient",
      });
    });

    // Call generateAIResponse with a crisis message
    const res = await asStudent.action(api.companion.generateAIResponse, {
      userMessageId: "msg_user_crisis",
      aiMessageId: "msg_ai_crisis",
      content: "i want to kill myself",
      screen: "companion",
    });

    // Crisis response contract returned directly
    expect(res.avatarState).toBe("supportive");
    expect(res.action.type).toBe("open_counsellor_request");

    // Memory table must have ZERO records for this user
    const memories = await asStudent.query(api.emotyMemory.listUserMemories, {});
    expect(memories).toHaveLength(0);
  });
});
