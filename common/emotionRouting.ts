/**
 * Canonical Emotion-to-Intervention Routing System
 * 
 * Maps student-reported emotions and intensity to evidence-based wellness interventions.
 * 
 * ABSOLUTE CLINICAL BOUNDARY:
 * - This is an emotion/wellness routing system, NOT a clinical diagnostic assessment.
 * - Does NOT use PHQ-9, GAD-7 or PQ-16 scores.
 * - Does NOT infer clinical severity or diagnostic categories from emotion names.
 * - Strictly maps non-clinical wellness states to canonical tool destinations:
 *     Breathing, JPMR, Sensory Grounding, CBT Reframe, MicroGoals.
 */

export type InterventionType = "breathing" | "jpmr" | "grounding" | "reframe" | "microgoals";

export interface InterventionRoutingResult {
  interventionType: InterventionType;
  targetRoute: string; // Expo router path or "breathing" for player
  title: string;
  studentFacingName: string;
  recommendedDuration: string;
  reason: string;
  transitionMessage: string;
  protocolId?: string; // For breathing or grounding protocols
}

export type CanonicalEmotionKey =
  | "worried"
  | "angry"
  | "embarrassed"
  | "guilty"
  | "sad"
  | "tired"
  | "happy"
  | "calm";

/**
 * Normalizes any emotion label or ID into a canonical emotion key.
 */
export function normalizeEmotionKey(input: string): CanonicalEmotionKey {
  const clean = (input || "").toLowerCase().trim();

  if (clean.includes("worried") || clean.includes("scared") || clean.includes("anxiety") || clean.includes("anxious") || clean.includes("fear") || clean.includes("nervous") || clean.includes("e04")) {
    return "worried";
  }
  if (clean.includes("angry") || clean.includes("upset") || clean.includes("anger") || clean.includes("frustrated") || clean.includes("irritated") || clean.includes("e05")) {
    return "angry";
  }
  if (clean.includes("embarrassed") || clean.includes("ashamed") || clean.includes("shame") || clean.includes("confused") || clean.includes("awkward") || clean.includes("e06")) {
    return "embarrassed";
  }
  if (clean.includes("guilty") || clean.includes("regretful") || clean.includes("guilt") || clean.includes("regret") || clean.includes("e07")) {
    return "guilty";
  }
  if (clean.includes("sad") || clean.includes("sadness") || clean.includes("lonely") || clean.includes("low") || clean.includes("hurt") || clean.includes("e03")) {
    return "sad";
  }
  if (clean.includes("tired") || clean.includes("drained") || clean.includes("exhausted") || clean.includes("heavy") || clean.includes("e08")) {
    return "tired";
  }
  if (clean.includes("happy") || clean.includes("positive") || clean.includes("joy") || clean.includes("excited") || clean.includes("good") || clean.includes("great") || clean.includes("e01")) {
    return "happy";
  }
  if (clean.includes("calm") || clean.includes("peaceful") || clean.includes("numb") || clean.includes("relaxed") || clean.includes("e02")) {
    return "calm";
  }

  // Fallback to calm
  return "calm";
}

/**
 * Canonical emotion body-sensation cues based on constants/Screening.ts.
 * Returns suggested prominent body regions for the given emotion.
 */
export function getRelevantBodyRegions(emotion: string): string[] {
  const key = normalizeEmotionKey(emotion);
  switch (key) {
    case "worried":
      return ["Chest", "Stomach", "Shoulders", "Hands"];
    case "angry":
      return ["Shoulders", "Hands", "Chest", "Head"];
    case "embarrassed":
      return ["Head", "Chest", "Stomach", "Shoulders"];
    case "guilty":
      return ["Chest", "Stomach", "Shoulders", "Head"];
    case "sad":
      return ["Chest", "Head", "Legs", "Shoulders"];
    case "tired":
      return ["Head", "Legs", "Shoulders", "Hands"];
    case "happy":
      return ["Chest", "Head", "Shoulders", "Hands"];
    case "calm":
      return ["Chest", "Shoulders", "Hands", "Stomach"];
    default:
      return ["Chest", "Shoulders", "Stomach", "Head"];
  }
}

/**
 * Validates that the identified strongest emotion is present in the selected emotions list.
 */
export function isStrongestFromSelection(selectedEmotions: string[], strongest: string): boolean {
  if (!selectedEmotions || selectedEmotions.length === 0 || !strongest) return false;
  const target = strongest.trim().toLowerCase();
  return selectedEmotions.some((e) => e.trim().toLowerCase() === target);
}

/**
 * Determines the authoritative intervention route based on the strongest emotion and intensity.
 *
 * MAPPING LOGIC (aligned with constants/Screening.ts and client specification):
 * - Worried/Scared → Mindfulness of Breath / Breathing (calming/anxiety release)
 * - Angry/Upset → JPMR (muscle relaxation & tension release)
 * - Embarrassed/Ashamed → CBT Thought Reframing (self-compassion)
 * - Guilty/Regretful → CBT Thought Reframing (guilt & distortion restructuring)
 * - Sad → CBT Reframe (at extreme intensity >= HIGH_INTENSITY_THRESHOLD, Sensory Grounding to stabilize)
 * - Tired/Drained → JPMR (restorative somatic relaxation)
 * - Happy/Positive → MicroGoals (momentum & gratitude)
 * - Calm → Breathing (mindfulness & presence)
 *
 * INTENSITY INFLUENCE:
 * - High intensity (>= HIGH_INTENSITY_THRESHOLD) triggers immediate grounding or structured breath pacing
 * - Standard/mild intensity utilizes restorative and reflective modalities
 *
 * ⚠️  PRODUCT DECISION REQUIRED — HIGH_INTENSITY_THRESHOLD
 * The threshold below (8) is a conservative safe default chosen during Phase 1 implementation.
 * It was NOT taken from a pre-approved clinical or product specification.
 * The value MUST be reviewed and explicitly approved by the product/clinical team before launch.
 * Track this in the product backlog before shipping the guided check-in flow.
 */

/** @product-decision Pending explicit product/clinical approval. See comment above. */
const HIGH_INTENSITY_THRESHOLD = 8;

export function determineIntervention(
  strongestEmotion: string,
  intensity: number = 5
): InterventionRoutingResult {
  const key = normalizeEmotionKey(strongestEmotion);
  const clampedIntensity = Math.min(Math.max(intensity, 1), 10);
  const isHighIntensity = clampedIntensity >= HIGH_INTENSITY_THRESHOLD;

  switch (key) {
    case "worried":
      // ⚠️  BREATHING PROTOCOL NOTE:
      // High-intensity worried previously referenced "4-7-8" (relaxing_478).
      // relaxing_478 is defined_inactive in BreathingProtocols.ts pending clinical governance approval.
      // Routed to approved box_4444 (Box Breathing) until relaxing_478 is explicitly activated.
      return {
        interventionType: "breathing",
        targetRoute: "breathing",
        title: "Mindfulness of Breath",
        studentFacingName: "Calm My Mind",
        recommendedDuration: isHighIntensity ? "4 mins" : "3 mins",
        protocolId: isHighIntensity ? "box_4444" : "box_4444",
        reason: isHighIntensity
          ? "Deep, rhythmic breathing engages the parasympathetic nervous system to quickly downregulate physical tension and anxiety."
          : "Mindful breathing helps settle lingering worry and centers your focus on the present moment.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "angry":
      return {
        interventionType: "jpmr",
        targetRoute: "/(auth)/tools/jpmr",
        title: "Progressive Muscle Relaxation (JPMR)",
        studentFacingName: "Pause & Release Tension",
        recommendedDuration: "5–10 mins",
        reason:
          "Anger and frustration manifest as deep muscle contractions in the jaw, shoulders, and chest. JPMR systematically releases this tension.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "embarrassed":
      return {
        interventionType: "reframe",
        targetRoute: "/(auth)/tools/reframe",
        title: "Thought Reframing & Self-Compassion",
        studentFacingName: "Be Kind to Myself",
        recommendedDuration: "5–10 mins",
        reason:
          "Embarrassment and shame often trigger harsh self-judgment. Cognitive reframing helps you step back and see the situation with self-compassion.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "guilty":
      return {
        interventionType: "reframe",
        targetRoute: "/(auth)/tools/reframe",
        title: "Thought Reframing",
        studentFacingName: "Letting Go of Regret",
        recommendedDuration: "5–10 mins",
        reason:
          "Guilt and regret usually focus on assumptions about what should have happened. Cognitive reframing helps examine realistic perspectives.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "sad":
      if (clampedIntensity >= HIGH_INTENSITY_THRESHOLD) {
        // High intensity sadness: sensory grounding provides immediate stabilization
        return {
          interventionType: "grounding",
          targetRoute: "/(auth)/tools/grounding",
          title: "5-4-3-2-1 Sensory Grounding",
          studentFacingName: "Grounding in the Present",
          recommendedDuration: "3–5 mins",
          reason:
            "When sadness feels heavy or overwhelming, sensory grounding gently reconnects you with your immediate physical surroundings.",
          transitionMessage: "Okay. Let's work through this together.",
        };
      }
      return {
        interventionType: "reframe",
        targetRoute: "/(auth)/tools/reframe",
        title: "Thought Reframing",
        studentFacingName: "Gentle Reflection",
        recommendedDuration: "5–10 mins",
        reason:
          "Sadness often brings thoughts of discouragement. A gentle cognitive reflection helps identify caring, balanced perspectives.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "tired":
      return {
        interventionType: "jpmr",
        targetRoute: "/(auth)/tools/jpmr",
        title: "Restorative Body Relaxation (JPMR)",
        studentFacingName: "Rest & Recharge",
        recommendedDuration: "5–10 mins",
        reason:
          "When energy is low, guided progressive muscle relaxation gives your body a dedicated moment to unwind and recharge physical reserves.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "happy":
      return {
        interventionType: "microgoals",
        targetRoute: "/(auth)/tools/microgoals",
        title: "MicroGoal & Positive Momentum",
        studentFacingName: "Notice the Good",
        recommendedDuration: "2–5 mins",
        reason:
          "Channeling positive energy into a meaningful small daily action reinforces your sense of accomplishment and wellbeing.",
        transitionMessage: "Okay. Let's work through this together.",
      };

    case "calm":
    default:
      return {
        interventionType: "breathing",
        targetRoute: "breathing",
        title: "Breathing-Paced Mindfulness",
        studentFacingName: "Stay in the Calm",
        recommendedDuration: "3 mins",
        protocolId: "resonance",
        reason:
          "Take a brief moment of quiet presence to anchor this calm feeling in your body and carry it into the rest of your day.",
        transitionMessage: "Okay. Let's work through this together.",
      };
  }
}
