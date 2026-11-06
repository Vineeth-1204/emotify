/**
 * Emoty guide signals (Home next-step suggestions): computed from the student's own records,
 * on the student's local day; "Not now" persists for that day; nobody else can read or write them.
 */
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { getEmotyNextStep } from "../common/homeEmotyAction";

const modules = import.meta.glob("./**/*.ts");

// 11:30 in India on 2026-10-20 (UTC+5:30, getTimezoneOffset() = -330).
const NOW = Date.parse("2026-10-20T06:00:00Z");
const TODAY = "2026-10-20";
const IST = -330;
const LOCAL_MIDNIGHT = Date.parse("2026-10-19T18:30:00Z");
const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      student: await user({ full_name: "Student One", role: "patient", patientId: "1001" }),
      other: await user({ full_name: "Student Two", role: "patient", patientId: "1002" }),
      counsellor: await user({ full_name: "Counsellor", role: "counsellor" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  const signals = (id: string = ids.student, dateStr = TODAY) =>
    as(id).query(api.emotyGuide.getMyGuideSignals, { dateStr, tzOffsetMinutes: IST }) as Promise<any>;
  const checkin = (userId: string, dateStr: string, mood: string) =>
    t.run((ctx) => ctx.db.insert("dailyCheckins", { userId, dateStr, mood, createdAt: Date.now() }));
  const breathing = (userId: string, createdAt: number) =>
    t.run((ctx) =>
      ctx.db.insert("breathingLogs", {
        userId,
        protocolId: "box_4444",
        protocolName: "Box",
        sourceType: "self_initiated",
        startedAt: createdAt,
        durationSeconds: 120,
        cyclesCompleted: 4,
        targetCycles: 4,
        status: "completed",
        createdAt,
      })
    );
  const reframe = (userId: string, createdAt: number) =>
    t.run((ctx) =>
      ctx.db.insert("reframeLogs", {
        userId,
        situation_text: "x",
        thought_original: "x",
        thinking_trap_choice: "x",
        guided_answers: [],
        reframe_text: "x",
        pre_reframe_intensity: 5,
        post_reframe_intensity: 3,
        improvement_percentage: 40,
        saved_reframe_flag: false,
        createdAt,
      })
    );
  return { t, ...ids, as, signals, checkin, breathing, reframe };
}

describe("guide signals", () => {
  test("a quiet day: nothing to suggest beyond the existing steps", async () => {
    const { signals } = await setup();
    expect(await signals()).toEqual({
      todayMood: null,
      calmToolDoneToday: false,
      reframeDoneRecently: false,
      lowMoodDays: 0,
      appointmentSoon: null,
      dismissed: [],
    });
  });

  test("today's mood and low days over the last three local days", async () => {
    const { student, signals, checkin } = await setup();
    await checkin(student, TODAY, "heavy");
    await checkin(student, "2026-10-19", "sad");
    await checkin(student, "2026-10-18", "good");
    await checkin(student, "2026-10-17", "low"); // four days ago: outside the window
    const s = await signals();
    expect(s).toMatchObject({ todayMood: "heavy", lowMoodDays: 2 });
    expect(getEmotyNextStep({ hasCheckedInToday: true, hasLoggedEmotionToday: true, dismissedEmotionFollowup: false, dismissedGoalFollowup: false, guide: s })).toEqual({
      action: "calm_tool",
      tool: "grounding",
    });
  });

  test("a calming exercise counts from the student's local midnight, not UTC midnight", async () => {
    const { student, signals, breathing } = await setup();
    await breathing(student, LOCAL_MIDNIGHT - HOUR); // yesterday evening locally
    expect((await signals()).calmToolDoneToday).toBe(false);
    await breathing(student, LOCAL_MIDNIGHT + HOUR); // 01:00 today locally (still 19 Oct in UTC)
    expect((await signals()).calmToolDoneToday).toBe(true);
  });

  test("a reframe in the last three days counts as recent", async () => {
    const { student, signals, reframe } = await setup();
    await reframe(student, LOCAL_MIDNIGHT - 3 * 24 * HOUR);
    expect((await signals()).reframeDoneRecently).toBe(false);
    await reframe(student, LOCAL_MIDNIGHT - 24 * HOUR);
    expect((await signals()).reframeDoneRecently).toBe(true);
  });

  test("only a confirmed appointment today or tomorrow triggers the reminder", async () => {
    const { t, student, signals } = await setup();
    const appt = (date: string, status: string) =>
      t.run((ctx) =>
        ctx.db.insert("appointments", { userId: student as any, title: "Session", createdBy: "admin", date, time: "10:00 AM", reason: "x", status, createdAt: Date.now() } as any)
      );
    await appt("2026-10-21", "pending");
    await appt("2026-10-25", "accepted");
    expect((await signals()).appointmentSoon).toBeNull();
    await appt("2026-10-21", "accepted");
    expect((await signals()).appointmentSoon).toBe("tomorrow");
    await appt(TODAY, "scheduled");
    expect((await signals()).appointmentSoon).toBe("today");
  });

  test("another student's records never count", async () => {
    const { other, signals, checkin, breathing, reframe } = await setup();
    await checkin(other, TODAY, "heavy");
    await breathing(other, NOW);
    await reframe(other, NOW);
    expect(await signals()).toMatchObject({ todayMood: null, calmToolDoneToday: false, reframeDoneRecently: false, lowMoodDays: 0 });
  });
});

describe("Not now", () => {
  test("persists for the day only, is idempotent, and is per student", async () => {
    const { t, as, student, other, signals } = await setup();
    await as(student).mutation(api.emotyGuide.dismissNextStep, { action: "calm_tool", dateStr: TODAY });
    await as(student).mutation(api.emotyGuide.dismissNextStep, { action: "calm_tool", dateStr: TODAY });
    await as(student).mutation(api.emotyGuide.dismissNextStep, { action: "reframe", dateStr: TODAY });
    expect((await signals()).dismissed.sort()).toEqual(["calm_tool", "reframe"]);
    expect((await signals(student, "2026-10-21")).dismissed).toEqual([]);
    expect((await signals(other)).dismissed).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("emotyGuideDismissals").collect());
    expect(rows).toHaveLength(2);
  });

  test("rejects unknown actions, bad dates and non-students", async () => {
    const { t, as, student, counsellor } = await setup();
    await expect(as(student).mutation(api.emotyGuide.dismissNextStep, { action: "checkin", dateStr: TODAY })).rejects.toThrow(/Unknown suggestion/);
    await expect(as(student).mutation(api.emotyGuide.dismissNextStep, { action: "reframe", dateStr: "20-10-2026" })).rejects.toThrow(/Invalid date/);
    await expect(as(counsellor).mutation(api.emotyGuide.dismissNextStep, { action: "reframe", dateStr: TODAY })).rejects.toThrow(/Unauthenticated/);
    await expect(t.mutation(api.emotyGuide.dismissNextStep, { action: "reframe", dateStr: TODAY })).rejects.toThrow(/Unauthenticated/);
  });
});

describe("access", () => {
  test("staff and anonymous callers get nothing; bad arguments are refused", async () => {
    const { t, as, counsellor, signals } = await setup();
    expect(await as(counsellor).query(api.emotyGuide.getMyGuideSignals, { dateStr: TODAY, tzOffsetMinutes: 0 })).toBeNull();
    expect(await t.query(api.emotyGuide.getMyGuideSignals, { dateStr: TODAY, tzOffsetMinutes: 0 })).toBeNull();
    await expect(signals(undefined, "2026-13-45")).rejects.toThrow(/Invalid date/);
  });
});
