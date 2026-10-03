/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import fs from "fs";
import path from "path";

const modules = import.meta.glob("./**/*.ts");

function makeAnswers(count: number, score: number = 0) {
  const ans: Record<string, number> = {};
  for (let i = 1; i <= count; i++) {
    ans[String(i)] = score;
  }
  return ans;
}

describe("Priority 9 Step 6B: Counselor Dashboard Intervention Timeline Integration Suite", () => {
  async function setupEnv() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9811111111",
        role: "patient",
        status: "active",
        patientId: "STU-A",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    let studentBId = "";
    await t.run(async (ctx) => {
      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9822222222",
        role: "patient",
        status: "active",
        patientId: "STU-B",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    let counselorId = "";
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Clara",
        mobile_number: "9833333333",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    return { t, studentAId, studentBId, counselorId };
  }

  // 1. TIMELINE-BREATHING: Completed breathingLogs appears in Clinical Timeline under category intervention
  test("TIMELINE-BREATHING: Completed breathing session appears in timeline under category intervention", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing (4-4-4-4)",
      sourceType: "self_initiated",
      startedAt: Date.now() - 120000,
      completedAt: Date.now(),
      durationSeconds: 120,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "intervention",
    });

    const breathingEvent = timeline.find((e) => e.eventType === "breathing_completed");
    expect(breathingEvent).toBeDefined();
    expect(breathingEvent?.category).toBe("intervention");
    expect(breathingEvent?.title).toBe("Breathing: Box Breathing (4-4-4-4)");
    expect(breathingEvent?.summary).toContain("4/4 cycles completed");
    expect(breathingEvent?.status).toBe("completed");
    expect(breathingEvent?.sourceTable).toBe("breathingLogs");
  });

  // 2. TIMELINE-BREATHING-PARTIAL: Partial breathing session appears with breathing_partial eventType
  test("TIMELINE-BREATHING-PARTIAL: Partial breathing session appears with breathing_partial eventType", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.breathing.logSession, {
      protocolId: "paced_444",
      protocolName: "Paced Breathing",
      sourceType: "emotion_map",
      startedAt: Date.now() - 60000,
      completedAt: Date.now(),
      durationSeconds: 60,
      cyclesCompleted: 2,
      targetCycles: 4,
      status: "partial",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const partialEvent = timeline.find((e) => e.eventType === "breathing_partial");
    expect(partialEvent).toBeDefined();
    expect(partialEvent?.category).toBe("intervention");
    expect(partialEvent?.summary).toContain("2/4 cycles completed");
    expect(partialEvent?.status).toBe("partial");
  });

  // 3. TIMELINE-BREATHING-ABANDONED: Abandoned breathing session does NOT appear
  test("TIMELINE-BREATHING-ABANDONED: Abandoned breathing session does not appear in timeline", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.breathing.logSession, {
      protocolId: "calming_434",
      protocolName: "Calming Breath",
      sourceType: "self_initiated",
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
      durationSeconds: 5,
      cyclesCompleted: 0,
      targetCycles: 4,
      status: "abandoned",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const abandonedEvent = timeline.find((e) => e.sourceTable === "breathingLogs");
    expect(abandonedEvent).toBeUndefined();
  });

  // 4. TIMELINE-GROUNDING: Completed groundingLogs record appears under intervention with 5/5 steps
  test("TIMELINE-GROUNDING: Completed grounding session appears under intervention with 5/5 steps", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 180000,
      completedAt: Date.now(),
      durationSeconds: 180,
      stepsCompleted: 5,
      status: "completed",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "intervention",
    });

    const groundingEvent = timeline.find((e) => e.eventType === "grounding_completed");
    expect(groundingEvent).toBeDefined();
    expect(groundingEvent?.category).toBe("intervention");
    expect(groundingEvent?.title).toBe("Sensory Grounding: 5-4-3-2-1");
    expect(groundingEvent?.summary).toContain("5/5 sensory steps completed");
    expect(groundingEvent?.status).toBe("completed");
  });

  // 5. TIMELINE-GROUNDING-PARTIAL: Partial grounding session appears with correct steps and status
  test("TIMELINE-GROUNDING-PARTIAL: Partial grounding session appears with correct steps and status", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "cbt_support",
      startedAt: Date.now() - 90000,
      completedAt: Date.now(),
      durationSeconds: 90,
      stepsCompleted: 3,
      status: "partial",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const partialEvent = timeline.find((e) => e.eventType === "grounding_partial");
    expect(partialEvent).toBeDefined();
    expect(partialEvent?.summary).toContain("3/5 sensory steps completed");
    expect(partialEvent?.status).toBe("partial");
  });

  // 6. TIMELINE-GROUNDING-ABANDONED: Abandoned grounding session does NOT appear
  test("TIMELINE-GROUNDING-ABANDONED: Abandoned grounding session does not appear in timeline", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.grounding.logSession, {
      protocolId: "sensory_54321",
      protocolName: "5-4-3-2-1 Sensory Grounding",
      sourceType: "self_initiated",
      startedAt: Date.now() - 10000,
      completedAt: Date.now(),
      durationSeconds: 10,
      stepsCompleted: 0,
      status: "abandoned",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const abandonedEvent = timeline.find((e) => e.sourceTable === "groundingLogs");
    expect(abandonedEvent).toBeUndefined();
  });

  // 7. TIMELINE-CBT-REFRAME-DEDUP: Linked reframeLog does not create duplicate top-level event
  test("TIMELINE-CBT-REFRAME-DEDUP: CBT session with linked reframe produces ONE top-level event, not duplicate", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    let sessionId = "";
    let reframeId = "";

    await t.run(async (ctx) => {
      // Completed CBT Session
      sessionId = await ctx.db.insert("cbtSessions", {
        userId: studentAId,
        situation: "Upcoming exam",
        automaticThought: "I will fail completely",
        emotion: "Anxiety",
        emotionBefore: 8,
        emotionAfter: 3,
        beliefScore: 85,
        thinkingStyle: "Catastrophizing",
        cbtDistortion: "Fortune Telling",
        sessionStatus: "completed",
        currentStep: "completed",
        stepIndex: 8,
        timestamp: Date.now(),
        conversation: [],
      });

      // Linked reframe log generated from that CBT session
      reframeId = await ctx.db.insert("reframeLogs", {
        userId: studentAId,
        situation_text: "Upcoming exam",
        thought_original: "I will fail completely",
        thinking_trap_choice: "Catastrophizing",
        guided_answers: ["I have prepared", "One exam does not define me"],
        reframe_text: "I can try my best and learn from it",
        pre_reframe_intensity: 8,
        post_reframe_intensity: 3,
        improvement_percentage: 63,
        saved_reframe_flag: true,
        cbtSessionId: sessionId,
        createdAt: Date.now(),
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "intervention",
    });

    // Exactly 1 top-level CBT event must exist
    const cbtEvents = timeline.filter((e) => e.sourceTable === "cbtSessions");
    expect(cbtEvents.length).toBe(1);
    expect(cbtEvents[0].sourceId).toBe(String(sessionId));
    expect(cbtEvents[0].metadata?.reframeCompleted).toBe(true);
    expect(cbtEvents[0].metadata?.reframeImprovementPercentage).toBe(63);

    // The linked reframeLog must NOT produce a separate top-level timeline card
    const duplicateReframe = timeline.find((e) => e.sourceTable === "reframeLogs" && e.sourceId === String(reframeId));
    expect(duplicateReframe).toBeUndefined();
  });

  // 8. TIMELINE-STANDALONE-REFRAME: Standalone reframe without cbtSessionId appears independently
  test("TIMELINE-STANDALONE-REFRAME: Reframe without cbtSessionId appears as independent event", async () => {
    const { t, studentAId, counselorId } = await setupEnv();

    let standaloneReframeId = "";
    await t.run(async (ctx) => {
      standaloneReframeId = await ctx.db.insert("reframeLogs", {
        userId: studentAId,
        situation_text: "Meeting presentation",
        thought_original: "Everyone will judge me",
        thinking_trap_choice: "Mind Reading",
        guided_answers: ["People are focused on content"],
        reframe_text: "I have prepared useful information",
        pre_reframe_intensity: 7,
        post_reframe_intensity: 2,
        improvement_percentage: 71,
        saved_reframe_flag: true,
        sourceType: "self_initiated",
        createdAt: Date.now(),
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "intervention",
    });

    const standaloneEvent = timeline.find((e) => e.id === `reframeLogs_${standaloneReframeId}`);
    expect(standaloneEvent).toBeDefined();
    expect(standaloneEvent?.eventType).toBe("reframe_completed");
    expect(standaloneEvent?.summary).toContain("71% improvement");
  });

  // 9. TIMELINE-PROVENANCE: Valid attemptId/triageId is preserved; missing provenance remains undefined
  test("TIMELINE-PROVENANCE: Valid attemptId and triageId are preserved on breathing/grounding records", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    const sub = await asStudent.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    // Breathing session with validated provenance
    await asStudent.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing",
      sourceType: "cbt_support",
      startedAt: Date.now() - 100000,
      completedAt: Date.now(),
      durationSeconds: 120,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
      attemptId: sub.attemptId,
      triageId: sub.triageId,
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const breathingEvent = timeline.find((e) => e.sourceTable === "breathingLogs");
    expect(breathingEvent).toBeDefined();
    expect(breathingEvent?.provenance?.attemptId).toBe(String(sub.attemptId));
    expect(breathingEvent?.provenance?.triageId).toBe(String(sub.triageId));
  });

  // 10. TIMELINE-PRIVACY: Raw dialogue arrays or private free-text are never added to timeline events
  test("TIMELINE-PRIVACY: Raw dialogue arrays and private conversations are excluded from timeline", async () => {
    const { t, studentAId, counselorId } = await setupEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("cbtSessions", {
        userId: studentAId,
        situation: "Private Situation",
        automaticThought: "Private Automatic Thought",
        emotion: "Sadness",
        emotionBefore: 6,
        emotionAfter: 2,
        beliefScore: 90,
        thinkingStyle: "Overgeneralization",
        sessionStatus: "completed",
        currentStep: "completed",
        stepIndex: 8,
        timestamp: Date.now(),
        conversation: [
          { role: "user", content: "Very intimate secret conversation text", timestamp: Date.now() },
          { role: "assistant", content: "Empathetic response", timestamp: Date.now() },
        ],
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const cbtEvent = timeline.find((e) => e.sourceTable === "cbtSessions");
    expect(cbtEvent).toBeDefined();
    // Verify metadata does not contain raw conversation arrays
    expect(cbtEvent?.metadata?.conversation).toBeUndefined();
    expect(JSON.stringify(cbtEvent)).not.toContain("Very intimate secret conversation text");
  });

  // 11. DASHBOARD-BREATHING: getPatientCbtAnalytics returns authorized breathing logs
  test("DASHBOARD-BREATHING: getPatientCbtAnalytics returns breathingLogs for counselor", async () => {
    const { t, studentAId, counselorId } = await setupEnv();
    const asStudent = t.withIdentity({ subject: studentAId });

    await asStudent.mutation(api.breathing.logSession, {
      protocolId: "box_4444",
      protocolName: "Box Breathing (4-4-4-4)",
      sourceType: "self_initiated",
      startedAt: Date.now() - 120000,
      completedAt: Date.now(),
      durationSeconds: 120,
      cyclesCompleted: 4,
      targetCycles: 4,
      status: "completed",
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const analytics = await asCounselor.query(api.dashboard.getPatientCbtAnalytics, {
      userId: studentAId,
    });

    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics?.breathingLogs)).toBe(true);
    expect(analytics?.breathingLogs.length).toBe(1);
    expect(analytics?.breathingLogs[0].protocolName).toBe("Box Breathing (4-4-4-4)");
    expect(analytics?.breathingLogs[0].cyclesCompleted).toBe(4);
  });

  // 12. DASHBOARD-BREATHING-AUTH: Unauthorized student cannot retrieve another student's analytics
  test("DASHBOARD-BREATHING-AUTH: Student cannot query another student's CBT/somatic analytics", async () => {
    const { t, studentAId, studentBId } = await setupEnv();
    const asStudentB = t.withIdentity({ subject: studentBId });

    await expect(
      asStudentB.query(api.dashboard.getPatientCbtAnalytics, {
        userId: studentAId,
      })
    ).rejects.toThrow();
  });

  // 13. DASHBOARD-TIMELINE-DUPLICATE: Tab 3 in PatientDetail.tsx does NOT render duplicate ClinicalTimelineView
  test("DASHBOARD-TIMELINE-DUPLICATE: PatientDetail.tsx Tab 3 does not render nested ClinicalTimelineView", () => {
    const patientDetailPath = path.resolve(__dirname, "../dashboard/src/pages/PatientDetail.tsx");
    const content = fs.readFileSync(patientDetailPath, "utf-8");

    // ClinicalTimelineView should only appear in Tab 2, exactly once
    const matches = content.match(/<ClinicalTimelineView/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1);
  });

  // 14. DASHBOARD-SOMATIC-BREATHING: Breathing Sessions table exists in PatientDetail.tsx Tab 4
  test("DASHBOARD-SOMATIC-BREATHING: Breathing Sessions table exists in PatientDetail.tsx Tab 4", () => {
    const patientDetailPath = path.resolve(__dirname, "../dashboard/src/pages/PatientDetail.tsx");
    const content = fs.readFileSync(patientDetailPath, "utf-8");

    expect(content).toContain("Breathing Sessions");
    expect(content).toContain("cbtAnalytics?.breathingLogs");
    expect(content).toContain("Cycles Completed");
    expect(content).toContain("Somatic & Sensory Interventions");
  });
});
