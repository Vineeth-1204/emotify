/**
 * Emoty AI Response Contract & Provider Configuration Foundation (AI-3 Step 1)
 *
 * Defines the type-safe contract for Emoty AI responses, strictly enforcing:
 * 1. Valid conversational modes (casual, emotional_support, guidance, app_assistance, out_of_scope).
 * 2. Controlled action allowlist (none, open_emotion_map, show_today_goal, etc.).
 * 3. Verified avatar states matching EmotyAvatar.tsx (idle, calm, happy, sad, etc.).
 * 4. Model configuration and robust JSON extraction/validation.
 * 5. Safe structured fallback generator.
 */

// =========================================================================
// 1. CONSTANTS & ALLOWLISTS
// =========================================================================

export const EMOTY_MODES = [
  "casual",
  "emotional_support",
  "guidance",
  "app_assistance",
  "out_of_scope",
] as const;

export type EmotyMode = (typeof EMOTY_MODES)[number];

export const EMOTY_ACTION_TYPES = [
  "none",
  "open_emotion_map",
  "show_today_goal",
  "start_today_goal",
  "start_breathing",
  "start_grounding",
  "start_jpmr",
  "start_reframe",
  "start_cbt",
  "open_counsellor_request",
  "show_check_in",
] as const;

export type EmotyActionType = (typeof EMOTY_ACTION_TYPES)[number];

/**
 * Avatar states strictly restricted to the 13 procedural SVG states
 * supported by components/avatar/EmotyAvatar.tsx.
 */
export const EMOTY_AVATAR_STATES = [
  "idle",
  "listening",
  "thinking",
  "calm",
  "happy",
  "sad",
  "worried",
  "angry",
  "tired",
  "breathing",
  "encouraging",
  "celebrating",
  "supportive",
] as const;

export type EmotyAvatarState = (typeof EMOTY_AVATAR_STATES)[number];

// =========================================================================
// 2. TYPE-SAFE INTERFACES
// =========================================================================

export interface EmotyAction {
  type: EmotyActionType;
  label?: string; // Optional plain display text, sanitized
}

export interface EmotyResponseContract {
  mode: EmotyMode;
  response: string;
  action: EmotyAction;
  avatarState: EmotyAvatarState;
}

export type ValidationResult =
  | { success: true; data: EmotyResponseContract }
  | { success: false; error: string };

// =========================================================================
// 3. PROVIDER MODEL CONFIGURATION
// =========================================================================

/**
 * Verified Gemini model identifiers for production use (verified October 2026).
 * Compatible with:
 * - Google Generative Language v1beta REST endpoint:
 *   https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent
 * - Structured JSON output (responseMimeType: "application/json")
 * - Low-latency mobile interaction & conversational companion workload
 * - Production API-key authentication
 */
export const GEMINI_PRIMARY_MODEL = "gemini-3.5-flash-lite";

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
] as const;

export interface GeminiModelConfig {
  deploymentOverride?: string;
  primary: string;
  fallbacks: string[];
  activeCascade: string[];
}

/**
 * Returns structured model configuration distinguishing:
 * - configured deployment model (process.env.GEMINI_MODEL)
 * - primary model
 * - fallback models
 */
export function getGeminiModelConfig(): GeminiModelConfig {
  const envModel = typeof process !== "undefined" ? process.env?.GEMINI_MODEL?.trim() : undefined;
  const primary = envModel || GEMINI_PRIMARY_MODEL;
  const fallbacks = (GEMINI_FALLBACK_MODELS as readonly string[]).filter((m) => m !== primary);
  return {
    deploymentOverride: envModel,
    primary,
    fallbacks: [...fallbacks],
    activeCascade: [primary, ...fallbacks],
  };
}

/**
 * Retrieve verified models list, prioritizing process.env.GEMINI_MODEL
 * without exposing keys or credentials.
 */
export function getGeminiModels(): string[] {
  return getGeminiModelConfig().activeCascade;
}


// =========================================================================
// 4. JSON EXTRACTION HELPER
// =========================================================================

/**
 * Safely extracts and parses JSON from raw model string.
 * Strips markdown code blocks (```json ... ```) and extracts outermost braces.
 */
export function extractJsonFromModelText(text: string | undefined | null): unknown {
  if (!text || typeof text !== "string") {
    throw new Error("Empty or non-string text provided for JSON extraction.");
  }

  let cleaned = text.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
    cleaned = cleaned.trim();
  }

  // Find outermost JSON object
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("No valid JSON object boundaries found in response.");
  }

  const jsonSubstring = cleaned.substring(startIdx, endIdx + 1);
  return JSON.parse(jsonSubstring);
}

// =========================================================================
// 5. CONTRACT VALIDATOR
// =========================================================================

/**
 * Validates a parsed candidate object against the EmotyResponseContract.
 * Enforces strict typing, rejects arbitrary action types, and validates strings.
 */
export function validateEmotyResponse(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { success: false, error: "Contract payload must be a non-null object." };
  }

  const obj = raw as Record<string, any>;

  // 1. Validate mode
  if (!obj.mode || typeof obj.mode !== "string") {
    return { success: false, error: "Missing or invalid 'mode' field." };
  }
  const mode = obj.mode.toLowerCase().trim() as EmotyMode;
  if (!EMOTY_MODES.includes(mode)) {
    return { success: false, error: `Invalid mode '${obj.mode}'. Must be one of: ${EMOTY_MODES.join(", ")}.` };
  }

  // 2. Validate response text
  if (typeof obj.response !== "string" || obj.response.trim().length === 0) {
    return { success: false, error: "Missing or empty 'response' text." };
  }
  const response = obj.response.trim();

  // 3. Validate action
  if (!obj.action || typeof obj.action !== "object" || Array.isArray(obj.action)) {
    return { success: false, error: "Missing or invalid 'action' object." };
  }
  if (!obj.action.type || typeof obj.action.type !== "string") {
    return { success: false, error: "Missing or invalid 'action.type' field." };
  }
  const actionType = obj.action.type.toLowerCase().trim() as EmotyActionType;
  if (!EMOTY_ACTION_TYPES.includes(actionType)) {
    return { success: false, error: `Invalid action.type '${obj.action.type}'. Must be one of: ${EMOTY_ACTION_TYPES.join(", ")}.` };
  }

  let label: string | undefined = undefined;
  if (obj.action.label !== undefined && obj.action.label !== null) {
    if (typeof obj.action.label !== "string") {
      return { success: false, error: "'action.label' must be a string." };
    }
    label = obj.action.label.replace(/<[^>]*>/g, "").trim().slice(0, 100);
  }

  // 4. Validate avatarState
  if (!obj.avatarState || typeof obj.avatarState !== "string") {
    return { success: false, error: "Missing or invalid 'avatarState' field." };
  }
  const avatarState = obj.avatarState.toLowerCase().trim() as EmotyAvatarState;
  if (!EMOTY_AVATAR_STATES.includes(avatarState)) {
    return { success: false, error: `Invalid avatarState '${obj.avatarState}'. Must be one of: ${EMOTY_AVATAR_STATES.join(", ")}.` };
  }

  return {
    success: true,
    data: {
      mode,
      response,
      action: {
        type: actionType,
        ...(label ? { label } : {}),
      },
      avatarState,
    },
  };
}

// =========================================================================
// 6. SAFE STRUCTURED FALLBACK GENERATOR
// =========================================================================

/**
 * Returns a guaranteed valid EmotyResponseContract for error states,
 * timeouts, or validation rejections.
 */
export function getSafeStructuredFallback(
  customMessage?: string,
  mode: EmotyMode = "casual"
): EmotyResponseContract {
  return {
    mode,
    response:
      customMessage?.trim() ||
      "I'm having a little trouble thinking right now. Try sending that again in a moment.",
    action: {
      type: "none",
    },
    avatarState: "idle",
  };
}
