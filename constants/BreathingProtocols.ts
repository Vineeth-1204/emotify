/**
 * Declarative Breathing Protocol Registry
 * Priority 9 Step 4B - Canonical Breathing Architecture
 *
 * Defines declarative breathing configurations separated from runtime timing and presentation logic.
 * Active protocols are available to student flows; defined inactive protocols remain in the registry
 * pending explicit clinical/product review.
 */

export type BreathingPhase = 'INHALE' | 'HOLD' | 'EXHALE' | 'REST';

export interface PhaseLabels {
  display: string;
  instruction: string;
  accessibilityVoice: string;
}

export interface BreathingProtocol {
  id: string;
  name: string;
  description: string;
  inhaleSeconds: number;
  holdSeconds: number; // Inhale hold
  exhaleSeconds: number;
  restSeconds: number; // Exhale hold (post-exhale rest)
  defaultCycles: number;
  defaultDurationSeconds: number;
  targetType: 'cycles' | 'duration';
  isActive: boolean;
  activationStatus: 'active' | 'defined_inactive';
  phaseLabels: Record<BreathingPhase, PhaseLabels>;
}

/**
 * Total cycle duration in seconds for a protocol
 */
export function getCycleDurationSeconds(protocol: BreathingProtocol): number {
  return (
    protocol.inhaleSeconds +
    protocol.holdSeconds +
    protocol.exhaleSeconds +
    protocol.restSeconds
  );
}

/**
 * Authoritative Breathing Protocol Registry
 */
export const BREATHING_PROTOCOLS: Record<string, BreathingProtocol> = {
  // 1. Box Breathing (Standard 4-4-4-4)
  box_4444: {
    id: 'box_4444',
    name: 'Box Breathing',
    description: 'Equal intervals of inhale, hold, exhale, and rest to stabilize focus and calm.',
    inhaleSeconds: 4,
    holdSeconds: 4,
    exhaleSeconds: 4,
    restSeconds: 4,
    defaultCycles: 4,
    defaultDurationSeconds: 64,
    targetType: 'cycles',
    isActive: true,
    activationStatus: 'active',
    phaseLabels: {
      INHALE: {
        display: 'Inhale',
        instruction: 'Breathe in slowly through your nose',
        accessibilityVoice: 'Inhale for 4 seconds',
      },
      HOLD: {
        display: 'Hold',
        instruction: 'Gently hold your breath',
        accessibilityVoice: 'Hold for 4 seconds',
      },
      EXHALE: {
        display: 'Exhale',
        instruction: 'Release breath smoothly through your mouth',
        accessibilityVoice: 'Exhale for 4 seconds',
      },
      REST: {
        display: 'Rest',
        instruction: 'Rest comfortably before the next breath',
        accessibilityVoice: 'Rest for 4 seconds',
      },
    },
  },

  // 2. Paced Calming Breath (4-4-4) - Migrated from Emotion Map
  paced_444: {
    id: 'paced_444',
    name: 'Paced Calming Breath',
    description: 'Rhythmic 4-second inhale, hold, and exhale sequence for soothing body tension.',
    inhaleSeconds: 4,
    holdSeconds: 4,
    exhaleSeconds: 4,
    restSeconds: 0,
    defaultCycles: 15,
    defaultDurationSeconds: 180, // 3 minutes standard
    targetType: 'duration',
    isActive: true,
    activationStatus: 'active',
    phaseLabels: {
      INHALE: {
        display: 'Inhale',
        instruction: 'Breathe in gently',
        accessibilityVoice: 'Inhale for 4 seconds',
      },
      HOLD: {
        display: 'Hold',
        instruction: 'Hold your breath softly',
        accessibilityVoice: 'Hold for 4 seconds',
      },
      EXHALE: {
        display: 'Exhale',
        instruction: 'Breathe out slowly and fully',
        accessibilityVoice: 'Exhale for 4 seconds',
      },
      REST: {
        display: 'Rest',
        instruction: 'Pause',
        accessibilityVoice: 'Rest',
      },
    },
  },

  // 3. Gentle Pause Breath (4-3-4) - Migrated from CBT Reframe Support Mode
  calming_434: {
    id: 'calming_434',
    name: 'Gentle Pause Breath',
    description: 'A 4-3-4 respiration sequence designed for a brief de-escalation pause.',
    inhaleSeconds: 4,
    holdSeconds: 3,
    exhaleSeconds: 4,
    restSeconds: 0,
    defaultCycles: 6,
    defaultDurationSeconds: 66,
    targetType: 'cycles',
    isActive: true,
    activationStatus: 'active',
    phaseLabels: {
      INHALE: {
        display: 'Breathe In...',
        instruction: 'Inhale deeply and comfortably',
        accessibilityVoice: 'Breathe in for 4 seconds',
      },
      HOLD: {
        display: 'Hold...',
        instruction: 'Hold the breath gently',
        accessibilityVoice: 'Hold for 3 seconds',
      },
      EXHALE: {
        display: 'Breathe Out...',
        instruction: 'Breathe out slowly and steadily',
        accessibilityVoice: 'Breathe out for 4 seconds',
      },
      REST: {
        display: 'Rest',
        instruction: 'Pause',
        accessibilityVoice: 'Rest',
      },
    },
  },

  // 4. Three Deep Belly Breaths (Quick Habit / Micro-goal Reset)
  belly_reset_3: {
    id: 'belly_reset_3',
    name: '3 Deep Belly Breaths',
    description: 'Three deep abdominal breaths for a fast grounding pause.',
    inhaleSeconds: 4,
    holdSeconds: 2,
    exhaleSeconds: 4,
    restSeconds: 0,
    defaultCycles: 3,
    defaultDurationSeconds: 30,
    targetType: 'cycles',
    isActive: true,
    activationStatus: 'active',
    phaseLabels: {
      INHALE: {
        display: 'Belly Inhale',
        instruction: 'Breathe deep into your lower belly',
        accessibilityVoice: 'Inhale into your belly for 4 seconds',
      },
      HOLD: {
        display: 'Hold',
        instruction: 'Gentle pause',
        accessibilityVoice: 'Hold for 2 seconds',
      },
      EXHALE: {
        display: 'Release',
        instruction: 'Let everything soften as you exhale',
        accessibilityVoice: 'Release for 4 seconds',
      },
      REST: {
        display: 'Rest',
        instruction: 'Pause',
        accessibilityVoice: 'Rest',
      },
    },
  },

  // 5. Relaxing Breath (4-7-8) - Defined but NOT active until clinical review
  relaxing_478: {
    id: 'relaxing_478',
    name: '4-7-8 Relaxing Breath',
    description: 'Extended exhalation rhythm designed for deep calming.',
    inhaleSeconds: 4,
    holdSeconds: 7,
    exhaleSeconds: 8,
    restSeconds: 0,
    defaultCycles: 4,
    defaultDurationSeconds: 76,
    targetType: 'cycles',
    isActive: false, // Defined but inactive per clinical governance rules
    activationStatus: 'defined_inactive',
    phaseLabels: {
      INHALE: {
        display: 'Inhale',
        instruction: 'Breathe in quietly through the nose',
        accessibilityVoice: 'Inhale for 4 seconds',
      },
      HOLD: {
        display: 'Hold',
        instruction: 'Hold breath steady',
        accessibilityVoice: 'Hold for 7 seconds',
      },
      EXHALE: {
        display: 'Exhale',
        instruction: 'Exhale completely with a whoosh sound',
        accessibilityVoice: 'Exhale for 8 seconds',
      },
      REST: {
        display: 'Rest',
        instruction: 'Rest',
        accessibilityVoice: 'Rest',
      },
    },
  },
};

/**
 * Retrieve active protocols available for student selection
 */
export function getActiveBreathingProtocols(): BreathingProtocol[] {
  return Object.values(BREATHING_PROTOCOLS).filter((p) => p.isActive);
}

/**
 * Retrieve a protocol safely with fallback to default paced breath
 */
export function getBreathingProtocol(id: string): BreathingProtocol {
  const protocol = BREATHING_PROTOCOLS[id];
  if (protocol) return protocol;
  return BREATHING_PROTOCOLS.paced_444;
}
