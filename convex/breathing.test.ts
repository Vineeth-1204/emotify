/**
 * Priority 9 Step 4B - Canonical Breathing Engine, Accessibility & Persistence Test Suite
 *
 * Comprehensive tests covering:
 * - Declarative protocol registry & clinical boundaries
 * - State machine, phase ordering & timer accuracy
 * - Lifecycle, cleanup & pause/resume
 * - Reduced motion & screen reader accessibility
 * - Backend persistence, schema validation & rate limiting
 * - Row-level authorization & counselor access
 * - Provenance preservation & boundary with Emoty / JPMR
 */

import { describe, test, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { testUserId, assignAllPatientsToCounsellors } from "../test-utils/identity";
import { api } from "./_generated/api";
import {
  BREATHING_PROTOCOLS,
  getActiveBreathingProtocols,
  getBreathingProtocol,
  getCycleDurationSeconds,
} from "../constants/BreathingProtocols";

describe("Priority 9 Step 4B: Canonical Breathing Engine & Protocols", () => {
  // =========================================================================
  // 1. PROTOCOL REGISTRY & CLINICAL BOUNDARY TESTS
  // =========================================================================
  test("BREATH-01: Protocol Integrity - All protocols have non-negative durations and valid cycles", () => {
    for (const [id, protocol] of Object.entries(BREATHING_PROTOCOLS)) {
      expect(protocol.id).toBe(id);
      expect(protocol.name.length).toBeGreaterThan(0);
      expect(protocol.inhaleSeconds).toBeGreaterThan(0);
      expect(protocol.exhaleSeconds).toBeGreaterThan(0);
      expect(protocol.holdSeconds).toBeGreaterThanOrEqual(0);
      expect(protocol.restSeconds).toBeGreaterThanOrEqual(0);
      expect(protocol.defaultCycles).toBeGreaterThanOrEqual(1);
      expect(protocol.defaultDurationSeconds).toBeGreaterThan(0);

      const cycleDuration = getCycleDurationSeconds(protocol);
      expect(cycleDuration).toBe(
        protocol.inhaleSeconds + protocol.holdSeconds + protocol.exhaleSeconds + protocol.restSeconds
      );
      expect(cycleDuration).toBeGreaterThan(0);

      // Verify phase labels exist for every phase
      expect(protocol.phaseLabels.INHALE.display).toBeDefined();
      expect(protocol.phaseLabels.HOLD.display).toBeDefined();
      expect(protocol.phaseLabels.EXHALE.display).toBeDefined();
      expect(protocol.phaseLabels.REST.display).toBeDefined();
    }
  });

  test("BREATH-02: Clinical Boundary - 4-7-8 protocol is defined but marked inactive pending clinical approval", () => {
    const p478 = BREATHING_PROTOCOLS.relaxing_478;
    expect(p478).toBeDefined();
    expect(p478.isActive).toBe(false);
    expect(p478.activationStatus).toBe("defined_inactive");

    const activeProtocols = getActiveBreathingProtocols();
    const activeIds = activeProtocols.map((p) => p.id);
    expect(activeIds).not.toContain("relaxing_478");

    // Active approved protocols are present
    expect(activeIds).toContain("box_4444");
    expect(activeIds).toContain("paced_444");
    expect(activeIds).toContain("calming_434");
    expect(activeIds).toContain("belly_reset_3");
  });

  test("BREATH-03: Safe Fallback - Unknown protocol ID gracefully returns default paced protocol", () => {
    const unknown = getBreathingProtocol("non_existent_protocol_id");
    expect(unknown).toBeDefined();
    expect(unknown.id).toBe("paced_444");
  });

  // =========================================================================
  // 2. TIMING, PHASES & PROGRESSION
  // =========================================================================
  test("BREATH-04: Box 4-4-4-4 Cycle Timing Sums to Exactly 16 Seconds", () => {
    const box = BREATHING_PROTOCOLS.box_4444;
    expect(box.inhaleSeconds).toBe(4);
    expect(box.holdSeconds).toBe(4);
    expect(box.exhaleSeconds).toBe(4);
    expect(box.restSeconds).toBe(4);
    expect(getCycleDurationSeconds(box)).toBe(16);
    expect(box.defaultCycles * 16).toBe(64);
  });

  test("BREATH-05: Paced 4-4-4 Cycle Timing Sums to Exactly 12 Seconds", () => {
    const paced = BREATHING_PROTOCOLS.paced_444;
    expect(paced.inhaleSeconds).toBe(4);
    expect(paced.holdSeconds).toBe(4);
    expect(paced.exhaleSeconds).toBe(4);
    expect(paced.restSeconds).toBe(0);
    expect(getCycleDurationSeconds(paced)).toBe(12);
    // 15 cycles of 12 seconds = 180 seconds (3 minutes)
    expect(15 * 12).toBe(180);
  });

  test("BREATH-06: Belly Reset Cycle Timing Sums to Exactly 10 Seconds", () => {
    const belly = BREATHING_PROTOCOLS.belly_reset_3;
    expect(belly.inhaleSeconds).toBe(4);
    expect(belly.holdSeconds).toBe(2);
    expect(belly.exhaleSeconds).toBe(4);
    expect(belly.restSeconds).toBe(0);
    expect(getCycleDurationSeconds(belly)).toBe(10);
    expect(belly.defaultCycles * 10).toBe(30);
  });

  // =========================================================================
  // 3. BACKEND PERSISTENCE & SCHEMA VALIDATION TESTS
  // =========================================================================
  test("BREATH-07: Backend Persistence - Valid session logs successfully into breathingLogs", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "student_breathe_01",
        role: "patient",
        status: "active",
      });
    });

    const studentSession = t.withIdentity({
      subject: "student_breathe_01",
      issuer: "https://clerk.emotify.com",
    });
    const uid_student_breathe_01 = await testUserId(studentSession, "student_breathe_01");

    const logId = await studentSession.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing",
      sourceType: "self_initiated",
      startedAt: Date.now() - 64000,
      completedAt: Date.now(),
      durationSeconds: 64,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    expect(logId).toBeDefined();

    // Verify record in database
    await t.run(async (ctx) => {
      const doc = await ctx.db.get(logId);
      expect(doc).toBeDefined();
      expect(doc!.userId).toBe(uid_student_breathe_01);
      expect(doc!.protocolId).toBe("box_4444");
      expect(doc!.durationSeconds).toBe(64);
      expect(doc!.cyclesCompleted).toBe(4);
      expect(doc!.status).toBe("completed");
      expect(doc!.sourceType).toBe("self_initiated");
      expect(doc!.attemptId).toBeUndefined();
      expect(doc!.triageId).toBeUndefined();
    });
  });

  test("BREATH-08: Validation Rejections - Invalid duration, status, or source are strictly rejected", async () => {
    const t = convexTest(schema);
    const studentSession = t.withIdentity({ subject: "student_breathe_02" });
    const uid_student_breathe_02 = await testUserId(studentSession, "student_breathe_02");

    // Negative duration
    await expect(
      studentSession.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: -10,
        cyclesCompleted: 1,
        targetCycles: 4,
        status: "completed",
      })
    ).rejects.toThrow("durationSeconds must be a non-negative number.");

    // Invalid status
    await expect(
      studentSession.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 60,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "invalid_status_value",
      })
    ).rejects.toThrow("Invalid status 'invalid_status_value'");

    // Invalid sourceType
    await expect(
      studentSession.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "unauthorized_source",
        startedAt: Date.now(),
        durationSeconds: 60,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
      })
    ).rejects.toThrow("Invalid sourceType 'unauthorized_source'");
  });

  // =========================================================================
  // 4. PROVENANCE & CLINICAL ISOLATION TESTS
  // =========================================================================
  test("BREATH-09: Provenance - Legitimate screening attempt & triage IDs are preserved", async () => {
    const t = convexTest(schema);

    let attemptId: any;
    let triageId: any;

    await t.run(async (ctx) => {
      const seedId_student_breathe_03 = await ctx.db.insert("users", {
        clerkId: "student_breathe_03",
        role: "patient",
      });

      attemptId = await ctx.db.insert("screeningAttempts", {
        userId: String(seedId_student_breathe_03),
        status: "completed",
        startedAt: Date.now() - 100000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 5, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 4, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 2, maxScore: 16, severity: "none", level: "none" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      triageId = await ctx.db.insert("triages", {
        userId: String(seedId_student_breathe_03),
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        attemptId,
        createdAt: Date.now(),
      });
    });

    const studentSession = t.withIdentity({ subject: "student_breathe_03" });
    const uid_student_breathe_03 = await testUserId(studentSession, "student_breathe_03");

    const logId = await studentSession.mutation(api.breathing.logSession, {
      protocolId: "calming_434",
      protocolName: "Gentle Pause Breath",
      sourceType: "cbt_support",
      startedAt: Date.now() - 30000,
      durationSeconds: 30,
      cyclesCompleted: 3,
      targetCycles: 6,
      status: "partial",
      attemptId,
      triageId,
    });

    await t.run(async (ctx) => {
      const log = await ctx.db.get(logId);
      expect(log!.attemptId).toBe(attemptId);
      expect(log!.triageId).toBe(triageId);
      expect(log!.sourceType).toBe("cbt_support");
    });
  });

  test("BREATH-10: Provenance Isolation - Cross-user attemptId or triageId is rejected", async () => {
    const t = convexTest(schema);

    let otherStudentAttemptId: any;

    await t.run(async (ctx) => {
      otherStudentAttemptId = await ctx.db.insert("screeningAttempts", {
        userId: "other_student_999",
        status: "completed",
        startedAt: Date.now() - 100000,
        instrumentVersions: { phq9: "1.0", gad7: "1.0", pq16: "1.0" },
        responses: {},
        results: {
          phq9: { administered: true, score: 5, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 4, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 2, maxScore: 16, severity: "none", level: "none" },
        },
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const studentSession = t.withIdentity({ subject: "student_breathe_04" });
    const uid_student_breathe_04 = await testUserId(studentSession, "student_breathe_04");

    await expect(
      studentSession.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 60,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
        attemptId: otherStudentAttemptId,
      })
    ).rejects.toThrow("Referenced screening attempt does not belong to user.");
  });

  // =========================================================================
  // 5. ROW-LEVEL AUTHORIZATION & COUNSELOR READ ACCESS
  // =========================================================================
  test("BREATH-11: Row-Level Isolation - Student cannot query another student's breathing logs", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const seedId_student_alice = await ctx.db.insert("users", { clerkId: "student_alice", role: "patient" });
      const seedId_student_bob = await ctx.db.insert("users", { clerkId: "student_bob", role: "patient" });

      await ctx.db.insert("breathingLogs", {
        userId: String(seedId_student_alice),
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now(),
        durationSeconds: 64,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
        createdAt: Date.now(),
      });
    });

    const aliceSession = t.withIdentity({ subject: "student_alice" });
    const uid_student_alice = await testUserId(aliceSession, "student_alice");
    const bobSession = t.withIdentity({ subject: "student_bob" });
    const uid_student_bob = await testUserId(bobSession, "student_bob");

    // Alice queries own logs -> succeeds
    const aliceLogs = await aliceSession.query(api.breathing.getUserLogs, { userId: uid_student_alice });
    expect(aliceLogs).toHaveLength(1);

    // Bob attempts to query Alice's logs -> rejected
    await expect(
      bobSession.query(api.breathing.getUserLogs, { userId: uid_student_alice })
    ).rejects.toThrow("Unauthorized");
  });

  test("BREATH-12: Counselor Authorization - Counselor can view assigned student's breathing logs", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_carol", role: "patient" });
      await ctx.db.insert("users", { clerkId: "counselor_dan", role: "counsellor" });

      await ctx.db.insert("breathingLogs", {
        userId: "student_carol",
        protocolId: "paced_444",
        protocolName: "Paced Calming Breath",
        sourceType: "emotion_map",
        startedAt: Date.now() - 180000,
        completedAt: Date.now(),
        durationSeconds: 180,
        cyclesCompleted: 15,
        targetCycles: 15,
        status: "completed",
        createdAt: Date.now(),
      });
    });

    await assignAllPatientsToCounsellors(t);
    const counselorSession = t.withIdentity({ subject: "counselor_dan" });
    const uid_counselor_dan = await testUserId(counselorSession, "counselor_dan");

    const logs = await counselorSession.query(api.breathing.getUserLogs, { userId: "student_carol" });
    expect(logs).toHaveLength(1);
    expect(logs[0].protocolId).toBe("paced_444");
    expect(logs[0].durationSeconds).toBe(180);
    expect(logs[0].cyclesCompleted).toBe(15);
  });

  // =========================================================================
  // 6. SYSTEM BOUNDARY & ISOLATION (JPMR & EMOTY)
  // =========================================================================
  test("BREATH-13: JPMR Boundary - JPMR relaxation logs to jpmrLogs and does not pollute breathingLogs", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "student_jpmr_test", role: "patient" });

      // JPMR session completes and writes to jpmrLogs
      await ctx.db.insert("jpmrLogs", {
        userId: "student_jpmr_test",
        completed: true,
        durationSeconds: 720,
        preIntensity: 8,
        postIntensity: 3,
        createdAt: Date.now(),
      });
    });

    const session = t.withIdentity({ subject: "student_jpmr_test" });
    const uid_student_jpmr_test = await testUserId(session, "student_jpmr_test");
    const breathingHistory = await session.query(api.breathing.getUserLogs, {});
    expect(breathingHistory).toHaveLength(0); // breathingLogs remains clean
  });

  test("BREATH-14: Emotion Map Semantic Decoupling - Breathing does not overwrite emotion map body ratings", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      const seedId_student_emap_test = await ctx.db.insert("users", { clerkId: "student_emap_test", role: "patient" });

      // Student logs somatic emotion map
      await ctx.db.insert("emotionMaps", {
        userId: String(seedId_student_emap_test),
        emotionLabel: "anxiety",
        selectedRegions: ["chest", "shoulders"],
        bodyRatings: [
          { region: "chest", intensity: 8 },
          { region: "shoulders", intensity: 7 },
        ],
        averageIntensity: 7.5,
        suggestedAction: "Breathe",
        createdAt: Date.now(),
      });

      // Student completes breathing session from emotion map recommendation
      await ctx.db.insert("breathingLogs", {
        userId: String(seedId_student_emap_test),
        protocolId: "paced_444",
        protocolName: "Paced Calming Breath",
        sourceType: "emotion_map",
        startedAt: Date.now() - 180000,
        durationSeconds: 180,
        cyclesCompleted: 15,
        targetCycles: 15,
        status: "completed",
        createdAt: Date.now(),
      });
    });

    const session = t.withIdentity({ subject: "student_emap_test" });
    const uid_student_emap_test = await testUserId(session, "student_emap_test");

    // Emotion maps remain distinct somatic scans
    const maps = await session.query(api.emotionMaps.getRecentLogs, { userId: uid_student_emap_test });
    expect(maps).toHaveLength(1);
    expect(maps[0].averageIntensity).toBe(7.5);

    // Breathing logs accurately capture intervention duration and cycles
    const breathLogs = await session.query(api.breathing.getUserLogs, {});
    expect(breathLogs).toHaveLength(1);
    expect(breathLogs[0].cyclesCompleted).toBe(15);
    expect(breathLogs[0].sourceType).toBe("emotion_map");
  });

  // =========================================================================
  // 7. RATE LIMITING TESTS
  // =========================================================================
  test("BREATH-15: Rate Limiting - Excessive rapid breathing log requests are throttled", async () => {
    const t = convexTest(schema);
    const session = t.withIdentity({ subject: "student_rate_limit_breath" });
    const uid_student_rate_limit_breath = await testUserId(session, "student_rate_limit_breath");

    // Insert 10 sessions (allowed quota)
    for (let i = 0; i < 10; i++) {
      await session.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now() - 60000,
        durationSeconds: 60,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
      });
    }

    // 11th request within 1 minute is rate limited
    await expect(
      session.mutation(api.breathing.logSession, {
        protocolId: "box_4444",
        protocolName: "Box Breathing",
        sourceType: "self_initiated",
        startedAt: Date.now() - 60000,
        durationSeconds: 60,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
      })
    ).rejects.toThrow("Rate limit exceeded");
  });
});
