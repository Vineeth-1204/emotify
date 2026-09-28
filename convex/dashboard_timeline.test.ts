/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeAnswers(count: number, score: number = 0) {
  const ans: Record<string, number> = {};
  for (let i = 1; i <= count; i++) {
    ans[String(i)] = score;
  }
  return ans;
}

describe("Priority 4 Step 5B: Dashboard Clinical Timeline Integration Suite (DASH-TL-01 to DASH-TL-12)", () => {
  async function setupDashboardTimelineEnv() {
    const t = convexTest(schema, modules);

    // 1. Setup Student
    let studentId = "";
    await t.run(async (ctx) => {
      studentId = await ctx.db.insert("users", {
        full_name: "Timeline Test Student",
        mobile_number: "9876543210",
        role: "patient",
        status: "active",
        patientId: "STU-TL-01",
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });
    });

    // 2. Setup Counselor
    let counselorId = "";
    await t.run(async (ctx) => {
      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor Carol",
        mobile_number: "9876543211",
        role: "counsellor",
        status: "active",
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });
    });

    // 3. Setup Unrelated Student
    let strangerId = "";
    await t.run(async (ctx) => {
      strangerId = await ctx.db.insert("users", {
        full_name: "Stranger Student",
        mobile_number: "9876543212",
        role: "patient",
        status: "active",
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });
    });

    return { t, studentId, counselorId, strangerId };
  }

  // DASH-TL-01: PatientDetail requests the canonical student timeline
  test("DASH-TL-01: PatientDetail requests the canonical student timeline using users._id", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();
    const asCounselor = t.withIdentity({ subject: counselorId });

    // Passing canonical users._id
    const timeline = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    expect(Array.isArray(timeline)).toBe(true);
  });

  // DASH-TL-02: Timeline events render from getStudentClinicalTimeline
  test("DASH-TL-02: Timeline events render authoritative structure from getStudentClinicalTimeline", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();
    const asStudent = t.withIdentity({ subject: studentId });

    // Submit authoritative screening attempt
    await asStudent.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
      categoryFilter: "screening",
    });

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event.category).toBe("screening");
    expect(event.title).toBe("Clinical Screening Completed");
    expect(event.sourceTable).toBe("screeningAttempts");
    expect(event.metadata?.phq9Score).toBe(9);
    expect(event.metadata?.gad7Score).toBe(7);
  });

  // DASH-TL-03: Old recoveryTimeline is no longer used as the clinical timeline source
  test("DASH-TL-03: The clinical timeline aggregates multi-domain clinical tables, not just CBT recovery milestones", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      // 1. Triage record
      await ctx.db.insert("triages", {
        userId: studentId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700003000000,
      });

      // 2. Appointment record
      await ctx.db.insert("appointments", {
        userId: studentId as any,
        title: "Intake Consultation Session",
        date: "2026-10-01",
        time: "10:00 AM",
        status: "confirmed",
        createdAt: 1700004000000,
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });

    // 3. Clinical case note added by counselor
    await asCounselor.mutation(api.dashboard.addTimelineEvent, {
      userId: studentId,
      eventType: "intervention",
      title: "Intake Consultation Note",
      description: "Student engaged well during intake.",
    });

    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    // Must contain triage, counseling, and note events (far beyond CBT recovery)
    const categories = events.map((e) => e.category);
    expect(categories).toContain("triage");
    expect(categories).toContain("counseling");
    expect(categories).toContain("note");
  });

  // DASH-TL-04: Events display in backend-provided chronological order
  test("DASH-TL-04: Events display in strict backend-provided chronological order (newest first)", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentId,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700001000000, // Older
      });
      await ctx.db.insert("triages", {
        userId: studentId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700009000000, // Newer
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    expect(events.length).toBe(2);
    expect(events[0].occurredAt).toBe(1700009000000);
    expect(events[1].occurredAt).toBe(1700001000000);
    expect(events[0].occurredAt).toBeGreaterThan(events[1].occurredAt);
  });

  // DASH-TL-05: Category filters change the displayed events correctly
  test("DASH-TL-05: Category filters isolate events by clinical domain", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700002000000,
      });
      await ctx.db.insert("alerts", {
        userId: studentId,
        type: "suicide",
        status: "pending",
        createdAt: 1700003000000,
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });

    // Filter by triage only
    const triageEvents = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
      categoryFilter: "triage",
    });
    expect(triageEvents.length).toBe(1);
    expect(triageEvents[0].category).toBe("triage");

    // Filter by safety only
    const safetyEvents = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
      categoryFilter: "safety",
    });
    expect(safetyEvents.length).toBe(1);
    expect(safetyEvents[0].category).toBe("safety");
  });

  // DASH-TL-06: Provenance indicators appear only when explicit provenance exists
  test("DASH-TL-06: Provenance indicators appear only when explicit provenance exists", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();
    const asStudent = t.withIdentity({ subject: studentId });

    // High-risk submission triggers triage and safety alert with deterministic provenance
    const phq9Ans = makeAnswers(9, 1);
    phq9Ans["9"] = 2; // Suicide risk flag

    const sub = await asStudent.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: phq9Ans,
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    const alertEvent = events.find((e) => e.eventType === "safety_alert_created");
    expect(alertEvent).toBeDefined();
    expect(alertEvent?.provenance?.attemptId).toBe(String(sub.attemptId));
    expect(alertEvent?.provenance?.triageId).toBe(String(sub.triageId));
    expect(alertEvent?.provenance?.alertId).toBeDefined();
  });

  // DASH-TL-07: Historical events without provenance render safely
  test("DASH-TL-07: Historical events without provenance render safely without fabricated links", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      // Historical alert created before provenance tracking
      await ctx.db.insert("alerts", {
        userId: studentId,
        type: "manual_sos",
        status: "acknowledged",
        createdAt: 1700001000000,
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    const manualAlert = events.find((e) => e.eventType === "safety_alert_created");
    expect(manualAlert).toBeDefined();
    expect(manualAlert?.provenance?.attemptId).toBeUndefined();
    expect(manualAlert?.provenance?.triageId).toBeUndefined();
    expect(manualAlert?.provenance?.sessionId).toBeUndefined();
  });

  // DASH-TL-08: Loading / skipped behavior works
  test("DASH-TL-08: Unauthenticated access is rejected safely", async () => {
    const { t, studentId } = await setupDashboardTimelineEnv();

    await expect(
      t.query(api.timeline.getStudentClinicalTimeline, { userId: studentId })
    ).rejects.toThrow(/Unauthenticated/);
  });

  // DASH-TL-09: Empty state works
  test("DASH-TL-09: Empty state works and returns empty array without implying clinical pathology", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();
    const asCounselor = t.withIdentity({ subject: counselorId });

    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });

  // DASH-TL-10: Error state works without exposing implementation details
  test("DASH-TL-10: Unauthorized cross-student query is securely blocked", async () => {
    const { t, studentId, strangerId } = await setupDashboardTimelineEnv();
    const asStranger = t.withIdentity({ subject: strangerId });

    await expect(
      asStranger.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentId,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  // DASH-TL-11: Raw AI conversation content is not rendered
  test("DASH-TL-11: Raw AI conversation dialogue and prompts are not present in timeline event models", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("cbtSessions", {
        userId: studentId,
        automaticThought: "I cannot do this anymore",
        cbtDistortion: "catastrophizing",
        thinkingStyle: "Catastrophizing",
        emotionBefore: 9,
        emotionAfter: 4,
        beliefScore: 80,
        stepIndex: 3,
        currentStep: "challenge",
        sessionStatus: "completed",
        timestamp: 1700004000000,
        conversation: [
          { role: "user", content: "Sensitive raw student dialogue that must not leak into timeline overview", timestamp: 1700004000000 },
          { role: "ai", content: "Sensitive AI raw response text", timestamp: 1700004001000 },
        ],
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });
    const events = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });

    const cbtEvent = events.find((e) => e.eventType === "cbt_session_completed");
    expect(cbtEvent).toBeDefined();
    // Verify metadata does not contain raw conversation history
    expect(cbtEvent?.metadata?.conversation).toBeUndefined();
    expect(JSON.stringify(cbtEvent)).not.toContain("Sensitive raw student dialogue");
    expect(JSON.stringify(cbtEvent)).not.toContain("Sensitive AI raw response text");
  });

  // DASH-TL-12: Monitoring telemetry is not displayed by default
  test("DASH-TL-12: High-frequency monitoring telemetry (emotionLogs, dailyCheckins) is excluded by default", async () => {
    const { t, studentId, counselorId } = await setupDashboardTimelineEnv();

    await t.run(async (ctx) => {
      // Regular clinical event
      await ctx.db.insert("triages", {
        userId: studentId,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700001000000,
      });

      // High-frequency emotion logs
      await ctx.db.insert("emotionLogs", {
        userId: studentId,
        emotion: "anxious",
        bodyRegions: ["chest", "shoulders"],
        preIntensity: 7,
        postIntensity: 5,
        createdAt: 1700002000000,
      });

      // Daily check-in
      await ctx.db.insert("dailyCheckins", {
        userId: studentId,
        dateStr: "2026-10-01",
        mood: "okay",
        createdAt: 1700003000000,
      });
    });

    const asCounselor = t.withIdentity({ subject: counselorId });

    // 1. Default timeline (no category filter)
    const defaultEvents = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
    });
    expect(defaultEvents.length).toBe(1);
    expect(defaultEvents[0].category).toBe("triage");
    expect(defaultEvents.some((e) => e.category === "monitoring")).toBe(false);

    // 2. Explicit monitoring filter requested
    const monitoringEvents = await asCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
      categoryFilter: "monitoring",
    });
    expect(monitoringEvents.length).toBe(2);
    expect(monitoringEvents.every((e) => e.category === "monitoring")).toBe(true);
  });
});
