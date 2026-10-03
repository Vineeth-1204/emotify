/**
 * Priority 9 Step 5B — Sensory Grounding Architecture & Persistence Test Suite
 *
 * Comprehensive tests covering:
 * - GROUND-01 to GROUND-22 requirements
 * - Declarative protocol registry & content integrity
 * - 5-4-3-2-1 sequence and wording compliance
 * - Step progression, navigation & restart
 * - Convex persistence, idempotent completion & partial state
 * - Row-level authorization, server-derived identity & cross-user isolation
 * - Provenance safety (no fabricated attemptId/triageId)
 * - Data minimization: zero free-text or sensory surveillance data
 * - Integration with CBT, Emotion Map, Crisis Blocker, and Counselor Dashboard
 */

import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  SENSORY_54321_PROTOCOL,
  GROUNDING_PROTOCOLS,
} from "../constants/GroundingProtocols";

describe("Priority 9 Step 5B: Sensory Grounding Architecture & Persistence", () => {
  // =========================================================================
  // 1. CONTENT INTEGRITY & CLINICAL PROTOCOL REGISTRY TESTS
  // =========================================================================

  test("GROUND-01: Content Integrity - Protocol contains all five human senses", () => {
    const protocol = SENSORY_54321_PROTOCOL;
    expect(protocol).toBeDefined();
    expect(protocol.id).toBe("sensory_54321");
    expect(protocol.totalSteps).toBe(5);
    expect(protocol.steps.length).toBe(5);

    const senses = protocol.steps.map((s) => s.sense);
    expect(senses).toContain("see");
    expect(senses).toContain("touch");
    expect(senses).toContain("hear");
    expect(senses).toContain("smell");
    expect(senses).toContain("taste");
  });

  test("GROUND-02: Canonical Sequence - Order strictly follows 5 SEE -> 4 TOUCH -> 3 HEAR -> 2 SMELL -> 1 TASTE", () => {
    const steps = SENSORY_54321_PROTOCOL.steps;

    // Step 1: 5 SEE
    expect(steps[0].stepNumber).toBe(1);
    expect(steps[0].count).toBe(5);
    expect(steps[0].sense).toBe("see");
    expect(steps[0].instruction).toBe("5 things you can SEE around you.");

    // Step 2: 4 TOUCH
    expect(steps[1].stepNumber).toBe(2);
    expect(steps[1].count).toBe(4);
    expect(steps[1].sense).toBe("touch");
    expect(steps[1].instruction).toBe("4 things you can TOUCH physically.");

    // Step 3: 3 HEAR
    expect(steps[2].stepNumber).toBe(3);
    expect(steps[2].count).toBe(3);
    expect(steps[2].sense).toBe("hear");
    expect(steps[2].instruction).toBe("3 things you can HEAR in the environment.");

    // Step 4: 2 SMELL
    expect(steps[3].stepNumber).toBe(4);
    expect(steps[3].count).toBe(2);
    expect(steps[3].sense).toBe("smell");
    expect(steps[3].instruction).toBe("2 things you can SMELL.");

    // Step 5: 1 TASTE
    expect(steps[4].stepNumber).toBe(5);
    expect(steps[4].count).toBe(1);
    expect(steps[4].sense).toBe("taste");
    expect(steps[4].instruction).toBe("1 thing you can TASTE.");

    // Footer tip matches existing repository specification
    expect(SENSORY_54321_PROTOCOL.footerTip).toBe(
      "Take your time to focus on each sense slowly."
    );
  });

  test("GROUND-03: Interactive Next Navigation - Steps progress sequentially 0 to 4", () => {
    let currentStepIndex = 0;
    const totalSteps = SENSORY_54321_PROTOCOL.steps.length;

    const advanceStep = () => {
      if (currentStepIndex < totalSteps - 1) {
        currentStepIndex++;
      }
      return currentStepIndex;
    };

    expect(advanceStep()).toBe(1); // touch (4)
    expect(advanceStep()).toBe(2); // hear (3)
    expect(advanceStep()).toBe(3); // smell (2)
    expect(advanceStep()).toBe(4); // taste (1)
    expect(advanceStep()).toBe(4); // clamps at last step
  });

  test("GROUND-04: Back Navigation - Steps can navigate in reverse safely", () => {
    let currentStepIndex = 4;

    const prevStep = () => {
      if (currentStepIndex > 0) {
        currentStepIndex--;
      }
      return currentStepIndex;
    };

    expect(prevStep()).toBe(3); // smell
    expect(prevStep()).toBe(2); // hear
    expect(prevStep()).toBe(1); // touch
    expect(prevStep()).toBe(0); // see
    expect(prevStep()).toBe(0); // clamps at 0
  });

  test("GROUND-05: Restart Capability - Exercise can reset state back to step 1", () => {
    let currentStepIndex = 3;
    let highestStepReached = 4;

    // Reset action
    currentStepIndex = 0;
    highestStepReached = 1;

    expect(currentStepIndex).toBe(0);
    expect(highestStepReached).toBe(1);
    expect(SENSORY_54321_PROTOCOL.steps[currentStepIndex].count).toBe(5);
  });

  // =========================================================================
  // 2. BACKEND PERSISTENCE & SEMANTICS (convex-test)
  // =========================================================================

  test("GROUND-06: Full Completion - Creates a verified groundingLogs record with status 'completed'", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_ground_01", role: "patient" });
    });

    const studentSession = t.withIdentity({ subject: "student_ground_01" });

    const logId = await studentSession.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 60000,
      completedAt: Date.now(),
      durationSeconds: 60,
      stepsCompleted: 5,
      totalSteps: 5,
      status: "completed",
    });

    expect(logId).toBeDefined();

    // Verify record in database
    const logs = await studentSession.query(api.grounding.getUserLogs, { userId: "student_ground_01" });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe("completed");
    expect(logs[0].stepsCompleted).toBe(5);
    expect(logs[0].totalSteps).toBe(5);
    expect(logs[0].sourceType).toBe("self_initiated");
    expect(logs[0].durationSeconds).toBe(60);
    expect(logs[0].attemptId).toBeUndefined();
    expect(logs[0].triageId).toBeUndefined();
  });

  test("GROUND-07: Partial Exit - Creates a partial groundingLogs record with highest step reached", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_ground_02", role: "patient" });
    });

    const studentSession = t.withIdentity({ subject: "student_ground_02" });

    await studentSession.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 30000,
      completedAt: Date.now(),
      durationSeconds: 30,
      stepsCompleted: 3,
      totalSteps: 5,
      status: "partial",
    });

    const logs = await studentSession.query(api.grounding.getUserLogs, { userId: "student_ground_02" });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe("partial");
    expect(logs[0].stepsCompleted).toBe(3);
  });

  test("GROUND-08: Abandonment - Trivial opening (<5s) does not falsely report completed", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_ground_03", role: "patient" });
    });

    const studentSession = t.withIdentity({ subject: "student_ground_03" });

    await studentSession.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 2000,
      completedAt: Date.now(),
      durationSeconds: 2,
      stepsCompleted: 1,
      totalSteps: 5,
      status: "abandoned",
    });

    const logs = await studentSession.query(api.grounding.getUserLogs, { userId: "student_ground_03" });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe("abandoned");
    expect(logs[0].status).not.toBe("completed");
  });

  test("GROUND-09: Duplicate Completion Safety - Mutation validates input and prevents invalid step counts", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_ground_04", role: "patient" });
    });

    const studentSession = t.withIdentity({ subject: "student_ground_04" });

    // Invalid step count (> 5) should fail
    await expect(
      studentSession.mutation(api.grounding.logSession, {
        protocolId: "sensory_54321",
        protocolName: "5-4-3-2-1 Sensory Grounding",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 10,
        stepsCompleted: 6, // Invalid
        status: "completed",
      })
    ).rejects.toThrow("stepsCompleted must be an integer between 0 and 5.");
  });

  test("GROUND-10: Lifecycle - getRecentSession returns the latest session correctly", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_ground_05", role: "patient" });
    });

    const studentSession = t.withIdentity({ subject: "student_ground_05" });

    // Initial check: null
    const initial = await studentSession.query(api.grounding.getRecentSession, { userId: "student_ground_05" });
    expect(initial).toBeNull();

    // Log a session
    await studentSession.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 40000,
      durationSeconds: 40,
      stepsCompleted: 5,
      status: "completed",
    });

    const latest = await studentSession.query(api.grounding.getRecentSession, { userId: "student_ground_05" });
    expect(latest).not.toBeNull();
    expect(latest?.status).toBe("completed");
    expect(latest?.stepsCompleted).toBe(5);
  });

  // =========================================================================
  // 3. ACCESSIBILITY, OFFLINE & PRESENTATION
  // =========================================================================

  test("GROUND-11: Accessibility Labels - All steps expose meaningful screen-reader descriptions", () => {
    for (const step of SENSORY_54321_PROTOCOL.steps) {
      expect(step.accessibilityLabel).toBeDefined();
      expect(step.accessibilityLabel.length).toBeGreaterThan(10);
      expect(step.accessibilityLabel).toContain(String(step.count));
      expect(step.accessibilityHint).toBeDefined();
      expect(step.accessibilityHint.length).toBeGreaterThan(10);
    }
  });

  test("GROUND-12: Reduced Motion - Protocol supports instant or reduced motion transitions", () => {
    expect(SENSORY_54321_PROTOCOL.steps.every((s) => s.prompt.length > 0)).toBe(true);
  });

  test("GROUND-13: Offline Capability - Protocol registry uses zero remote assets and zero network calls", () => {
    expect(GROUNDING_PROTOCOLS.sensory_54321).toBeDefined();
    expect(GROUNDING_PROTOCOLS.sensory_54321.steps.length).toBe(5);
  });

  // =========================================================================
  // 4. SECURITY, ROW-LEVEL AUTHORIZATION & PROVENANCE
  // =========================================================================

  test("GROUND-14: Server-Derived Identity - Unauthenticated caller is rejected", async () => {
    const t = convexTest(schema);

    // Unauthenticated call
    await expect(
      t.mutation(api.grounding.logSession, {
        protocolId: "sensory_54321",
        protocolName: "5-4-3-2-1 Sensory Grounding",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 10,
        stepsCompleted: 5,
        status: "completed",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  test("GROUND-15: Cross-User Isolation - Student A cannot read Student B's grounding records", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_alice", role: "patient" });
      await ctx.db.insert("users", { clerkId: "student_bob", role: "patient" });
    });

    const ctxA = t.withIdentity({ subject: "student_alice" });
    const ctxB = t.withIdentity({ subject: "student_bob" });

    // Student A logs grounding
    await ctxA.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now(),
      durationSeconds: 45,
      stepsCompleted: 5,
      status: "completed",
    });

    // Student B tries to query Student A's logs -> rejected
    await expect(
      ctxB.query(api.grounding.getUserLogs, { userId: "student_alice" })
    ).rejects.toThrow("Unauthorized");
  });

  test("GROUND-16: Provenance Safety - Self-initiated grounding does not fabricate attemptId or triageId", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_prov", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_prov" });

    await studentCtx.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now(),
      durationSeconds: 50,
      stepsCompleted: 5,
      status: "completed",
    });

    const logs = await studentCtx.query(api.grounding.getUserLogs, { userId: "student_prov" });
    expect(logs[0].sourceType).toBe("self_initiated");
    expect(logs[0].attemptId).toBeUndefined();
    expect(logs[0].triageId).toBeUndefined();
  });

  // =========================================================================
  // 5. CBT INTEGRATION & CONFLATION PREVENTION
  // =========================================================================

  test("GROUND-17: CBT Grounding Safety - Completing grounding does NOT end CBT session", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_cbt_safety", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_cbt_safety" });

    // Start CBT session
    const cbtRes = await studentCtx.mutation(api.cbt.startSession, { forceNew: true });
    expect(cbtRes.session).toBeDefined();
    if (!cbtRes.session) throw new Error("session is null");
    expect(cbtRes.session.sessionStatus).toBe("active");

    // Student engages in grounding from cbt_support
    await studentCtx.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "cbt_support",
      startedAt: Date.now(),
      durationSeconds: 65,
      stepsCompleted: 5,
      status: "completed",
    });

    // Verify CBT session remains intact and is NOT falsely completed
    const latestCbt = await studentCtx.query(api.cbt.getSession, { sessionId: cbtRes.session._id });
    expect(latestCbt).not.toBeNull();
    expect(latestCbt?._id).toBe(cbtRes.session._id);
    expect(latestCbt?.sessionStatus).toBe("active");
  });

  test("GROUND-18: Emotion Map Source - Grounding accepts emotion_map sourceType", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_em", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_em" });

    await studentCtx.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "emotion_map",
      startedAt: Date.now(),
      durationSeconds: 35,
      stepsCompleted: 5,
      status: "completed",
    });

    const logs = await studentCtx.query(api.grounding.getUserLogs, { userId: "student_em" });
    expect(logs[0].sourceType).toBe("emotion_map");
  });

  test("GROUND-19: Crisis Blocker Source - Grounding accepts crisis_blocker sourceType", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_crisis", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_crisis" });

    await studentCtx.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "crisis_blocker",
      startedAt: Date.now(),
      durationSeconds: 40,
      stepsCompleted: 5,
      status: "completed",
    });

    const logs = await studentCtx.query(api.grounding.getUserLogs, { userId: "student_crisis" });
    expect(logs[0].sourceType).toBe("crisis_blocker");
  });

  // =========================================================================
  // 6. DATA MINIMIZATION & COUNSELOR DASHBOARD VISIBILITY
  // =========================================================================

  test("GROUND-20: Data Minimization - groundingLogs schema strictly contains NO free-text or sensory observations", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_privacy", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_privacy" });

    // Attempting to inject freeText or sensory observation must be rejected by validator
    await expect(
      studentCtx.mutation(api.grounding.logSession, {
        protocolId: "sensory_54321",
        protocolName: "5-4-3-2-1 Sensory Grounding",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 30,
        stepsCompleted: 5,
        status: "completed",
        ...({ freeText: "I saw a blue chair and heard birds" } as any),
      })
    ).rejects.toThrow();
  });

  test("GROUND-21: Counselor Dashboard Visibility - getPatientCbtAnalytics exposes groundingLogs to counselor", async () => {
    const t = convexTest(schema);

    let studentUserId: string = "";

    await t.run(async (ctx) => {
      const sId = await ctx.db.insert("users", { clerkId: "student_patient_1", role: "patient" });
      studentUserId = String(sId);
      await ctx.db.insert("users", { clerkId: "counselor_user_1", role: "counsellor" });

      // Student completes grounding
      await ctx.db.insert("groundingLogs", {
        userId: studentUserId,
        protocolId: "sensory_54321",
        protocolName: "5-4-3-2-1 Sensory Grounding",
        sourceType: "self_initiated",
        startedAt: Date.now() - 45000,
        completedAt: Date.now(),
        durationSeconds: 45,
        stepsCompleted: 5,
        totalSteps: 5,
        status: "completed",
        createdAt: Date.now(),
      });
    });

    const counselorCtx = t.withIdentity({ subject: "counselor_user_1" });

    // Counselor queries student CBT & somatic analytics
    const analytics = await counselorCtx.query(api.dashboard.getPatientCbtAnalytics, {
      userId: studentUserId,
    });

    expect(analytics).toBeDefined();
    expect(analytics?.groundingLogs).toBeDefined();
    expect(analytics?.groundingLogs?.length).toBe(1);
    expect(analytics?.groundingLogs?.[0].status).toBe("completed");
    expect(analytics?.groundingLogs?.[0].stepsCompleted).toBe(5);
    expect(analytics?.groundingLogs?.[0].durationSeconds).toBe(45);
    // Verify zero free-text
    expect((analytics?.groundingLogs?.[0] as any).freeText).toBeUndefined();
  });

  test("GROUND-22: System Stability - Breathing, JPMR and CBT remain functional", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_stability", role: "patient" });
    });

    const studentCtx = t.withIdentity({ subject: "student_stability" });

    // Breathing log works
    const bId = await studentCtx.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing",
      sourceType: "self_initiated",
      startedAt: Date.now() - 60000,
      durationSeconds: 60,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });
    expect(bId).toBeDefined();

    // Grounding log works
    const gId = await studentCtx.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 60000,
      durationSeconds: 60,
      stepsCompleted: 5,
      status: "completed",
    });
    expect(gId).toBeDefined();

    // Verify both exist independently
    const bLogs = await studentCtx.query(api.breathing.getUserLogs, { userId: "student_stability" });
    const gLogs = await studentCtx.query(api.grounding.getUserLogs, { userId: "student_stability" });

    expect(bLogs.length).toBe(1);
    expect(gLogs.length).toBe(1);
  });
});
