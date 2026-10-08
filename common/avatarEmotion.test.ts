import { describe, expect, test } from "vitest";
import {
  AVATAR_EMOTIONS,
  AVATAR_EMOTION_STATE,
  EMOTY_RIVE_CONTRACT,
  avatarEmotionForState,
  isAvatarEmotion,
} from "./avatarEmotion";
import { EMOTY_AVATAR_STATES } from "./avatarPresentation";
import { getEmotyPresence, type EmotyPresenceInput } from "./emotyPresence";

describe("animated-character emotions", () => {
  test("exactly five calm emotions", () => {
    expect([...AVATAR_EMOTIONS]).toEqual(["idle", "happy", "encouraging", "thinking", "concerned"]);
  });

  test("every existing avatar state maps to one of the five", () => {
    for (const state of EMOTY_AVATAR_STATES) {
      expect(AVATAR_EMOTIONS, state).toContain(avatarEmotionForState(state));
    }
  });

  test("difficult and safety states are shown as calm concern, never mirrored", () => {
    for (const state of ["supportive", "sad", "worried", "tired", "angry"] as const) {
      expect(avatarEmotionForState(state), state).toBe("concerned");
    }
  });

  test("an emotion given on its own round-trips through its avatar state", () => {
    for (const emotion of AVATAR_EMOTIONS) {
      expect(EMOTY_AVATAR_STATES).toContain(AVATAR_EMOTION_STATE[emotion]);
      expect(avatarEmotionForState(AVATAR_EMOTION_STATE[emotion])).toBe(emotion);
    }
    expect(isAvatarEmotion("concerned")).toBe(true);
    expect(isAvatarEmotion("angry")).toBe(false);
  });

  test("safety precedence carries through to the animated character on every scene", () => {
    const scenes: EmotyPresenceInput[] = [
      { scene: "home", action: "checkin" },
      { scene: "checkin", selectedMood: "good" },
      { scene: "screening_intro", answered: 32, total: 32 },
      { scene: "reframe", step: "completed" },
      { scene: "small_steps", checkedIn: true, total: 1, completed: 1 },
      { scene: "companion", explicitAvatarState: "celebrating" },
    ];
    for (const input of scenes) {
      const { avatarState } = getEmotyPresence({ ...input, safetyActive: true });
      expect(avatarEmotionForState(avatarState), input.scene).toBe("concerned");
    }
    expect(avatarEmotionForState(getEmotyPresence({ scene: "safety" }).avatarState)).toBe("concerned");
  });
});

describe("Rive file contract", () => {
  test("names every input, state and value the .riv must provide", () => {
    expect(EMOTY_RIVE_CONTRACT.artboard).toBe("Emoty");
    expect(EMOTY_RIVE_CONTRACT.stateMachine).toBe("EmotyStateMachine");
    expect(EMOTY_RIVE_CONTRACT.inputs).toEqual({ emotion: "emotion", speaking: "speaking", reducedMotion: "reducedMotion" });
    expect(Object.keys(EMOTY_RIVE_CONTRACT.emotionValues).sort()).toEqual([...AVATAR_EMOTIONS].sort());
    expect(Object.keys(EMOTY_RIVE_CONTRACT.states).sort()).toEqual([...AVATAR_EMOTIONS].sort());
  });

  test("emotion values are distinct integers 0-4 and state names are distinct", () => {
    const values = Object.values(EMOTY_RIVE_CONTRACT.emotionValues);
    expect([...values].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(Object.values(EMOTY_RIVE_CONTRACT.states)).size).toBe(5);
    expect(EMOTY_RIVE_CONTRACT.emotionValues.idle).toBe(0);
  });
});
