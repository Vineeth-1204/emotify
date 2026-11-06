import { describe, expect, test } from "vitest";
import {
  EMOTY_LINES,
  EMOTY_MOOD_AVATAR_STATE,
  getEmotyPresence,
  type EmotyPresenceInput,
  type EmotyMood,
} from "./emotyPresence";
import { EMOTY_AVATAR_STATES, resolveAvatarPresentationState } from "./avatarPresentation";

const ALL_SCENES: EmotyPresenceInput[] = [
  { scene: "home", action: "checkin" },
  { scene: "home", action: "all_caught_up", justScreened: true },
  { scene: "checkin", selectedMood: "good" },
  { scene: "screening_intro", answered: 0, total: 32 },
  { scene: "screening_submitting" },
  { scene: "reframe", step: "balanced_thought" },
  { scene: "reframe", step: "completed" },
  { scene: "small_steps", checkedIn: true, total: 3, completed: 3 },
  { scene: "companion" },
  { scene: "safety" },
];

function allLines(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(EMOTY_LINES);
  return out;
}

describe("Emoty presence model", () => {
  test("every mood maps to an existing avatar state (no new visuals)", () => {
    const moods: EmotyMood[] = ["idle", "greeting", "listening", "thinking", "encouraging", "concerned", "celebrating"];
    for (const mood of moods) {
      expect(EMOTY_AVATAR_STATES).toContain(EMOTY_MOOD_AVATAR_STATE[mood]);
    }
  });

  test("safety always wins: every scene turns supportive with no upbeat line", () => {
    for (const input of ALL_SCENES) {
      const p = getEmotyPresence({ ...input, safetyActive: true });
      expect(p.avatarState, input.scene).toBe("supportive");
      expect(p.mood).toBe("concerned");
      if (input.scene === "companion") expect(p.line).toBeNull();
      else expect([EMOTY_LINES.concerned, EMOTY_LINES.safety]).toContain(p.line);
    }
  });

  test("the safety screen is always supportive with its own line", () => {
    const p = getEmotyPresence({ scene: "safety" });
    expect(p).toEqual({ mood: "concerned", avatarState: "supportive", line: EMOTY_LINES.safety });
  });

  test("home follows the existing next-action order and high-risk state", () => {
    expect(getEmotyPresence({ scene: "home", action: "checkin" }).avatarState).toBe("happy");
    expect(getEmotyPresence({ scene: "home", action: "emotion_followup" }).avatarState).toBe("listening");
    expect(getEmotyPresence({ scene: "home", action: "goal_suggestion" }).avatarState).toBe("encouraging");
    expect(getEmotyPresence({ scene: "home", action: "checkin" }).line).toBeNull();
    expect(getEmotyPresence({ scene: "home", action: "checkin", highRisk: true }).avatarState).toBe("supportive");
  });

  test("after screening, home thanks the student (supportive when the result is high risk)", () => {
    const normal = getEmotyPresence({ scene: "home", action: "checkin", justScreened: true });
    expect(normal).toMatchObject({ avatarState: "celebrating", line: EMOTY_LINES.homeJustScreened });
    const highRisk = getEmotyPresence({ scene: "home", action: "checkin", justScreened: true, highRisk: true });
    expect(highRisk).toMatchObject({ avatarState: "supportive", line: EMOTY_LINES.homeJustScreenedHighRisk });
  });

  test("check-in reacts to the chosen mood, and stays quiet until one is chosen", () => {
    expect(getEmotyPresence({ scene: "checkin", selectedMood: null }).line).toBeNull();
    expect(getEmotyPresence({ scene: "checkin", selectedMood: "good" }).avatarState).toBe("happy");
    expect(getEmotyPresence({ scene: "checkin", selectedMood: "low" })).toMatchObject({
      avatarState: "listening",
      line: EMOTY_LINES.checkin.low,
    });
    expect(getEmotyPresence({ scene: "checkin", selectedMood: "heavy" }).avatarState).toBe("listening");
  });

  test("screening intro tracks progress; submitting shows Emoty thinking", () => {
    expect(getEmotyPresence({ scene: "screening_intro", answered: 0, total: 32 }).line).toBe(EMOTY_LINES.screeningStart);
    expect(getEmotyPresence({ scene: "screening_intro", answered: 0, total: 32, forcedRetest: true }).line).toBe(
      EMOTY_LINES.screeningRetest
    );
    expect(getEmotyPresence({ scene: "screening_intro", answered: 10, total: 32 }).avatarState).toBe("encouraging");
    expect(getEmotyPresence({ scene: "screening_intro", answered: 32, total: 32 }).avatarState).toBe("celebrating");
    expect(getEmotyPresence({ scene: "screening_submitting" }).avatarState).toBe("thinking");
  });

  test("Think Differently steps", () => {
    expect(getEmotyPresence({ scene: "reframe", step: "understanding" })).toMatchObject({ avatarState: "listening", line: null });
    expect(getEmotyPresence({ scene: "reframe", step: "understanding", opening: true })).toMatchObject({
      avatarState: "happy",
      line: EMOTY_LINES.reframeOpening,
    });
    // The opening line belongs to the first step only
    expect(getEmotyPresence({ scene: "reframe", step: "balanced_thought", opening: true }).line).toBe(EMOTY_LINES.reframeBalanced);
    expect(getEmotyPresence({ scene: "reframe", step: "balanced_thought" }).avatarState).toBe("thinking");
    expect(getEmotyPresence({ scene: "reframe", step: "completed" }).avatarState).toBe("celebrating");
    expect(getEmotyPresence({ scene: "reframe", step: "safety_mode" }).avatarState).toBe("supportive");
    expect(getEmotyPresence({ scene: "reframe", step: "something_new" })).toMatchObject({ avatarState: "idle", line: null });
  });

  test("Small Steps", () => {
    expect(getEmotyPresence({ scene: "small_steps", checkedIn: false, total: 0, completed: 0 }).line).toBe(
      EMOTY_LINES.smallStepsCheckin
    );
    expect(getEmotyPresence({ scene: "small_steps", checkedIn: true, total: 0, completed: 0 }).line).toBe(
      EMOTY_LINES.smallStepsEmpty
    );
    expect(getEmotyPresence({ scene: "small_steps", checkedIn: true, total: 3, completed: 1 }).avatarState).toBe("encouraging");
    expect(getEmotyPresence({ scene: "small_steps", checkedIn: true, total: 3, completed: 3 }).avatarState).toBe("celebrating");
  });

  test("companion chat keeps exactly the avatar behaviour it had before", () => {
    const appStates = [null, "listening", "speaking", "thinking"] as const;
    const explicit = [null, "happy", "sad", "celebrating", "not-a-state"];
    for (const safety of [false, true]) {
      for (const activeAppState of appStates) {
        for (const explicitAvatarState of explicit) {
          const before = resolveAvatarPresentationState({
            safetyState: safety ? "crisis" : "normal",
            isSafetyActive: safety,
            activeAppState,
            explicitAvatarState,
            defaultState: "calm",
          });
          const after = getEmotyPresence({ scene: "companion", safetyActive: safety, activeAppState, explicitAvatarState });
          expect(after.avatarState).toBe(before);
          expect(after.line).toBeNull();
        }
      }
    }
  });

  test("lines are short, non-clinical and only ever say Emoty", () => {
    const clinical = /diagnos|depress|anxiety|disorder|psychos|suicid|symptom|severe|risk|score|phq|gad|result|treatment|medic|mitra/i;
    for (const line of allLines()) {
      expect(line.length, line).toBeGreaterThan(0);
      expect(line.length, line).toBeLessThanOrEqual(100);
      expect(line, line).not.toMatch(clinical);
    }
  });
});
