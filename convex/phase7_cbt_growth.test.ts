/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { testUserId } from "../test-utils/identity";
import {
  THINKING_PATTERNS,
  MANDATORY_AUTONOMY_OPTION,
  SUPPORT_ACTIVITIES,
  POSITIVE_GROWTH_STEPS,
} from "../common/cbtCatalogue";

const modules = import.meta.glob("./**/*.ts");

describe("Phase 7: CBT/REBT + Positive Growth", () => {
  // 1. Thinking Patterns & Autonomy Unit Verification
  describe("Catalogue & Clinical Autonomy", () => {
    test("P7-01: Exactly 15 Thinking Patterns (TP01-TP15) defined with verbatim 3-challenge questions", () => {
      const keys = Object.keys(THINKING_PATTERNS);
      expect(keys).toHaveLength(15);
      expect(keys).toContain("TP01");
      expect(keys).toContain("TP05");
      expect(keys).toContain("TP10");
      expect(keys).toContain("TP15");

      for (const pattern of Object.values(THINKING_PATTERNS)) {
        expect(pattern.challengeQuestions).toHaveLength(3);
        expect(pattern.suggestedNewThoughts).toHaveLength(3);
        // Option 3 is always the autonomy chip
        expect(pattern.suggestedNewThoughts[2]).toBe(MANDATORY_AUTONOMY_OPTION);
      }
    });

    test("P7-02: Mandatory autonomy option is verbatim and non-judgmental", () => {
      expect(MANDATORY_AUTONOMY_OPTION).toBe("I'm not ready to change my thought yet.");
    });

    test("P7-03: Support Mode provides 5 supportive activity alternatives", () => {
      expect(SUPPORT_ACTIVITIES).toHaveLength(5);
      const activityIds = SUPPORT_ACTIVITIES.map((a) => a.id);
      expect(activityIds).toContain("breathing");
      expect(activityIds).toContain("grounding");
      expect(activityIds).toContain("free_writing");
      expect(activityIds).toContain("emotion_cards");
      expect(activityIds).toContain("micro_goal");
    });

    test("P7-04: Positive Growth path contains authoritative 6 steps", () => {
      expect(POSITIVE_GROWTH_STEPS).toHaveLength(6);
      expect(POSITIVE_GROWTH_STEPS[0].id).toBe("reflection");
      expect(POSITIVE_GROWTH_STEPS[1].id).toBe("strength");
      expect(POSITIVE_GROWTH_STEPS[2].id).toBe("gratitude");
      expect(POSITIVE_GROWTH_STEPS[3].id).toBe("emotion");
      expect(POSITIVE_GROWTH_STEPS[4].id).toBe("growth");
      expect(POSITIVE_GROWTH_STEPS[5].id).toBe("save");
    });
  });

  // 2. CBT/REBT Session & Flow Backend Tests
  describe("CBT/REBT Session Transitions & Autonomy", () => {
    test("P7-05: Belief rating rejects invalid scores (<0 or >100) and accepts valid 0-100", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p7_belief_01",
        email: "p7_belief@emotify.com",
        name: "Belief Student",
      });
      const uid = await testUserId(t, "student_p7_belief_01");

      const sessionRes = await t.mutation(api.cbt.startSession, { forceNew: true });
      const sessionId = sessionRes.session!._id;

      // Initial belief rating (Step 5)
      await expect(
        t.mutation(api.cbt.submitBeliefBeforeRating, {
          sessionId,
          score: -5,
        })
      ).rejects.toThrow();

      await expect(
        t.mutation(api.cbt.submitBeliefBeforeRating, {
          sessionId,
          score: 105,
        })
      ).rejects.toThrow();

      const validInitial = await t.mutation(api.cbt.submitBeliefBeforeRating, {
        sessionId,
        score: 85,
      });
      expect(validInitial.success).toBe(true);

      const sessionAfterInitial = await t.query(api.cbt.getSession, { sessionId });
      expect(sessionAfterInitial?.beliefBefore).toBe(85);

      // Balanced thought belief rating (Step 10)
      await expect(
        t.mutation(api.cbt.submitBeliefRating, {
          sessionId,
          score: 150,
        })
      ).rejects.toThrow();

      const validBalanced = await t.mutation(api.cbt.submitBeliefRating, {
        sessionId,
        score: 60,
      });
      expect(validBalanced.success).toBe(true);

      const sessionAfterBalanced = await t.query(api.cbt.getSession, { sessionId });
      expect(sessionAfterBalanced?.beliefScore).toBe(60);
      expect(sessionAfterBalanced?.currentStep).toBe("emotion_after");
    });

    test("P7-06: Selecting mandatory Option 3 autonomy chip persists without shame or coercion", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p7_autonomy_01",
        email: "p7_autonomy@emotify.com",
        name: "Autonomy Student",
      });
      await testUserId(t, "student_p7_autonomy_01");

      const sessionRes = await t.mutation(api.cbt.startSession, { forceNew: true });
      const sessionId = sessionRes.session!._id;

      const selRes = await t.mutation(api.cbt.selectBalancedThought, {
        sessionId,
        thought: MANDATORY_AUTONOMY_OPTION,
      });

      expect(selRes.success).toBe(true);
      expect(selRes.autonomyChoiceMade).toBe(true);

      const session = await t.query(api.cbt.getSession, { sessionId });
      expect(session?.autonomyChoiceMade).toBe(true);
      expect(session?.balancedThought).toBe(MANDATORY_AUTONOMY_OPTION);
      expect(session?.currentStep).toBe("belief");
    });

    test("P7-07: Support Mode enters smoothly and completes without treating as failure", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p7_support_01",
        email: "p7_support@emotify.com",
        name: "Support Student",
      });
      await testUserId(t, "student_p7_support_01");

      const sessionRes = await t.mutation(api.cbt.startSession, { forceNew: true });
      const sessionId = sessionRes.session!._id;

      // 1. Enter Support Mode
      const startRes = await t.mutation(api.cbt.startSupportMode, { sessionId });
      expect(startRes.success).toBe(true);
      expect(startRes.activities).toHaveLength(5);

      const session1 = await t.query(api.cbt.getSession, { sessionId });
      expect(session1?.sessionStatus).toBe("support_mode");
      expect(session1?.currentStep).toBe("support_mode");

      // 2. Select breathing activity
      await t.mutation(api.cbt.selectSupportActivity, {
        sessionId,
        activityId: "breathing",
        note: "Took 1 minute breathing pause",
      });

      const session2 = await t.query(api.cbt.getSession, { sessionId });
      expect(session2?.supportModeActivity).toBe("breathing");

      // 3. Complete Support Mode session
      const completeRes = await t.mutation(api.cbt.completeSupportMode, {
        sessionId,
        note: "Felt calmer after breathing",
      });
      expect(completeRes.success).toBe(true);
      expect(completeRes.message).toBeDefined();

      const session3 = await t.query(api.cbt.getSession, { sessionId });
      expect(session3?.sessionStatus).toBe("completed");
      expect(session3?.currentStep).toBe("completed");
    });
  });

  // 3. Positive Growth Path & Memory Persistence Tests
  describe("Positive Growth Persistence & Security", () => {
    test("P7-08: Save and retrieve 6-step Positive Growth memory with data integrity", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p7_growth_01",
        email: "p7_growth@emotify.com",
        name: "Growth Student",
      });
      const uid = await testUserId(t, "student_p7_growth_01");

      const saveRes = await t.mutation(api.positiveGrowth.savePositiveMemory, {
        userId: uid,
        bestPartOfDay: "Walked with my friends after exams",
        strengthIdentified: "I stayed patient and listened well",
        gratitudeResponse: "A warm cup of chai and encouraging teacher",
        emotion: "Peaceful & Grateful",
        tomorrowGoal: "Smile at someone and keep studying in small chunks",
      });

      expect(saveRes.success).toBe(true);
      expect(saveRes.memoryId).toBeDefined();

      // Retrieve memories
      const memories = await t.query(api.positiveGrowth.getPositiveMemories, { userId: uid });
      expect(memories).toHaveLength(1);
      expect(memories[0].bestPartOfDay).toBe("Walked with my friends after exams");
      expect(memories[0].strengthIdentified).toBe("I stayed patient and listened well");
      expect(memories[0].gratitudeResponse).toBe("A warm cup of chai and encouraging teacher");
      expect(memories[0].emotion).toBe("Peaceful & Grateful");
      expect(memories[0].tomorrowGoal).toBe("Smile at someone and keep studying in small chunks");
    });

    test("P7-09: Duplicate writes on retry are cleanly prevented", async () => {
      const t = convexTest(schema, modules).withIdentity({
        subject: "student_p7_growth_02",
        email: "p7_growth2@emotify.com",
        name: "Retry Student",
      });
      const uid = await testUserId(t, "student_p7_growth_02");

      const payload = {
        userId: uid,
        bestPartOfDay: "Solved a hard math problem",
        strengthIdentified: "Persistence and focus",
        gratitudeResponse: "My study buddy who helped me",
        emotion: "Proud",
        tomorrowGoal: "Review tomorrow's lesson early",
        sessionId: "sess_growth_123",
      };

      const res1 = await t.mutation(api.positiveGrowth.savePositiveMemory, payload);
      expect(res1.success).toBe(true);
      expect(res1.alreadySaved).toBeUndefined();

      // Retry with same sessionId
      const res2 = await t.mutation(api.positiveGrowth.savePositiveMemory, payload);
      expect(res2.success).toBe(true);
      expect(res2.alreadySaved).toBe(true);
      expect(res2.memoryId).toBe(res1.memoryId);

      const memories = await t.query(api.positiveGrowth.getPositiveMemories, { userId: uid });
      expect(memories).toHaveLength(1);
    });

    test("P7-10: Student data isolation - student cannot access another student's positive memories", async () => {
      const t = convexTest(schema, modules);
      const tStudentA = t.withIdentity({
        subject: "student_a_growth",
        email: "student_a@emotify.com",
        name: "Student A",
      });
      const uidA = await testUserId(tStudentA, "student_a_growth");

      const tStudentB = t.withIdentity({
        subject: "student_b_growth",
        email: "student_b@emotify.com",
        name: "Student B",
      });
      await testUserId(tStudentB, "student_b_growth");

      // Student A saves a memory
      await tStudentA.mutation(api.positiveGrowth.savePositiveMemory, {
        userId: uidA,
        bestPartOfDay: "Private reflection of Student A",
        strengthIdentified: "Honesty",
        gratitudeResponse: "Family",
        emotion: "Content",
        tomorrowGoal: "Rest",
      });

      // Student B attempts to query Student A's memories -> rejected
      await expect(
        tStudentB.query(api.positiveGrowth.getPositiveMemories, { userId: uidA })
      ).rejects.toThrow();

      // Student B gets own memories -> empty
      const bMemories = await tStudentB.query(api.positiveGrowth.getPositiveMemories, {});
      expect(bMemories).toHaveLength(0);
    });

    test("P7-11: Deleting a positive memory enforces owner authorization", async () => {
      const t = convexTest(schema, modules);
      const tStudentA = t.withIdentity({
        subject: "student_a_del",
        email: "student_a_del@emotify.com",
        name: "Student A Del",
      });
      const uidA = await testUserId(tStudentA, "student_a_del");

      const tStudentB = t.withIdentity({
        subject: "student_b_del",
        email: "student_b_del@emotify.com",
        name: "Student B Del",
      });
      await testUserId(tStudentB, "student_b_del");

      const saveRes = await tStudentA.mutation(api.positiveGrowth.savePositiveMemory, {
        userId: uidA,
        bestPartOfDay: "Memory to delete",
        strengthIdentified: "Courage",
        gratitudeResponse: "Sunshine",
        emotion: "Relief",
        tomorrowGoal: "Sleep early",
      });
      const memoryId = saveRes.memoryId!;

      // Student B tries to delete Student A's memory -> rejected
      await expect(
        tStudentB.mutation(api.positiveGrowth.deletePositiveMemory, { id: memoryId })
      ).rejects.toThrow();

      // Student A deletes own memory -> succeeds
      const delRes = await tStudentA.mutation(api.positiveGrowth.deletePositiveMemory, { id: memoryId });
      expect(delRes.success).toBe(true);

      const remaining = await tStudentA.query(api.positiveGrowth.getPositiveMemories, { userId: uidA });
      expect(remaining).toHaveLength(0);
    });
  });
});
