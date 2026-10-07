/**
 * Single source of truth for crisis and emergency contacts (India deployment).
 * Used by the student app, the Emoty companion, CBT safety mode and fallbacks.
 * Change numbers here only; do not hard-code them elsewhere.
 */
export const CRISIS_RESOURCES = {
  /** National tele-mental-health helpline (24/7, free) */
  helplineName: "Tele-MANAS",
  helplineNumber: "14416",
  helplineTollFree: "1800-891-4416",
  /** National emergency number for immediate danger */
  emergencyNumber: "112",
} as const;

export const HELPLINE_DIAL_URL = `tel:${CRISIS_RESOURCES.helplineNumber}`;
export const EMERGENCY_DIAL_URL = `tel:${CRISIS_RESOURCES.emergencyNumber}`;

/** Short human-readable summary, e.g. for chat responses. */
export const CRISIS_RESOURCES_SUMMARY = `${CRISIS_RESOURCES.helplineName} ${CRISIS_RESOURCES.helplineNumber} (or ${CRISIS_RESOURCES.helplineTollFree}), or ${CRISIS_RESOURCES.emergencyNumber} in an emergency`;
