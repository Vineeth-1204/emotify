import {
  type EmotyAction,
  type EmotyActionType,
  EMOTY_ACTION_TYPES,
} from "./emotyContract";
import { type EmotySafetyState } from "./emotyContext";

// =========================================================================
// 1. ACTION ROUTER TYPES & ROUTE SPECIFICATIONS
// =========================================================================

export type AppRoute =
  | "/(auth)/tools/emotion-map"
  | "/(auth)/tools/emoty-goal"
  | "/(auth)/tools/microgoals"
  | "/(auth)/tools/breathing"
  | "/(auth)/tools/grounding"
  | "/(auth)/tools/jpmr"
  | "/(auth)/tools/reframe"
  | "/(auth)/tools/appointments"
  | "/(auth)/(tabs)";

export interface ResolvedActionRoute {
  actionType: EmotyActionType;
  route: AppRoute | null;
  kind: "navigation" | "modal" | "none";
  title: string;
  description: string;
  requiresSafetyOverride?: boolean;
}

/**
 * Authoritative Static Mapping from Allowlisted Emoty Action Types to
 * Verified Existing App Routes and Capabilities.
 *
 * Guaranteed:
 * - NO arbitrary route generation
 * - NO arbitrary function execution
 * - NO execution of external URLs or scripts
 */
export const ACTION_ROUTE_MAP: Record<EmotyActionType, ResolvedActionRoute> = {
  none: {
    actionType: "none",
    route: null,
    kind: "none",
    title: "None",
    description: "No action required.",
  },
  open_emotion_map: {
    actionType: "open_emotion_map",
    route: "/(auth)/tools/emotion-map",
    kind: "navigation",
    title: "Emotion Map",
    description: "Open the interactive Emotion Heatmap to explore physical and emotional sensations.",
  },
  show_today_goal: {
    actionType: "show_today_goal",
    route: "/(auth)/tools/emoty-goal",
    kind: "navigation",
    title: "Today's Goal",
    description: "View the student's active daily micro-goal or daily challenge.",
  },
  start_today_goal: {
    actionType: "start_today_goal",
    route: "/(auth)/tools/emoty-goal",
    kind: "navigation",
    title: "Start Goal",
    description: "Launch the active micro-goal execution flow.",
  },
  start_breathing: {
    actionType: "start_breathing",
    route: "/(auth)/tools/breathing",
    kind: "navigation",
    title: "Breathing Exercise",
    description: "Launch the paced somatic breathing exercise.",
  },
  start_grounding: {
    actionType: "start_grounding",
    route: "/(auth)/tools/grounding",
    kind: "navigation",
    title: "5-4-3-2-1 Grounding",
    description: "Launch the 5-4-3-2-1 sensory grounding exercise.",
  },
  start_jpmr: {
    actionType: "start_jpmr",
    route: "/(auth)/tools/jpmr",
    kind: "navigation",
    title: "Muscle Relaxation",
    description: "Launch the Jacobson's Progressive Muscle Relaxation protocol.",
  },
  start_reframe: {
    actionType: "start_reframe",
    route: "/(auth)/tools/reframe",
    kind: "navigation",
    title: "Thought Reframe",
    description: "Open the guided CBT thought reframe journaling tool.",
  },
  start_cbt: {
    actionType: "start_cbt",
    route: "/(auth)/tools/reframe",
    kind: "navigation",
    title: "CBT Dialogue",
    description: "Open the interactive CBT thought discovery and restructuring module.",
  },
  open_counsellor_request: {
    actionType: "open_counsellor_request",
    route: "/(auth)/tools/appointments",
    kind: "navigation",
    title: "Counselor Support",
    description: "Open the verified campus counselor request and appointment portal.",
  },
  show_check_in: {
    actionType: "show_check_in",
    route: "/(auth)/(tabs)",
    kind: "navigation",
    title: "Daily Check-in",
    description: "Navigate to home dashboard to complete or view the daily mood check-in.",
  },
};

// =========================================================================
// 2. VALIDATION & SECURITY GATE
// =========================================================================

export type ActionValidationResult =
  | {
      valid: true;
      action: EmotyAction;
      resolved: ResolvedActionRoute;
    }
  | {
      valid: false;
      fallbackAction: { type: "none" };
      resolved: ResolvedActionRoute;
      rejectionReason: string;
    };

/**
 * Validates candidate action payloads against strict security rules:
 * 1. Action object must exist and contain a valid allowlisted `type`.
 * 2. Payload must NOT contain arbitrary parameters (such as `route`, `function`,
 *    `sessionId`, `userId`, `counsellorId`, or external URLs).
 * 3. Enforces safety state constraints:
 *    - In CRISIS: Only `none` or `open_counsellor_request` permitted; wellness
 *      or arbitrary actions recommended by an LLM are strictly rejected.
 *    - In ELEVATED: Wellness actions and counselor requests are permitted, but
 *      must be allowlisted and unparameterized.
 * 4. Fails closed to `none` on any validation anomaly or untrusted input.
 */
export function validateAndResolveAction(
  rawAction: any,
  safetyState: EmotySafetyState = "normal"
): ActionValidationResult {
  // 1. Structural Check
  if (!rawAction || typeof rawAction !== "object") {
    return {
      valid: false,
      fallbackAction: { type: "none" },
      resolved: ACTION_ROUTE_MAP.none,
      rejectionReason: "Missing or non-object action payload.",
    };
  }

  // 2. Verify Allowlist
  const actionType = rawAction.type;
  if (!actionType || typeof actionType !== "string" || !EMOTY_ACTION_TYPES.includes(actionType as any)) {
    return {
      valid: false,
      fallbackAction: { type: "none" },
      resolved: ACTION_ROUTE_MAP.none,
      rejectionReason: `Action type '${actionType}' is not in the approved allowlist.`,
    };
  }

  const typedAction = actionType as EmotyActionType;

  // 3. Security Check: Reject arbitrary execution parameters
  // Allow only `type` and optional display-only `label` string
  const allowedKeys = new Set(["type", "label"]);
  const unknownKeys = Object.keys(rawAction).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    return {
      valid: false,
      fallbackAction: { type: "none" },
      resolved: ACTION_ROUTE_MAP.none,
      rejectionReason: `Arbitrary action parameters rejected: ${unknownKeys.join(", ")}.`,
    };
  }

  // 4. Verify label safety if present
  let sanitizedLabel: string | undefined = undefined;
  if (rawAction.label !== undefined && rawAction.label !== null) {
    if (typeof rawAction.label !== "string") {
      return {
        valid: false,
        fallbackAction: { type: "none" },
        resolved: ACTION_ROUTE_MAP.none,
        rejectionReason: "'label' parameter must be a string.",
      };
    }
    sanitizedLabel = rawAction.label.replace(/<[^>]*>/g, "").trim().slice(0, 100);
  }

  // 5. Safety State Interaction
  if (safetyState === "crisis") {
    // In crisis, only none or open_counsellor_request is acceptable
    if (typedAction !== "none" && typedAction !== "open_counsellor_request") {
      return {
        valid: false,
        fallbackAction: { type: "none" },
        resolved: ACTION_ROUTE_MAP.none,
        rejectionReason: `Action '${typedAction}' blocked during CRISIS safety state.`,
      };
    }
  }

  const resolved = ACTION_ROUTE_MAP[typedAction];
  if (!resolved) {
    return {
      valid: false,
      fallbackAction: { type: "none" },
      resolved: ACTION_ROUTE_MAP.none,
      rejectionReason: `No verified route mapping exists for action '${typedAction}'.`,
    };
  }

  return {
    valid: true,
    action: {
      type: typedAction,
      ...(sanitizedLabel ? { label: sanitizedLabel } : {}),
    },
    resolved,
  };
}

// =========================================================================
// 3. ACTION ROUTER CLIENT DISPATCHER HELPER
// =========================================================================

export interface ActionNavigationTarget {
  pathname: AppRoute;
  params?: Record<string, string>;
}

/**
 * Resolves the client Expo Router navigation target for a validated action.
 * Returns null if the action requires no navigation (e.g. 'none').
 */
export function resolveActionNavigation(
  action: EmotyAction,
  safetyState: EmotySafetyState = "normal"
): ActionNavigationTarget | null {
  const validation = validateAndResolveAction(action, safetyState);
  if (!validation.valid || !validation.resolved.route) {
    return null;
  }

  return {
    pathname: validation.resolved.route,
  };
}
