import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

/**
 * Persists exactly what the guided check-in (emotion-map handleContinueFromStep4) sends for the
 * sensation-first body step and feelings found through "Not sure", and checks it reaches History
 * (emotionMaps.getRecentLogs) and the counsellor timeline.
 */
async function setup() {
  const t = convexTest(schema, modules);
  let studentId = "";
  let counselorId = "";
  await t.run(async (ctx) => {
    studentId = await ctx.db.insert("users", {
      full_name: "Check-in Student",
      role: "patient",
      status: "active",
      created_at: 1700000000000,
      updated_at: 1700000000000,
    });
    counselorId = await ctx.db.insert("users", {
      full_name: "Counselor Cleo",
      role: "counsellor",
      status: "active",
      created_at: 1700000000000,
      updated_at: 1700000000000,
    });
  });
  await assignAllPatientsToCounsellors(t);
  return { t, studentId, counselorId, asStudent: t.withIdentity({ subject: studentId }) };
}

/** The two writes the screen makes, with the same argument shapes. */
async function saveCheckin(
  asStudent: any,
  c: { primary: string; secondary: string | null; historyLabel: string; regions: string[]; intensity: number; action: string }
) {
  const logEmotion = c.secondary || c.primary;
  const emotionsList = c.secondary ? [c.primary, c.secondary] : [c.primary];
  const logId = await asStudent.mutation(api.emotionLogs.create, {
    emotion: logEmotion,
    strongestEmotion: logEmotion,
    selectedEmotions: emotionsList,
    bodyRegions: c.regions,
    preIntensity: c.intensity,
  });
  const ratings = c.regions.map((region) => ({ region, intensity: c.intensity }));
  await asStudent.mutation(api.emotionMaps.create, {
    emotionLabel: c.historyLabel,
    selectedRegions: c.regions,
    bodyRatings: ratings.length > 0 ? ratings : [{ region: "General", intensity: c.intensity }],
    averageIntensity: c.intensity,
    suggestedAction: c.action,
    selectedEmotions: emotionsList,
    strongestEmotion: logEmotion,
  });
  return logId;
}

describe("guided check-in persistence with sensations and uncertainty", () => {
  test("sensation choices are saved as their figure regions and appear in History", async () => {
    const { asStudent, studentId } = await setup();
    await saveCheckin(asStudent, {
      primary: "sad", secondary: "Lonely", historyLabel: "Lonely",
      regions: ["Head", "Chest", "Legs"], intensity: 6, action: "Thought Reframing",
    });
    const history = await asStudent.query(api.emotionMaps.getRecentLogs, { userId: studentId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ emotionLabel: "Lonely", selectedRegions: ["Head", "Chest", "Legs"], averageIntensity: 6 });
    const logs = await asStudent.query(api.emotionLogs.getRecent, { userId: studentId });
    expect(logs[0]).toMatchObject({ emotion: "Lonely", bodyRegions: ["Head", "Chest", "Legs"], preIntensity: 6 });
  });

  test("a feeling found through 'Not sure' is saved like any other: emotion id and readable label agree", async () => {
    const { asStudent, studentId } = await setup();
    // Student picked Sad, chose "Not sure", then "Disappointed" from "Does it feel more like…"
    await saveCheckin(asStudent, {
      primary: "sad", secondary: "Disappointed", historyLabel: "Disappointed",
      regions: [], intensity: 4, action: "Thought Reframing",
    });
    const logs = await asStudent.query(api.emotionLogs.getRecent, { userId: studentId });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      emotion: "Disappointed", strongestEmotion: "Disappointed", selectedEmotions: ["sad", "Disappointed"],
      bodyRegions: [], preIntensity: 4,
    });
    const history = await asStudent.query(api.emotionMaps.getRecentLogs, { userId: studentId });
    expect(history[0]).toMatchObject({ emotionLabel: "Disappointed", selectedRegions: [], strongestEmotion: "Disappointed" });
  });

  test("both check-in records reach the counsellor's monitoring timeline", async () => {
    const { t, asStudent, studentId, counselorId } = await setup();
    await saveCheckin(asStudent, {
      primary: "angry", secondary: "Frustrated", historyLabel: "Frustrated",
      regions: ["Head"], intensity: 7, action: "Progressive Muscle Relaxation (JPMR)",
    });
    const res: any = await t.withIdentity({ subject: counselorId }).query(api.timeline.getStudentClinicalTimeline, {
      userId: studentId,
      categoryFilter: "monitoring",
    });
    const events: any[] = Array.isArray(res) ? res : res.events ?? res.items ?? [];
    const checkin = events.find((e) => e.eventType === "emotion_checkin");
    const map = events.find((e) => e.eventType === "emotion_map");
    expect(checkin?.title).toBe("Emotion Check-in: Frustrated");
    expect(checkin?.metadata?.preIntensity).toBe(7);
    expect(map?.title).toBe("Emotion Body Map: Frustrated");
    expect(map?.metadata?.selectedRegions).toEqual(["Head"]);
  });

  test("the post-intervention re-check still patches the saved log, once", async () => {
    const { asStudent, studentId } = await setup();
    const logId = await saveCheckin(asStudent, {
      primary: "calm", secondary: "Relaxed", historyLabel: "Relaxed", regions: ["Shoulders"], intensity: 3, action: "Breathing",
    });
    await asStudent.mutation(api.emotionLogs.recordPostIntensity, { logId, postIntensity: 2 });
    await asStudent.mutation(api.emotionLogs.recordPostIntensity, { logId, postIntensity: 9 });
    const logs = await asStudent.query(api.emotionLogs.getRecent, { userId: studentId });
    expect(logs[0]).toMatchObject({ preIntensity: 3, postIntensity: 2 });
  });

  test("the schema cannot hold a check-in without an emotion or outside 1–10, so none is invented", async () => {
    const { asStudent } = await setup();
    await expect(
      asStudent.mutation(api.emotionLogs.create, { emotion: " ", bodyRegions: [], preIntensity: 5 })
    ).rejects.toThrow("Emotion is required.");
    await expect(
      asStudent.mutation(api.emotionLogs.create, { emotion: "sad", bodyRegions: [], preIntensity: 11 })
    ).rejects.toThrow("preIntensity must be between 1 and 10.");
    await expect(
      asStudent.mutation(api.emotionMaps.create, {
        emotionLabel: "Sad", selectedRegions: [], bodyRatings: [], averageIntensity: 5, suggestedAction: "x",
      })
    ).rejects.toThrow("bodyRatings must be a non-empty array.");
  });
});
