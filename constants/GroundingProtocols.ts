/**
 * Declarative Sensory Grounding Protocol Registry
 * Priority 9 Step 5B — Sensory Grounding Architecture
 *
 * Defines declarative 5-4-3-2-1 sensory grounding configurations
 * separated from runtime interaction, presentation, and persistence logic.
 */

export type GroundingSense = 'see' | 'touch' | 'hear' | 'smell' | 'taste';

export interface GroundingStep {
  stepIndex: number; // 0-indexed: 0, 1, 2, 3, 4
  stepNumber: number; // Display step: 1, 2, 3, 4, 5
  count: number; // 5, 4, 3, 2, 1
  sense: GroundingSense;
  title: string;
  instruction: string;
  prompt: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  color: string;
  fillColor: string;
}

export interface GroundingProtocol {
  id: string;
  title: string;
  description: string;
  footerTip: string;
  totalSteps: number;
  steps: GroundingStep[];
}

export const SENSORY_54321_PROTOCOL: GroundingProtocol = {
  id: 'sensory_54321',
  title: '5-4-3-2-1 Sensory Grounding',
  description: 'Connect with your five senses to anchor yourself in the present moment.',
  footerTip: 'Take your time to focus on each sense slowly.',
  totalSteps: 5,
  steps: [
    {
      stepIndex: 0,
      stepNumber: 1,
      count: 5,
      sense: 'see',
      title: '5 Things You Can See',
      instruction: '5 things you can SEE around you.',
      prompt: 'Look around your environment. Notice 5 distinct things you can see—patterns, colors, light, or small details.',
      accessibilityLabel: 'Step 1 of 5: Notice 5 things you can see around you.',
      accessibilityHint: 'Look around your room or space and observe five visual details.',
      color: '#3B82F6',
      fillColor: '#EFF6FF',
    },
    {
      stepIndex: 1,
      stepNumber: 2,
      count: 4,
      sense: 'touch',
      title: '4 Things You Can Touch',
      instruction: '4 things you can TOUCH physically.',
      prompt: 'Notice 4 physical textures or sensations—the fabric of your clothes, a surface, your feet on the ground, or your hands.',
      accessibilityLabel: 'Step 2 of 5: Notice 4 things you can touch physically.',
      accessibilityHint: 'Pay attention to physical tactile sensations or surfaces you can touch.',
      color: '#10B981',
      fillColor: '#ECFDF5',
    },
    {
      stepIndex: 2,
      stepNumber: 3,
      count: 3,
      sense: 'hear',
      title: '3 Things You Can Hear',
      instruction: '3 things you can HEAR in the environment.',
      prompt: 'Listen carefully to the sounds in your surroundings—distant traffic, gentle hum of appliances, a breeze, or silence.',
      accessibilityLabel: 'Step 3 of 5: Notice 3 things you can hear in the environment.',
      accessibilityHint: 'Listen for three distinct external or ambient sounds.',
      color: '#F59E0B',
      fillColor: '#FFFBEB',
    },
    {
      stepIndex: 3,
      stepNumber: 4,
      count: 2,
      sense: 'smell',
      title: '2 Things You Can Smell',
      instruction: '2 things you can SMELL.',
      prompt: 'Take a gentle breath through your nose. Notice 2 subtle scents—fresh air, coffee, fabric, or hand soap.',
      accessibilityLabel: 'Step 4 of 5: Notice 2 things you can smell.',
      accessibilityHint: 'Inhale gently and observe any faint scents around you.',
      color: '#EC4899',
      fillColor: '#FDF2F8',
    },
    {
      stepIndex: 4,
      stepNumber: 5,
      count: 1,
      sense: 'taste',
      title: '1 Thing You Can Taste',
      instruction: '1 thing you can TASTE.',
      prompt: 'Notice 1 taste in your mouth—a sip of water, a mint, or simply the neutral feeling on your tongue.',
      accessibilityLabel: 'Step 5 of 5: Notice 1 thing you can taste.',
      accessibilityHint: 'Notice any taste sensation or take a sip of water.',
      color: '#8B5CF6',
      fillColor: '#FAF5FF',
    },
  ],
};

export const GROUNDING_PROTOCOLS: Record<string, GroundingProtocol> = {
  sensory_54321: SENSORY_54321_PROTOCOL,
};
