/**
 * Emoty contextual presence.
 *
 * One model for how Emoty appears on each student screen: a companion mood, the avatar
 * state that mood maps to, and at most one short line. Screens describe their situation
 * (scene + context they already have); they do not pick avatar states themselves.
 *
 * Rules:
 * - Moods map onto the existing avatar vocabulary (EMOTY_AVATAR_STATES); no new visuals.
 * - The avatar state always goes through resolveAvatarPresentationState, so the existing
 *   safety precedence (crisis/elevated -> supportive) still wins over any scene mood.
 * - Lines are short, warm and non-clinical: no assessments, scores, diagnoses or advice.
 * - Pure and deterministic: no network, no database, no navigation.
 */
import { resolveAvatarPresentationState, type AvatarPresentationInputs, type EmotyAvatarState } from "./avatarPresentation";
import type { EmotyNextActionType } from "./homeEmotyAction";

export type EmotyMood =
  | "idle"
  | "greeting"
  | "listening"
  | "thinking"
  | "encouraging"
  | "concerned"
  | "celebrating";

export const EMOTY_MOOD_AVATAR_STATE: Record<EmotyMood, EmotyAvatarState> = {
  idle: "idle",
  greeting: "happy",
  listening: "listening",
  thinking: "thinking",
  encouraging: "encouraging",
  concerned: "supportive",
  celebrating: "celebrating",
};

export type CheckinMood = "good" | "calm" | "low" | "heavy";

export type EmotyScene =
  | { scene: "home"; action: EmotyNextActionType; highRisk?: boolean; justScreened?: boolean }
  | { scene: "checkin"; selectedMood?: CheckinMood | null }
  | { scene: "screening_intro"; answered: number; total: number; forcedRetest?: boolean }
  | { scene: "screening_submitting" }
  | { scene: "reframe"; step: string }
  | { scene: "small_steps"; checkedIn: boolean; total: number; completed: number }
  | { scene: "companion" }
  | { scene: "safety" };

export type EmotyPresenceInput = EmotyScene & {
  /** Client safety lock or server crisis state: Emoty is always supportive. */
  safetyActive?: boolean;
  safetyState?: AvatarPresentationInputs["safetyState"];
  /** Live interaction state (voice, AI generation, breathing pacing, celebration). */
  activeAppState?: AvatarPresentationInputs["activeAppState"];
  /** An avatar state already chosen upstream (e.g. the companion's last structured reply). */
  explicitAvatarState?: EmotyAvatarState | string | null;
};

export interface EmotyPresence {
  mood: EmotyMood;
  avatarState: EmotyAvatarState;
  line: string | null;
}

export const EMOTY_LINES = {
  safety: "I'm right here with you. You don't have to face this alone.",
  concerned: "I'm right here with you. Support is available whenever you need it.",
  homeJustScreened: "Thanks for finishing your check-in. Let's take today one step at a time.",
  homeJustScreenedHighRisk: "Thank you for sharing all of that. The support options above are here for you.",
  checkin: {
    good: "Love hearing that. Let's keep the good going.",
    calm: "Calm is a nice place to be.",
    low: "Thanks for telling me. Low days happen, and that's okay.",
    heavy: "That sounds heavy. I'm glad you checked in with me.",
  } as Record<CheckinMood, string>,
  screeningStart: "I'll be right here with you. Answer what feels true for you; there are no wrong answers.",
  screeningRetest: "Your support team asked for a fresh check-in. I'll be right here with you.",
  screeningProgress: "Nice progress. Pick up wherever you left off.",
  screeningReady: "All done! Submit whenever you're ready.",
  screeningSubmitting: "Saving your answers. This only takes a moment.",
  reframeBalanced: "Take your time. There's no perfect answer here.",
  reframeBelief: "Even a small shift counts.",
  reframeEmotionAfter: "Notice how you feel now, whatever it is.",
  reframeCompleted: "You took real time for yourself today.",
  smallStepsCheckin: "Check in first and I'll line up a few small steps for you.",
  smallStepsEmpty: "Nothing waiting today. Rest counts too.",
  smallStepsInProgress: "Pick whichever step feels doable right now.",
  smallStepsDone: "That's every step for today. Nice work!",
} as const;

const HOME_ACTION_MOOD: Record<EmotyNextActionType, EmotyMood> = {
  checkin: "greeting",
  emotion_followup: "listening",
  goal_suggestion: "encouraging",
  all_caught_up: "greeting",
};

const CHECKIN_MOOD: Record<CheckinMood, EmotyMood> = {
  good: "greeting",
  calm: "encouraging",
  low: "listening",
  heavy: "listening",
};

const REFRAME_CHAT_STEPS = new Set(["understanding", "clarification", "guided_discovery", "reflection"]);

function sceneMoodAndLine(input: EmotyScene): { mood: EmotyMood; line: string | null } {
  switch (input.scene) {
    case "home":
      if (input.justScreened) {
        return input.highRisk
          ? { mood: "concerned", line: EMOTY_LINES.homeJustScreenedHighRisk }
          : { mood: "celebrating", line: EMOTY_LINES.homeJustScreened };
      }
      // Home keeps its own action copy; presence only sets Emoty's expression.
      return { mood: input.highRisk ? "concerned" : HOME_ACTION_MOOD[input.action], line: null };

    case "checkin":
      return input.selectedMood
        ? { mood: CHECKIN_MOOD[input.selectedMood], line: EMOTY_LINES.checkin[input.selectedMood] }
        : { mood: "listening", line: null };

    case "screening_intro": {
      if (input.total > 0 && input.answered >= input.total) {
        return { mood: "celebrating", line: EMOTY_LINES.screeningReady };
      }
      if (input.answered > 0) return { mood: "encouraging", line: EMOTY_LINES.screeningProgress };
      return input.forcedRetest
        ? { mood: "listening", line: EMOTY_LINES.screeningRetest }
        : { mood: "greeting", line: EMOTY_LINES.screeningStart };
    }

    case "screening_submitting":
      return { mood: "thinking", line: EMOTY_LINES.screeningSubmitting };

    case "reframe":
      if (input.step === "safety_mode") return { mood: "concerned", line: EMOTY_LINES.concerned };
      if (input.step === "completed") return { mood: "celebrating", line: EMOTY_LINES.reframeCompleted };
      if (input.step === "recovery_coach") return { mood: "celebrating", line: null };
      if (input.step === "balanced_thought") return { mood: "thinking", line: EMOTY_LINES.reframeBalanced };
      if (input.step === "belief") return { mood: "encouraging", line: EMOTY_LINES.reframeBelief };
      if (input.step === "emotion_after") return { mood: "listening", line: EMOTY_LINES.reframeEmotionAfter };
      if (REFRAME_CHAT_STEPS.has(input.step)) return { mood: "listening", line: null };
      return { mood: "idle", line: null };

    case "small_steps":
      if (!input.checkedIn) return { mood: "listening", line: EMOTY_LINES.smallStepsCheckin };
      if (input.total === 0) return { mood: "greeting", line: EMOTY_LINES.smallStepsEmpty };
      if (input.completed >= input.total) return { mood: "celebrating", line: EMOTY_LINES.smallStepsDone };
      return { mood: "encouraging", line: EMOTY_LINES.smallStepsInProgress };

    case "companion":
      return { mood: "idle", line: null };

    case "safety":
      return { mood: "concerned", line: EMOTY_LINES.safety };
  }
}

const STATE_MOOD: Partial<Record<EmotyAvatarState, EmotyMood>> = {
  supportive: "concerned",
  listening: "listening",
  thinking: "thinking",
  encouraging: "encouraging",
  celebrating: "celebrating",
  happy: "greeting",
};

export function getEmotyPresence(input: EmotyPresenceInput): EmotyPresence {
  const safetyActive = input.safetyActive === true || input.safetyState === "crisis";
  let { mood, line } = sceneMoodAndLine(input);

  // Safety always wins: Emoty becomes supportive and drops any upbeat line.
  if (safetyActive && input.scene !== "safety") {
    mood = "concerned";
    line = input.scene === "companion" ? null : EMOTY_LINES.concerned;
  }

  const avatarState = resolveAvatarPresentationState({
    safetyState: input.safetyState ?? (safetyActive ? "crisis" : null),
    isSafetyActive: safetyActive,
    activeAppState: input.activeAppState ?? null,
    explicitAvatarState:
      input.scene === "companion" ? input.explicitAvatarState ?? null : EMOTY_MOOD_AVATAR_STATE[mood],
    defaultState: input.scene === "companion" ? "calm" : "idle",
  });

  // Keep the reported mood consistent with what the avatar actually shows.
  return { mood: STATE_MOOD[avatarState] ?? mood, avatarState, line };
}
