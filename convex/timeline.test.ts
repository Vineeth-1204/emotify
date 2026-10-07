/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

function makeAnswers(count: number, score: number = 0) {
  const ans: Record<string, number> = {};
  for (let i = 1; i <= count; i++) {
    ans[String(i)] = score;
  }
  return ans;
}

describe("Priority 4 Step 5A: Clinical Timeline Backend Suite (TIMELINE-01 to TIMELINE-20)", () => {
  async function setupTimelineEnvironment() {
    const t = convexTest(schema, modules);

    // 1. Student Alpha
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

    // 2. Student Beta
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

    // 3. Counselor Clara
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

    // 4. Admin Arthur
    let adminId = "";
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", {
        full_name: "Admin Arthur",
        mobile_number: "9844444444",
        role: "admin",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    // Legacy fixtures: counsellors share every student (caseload assignments)
    await assignAllPatientsToCounsellors(t);

    return { t, studentAId, studentBId, counselorId, adminId };
  }

  // TIMELINE-01: Student can retrieve their own timeline
  test("TIMELINE-01: Student can retrieve their own timeline", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Submit screening
    await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((e) => e.studentId === studentAId)).toBe(true);
  });

  // TIMELINE-02: Student cannot retrieve another student's timeline
  test("TIMELINE-02: Student cannot retrieve another student's timeline", async () => {
    const { t, studentAId, studentBId } = await setupTimelineEnvironment();
    const authedB = t.withIdentity({ subject: studentBId });

    await expect(
      authedB.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // TIMELINE-03: Unauthenticated access is denied
  test("TIMELINE-03: Unauthenticated access is denied", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();

    await expect(
      t.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Unauthenticated/);
  });

  // TIMELINE-04: Counselor can access according to current Step 3 authorization
  test("TIMELINE-04: Counselor can access according to current Step 3 authorization", async () => {
    const { t, studentAId, counselorId } = await setupTimelineEnvironment();
    const authedCounselor = t.withIdentity({ subject: counselorId });

    // Student A has screening
    const authedA = t.withIdentity({ subject: studentAId });
    await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    expect(timeline.length).toBeGreaterThan(0);
  });

  // TIMELINE-05: Admin access works according to current authorization
  test("TIMELINE-05: Admin access works according to current authorization", async () => {
    const { t, studentAId, adminId } = await setupTimelineEnvironment();
    const authedAdmin = t.withIdentity({ subject: adminId });

    const timeline = await authedAdmin.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    expect(Array.isArray(timeline)).toBe(true);
  });

  // TIMELINE-06: Screening attempt appears with correct sourceId
  test("TIMELINE-06: Screening attempt appears with correct sourceId", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const sub = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "screening",
    });

    expect(timeline.length).toBe(1);
    expect(timeline[0].sourceId).toBe(String(sub.attemptId));
    expect(timeline[0].sourceTable).toBe("screeningAttempts");
    expect(timeline[0].eventType).toBe("screening_completed");
  });

  // TIMELINE-07: Screening provenance contains actual attemptId and triageId
  test("TIMELINE-07: Screening provenance contains actual attemptId and triageId", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const sub = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "screening",
    });

    const screeningEvent = timeline.find((e) => e.eventType === "screening_completed");
    expect(screeningEvent).toBeDefined();
    expect(screeningEvent!.provenance?.attemptId).toBe(String(sub.attemptId));
    expect(screeningEvent!.provenance?.triageId).toBe(String(sub.triageId));
  });

  // TIMELINE-08: Triage event contains actual attemptId
  test("TIMELINE-08: Triage event contains actual attemptId", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const sub = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: makeAnswers(9, 1),
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "triage",
    });

    expect(timeline.length).toBe(1);
    expect(timeline[0].sourceId).toBe(String(sub.triageId));
    expect(timeline[0].provenance?.attemptId).toBe(String(sub.attemptId));
    expect(timeline[0].provenance?.triageId).toBe(String(sub.triageId));
  });

  // TIMELINE-09: High-risk alert contains actual alertId, triageId and attemptId
  test("TIMELINE-09: High-risk alert contains actual alertId, triageId and attemptId", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // High risk: suicide flag
    const phq9Ans = makeAnswers(9, 1);
    phq9Ans["9"] = 2;

    const sub = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: phq9Ans,
        gad7: makeAnswers(7, 1),
        pq16: makeAnswers(16, 0),
      },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "safety",
    });

    const alertEvent = timeline.find((e) => e.eventType === "safety_alert_created");
    expect(alertEvent).toBeDefined();
    expect(alertEvent!.provenance?.attemptId).toBe(String(sub.attemptId));
    expect(alertEvent!.provenance?.triageId).toBe(String(sub.triageId));
    expect(alertEvent!.provenance?.alertId).toBeDefined();
    expect(alertEvent!.severity).toBe("critical");
  });

  // TIMELINE-10: Independent/manual alert does not receive fabricated provenance
  test("TIMELINE-10: Independent/manual alert does not receive fabricated provenance", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const alertId = await authedA.mutation(internal.alerts.createAlert, {
      type: "manual_sos",
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "safety",
    });

    const manualAlert = timeline.find((e) => e.sourceId === String(alertId));
    expect(manualAlert).toBeDefined();
    expect(manualAlert!.provenance?.alertId).toBe(String(alertId));
    expect(manualAlert!.provenance?.attemptId).toBeUndefined();
    expect(manualAlert!.provenance?.triageId).toBeUndefined();
  });

  // TIMELINE-11: Historical records with undefined provenance remain readable and unlinked
  test("TIMELINE-11: Historical records with undefined provenance remain readable and unlinked", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    let histTriageId: any = null;
    await t.run(async (ctx) => {
      histTriageId = await ctx.db.insert("triages", {
        userId: studentAId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: Date.now() - 500000,
        // attemptId intentionally left undefined
      });
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "triage",
    });

    const histEvent = timeline.find((e) => e.sourceId === String(histTriageId));
    expect(histEvent).toBeDefined();
    expect(histEvent!.provenance?.triageId).toBe(String(histTriageId));
    expect(histEvent!.provenance?.attemptId).toBeUndefined(); // Zero speculative links
  });

  // TIMELINE-12: Multiple screening attempts remain isolated and do not cross-link
  test("TIMELINE-12: Multiple screening attempts remain isolated and do not cross-link", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const sub1 = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: { phq9: makeAnswers(9, 1), gad7: makeAnswers(7, 1), pq16: makeAnswers(16, 0) },
    });

    const sub2 = await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: { phq9: makeAnswers(9, 2), gad7: makeAnswers(7, 2), pq16: makeAnswers(16, 0) },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "screening",
    });

    expect(timeline.length).toBe(2);
    const event1 = timeline.find((e) => e.sourceId === String(sub1.attemptId));
    const event2 = timeline.find((e) => e.sourceId === String(sub2.attemptId));

    expect(event1!.provenance?.triageId).toBe(String(sub1.triageId));
    expect(event2!.provenance?.triageId).toBe(String(sub2.triageId));
    expect(event1!.provenance?.triageId).not.toBe(event2!.provenance?.triageId);
  });

  // TIMELINE-13: Duplicate screening mirror records do not produce duplicate modern screening events
  test("TIMELINE-13: Duplicate screening mirror records do not produce duplicate modern screening events", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Submit single screening attempt (internally mirrors to `screenings` table)
    await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: { phq9: makeAnswers(9, 1), gad7: makeAnswers(7, 1), pq16: makeAnswers(16, 0) },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "screening",
    });

    // Exactly 1 screening event must exist, not 2
    expect(timeline.length).toBe(1);
    expect(timeline[0].sourceTable).toBe("screeningAttempts");
  });

  // TIMELINE-14: Events are sorted newest → oldest
  test("TIMELINE-14: Events are sorted newest -> oldest", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Insert records with deliberate timestamp intervals
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellorRequests", {
        user_id: studentAId,
        timestamp: now - 30000,
        status: "pending",
      });
      await ctx.db.insert("jpmrLogs", {
        userId: studentAId,
        completed: true,
        durationSeconds: 300,
        preIntensity: 8,
        postIntensity: 3,
        createdAt: now - 10000,
        completedAt: now - 10000,
      });
      await ctx.db.insert("followUps", {
        userId: studentAId,
        type: "checkin",
        dueDate: now + 50000,
        completed: false,
        createdAt: now - 50000,
      });
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    expect(timeline.length).toBe(3);
    for (let i = 0; i < timeline.length - 1; i++) {
      expect(timeline[i].occurredAt).toBeGreaterThanOrEqual(timeline[i + 1].occurredAt);
    }
  });

  // TIMELINE-15: Identical timestamps have deterministic ordering
  test("TIMELINE-15: Identical timestamps have deterministic ordering", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    const fixedTime = 1700000000000;
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellorRequests", {
        user_id: studentAId,
        timestamp: fixedTime,
        status: "pending",
      });
      await ctx.db.insert("jpmrLogs", {
        userId: studentAId,
        completed: true,
        durationSeconds: 120,
        preIntensity: 5,
        postIntensity: 2,
        createdAt: fixedTime,
        completedAt: fixedTime,
      });
    });

    const timeline1 = await authedA.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId });
    const timeline2 = await authedA.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId });

    expect(timeline1.map((e) => e.id)).toEqual(timeline2.map((e) => e.id));
  });

  // TIMELINE-16: Default timeline does not contain raw companion messages
  test("TIMELINE-16: Default timeline does not contain raw companion messages", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    await t.run(async (ctx) => {
      await ctx.db.insert("companionMessages", {
        messageId: "msg_1",
        userId: studentAId,
        role: "user",
        content: "I feel lonely today",
        createdAt: Date.now(),
      });
      await ctx.db.insert("aiCompanionLogs", {
        messageId: "msg_2",
        userId: studentAId,
        role: "assistant",
        content: "I am here for you",
        createdAt: Date.now(),
      });
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const hasCompanionMsg = timeline.some(
      (e) => e.sourceTable === "companionMessages" || e.sourceTable === "aiCompanionLogs"
    );
    expect(hasCompanionMsg).toBe(false);
  });

  // TIMELINE-17: Default timeline does not become flooded by high-frequency telemetry
  test("TIMELINE-17: Default timeline does not become flooded by high-frequency telemetry", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Insert 5 emotion logs and 5 daily checkins
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("emotionLogs", {
          userId: studentAId,
          emotion: "Anxious",
          bodyRegions: ["chest"],
          createdAt: Date.now() - i * 1000,
        });
        await ctx.db.insert("dailyCheckins", {
          userId: studentAId,
          dateStr: `2026-09-0${i + 1}`,
          mood: "neutral",
          createdAt: Date.now() - i * 1000,
        });
      }
    });

    // Default timeline query
    const defaultTimeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });
    expect(defaultTimeline.length).toBe(0); // Excluded from default view

    // Explicit monitoring query
    const monitoringTimeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "monitoring",
    });
    expect(monitoringTimeline.length).toBe(10);
  });

  // TIMELINE-18: Manual clinical notes can appear as note events
  test("TIMELINE-18: Manual clinical notes can appear as note events", async () => {
    const { t, studentAId, counselorId } = await setupTimelineEnvironment();
    const authedCounselor = t.withIdentity({ subject: counselorId });

    // Counselor adds manual case note
    await authedCounselor.mutation(api.dashboard.addTimelineEvent, {
      userId: studentAId,
      eventType: "intervention",
      title: "Counselling Consultation Note",
      description: "Student discussed academic stress and sleep hygiene.",
    });

    const timeline = await authedCounselor.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "note",
    });

    expect(timeline.length).toBe(1);
    expect(timeline[0].category).toBe("note");
    expect(timeline[0].eventType).toBe("staff_case_note");
    expect(timeline[0].title).toBe("Counselling Consultation Note");
    expect(timeline[0].summary).toBe("Student discussed academic stress and sleep hygiene.");
  });

  // TIMELINE-19: No timeline event leaks another student's data
  test("TIMELINE-19: No timeline event leaks another student's data", async () => {
    const { t, studentAId, studentBId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });
    const authedB = t.withIdentity({ subject: studentBId });

    // Student A has screening
    await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: { phq9: makeAnswers(9, 1), gad7: makeAnswers(7, 1), pq16: makeAnswers(16, 0) },
    });

    // Student B has counselor request
    await authedB.mutation(api.counsellorRequests.create, {
      thought_original: "Private beta thought",
      timestamp: Date.now(),
    });

    const timelineA = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    expect(timelineA.every((e) => e.studentId === studentAId)).toBe(true);
    expect(timelineA.some((e) => e.summary?.includes("Private beta thought"))).toBe(false);
  });

  // TIMELINE-20: Event IDs are deterministic and unique
  test("TIMELINE-20: Event IDs are deterministic and unique", async () => {
    const { t, studentAId } = await setupTimelineEnvironment();
    const authedA = t.withIdentity({ subject: studentAId });

    // Create high-risk screening (generates screeningAttempt, triage, alert)
    const phq9Ans = makeAnswers(9, 2);
    phq9Ans["9"] = 3;
    await authedA.mutation(api.screening.submitScreeningAttempt, {
      responses: { phq9: phq9Ans, gad7: makeAnswers(7, 2), pq16: makeAnswers(16, 0) },
    });

    const timeline = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    const idSet = new Set(timeline.map((e) => e.id));
    expect(idSet.size).toBe(timeline.length); // All unique

    // Consistent prefix pattern
    expect(timeline.every((e) => e.id.includes("_"))).toBe(true);
  });
});
