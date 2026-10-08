/**
 * Emotify AI-3 Step 8: User Memory & Personalization Preferences Configuration
 *
 * Provides human-readable presentation labels, preset options for controlled UI selection,
 * and display formatters for the student profile settings.
 *
 * Core Principle:
 * AI memory != clinical record.
 * Only explicit, non-sensitive personalization preferences are exposed here.
 */

export const USER_FACING_PREFERENCE_CATEGORIES = [
  "communication_preference",
  "support_preference",
  "routine_preference",
  "goal_preference",
  "chosen_name",
] as const;

export type UserFacingPreferenceCategory = (typeof USER_FACING_PREFERENCE_CATEGORIES)[number];

export interface PreferencePresetItem {
  category: UserFacingPreferenceCategory;
  key: string;
  value: string;
  label: string;
  categoryLabel: string;
  description: string;
}

export const CATEGORY_METADATA: Record<
  UserFacingPreferenceCategory,
  { label: string; icon: string; description: string }
> = {
  communication_preference: {
    label: "Communication Style",
    icon: "chatbubble-ellipses-outline",
    description: "How Emoty talks and communicates with you",
  },
  support_preference: {
    label: "Support Preferences",
    icon: "heart-outline",
    description: "Techniques and exercises you find most helpful",
  },
  routine_preference: {
    label: "Routine Timing",
    icon: "time-outline",
    description: "When you prefer to focus on routines and check-ins",
  },
  goal_preference: {
    label: "Goal Setting Style",
    icon: "flag-outline",
    description: "How you like your goals and daily steps paced",
  },
  chosen_name: {
    label: "Chosen Name",
    icon: "person-outline",
    description: "The name or nickname Emoty addresses you by",
  },
};

export const PREFERENCE_PRESETS: PreferencePresetItem[] = [
  // Communication
  {
    category: "communication_preference",
    key: "response_length",
    value: "concise",
    categoryLabel: "Communication Style",
    label: "Keep responses concise",
    description: "Brief, direct responses that get straight to the point",
  },
  {
    category: "communication_preference",
    key: "response_length",
    value: "detailed",
    categoryLabel: "Communication Style",
    label: "Detailed explanations",
    description: "Thoughtful explanations with extra context and depth",
  },
  {
    category: "communication_preference",
    key: "communication_tone",
    value: "casual",
    categoryLabel: "Communication Style",
    label: "Casual and warm tone",
    description: "Friendly, relaxed everyday conversational style",
  },
  {
    category: "communication_preference",
    key: "communication_tone",
    value: "supportive",
    categoryLabel: "Communication Style",
    label: "Gentle and encouraging",
    description: "Calm, supportive and validating tone",
  },

  // Support
  {
    category: "support_preference",
    key: "exercise_preference",
    value: "breathing_exercises",
    categoryLabel: "Support Preferences",
    label: "Breathing exercises",
    description: "Prefers box breathing, 4-7-8, or calming breathwork",
  },
  {
    category: "support_preference",
    key: "exercise_preference",
    value: "grounding_exercises",
    categoryLabel: "Support Preferences",
    label: "5-4-3-2-1 Grounding",
    description: "Prefers sensory grounding when overwhelmed",
  },
  {
    category: "support_preference",
    key: "coping_modality",
    value: "journaling_prompts",
    categoryLabel: "Support Preferences",
    label: "Reflective journaling",
    description: "Prefers guided reflection and written prompts",
  },
  {
    category: "support_preference",
    key: "guidance_type",
    value: "listening_mode",
    categoryLabel: "Support Preferences",
    label: "Active listening mode",
    description: "Prefers Emoty to listen first without rushing to solutions",
  },

  // Routine
  {
    category: "routine_preference",
    key: "goal_timing",
    value: "morning",
    categoryLabel: "Routine Timing",
    label: "Morning routine focus",
    description: "Prefers setting intentions and goals early in the day",
  },
  {
    category: "routine_preference",
    key: "goal_timing",
    value: "evening",
    categoryLabel: "Routine Timing",
    label: "Evening reflection focus",
    description: "Prefers winding down and reviewing the day at night",
  },

  // Goal
  {
    category: "goal_preference",
    key: "goal_scale",
    value: "small_achievable_steps",
    categoryLabel: "Goal Setting Style",
    label: "Smaller achievable steps",
    description: "Prefers micro-goals that avoid feeling overwhelmed",
  },
  {
    category: "goal_preference",
    key: "goal_scale",
    value: "structured_milestones",
    categoryLabel: "Goal Setting Style",
    label: "Structured milestones",
    description: "Prefers clear, step-by-step milestones to track progress",
  },
];

/**
 * Format category to user-friendly human-readable label.
 */
export function formatPreferenceCategory(category: string): string {
  if (category in CATEGORY_METADATA) {
    return CATEGORY_METADATA[category as UserFacingPreferenceCategory].label;
  }
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Format a preference key and value into user-friendly human-readable text.
 */
export function formatPreferenceValue(category: string, key: string, value: string): string {
  if (category === "chosen_name") {
    return value;
  }

  const match = PREFERENCE_PRESETS.find(
    (p) => p.category === category && p.key === key && p.value === value
  );
  if (match) {
    return match.label;
  }

  // Graceful fallback: clean up snake_case
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
