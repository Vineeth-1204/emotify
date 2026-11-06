/**
 * Emoty's animated-character emotions and the Rive file contract.
 *
 * The app already decides how Emoty should look through the presence model
 * (getEmotyPresence -> resolveAvatarPresentationState -> one of 13 avatar states, with
 * safety precedence). An animated character only needs a small, calm vocabulary, so the
 * 13 states collapse onto five emotions here:
 *
 *   app event -> getEmotyPresence / resolveAvatarPresentationState -> AvatarState
 *             -> avatarEmotionForState -> EMOTY_RIVE_CONTRACT.emotionValues -> Rive input
 *
 * Difficult states (sad, worried, tired, angry) and safety (supportive) all become
 * "concerned": calm, warm and attentive. Emoty never mirrors distress or anger back.
 *
 * Pure and deterministic: no React Native, no network.
 */
import type { EmotyAvatarState } from "./avatarPresentation";

export const AVATAR_EMOTIONS = ["idle", "happy", "encouraging", "thinking", "concerned"] as const;
export type AvatarEmotion = (typeof AVATAR_EMOTIONS)[number];

const STATE_EMOTION: Record<EmotyAvatarState, AvatarEmotion> = {
  idle: "idle",
  calm: "idle",
  listening: "idle",
  breathing: "idle",
  happy: "happy",
  celebrating: "happy",
  encouraging: "encouraging",
  thinking: "thinking",
  supportive: "concerned",
  sad: "concerned",
  worried: "concerned",
  tired: "concerned",
  angry: "concerned",
};

export function avatarEmotionForState(state: EmotyAvatarState): AvatarEmotion {
  return STATE_EMOTION[state] ?? "idle";
}

/** The avatar state an emotion is shown with when only an emotion is given (aura, image fallback). */
export const AVATAR_EMOTION_STATE: Record<AvatarEmotion, EmotyAvatarState> = {
  idle: "idle",
  happy: "happy",
  encouraging: "encouraging",
  thinking: "thinking",
  concerned: "supportive",
};

export function isAvatarEmotion(value: unknown): value is AvatarEmotion {
  return typeof value === "string" && (AVATAR_EMOTIONS as readonly string[]).includes(value);
}

/**
 * What every Emoty .riv file must provide. Boy and girl share one contract, so a character
 * file can be swapped without touching any screen.
 *
 * - Artboard `artboard`, square, head-and-shoulders, framed like the reference JPG.
 * - State machine `stateMachine`, whose initial state is Idle.
 * - Number input `inputs.emotion`: transitions (from Any State, ~250-400 ms blend) to the
 *   state named in `states` when it equals the value in `emotionValues`.
 * - Boolean input `inputs.speaking`: optional mouth/talk layer while true.
 * - Boolean input `inputs.reducedMotion`: when true, hold a still pose per emotion
 *   (no idle loops, bounces or sways); expression changes may cross-fade only.
 */
export const EMOTY_RIVE_CONTRACT = {
  artboard: "Emoty",
  stateMachine: "EmotyStateMachine",
  inputs: {
    emotion: "emotion",
    speaking: "speaking",
    reducedMotion: "reducedMotion",
  },
  emotionValues: {
    idle: 0,
    happy: 1,
    encouraging: 2,
    thinking: 3,
    concerned: 4,
  } as Record<AvatarEmotion, number>,
  states: {
    idle: "Idle",
    happy: "Happy",
    encouraging: "Encouraging",
    thinking: "Thinking",
    concerned: "Concerned",
  } as Record<AvatarEmotion, string>,
} as const;
