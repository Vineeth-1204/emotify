import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { EMOTY_DISMISSIBLE_ACTIONS, calmToolFor, getCurrentEmotyAction, getEmotyNextStep, isLowMood } from "./homeEmotyAction";

const ready = {
  hasCheckedInToday: true,
  hasLoggedEmotionToday: true,
  dismissedEmotionFollowup: false,
  suggestedGoalStatus: "suggested",
  dismissedGoalFollowup: false,
};

describe("Phase 5 Home next-action priority", () => {
  test("asks for the daily check-in first", () => {
    expect(getCurrentEmotyAction({ ...ready, hasCheckedInToday: false })).toBe("checkin");
  });

  test("keeps the emotion follow-up ahead of the suggested task", () => {
    expect(getCurrentEmotyAction({ ...ready, hasLoggedEmotionToday: false })).toBe("emotion_followup");
  });

  test("shows the existing suggested goal after the emotion follow-up is complete or dismissed", () => {
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "suggested" })).toBe("goal_suggestion");
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "active" })).toBe("goal_suggestion");
  });

  test("uses the existing caught-up state when the goal is complete or deferred", () => {
    expect(getCurrentEmotyAction({ ...ready, suggestedGoalStatus: "all_completed" })).toBe("all_caught_up");
    expect(getCurrentEmotyAction({ ...ready, dismissedGoalFollowup: true })).toBe("all_caught_up");
  });
});

describe("Emoty guide: new suggestions keep the Phase 5 order", () => {
  const quiet = {
    todayMood: "good",
    calmToolDoneToday: false,
    reframeDoneRecently: false,
    lowMoodDays: 0,
    appointmentSoon: null,
    dismissed: [],
  };
  const base = { ...ready, suggestedGoalStatus: null };

  test("check-in and emotion follow-up still come first, even on a low day", () => {
    const guide = { ...quiet, todayMood: "low", lowMoodDays: 3, appointmentSoon: "today" as const };
    expect(getEmotyNextStep({ ...base, hasCheckedInToday: false, guide }).action).toBe("checkin");
    expect(getEmotyNextStep({ ...base, hasLoggedEmotionToday: false, guide }).action).toBe("emotion_followup");
  });

  test("a low check-in suggests breathing, a heavy one grounding, until one is done", () => {
    expect(getEmotyNextStep({ ...base, guide: { ...quiet, todayMood: "low" } })).toEqual({ action: "calm_tool", tool: "breathing" });
    expect(getEmotyNextStep({ ...base, guide: { ...quiet, todayMood: "heavy" } })).toEqual({ action: "calm_tool", tool: "grounding" });
    expect(getEmotyNextStep({ ...base, guide: { ...quiet, todayMood: "worried" } }).tool).toBe("grounding");
    expect(getEmotyNextStep({ ...base, guide: { ...quiet, todayMood: "low", calmToolDoneToday: true } }).action).toBe("all_caught_up");
  });

  test("two or more tough days suggest a reframe, unless one was done recently", () => {
    const tough = { ...quiet, todayMood: "calm", lowMoodDays: 2 };
    expect(getEmotyNextStep({ ...base, guide: tough }).action).toBe("reframe");
    expect(getEmotyNextStep({ ...base, guide: { ...tough, lowMoodDays: 1 } }).action).toBe("all_caught_up");
    expect(getEmotyNextStep({ ...base, guide: { ...tough, reframeDoneRecently: true } }).action).toBe("all_caught_up");
    // The calming exercise for today's low mood comes before the reframe.
    expect(getEmotyNextStep({ ...base, guide: { ...tough, todayMood: "low" } }).action).toBe("calm_tool");
  });

  test("the micro-goal comes before an appointment reminder; the reminder before caught-up", () => {
    const soon = { ...quiet, appointmentSoon: "tomorrow" as const };
    expect(getEmotyNextStep({ ...base, suggestedGoalStatus: "suggested", guide: soon }).action).toBe("goal_suggestion");
    expect(getEmotyNextStep({ ...base, guide: soon }).action).toBe("appointment_reminder");
  });

  test("Not now hides a suggestion for the day and moves on to the next one", () => {
    const guide = { ...quiet, todayMood: "low", lowMoodDays: 2, appointmentSoon: "today" as const };
    expect(getEmotyNextStep({ ...base, guide: { ...guide, dismissed: ["calm_tool"] } }).action).toBe("reframe");
    expect(getEmotyNextStep({ ...base, guide: { ...guide, dismissed: ["calm_tool", "reframe"] } }).action).toBe("appointment_reminder");
    expect(getEmotyNextStep({ ...base, guide: { ...guide, dismissed: ["calm_tool", "reframe", "appointment_reminder"] } }).action).toBe("all_caught_up");
    // The original two "Not now" choices are remembered through the same list.
    expect(getEmotyNextStep({ ...base, hasLoggedEmotionToday: false, guide: { ...quiet, dismissed: ["emotion_followup"] } }).action).toBe("all_caught_up");
    expect(getEmotyNextStep({ ...base, suggestedGoalStatus: "suggested", guide: { ...quiet, dismissed: ["goal_suggestion"] } }).action).toBe("all_caught_up");
  });

  test("elevated support or crisis: no new suggestions; existing steps unchanged", () => {
    const guide = { ...quiet, todayMood: "heavy", lowMoodDays: 3, appointmentSoon: "today" as const };
    expect(getEmotyNextStep({ ...base, guide, safetyElevated: true }).action).toBe("all_caught_up");
    expect(getEmotyNextStep({ ...base, hasCheckedInToday: false, guide, safetyElevated: true }).action).toBe("checkin");
    expect(getEmotyNextStep({ ...base, suggestedGoalStatus: "suggested", guide, safetyElevated: true }).action).toBe("goal_suggestion");
  });

  test("while signals load, Home behaves exactly as before", () => {
    expect(getEmotyNextStep({ ...base, guide: null }).action).toBe("all_caught_up");
    expect(getCurrentEmotyAction({ ...ready, guide: undefined })).toBe("goal_suggestion");
  });

  test("helpers and the Home wiring", () => {
    expect(isLowMood("sad")).toBe(true);
    expect(isLowMood("calm")).toBe(false);
    expect(calmToolFor("low")).toBe("breathing");
    expect(EMOTY_DISMISSIBLE_ACTIONS).not.toContain("checkin");
    const home = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/(tabs)/index.tsx"), "utf-8");
    expect(home).toContain("api.emotyGuide.getMyGuideSignals");
    expect(home).toContain("getEmotyNextStep(");
    expect(home).toContain('putOffStep("emotion_followup")');
    expect(home).toContain('putOffStep("goal_suggestion")');
    const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../i18n/locales/en.json"), "utf-8"));
    for (const key of ["breathingCopy", "breathingButton", "groundingCopy", "groundingButton", "reframeCopy", "reframeButton", "appointmentTodayCopy", "appointmentTomorrowCopy", "appointmentButton", "notNow"]) {
      expect(en.emotyGuide[key], key).toEqual(expect.any(String));
      expect(en.emotyGuide[key], key).not.toMatch(/depress|anxiety|disorder|risk|score|symptom|diagnos/i);
    }
  });
});
