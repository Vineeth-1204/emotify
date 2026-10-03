/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 5C: Clinical Timeline Query Bounding & Deterministic Cursor Pagination", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    let studentBId = "";
    let counselorId = "";

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student A",
        mobile_number: "9876543201",
        role: "patient",
        status: "active",
        patientId: "101",
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student B",
        mobile_number: "9876543202",
        role: "patient",
        status: "active",
        patientId: "102",
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Counselor",
        mobile_number: "9876543203",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    });

    const authedA = t.withIdentity({ subject: studentAId });
    const authedB = t.withIdentity({ subject: studentBId });
    const authedCounselor = t.withIdentity({ subject: counselorId });

    return { t, studentAId, studentBId, counselorId, authedA, authedB, authedCounselor };
  }

  // P11-5C-TL-01: First page returns default maximum of 50.
  test("P11-5C-TL-01: First page returns default maximum of 50 events", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    // Insert 60 clinical notes
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Case Note ${i + 1}`,
          description: `Clinical assessment note ${i + 1}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    expect(res.events).toHaveLength(50);
    expect(res.nextCursor).not.toBeNull();
  });

  // P11-5C-TL-02: Explicit limit works.
  test("P11-5C-TL-02: Explicit limit works", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Description ${i}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 15,
      paginate: true,
    });

    expect(res.events).toHaveLength(15);
    expect(res.nextCursor).not.toBeNull();
  });

  // P11-5C-TL-03: Maximum limit is capped at 100.
  test("P11-5C-TL-03: Maximum limit is capped at 100", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Description ${i}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    // Request limit of 150 -> should be capped at 100
    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 150,
      paginate: true,
    });

    expect(res.events).toHaveLength(100);
    expect(res.nextCursor).not.toBeNull();
  });

  // P11-5C-TL-04: Second page using nextCursor contains no events from page 1.
  test("P11-5C-TL-04: Second page using nextCursor contains no events from page 1", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Desc ${i}`,
          timestamp: 1700000000000 + i * 1000,
        });
      }
    });

    const page1 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 10,
      paginate: true,
    });
    expect(page1.events).toHaveLength(10);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 10,
      cursor: page1.nextCursor!,
    });
    expect(page2.events).toHaveLength(10);

    const page1Ids = new Set(page1.events.map((e: any) => e.id));
    for (const e of page2.events) {
      expect(page1Ids.has(e.id)).toBe(false);
    }
  });

  // P11-5C-TL-05: Repeated pagination eventually covers all eligible synthetic events without duplication.
  test("P11-5C-TL-05: Repeated pagination eventually covers all eligible synthetic events without duplication", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const totalEvents = 23;
    await t.run(async (ctx) => {
      for (let i = 0; i < totalEvents; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "mild",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: 1700000000000 + i * 1000,
        });
      }
    });

    const pageSize = 7;
    const collected: string[] = [];
    let currentCursor: string | null | undefined = undefined;

    for (let loop = 0; loop < 10; loop++) {
      const res: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        limit: pageSize,
        cursor: currentCursor,
        paginate: true,
      });

      for (const e of res.events) {
        collected.push(e.id);
      }

      currentCursor = res.nextCursor;
      if (!currentCursor) break;
    }

    expect(collected).toHaveLength(totalEvents);
    const uniqueIds = new Set(collected);
    expect(uniqueIds.size).toBe(totalEvents);
  });

  // P11-5C-TL-06: Events with identical timestamps are deterministically ordered by eventId.
  test("P11-5C-TL-06: Events with identical timestamps are deterministically ordered by eventId descending", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const sameTime = 1700005000000;
    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentAId,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: sameTime,
      });
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Note at same time",
        description: "Note description",
        timestamp: sameTime,
      });
    });

    const res1 = await authedA.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId, paginate: true });
    const res2 = await authedA.query(api.timeline.getStudentClinicalTimeline, { userId: studentAId, paginate: true });

    expect(res1.events).toHaveLength(2);
    expect(res2.events).toHaveLength(2);
    // Both executions produce exact identical ordering
    expect(res1.events[0].id).toBe(res2.events[0].id);
    expect(res1.events[1].id).toBe(res2.events[1].id);
    // Verify tie-breaker ordering: id descending
    expect(res1.events[0].id.localeCompare(res1.events[1].id)).toBeGreaterThan(0);
  });

  // P11-5C-TL-07: Cursor resumes correctly when multiple events share the same timestamp.
  test("P11-5C-TL-07: Cursor resumes correctly when multiple events share the same timestamp", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const sameTime = 1700007000000;
    await t.run(async (ctx) => {
      // Create 3 events with the exact same timestamp
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Desc ${i}`,
          timestamp: sameTime,
        });
      }
    });

    // Page with limit = 1
    const p1 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 1,
      paginate: true,
    });
    expect(p1.events).toHaveLength(1);
    expect(p1.nextCursor).not.toBeNull();

    // Page 2
    const p2 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 1,
      cursor: p1.nextCursor!,
    });
    expect(p2.events).toHaveLength(1);
    expect(p2.events[0].id).not.toBe(p1.events[0].id);
    expect(p2.events[0].occurredAt).toBe(sameTime);

    // Page 3
    const p3 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 1,
      cursor: p2.nextCursor!,
    });
    expect(p3.events).toHaveLength(1);
    expect(p3.events[0].id).not.toBe(p1.events[0].id);
    expect(p3.events[0].id).not.toBe(p2.events[0].id);
    expect(p3.nextCursor).toBeNull(); // Last item, no more
  });

  // P11-5C-TL-08: Malformed cursor is rejected safely.
  test("P11-5C-TL-08: Malformed cursor is rejected safely", async () => {
    const { studentAId, authedA } = await setupTestEnvironment();

    await expect(
      authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        cursor: "not-a-valid-base64-json-cursor",
      })
    ).rejects.toThrow(/Malformed or invalid timeline cursor/);

    await expect(
      authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        cursor: btoa(JSON.stringify({ bad: "object" })),
      })
    ).rejects.toThrow(/Malformed or invalid timeline cursor/);
  });

  // P11-5C-TL-09: Student A cannot use a cursor to access Student B's timeline.
  test("P11-5C-TL-09: Student A cannot use a cursor to access Student B's timeline", async () => {
    const { t, studentAId, studentBId, authedB } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Student A Note",
        description: "Student A secret note",
        timestamp: 1700000000000,
      });
    });

    // Create a forged cursor bound to Student A
    const cursorForA = btoa(JSON.stringify({ t: 1700000000000, id: "clinicalTimelines_dummy", u: studentAId }));

    // Student B queries their own timeline using Student A's cursor -> Rejected because cursor is bound to student A!
    await expect(
      authedB.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentBId,
        cursor: cursorForA,
      })
    ).rejects.toThrow(/Cursor does not match requested student timeline/);
  });

  // P11-5C-TL-10: Student authorization remains enforced before timeline queries.
  test("P11-5C-TL-10: Student authorization remains enforced before timeline queries", async () => {
    const { studentAId, authedB } = await setupTestEnvironment();

    // Student B attempts to query Student A's timeline
    await expect(
      authedB.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
      })
    ).rejects.toThrow(/Students can access ONLY their own clinical data/);
  });

  // P11-5C-TL-10B: Existing caller without cursor or paginate receives raw event array exactly as before.
  test("P11-5C-TL-10B: Existing caller without cursor or paginate receives raw event array exactly as before", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Note for legacy caller",
        description: "Legacy format verification",
        timestamp: 1700000000000,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
    });

    // Verified: returns standard array for complete backward compatibility
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe("Note for legacy caller");
  });

  // P11-5C-TL-11: Existing event categories remain unchanged.
  test("P11-5C-TL-11: Existing event categories remain unchanged", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentAId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700001000000,
      });
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Case Note",
        description: "Staff observation",
        timestamp: 1700002000000,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    const categories = res.events.map((e: any) => e.category);
    expect(categories).toContain("triage");
    expect(categories).toContain("note");
  });

  // P11-5C-TL-12: Existing provenance fields remain unchanged.
  test("P11-5C-TL-12: Existing provenance fields remain unchanged", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    let attemptDocId!: any;
    let triageDocId!: any;

    await t.run(async (ctx) => {
      triageDocId = await ctx.db.insert("triages", {
        userId: studentAId,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: 1700003000000,
      });

      attemptDocId = await ctx.db.insert("screeningAttempts", {
        userId: studentAId,
        status: "completed",
        startedAt: 1700002000000,
        completedAt: 1700003000000,
        triageId: triageDocId,
        instrumentVersions: { phq9: "1", gad7: "1", pq16: "1" },
        responses: {},
        results: {
          phq9: { administered: true, score: 10, maxScore: 27, severity: "moderate", level: "moderate", item9Score: 0, item9Flag: false },
          gad7: { administered: true, score: 8, maxScore: 21, severity: "mild", level: "mild" },
          pq16: { administered: true, score: 2, maxScore: 16, severity: "low", level: "low" },
        },
        triageLevel: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    const screeningEvent = res.events.find((e: any) => e.sourceTable === "screeningAttempts");
    expect(screeningEvent).toBeDefined();
    expect(screeningEvent?.provenance?.attemptId).toBe(String(attemptDocId));
    expect(screeningEvent?.provenance?.triageId).toBe(String(triageDocId));
  });

  // P11-5C-TL-13: Raw AI companion messages do not enter the timeline.
  test("P11-5C-TL-13: Raw AI companion messages do not enter the timeline", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("companionMessages", {
        messageId: "msg_123",
        userId: studentAId,
        role: "user",
        content: "Private confidential chat with AI companion",
        createdAt: 1700004000000,
      });
      await ctx.db.insert("aiCompanionLogs", {
        messageId: "log_456",
        userId: studentAId,
        role: "assistant",
        content: "AI comforting words",
        createdAt: 1700004001000,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    expect(res.events.some((e: any) => e.sourceTable === "companionMessages")).toBe(false);
    expect(res.events.some((e: any) => e.sourceTable === "aiCompanionLogs")).toBe(false);
    expect(JSON.stringify(res.events)).not.toContain("Private confidential chat");
  });

  // P11-5C-TL-14: CBT/reframe deduplication remains intact across pages.
  test("P11-5C-TL-14: CBT/reframe deduplication remains intact across pages", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const tSession = 1700005000000;
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("cbtSessions", {
        userId: studentAId,
        stepIndex: 5,
        conversation: [],
        sessionStatus: "completed",
        currentStep: "completed",
        timestamp: tSession,
        emotionBefore: 8,
        emotionAfter: 3,
      });

      // Insert linked reframeLog
      await ctx.db.insert("reframeLogs", {
        userId: studentAId,
        situation_text: "Situation in CBT",
        thought_original: "Catastrophic thought",
        thinking_trap_choice: "Catastrophizing",
        guided_answers: ["Answer 1"],
        reframe_text: "Reframed thought",
        pre_reframe_intensity: 8,
        post_reframe_intensity: 3,
        improvement_percentage: 62,
        saved_reframe_flag: true,
        createdAt: tSession,
        cbtSessionId: String(sessionId),
      });

      // Insert an older note
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Older Note",
        description: "Older note content",
        timestamp: tSession - 10000,
      });
    });

    // Page 1 with limit = 1 -> returns CBT session
    const p1 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 1,
      paginate: true,
    });
    expect(p1.events).toHaveLength(1);
    expect(p1.events[0].sourceTable).toBe("cbtSessions");
    expect(p1.nextCursor).not.toBeNull();

    // Page 2 -> queries next items. The linked reframeLog must NOT appear as a duplicate event!
    const p2 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 10,
      cursor: p1.nextCursor!,
    });

    expect(p2.events.some((e: any) => e.sourceTable === "reframeLogs")).toBe(false);
    expect(p2.events[0].sourceTable).toBe("clinicalTimelines");
  });

  // P11-5C-TL-15: Abandoned/incomplete events remain excluded where existing semantics exclude them.
  test("P11-5C-TL-15: Abandoned/incomplete events remain excluded where existing semantics exclude them", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      // Incomplete JPMR
      await ctx.db.insert("jpmrLogs", {
        userId: studentAId,
        completed: false,
        preIntensity: 8,
        postIntensity: 8,
        createdAt: 1700001000000,
      });
      // Incomplete microGoal
      await ctx.db.insert("microGoals", {
        userId: studentAId,
        goalId: "g1",
        goalTitle: "Incomplete Goal",
        goalDescription: "Test",
        category: "wellness",
        difficulty: "easy",
        points: 10,
        completed: false,
        skipped: false,
        createdAt: 1700002000000,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    expect(res.events).toHaveLength(0);
  });

  // P11-5C-TL-16: Category filtering remains correct across multiple pages.
  test("P11-5C-TL-16: Category filtering remains correct across multiple pages", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      for (let i = 0; i < 15; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "mild",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: 1700000000000 + i * 2000,
        });
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Desc ${i}`,
          timestamp: 1700000000000 + i * 2000 + 1000,
        });
      }
    });

    // Query filter "triage" with limit = 5
    const p1 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "triage",
      limit: 5,
      paginate: true,
    });
    expect(p1.events).toHaveLength(5);
    expect(p1.events.every((e: any) => e.category === "triage")).toBe(true);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      categoryFilter: "triage",
      limit: 5,
      cursor: p1.nextCursor!,
    });
    expect(p2.events).toHaveLength(5);
    expect(p2.events.every((e: any) => e.category === "triage")).toBe(true);

    const p1Ids = new Set(p1.events.map((e: any) => e.id));
    for (const e of p2.events) {
      expect(p1Ids.has(e.id)).toBe(false);
    }
  });

  // P11-5C-TL-17: An empty timeline returns events = [] and nextCursor = null.
  test("P11-5C-TL-17: An empty timeline returns events = [] and nextCursor = null", async () => {
    const { studentAId, authedA } = await setupTestEnvironment();

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      paginate: true,
    });

    expect(res.events).toEqual([]);
    expect(res.nextCursor).toBeNull();
  });

  // P11-5C-TL-18: A final page returns nextCursor = null.
  test("P11-5C-TL-18: A final page returns nextCursor = null", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    await t.run(async (ctx) => {
      await ctx.db.insert("clinicalTimelines", {
        userId: studentAId,
        eventType: "note",
        title: "Single Note",
        description: "Only event in DB",
        timestamp: 1700000000000,
      });
    });

    const res = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 10,
      paginate: true,
    });

    expect(res.events).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  // LARGE DATASET TEST
  test("P11-5C-LARGE: Multi-source synthetic dataset verifies deterministic traversal across pages", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const tBase = 1700000000000;
    let expectedEligibleEventCount = 0;

    await t.run(async (ctx) => {
      // 1. 20 clinical notes
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: `Desc ${i}`,
          timestamp: tBase + i * 10000,
        });
        expectedEligibleEventCount++;
      }

      // 2. 15 triages (with some sharing timestamps with notes)
      for (let i = 0; i < 15; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "mild",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: tBase + i * 10000 + 5000,
        });
        expectedEligibleEventCount++;
      }

      // 3. 10 completed JPMR logs
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          completed: true,
          durationSeconds: 120,
          preIntensity: 7,
          postIntensity: 3,
          createdAt: tBase + i * 20000 + 2000,
          completedAt: tBase + i * 20000 + 2500,
        });
        expectedEligibleEventCount++;
      }

      // 4. 5 incomplete JPMR logs (must be excluded!)
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          completed: false,
          preIntensity: 7,
          postIntensity: 7,
          createdAt: tBase + i * 20000 + 1000,
        });
      }

      // 5. 5 CBT sessions and 5 linked reframeLogs (reframeLogs must be deduplicated!)
      for (let i = 0; i < 5; i++) {
        const sessId = await ctx.db.insert("cbtSessions", {
          userId: studentAId,
          stepIndex: 3,
          conversation: [],
          sessionStatus: "completed",
          currentStep: "completed",
          timestamp: tBase + 300000 + i * 10000,
        });
        expectedEligibleEventCount++;

        await ctx.db.insert("reframeLogs", {
          userId: studentAId,
          situation_text: `Situation ${i}`,
          thought_original: `Thought ${i}`,
          thinking_trap_choice: "Trap",
          guided_answers: [],
          reframe_text: `Reframe ${i}`,
          pre_reframe_intensity: 6,
          post_reframe_intensity: 3,
          improvement_percentage: 50,
          saved_reframe_flag: false,
          createdAt: tBase + 300000 + i * 10000,
          cbtSessionId: String(sessId),
        });
      }
    });

    // Total expected eligible events = 20 + 15 + 10 + 5 = 50 events
    expect(expectedEligibleEventCount).toBe(50);

    // Paginate with small page size (12) to force 5 distinct pages
    const pageSize = 12;
    const allTraversedIds: string[] = [];
    let cursor: string | null | undefined = undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      const res: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        limit: pageSize,
        cursor: cursor,
        paginate: true,
      });

      expect(res.events.length).toBeLessThanOrEqual(pageSize);

      for (const e of res.events) {
        allTraversedIds.push(e.id);
      }

      cursor = res.nextCursor;
      if (!cursor) break;
      if (pageCount > 10) break; // safety guard
    }

    expect(allTraversedIds).toHaveLength(expectedEligibleEventCount);
    // Zero duplicate IDs across pages
    const uniqueIds = new Set(allTraversedIds);
    expect(uniqueIds.size).toBe(expectedEligibleEventCount);
    expect(pageCount).toBe(5); // ceil(50 / 12) = 5 pages
  });

  // P11-5C-TL-20: Stress test with >250 eligible events sharing the exact same timestamp.
  test("P11-5C-TL-20: Create >250 eligible events sharing exact same timestamp and paginate through all", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const sameTime = 1700099999000;
    const totalCount = 260;

    await t.run(async (ctx) => {
      for (let i = 0; i < totalCount; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "mild",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: sameTime,
        });
      }

      // Test for await support in convex-test
      const q = ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", studentAId))
        .order("desc");

      let count = 0;
      for await (const doc of q) {
        count++;
        if (count >= 10) break;
      }
      expect(count).toBe(10);
    });

    const pageSize = 50;
    const traversedIds: string[] = [];
    let cursor: string | null | undefined = undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      const res: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        limit: pageSize,
        cursor: cursor,
        paginate: true,
      });

      for (const e of res.events) {
        traversedIds.push(e.id);
      }

      cursor = res.nextCursor;
      if (!cursor) break;
      if (pageCount > 20) break; // safety guard
    }

    expect(traversedIds).toHaveLength(totalCount);
    const uniqueIds = new Set(traversedIds);
    expect(uniqueIds.size).toBe(totalCount);
  });

  // P11-5C-TL-21: Multi-source same-timestamp stress test (>250 events across multiple sources)
  // and cursor resumption in the middle of a same-timestamp cluster.
  test("P11-5C-TL-21: Multi-source same-timestamp stress (>250 events) with deterministic ID tie-breaking and mid-cluster resumption", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const sameTime = 1700088888000;
    const triageCount = 130;
    const noteCount = 130;
    const totalCount = triageCount + noteCount; // 260 events

    await t.run(async (ctx) => {
      // 130 triages
      for (let i = 0; i < triageCount; i++) {
        await ctx.db.insert("triages", {
          userId: studentAId,
          level: "moderate",
          suicideFlag: false,
          psychosisFlag: false,
          createdAt: sameTime,
        });
      }
      // 130 clinical notes
      for (let i = 0; i < noteCount; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Note ${i}`,
          description: "Routine staff observation note",
          timestamp: sameTime,
        });
      }
    });

    const pageSize = 50;
    const allEvents: any[] = [];
    let cursor: string | null | undefined = undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      const res: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        limit: pageSize,
        cursor: cursor,
        paginate: true,
      });

      for (const e of res.events) {
        allEvents.push(e);
      }

      cursor = res.nextCursor;
      if (!cursor) break;
      if (pageCount > 20) break; // safety guard
    }

    // Verify all 260 events retrieved exactly once across multiple pages
    expect(allEvents).toHaveLength(totalCount);
    const uniqueIds = new Set(allEvents.map((e) => e.id));
    expect(uniqueIds.size).toBe(totalCount);

    // Verify strict deterministic descending order (occurredAt DESC, id DESC)
    for (let i = 0; i < allEvents.length - 1; i++) {
      const a = allEvents[i];
      const b = allEvents[i + 1];
      expect(a.occurredAt).toBeGreaterThanOrEqual(b.occurredAt);
      if (a.occurredAt === b.occurredAt) {
        expect(a.id.localeCompare(b.id)).toBeGreaterThan(0);
      }
    }

    // Mid-cluster cursor resumption:
    // Take event at index 99 (100th event) as cursor, fetch next page
    const midIndex = 99;
    const midEvent = allEvents[midIndex];
    const encodedMidCursor = Buffer.from(
      JSON.stringify({ t: midEvent.occurredAt, id: midEvent.id, u: studentAId })
    ).toString("base64");

    const midRes: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
      userId: studentAId,
      limit: 50,
      cursor: encodedMidCursor,
      paginate: true,
    });

    // Verify first event in resumption is precisely event at index 100
    expect(midRes.events[0].id).toBe(allEvents[midIndex + 1].id);
    expect(midRes.events).toHaveLength(50);
  });

  // P11-5C-TL-22: Category filtering stress test (300 raw events: 200 excluded, 100 eligible, same timestamp)
  test("P11-5C-TL-22: Category filtering stress with 200 excluded and 100 eligible records at same timestamp", async () => {
    const { t, studentAId, authedA } = await setupTestEnvironment();

    const sameTime = 1700077777000;
    const excludedCount = 200;
    const eligibleCount = 100;

    await t.run(async (ctx) => {
      // 200 excluded records: uncompleted JPMR logs (completed: false)
      for (let i = 0; i < excludedCount; i++) {
        await ctx.db.insert("jpmrLogs", {
          userId: studentAId,
          completed: false, // ineligible
          preIntensity: 7,
          postIntensity: 7,
          createdAt: sameTime,
          completedAt: sameTime,
        });
      }

      // 100 eligible records: clinical notes (category "note")
      for (let i = 0; i < eligibleCount; i++) {
        await ctx.db.insert("clinicalTimelines", {
          userId: studentAId,
          eventType: "note",
          title: `Eligible Note ${i}`,
          description: "Eligible staff progress note",
          timestamp: sameTime,
        });
      }
    });

    const pageSize = 35;
    const retrievedEvents: any[] = [];
    let cursor: string | null | undefined = undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      const res: any = await authedA.query(api.timeline.getStudentClinicalTimeline, {
        userId: studentAId,
        categoryFilter: "note",
        limit: pageSize,
        cursor: cursor,
        paginate: true,
      });

      for (const e of res.events) {
        retrievedEvents.push(e);
      }

      cursor = res.nextCursor;
      if (!cursor) break;
      if (pageCount > 20) break;
    }

    // Verify all 100 eligible events retrieved with 0 excluded events polluting candidate pool
    expect(retrievedEvents).toHaveLength(eligibleCount);
    const uniqueIds = new Set(retrievedEvents.map((e) => e.id));
    expect(uniqueIds.size).toBe(eligibleCount);
    for (const e of retrievedEvents) {
      expect(e.category).toBe("note");
      expect(e.sourceTable).toBe("clinicalTimelines");
    }
  });
});
