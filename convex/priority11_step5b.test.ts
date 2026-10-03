/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Priority 11 Step 5B: Compound Telemetry Indexes", () => {
  async function setupTestEnvironment() {
    const t = convexTest(schema, modules);

    const studentA = "student_a_test_id";
    const studentB = "student_b_test_id";

    return { t, studentA, studentB };
  }

  // P11-5B-IDX-01: jpmrLogs user + completedAt query
  test("P11-5B-IDX-01: jpmrLogs user + completedAt compound index query executes correctly", async () => {
    const { t, studentA, studentB } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      // Insert jpmrLogs for studentA at different completedAt timestamps
      await ctx.db.insert("jpmrLogs", {
        userId: studentA,
        preIntensity: 7,
        postIntensity: 3,
        createdAt: tBase + 1000,
        completedAt: tBase + 5000,
        completed: true,
      });

      await ctx.db.insert("jpmrLogs", {
        userId: studentA,
        preIntensity: 8,
        postIntensity: 4,
        createdAt: tBase + 10000,
        completedAt: tBase + 15000,
        completed: true,
      });

      // Insert for studentB
      await ctx.db.insert("jpmrLogs", {
        userId: studentB,
        preIntensity: 6,
        postIntensity: 2,
        createdAt: tBase + 10000,
        completedAt: tBase + 15000,
        completed: true,
      });
    });

    await t.run(async (ctx) => {
      // Query using the new compound index by_userId_and_completedAt
      const results = await ctx.db
        .query("jpmrLogs")
        .withIndex("by_userId_and_completedAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("completedAt", tBase + 1000)
            .lte("completedAt", tBase + 20000)
        )
        .collect();

      expect(results).toHaveLength(2);
      expect(results[0].userId).toBe(studentA);
      expect(results[1].userId).toBe(studentA);
      expect(results[0].completedAt).toBe(tBase + 5000);
      expect(results[1].completedAt).toBe(tBase + 15000);
    });
  });

  // P11-5B-IDX-02: emotionLogs user + createdAt query
  test("P11-5B-IDX-02: emotionLogs user + createdAt compound index query executes correctly", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "anxious",
        bodyRegions: ["chest", "throat"],
        createdAt: tBase + 2000,
      });

      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "calm",
        bodyRegions: ["hands"],
        createdAt: tBase + 8000,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("emotionLogs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("createdAt", tBase + 1000)
            .lte("createdAt", tBase + 5000)
        )
        .collect();

      expect(results).toHaveLength(1);
      expect(results[0].emotion).toBe("anxious");
      expect(results[0].createdAt).toBe(tBase + 2000);
    });
  });

  // P11-5B-IDX-03: reframeLogs user + createdAt query
  test("P11-5B-IDX-03: reframeLogs user + createdAt compound index query executes correctly", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      await ctx.db.insert("reframeLogs", {
        userId: studentA,
        situation_text: "Final exam tomorrow",
        thought_original: "I am going to fail",
        thinking_trap_choice: "Catastrophizing",
        guided_answers: ["I have studied", "It is just one exam"],
        reframe_text: "I am prepared and will do my best",
        pre_reframe_intensity: 8,
        post_reframe_intensity: 4,
        improvement_percentage: 50,
        saved_reframe_flag: true,
        createdAt: tBase + 3000,
      });

      await ctx.db.insert("reframeLogs", {
        userId: studentA,
        situation_text: "Group presentation",
        thought_original: "Everyone will judge me",
        thinking_trap_choice: "Mind Reading",
        guided_answers: ["People are focused on their own work"],
        reframe_text: "Everyone is nervous, not just me",
        pre_reframe_intensity: 7,
        post_reframe_intensity: 3,
        improvement_percentage: 57,
        saved_reframe_flag: true,
        createdAt: tBase + 12000,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("reframeLogs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("createdAt", tBase + 1000)
            .lte("createdAt", tBase + 15000)
        )
        .collect();

      expect(results).toHaveLength(2);
      expect(results[0].situation_text).toBe("Final exam tomorrow");
      expect(results[1].situation_text).toBe("Group presentation");
    });
  });

  // P11-5B-IDX-04: cbtSessions user + timestamp query
  test("P11-5B-IDX-04: cbtSessions user + timestamp compound index query executes correctly", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      await ctx.db.insert("cbtSessions", {
        userId: studentA,
        stepIndex: 1,
        conversation: [],
        sessionStatus: "completed",
        currentStep: "completed",
        timestamp: tBase + 4000,
      });

      await ctx.db.insert("cbtSessions", {
        userId: studentA,
        stepIndex: 2,
        conversation: [],
        sessionStatus: "active",
        currentStep: "guided_discovery",
        timestamp: tBase + 14000,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId_and_timestamp", (q) =>
          q
            .eq("userId", studentA)
            .gte("timestamp", tBase + 10000)
            .lte("timestamp", tBase + 20000)
        )
        .collect();

      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe(tBase + 14000);
      expect(results[0].sessionStatus).toBe("active");
    });
  });

  // P11-5B-IDX-05: screeningAttempts user + startedAt query
  test("P11-5B-IDX-05: screeningAttempts user + startedAt compound index query executes correctly", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    const baseInstrumentVersions = {
      phq9: "1.0",
      gad7: "1.0",
      pq16: "1.0",
    };
    const baseResults = {
      phq9: { administered: true, score: 5, maxScore: 27, severity: "mild", level: "mild", item9Score: 0, item9Flag: false },
      gad7: { administered: true, score: 4, maxScore: 21, severity: "mild", level: "mild" },
      pq16: { administered: true, score: 2, maxScore: 16, severity: "low", level: "low" },
    };

    await t.run(async (ctx) => {
      await ctx.db.insert("screeningAttempts", {
        userId: studentA,
        status: "completed",
        startedAt: tBase + 5000,
        instrumentVersions: baseInstrumentVersions,
        responses: {},
        results: baseResults,
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });

      await ctx.db.insert("screeningAttempts", {
        userId: studentA,
        status: "completed",
        startedAt: tBase + 25000,
        instrumentVersions: baseInstrumentVersions,
        responses: {},
        results: baseResults,
        triageLevel: "mild",
        suicideFlag: false,
        psychosisFlag: false,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId_and_startedAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("startedAt", tBase + 1000)
            .lte("startedAt", tBase + 10000)
        )
        .collect();

      expect(results).toHaveLength(1);
      expect(results[0].startedAt).toBe(tBase + 5000);
    });
  });

  // P11-5B-IDX-06: triages user + createdAt query
  test("P11-5B-IDX-06: triages user + createdAt compound index query executes correctly", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", {
        userId: studentA,
        level: "mild",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: tBase + 6000,
      });

      await ctx.db.insert("triages", {
        userId: studentA,
        level: "moderate",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: tBase + 16000,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("createdAt", tBase + 5000)
            .lte("createdAt", tBase + 10000)
        )
        .collect();

      expect(results).toHaveLength(1);
      expect(results[0].level).toBe("mild");
      expect(results[0].createdAt).toBe(tBase + 6000);
    });
  });

  // P11-5B-IDX-07: cross-student isolation for indexed queries
  test("P11-5B-IDX-07: cross-student isolation for indexed queries", async () => {
    const { t, studentA, studentB } = await setupTestEnvironment();

    const tCommon = 1700000050000;

    await t.run(async (ctx) => {
      // Insert records with the exact same timestamp for Student A and Student B across all 6 tables
      await ctx.db.insert("jpmrLogs", {
        userId: studentA,
        preIntensity: 5,
        postIntensity: 2,
        createdAt: tCommon,
        completedAt: tCommon,
      });
      await ctx.db.insert("jpmrLogs", {
        userId: studentB,
        preIntensity: 8,
        postIntensity: 5,
        createdAt: tCommon,
        completedAt: tCommon,
      });

      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "happy",
        bodyRegions: [],
        createdAt: tCommon,
      });
      await ctx.db.insert("emotionLogs", {
        userId: studentB,
        emotion: "sad",
        bodyRegions: [],
        createdAt: tCommon,
      });

      await ctx.db.insert("reframeLogs", {
        userId: studentA,
        situation_text: "A situation",
        thought_original: "A thought",
        thinking_trap_choice: "None",
        guided_answers: [],
        reframe_text: "A reframe",
        pre_reframe_intensity: 5,
        post_reframe_intensity: 2,
        improvement_percentage: 60,
        saved_reframe_flag: false,
        createdAt: tCommon,
      });
      await ctx.db.insert("reframeLogs", {
        userId: studentB,
        situation_text: "B situation",
        thought_original: "B thought",
        thinking_trap_choice: "None",
        guided_answers: [],
        reframe_text: "B reframe",
        pre_reframe_intensity: 6,
        post_reframe_intensity: 3,
        improvement_percentage: 50,
        saved_reframe_flag: false,
        createdAt: tCommon,
      });

      await ctx.db.insert("cbtSessions", {
        userId: studentA,
        stepIndex: 1,
        conversation: [],
        sessionStatus: "completed",
        currentStep: "completed",
        timestamp: tCommon,
      });
      await ctx.db.insert("cbtSessions", {
        userId: studentB,
        stepIndex: 1,
        conversation: [],
        sessionStatus: "completed",
        currentStep: "completed",
        timestamp: tCommon,
      });

      const baseInst = { phq9: "1", gad7: "1", pq16: "1" };
      const baseRes = {
        phq9: { administered: true, score: 0, maxScore: 27, severity: "none", level: "none", item9Score: 0, item9Flag: false },
        gad7: { administered: true, score: 0, maxScore: 21, severity: "none", level: "none" },
        pq16: { administered: true, score: 0, maxScore: 16, severity: "none", level: "none" },
      };
      await ctx.db.insert("screeningAttempts", {
        userId: studentA,
        status: "completed",
        startedAt: tCommon,
        instrumentVersions: baseInst,
        responses: {},
        results: baseRes,
        triageLevel: "minimal",
        suicideFlag: false,
        psychosisFlag: false,
      });
      await ctx.db.insert("screeningAttempts", {
        userId: studentB,
        status: "completed",
        startedAt: tCommon,
        instrumentVersions: baseInst,
        responses: {},
        results: baseRes,
        triageLevel: "minimal",
        suicideFlag: false,
        psychosisFlag: false,
      });

      await ctx.db.insert("triages", {
        userId: studentA,
        level: "minimal",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: tCommon,
      });
      await ctx.db.insert("triages", {
        userId: studentB,
        level: "minimal",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: tCommon,
      });
    });

    await t.run(async (ctx) => {
      // Query each table with studentA's userId; assert ZERO studentB records leak
      const jpmr = await ctx.db
        .query("jpmrLogs")
        .withIndex("by_userId_and_completedAt", (q) =>
          q.eq("userId", studentA).gte("completedAt", tCommon).lte("completedAt", tCommon)
        )
        .collect();
      expect(jpmr).toHaveLength(1);
      expect(jpmr[0].userId).toBe(studentA);

      const emotion = await ctx.db
        .query("emotionLogs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", studentA).gte("createdAt", tCommon).lte("createdAt", tCommon)
        )
        .collect();
      expect(emotion).toHaveLength(1);
      expect(emotion[0].userId).toBe(studentA);

      const reframe = await ctx.db
        .query("reframeLogs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", studentA).gte("createdAt", tCommon).lte("createdAt", tCommon)
        )
        .collect();
      expect(reframe).toHaveLength(1);
      expect(reframe[0].userId).toBe(studentA);

      const cbt = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId_and_timestamp", (q) =>
          q.eq("userId", studentA).gte("timestamp", tCommon).lte("timestamp", tCommon)
        )
        .collect();
      expect(cbt).toHaveLength(1);
      expect(cbt[0].userId).toBe(studentA);

      const screening = await ctx.db
        .query("screeningAttempts")
        .withIndex("by_userId_and_startedAt", (q) =>
          q.eq("userId", studentA).gte("startedAt", tCommon).lte("startedAt", tCommon)
        )
        .collect();
      expect(screening).toHaveLength(1);
      expect(screening[0].userId).toBe(studentA);

      const triage = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", studentA).gte("createdAt", tCommon).lte("createdAt", tCommon)
        )
        .collect();
      expect(triage).toHaveLength(1);
      expect(triage[0].userId).toBe(studentA);
    });
  });

  // P11-5B-IDX-08: time-range boundaries correctly include lower and upper bounds
  test("P11-5B-IDX-08: time-range boundaries correctly include lower and upper bounds", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const lowerBound = 1700001000000;
    const upperBound = 1700002000000;
    const midPoint = 1700001500000;

    await t.run(async (ctx) => {
      // Insert items exactly at lowerBound, midPoint, and upperBound
      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "lower",
        bodyRegions: [],
        createdAt: lowerBound,
      });
      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "mid",
        bodyRegions: [],
        createdAt: midPoint,
      });
      await ctx.db.insert("emotionLogs", {
        userId: studentA,
        emotion: "upper",
        bodyRegions: [],
        createdAt: upperBound,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("emotionLogs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("createdAt", lowerBound)
            .lte("createdAt", upperBound)
        )
        .collect();

      expect(results).toHaveLength(3);
      const emotions = results.map((r) => r.emotion);
      expect(emotions).toContain("lower");
      expect(emotions).toContain("mid");
      expect(emotions).toContain("upper");
    });
  });

  // P11-5B-IDX-09: records outside the requested time range are excluded
  test("P11-5B-IDX-09: records outside the requested time range are excluded", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const rangeStart = 1700005000000;
    const rangeEnd = 1700006000000;

    await t.run(async (ctx) => {
      // 1 ms before rangeStart
      await ctx.db.insert("triages", {
        userId: studentA,
        level: "before",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: rangeStart - 1,
      });
      // Inside range
      await ctx.db.insert("triages", {
        userId: studentA,
        level: "inside",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: rangeStart + 500,
      });
      // 1 ms after rangeEnd
      await ctx.db.insert("triages", {
        userId: studentA,
        level: "after",
        suicideFlag: false,
        psychosisFlag: false,
        createdAt: rangeEnd + 1,
      });
    });

    await t.run(async (ctx) => {
      const results = await ctx.db
        .query("triages")
        .withIndex("by_userId_and_createdAt", (q) =>
          q
            .eq("userId", studentA)
            .gte("createdAt", rangeStart)
            .lte("createdAt", rangeEnd)
        )
        .collect();

      expect(results).toHaveLength(1);
      expect(results[0].level).toBe("inside");
    });
  });

  // P11-5B-IDX-10: existing behavior remains valid when the new indexes are unused
  test("P11-5B-IDX-10: existing behavior remains valid when the new indexes are unused", async () => {
    const { t, studentA } = await setupTestEnvironment();

    const tBase = 1700000000000;

    await t.run(async (ctx) => {
      await ctx.db.insert("reframeLogs", {
        userId: studentA,
        situation_text: "Old situation",
        thought_original: "Old thought",
        thinking_trap_choice: "Trap",
        guided_answers: [],
        reframe_text: "Old reframe",
        pre_reframe_intensity: 6,
        post_reframe_intensity: 3,
        improvement_percentage: 50,
        saved_reframe_flag: false,
        createdAt: tBase + 1000,
      });
    });

    await t.run(async (ctx) => {
      // Query via legacy by_user index
      const byUserResults = await ctx.db
        .query("reframeLogs")
        .withIndex("by_user", (q) => q.eq("userId", studentA))
        .collect();
      expect(byUserResults).toHaveLength(1);
      expect(byUserResults[0].situation_text).toBe("Old situation");

      // Query via legacy by_createdAt index
      const byCreatedAtResults = await ctx.db
        .query("reframeLogs")
        .withIndex("by_createdAt", (q) => q.eq("createdAt", tBase + 1000))
        .collect();
      expect(byCreatedAtResults).toHaveLength(1);
      expect(byCreatedAtResults[0].situation_text).toBe("Old situation");
    });
  });
});
