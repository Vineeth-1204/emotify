import {
  EMOTY_AVATAR_STATES,
  type EmotyAvatarState,
  type EmotyMode,
  type EmotyAction,
} from "../convex/emotyContract";
import { type EmotySafetyState } from "../convex/emotyContext";

export { EMOTY_AVATAR_STATES, type EmotyAvatarState };
export type AvatarState = EmotyAvatarState;

export interface AvatarPresentationInputs {
  /** Authoritative server safety state ('crisis' | 'elevated' | 'normal') */
  safetyState?: EmotySafetyState | null;

  /** Client-side safety banner or active safety lock */
  isSafetyActive?: boolean;

  /** Active student app interaction state (voice, generation, somatic pacing, celebration) */
  activeAppState?: "listening" | "speaking" | "thinking" | "breathing" | "celebrating" | null;

  /** Emoty conversational reasoning mode */
  mode?: EmotyMode | null;

  /** Validated action recommendation from Action Router */
  action?: EmotyAction | null;

  /** Explicit avatar state passed by caller (e.g. from structured contract or component prop) */
  explicitAvatarState?: EmotyAvatarState | string | null;

  /** User-logged emotion under normal conditions (e.g. daily checkin or Home card) */
  userEmotion?: string | null;

  /** Fallback base state if no higher priority rule applies */
  defaultState?: EmotyAvatarState;
}

/**
 * Validates whether an input string is an approved avatar state.
 */
export function isValidAvatarState(state: any): state is EmotyAvatarState {
  return typeof state === "string" && (EMOTY_AVATAR_STATES as readonly string[]).includes(state);
}

/**
 * Normalizes legacy or raw state strings into an approved EmotyAvatarState.
 * Fails closed to the provided fallback (defaults to 'calm').
 */
export function normalizeAvatarState(
  rawState: any,
  fallback: EmotyAvatarState = "calm"
): EmotyAvatarState {
  if (!rawState || typeof rawState !== "string") return fallback;
  if (rawState === "neutral") return "idle";
  if (rawState === "grounding") return "calm";
  if (isValidAvatarState(rawState)) return rawState;
  return fallback;
}

/**
 * Single Authoritative Avatar Presentation Resolver.
 *
 * Enforces the strict 6-tier architectural precedence:
 * 1. CRISIS / safety presentation (unconditionally 'supportive')
 * 2. ELEVATED safety presentation ('supportive', or somatic pacing if active)
 * 3. Active validated application state ('thinking', 'listening', 'speaking', 'breathing', 'celebrating')
 * 4. Action recommendation presentation ('breathing', 'supportive', 'encouraging', etc.)
 * 5. Emoty conversational mode ('emotional_support' -> 'supportive', 'guidance' -> 'thinking', etc.)
 * 6. Explicit validated avatar state (validated against EMOTY_AVATAR_STATES)
 * 7. User emotion under normal conditions (e.g. 'happy' -> 'happy', 'calm' -> 'calm')
 * 8. Ordinary / default fallback ('calm' or 'idle')
 *
 * Guarantees:
 * - Deterministic, pure function
 * - Never calls Gemini
 * - Never mutates database or clinical state
 * - Never executes application navigation
 * - Fails closed on any unknown or arbitrary state
 */
export function resolveAvatarPresentationState(
  inputs: AvatarPresentationInputs
): EmotyAvatarState {
  const {
    safetyState,
    isSafetyActive,
    activeAppState,
    mode,
    action,
    explicitAvatarState,
    userEmotion,
    defaultState = "calm",
  } = inputs;

  // =========================================================================
  // TIER 1: CRISIS SAFETY PRESENTATION (HIGHEST PRECEDENCE)
  // =========================================================================
  // If the user is in CRISIS, the avatar is strictly and unconditionally 'supportive'.
  // Cannot be overridden by user emotion, Home state, mode, action, or Gemini avatar output.
  if (safetyState === "crisis" || isSafetyActive === true) {
    return "supportive";
  }

  // =========================================================================
  // TIER 2: ELEVATED SAFETY PRESENTATION
  // =========================================================================
  // In ELEVATED safety state, presentation defaults to 'supportive'.
  // However, active somatic co-regulation (breathing) or active listening is permitted.
  if (safetyState === "elevated") {
    if (activeAppState === "breathing") return "breathing";
    if (activeAppState === "listening") return "listening";
    if (activeAppState === "thinking") return "thinking";
    return "supportive";
  }

  // =========================================================================
  // TIER 3: ACTIVE VALIDATED APPLICATION INTERACTION STATE
  // =========================================================================
  // Immediate UI feedback for student interaction:
  // - thinking: AI response generation or TTS synthesis loading
  // - listening: Voice input recording / STT active
  // - speaking: TTS audio playback active
  // - breathing: Active somatic respiration pacing
  // - celebrating: Microgoal completion or reward animation
  if (activeAppState === "thinking") return "thinking";
  if (activeAppState === "listening") return "listening";
  if (activeAppState === "speaking") return "encouraging";
  if (activeAppState === "breathing") return "breathing";
  if (activeAppState === "celebrating") return "celebrating";

  // =========================================================================
  // TIER 4: ACTION RECOMMENDATION PRESENTATION
  // =========================================================================
  // If an action has been validated, the avatar presents the appropriate stance:
  if (action && action.type && action.type !== "none") {
    switch (action.type) {
      case "start_breathing":
        return "breathing";
      case "open_counsellor_request":
        return "supportive";
      case "show_today_goal":
      case "start_today_goal":
        return "encouraging";
      case "start_grounding":
      case "start_jpmr":
        return "calm";
      case "start_reframe":
      case "start_cbt":
        return "thinking";
      case "open_emotion_map":
      case "show_check_in":
        return "listening";
    }
  }

  // =========================================================================
  // TIER 5: EMOTY CONVERSATIONAL REASONING MODE
  // =========================================================================
  // Maps Step 3 conversational modes to existing 13-state vocabulary:
  if (mode) {
    switch (mode) {
      case "emotional_support":
        return "supportive";
      case "guidance":
        return "thinking";
      case "app_assistance":
        return "encouraging";
      case "casual":
      case "out_of_scope":
        return "calm";
    }
  }

  // =========================================================================
  // TIER 6: EXPLICIT VALIDATED AVATAR STATE
  // =========================================================================
  // Validated against approved allowlist. Unknown strings fail closed.
  if (explicitAvatarState) {
    const normalized = normalizeAvatarState(explicitAvatarState, null as any);
    if (normalized) {
      return normalized;
    }
  }

  // =========================================================================
  // TIER 7: USER EMOTION (NORMAL CONDITIONS ONLY)
  // =========================================================================
  // Under normal conditions, user's logged emotion provides conversational resonance:
  if (userEmotion && typeof userEmotion === "string") {
    const lower = userEmotion.toLowerCase().trim();
    if (lower === "happy" || lower === "good") return "happy";
    if (lower === "calm" || lower === "peaceful") return "calm";
    if (lower === "sad" || lower === "low") return "listening";
    if (lower === "worried" || lower === "heavy" || lower === "anxious") return "listening";
    if (lower === "angry") return "listening";
    if (lower === "tired") return "calm";
  }

  // =========================================================================
  // TIER 8: DEFAULT BASE STATE
  // =========================================================================
  return normalizeAvatarState(defaultState, "calm");
}
