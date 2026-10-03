/**
 * Central Authoritative Catalog for Non-Clinical Routine Interventions & Micro-Goals
 *
 * Source-of-truth definition for standard behavioral activation and habit-building templates.
 * 
 * ABSOLUTE CLINICAL BOUNDARY:
 * - This catalog contains only non-clinical wellness habit definitions.
 * - NO mood mappings.
 * - NO psychiatric or clinical indications (e.g. "for depression", "for anxiety").
 * - NO diagnostic scoring or triage linkages.
 */

export interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  points: number; // legacy points, mapped to XP and Coins
  category: string;
  difficulty: "easy" | "medium" | "very_small" | "large";
  whyItHelps: string;
  estimatedTime: string;
  isDailyChallenge?: boolean;
}

export type GoalTier = "small" | "medium" | "large" | "challenge";

export const ROUTINE_HABIT_CATALOG: Record<GoalTier, readonly GoalTemplate[]> = {
  small: [
    {
      id: "water",
      title: "Drink a glass of water",
      description: "Stay hydrated to improve focus and alertness.",
      points: 10,
      category: "Hydration",
      difficulty: "easy",
      whyItHelps: "Hydration keeps your mind and body active.",
      estimatedTime: "1 min",
    },
    {
      id: "stretch_5",
      title: "Stretch for 5 minutes",
      description: "Do a few gentle body stretches.",
      points: 10,
      category: "Exercise",
      difficulty: "easy",
      whyItHelps: "Stretching releases physical tension accumulated from stress.",
      estimatedTime: "5 mins",
    },
    {
      id: "breathe",
      title: "Take 3 deep belly breaths",
      description: "Take slow, deep belly breaths to calm down.",
      points: 10,
      category: "Breathing",
      difficulty: "easy",
      whyItHelps: "Deep breathing lowers your heart rate and activates calm.",
      estimatedTime: "3 mins",
    },
    {
      id: "outside_brief",
      title: "Stand by an open window",
      description: "Stand outside or look at the sky for a moment.",
      points: 10,
      category: "Mindfulness",
      difficulty: "easy",
      whyItHelps: "Natural sunlight regulates sleep and raises serotonin.",
      estimatedTime: "5 mins",
    },
    {
      id: "music",
      title: "Listen to calming music",
      description: "Play some of your favorite relaxing music.",
      points: 10,
      category: "Relaxation",
      difficulty: "easy",
      whyItHelps: "Music activates neural pathways associated with pleasure.",
      estimatedTime: "5 mins",
    },
    {
      id: "gratitude_1",
      title: "Write one gratitude entry",
      description: "Jot down one thing you are grateful for today.",
      points: 10,
      category: "Gratitude",
      difficulty: "easy",
      whyItHelps: "Expressing gratitude rewires the brain to focus on safety.",
      estimatedTime: "2 mins",
    },
    {
      id: "dim_screens",
      title: "Dim screen brightness",
      description: "Reduce screen glare to prepare your eyes.",
      points: 10,
      category: "Sleep",
      difficulty: "easy",
      whyItHelps: "Low blue-light exposure supports natural sleep cycles.",
      estimatedTime: "1 min",
    },
    {
      id: "wash_face",
      title: "Splash face with cold water",
      description: "Splash cold water on your face.",
      points: 10,
      category: "Self Care",
      difficulty: "easy",
      whyItHelps: "Cool water stimulates the vagus nerve and aids alertness.",
      estimatedTime: "1 min",
    },
  ],
  medium: [
    {
      id: "journal_5",
      title: "Journal for 5 minutes",
      description: "Write down your current thoughts and feelings.",
      points: 25,
      category: "Journaling",
      difficulty: "medium",
      whyItHelps: "Journaling brings awareness to your emotional state.",
      estimatedTime: "5 mins",
    },
    {
      id: "breathe_478",
      title: "Practice 4-7-8 breathing",
      description: "Practice the 4-7-8 breathing technique for 3 minutes.",
      points: 25,
      category: "Breathing",
      difficulty: "medium",
      whyItHelps: "Rhythmic breathing provides an instant physiological pause.",
      estimatedTime: "3 mins",
    },
    {
      id: "nutrition_fruit",
      title: "Eat a healthy fruit or snack",
      description: "Eat a serving of fresh fruit or nuts.",
      points: 25,
      category: "Nutrition",
      difficulty: "medium",
      whyItHelps: "Nourishing your body supports emotional regulation.",
      estimatedTime: "10 mins",
    },
    {
      id: "study_review",
      title: "Review notes from one class",
      description: "Open a notebook and read over a single page.",
      points: 25,
      category: "Study Balance",
      difficulty: "medium",
      whyItHelps: "Reviewing a single page makes academic progress feel doable.",
      estimatedTime: "10 mins",
    },
    {
      id: "doodle_5",
      title: "Doodle or sketch for 5 mins",
      description: "Doodle or sketch on a piece of paper.",
      points: 25,
      category: "Creativity",
      difficulty: "medium",
      whyItHelps: "Creative expression relaxes the brain and improves focus.",
      estimatedTime: "5 mins",
    },
    {
      id: "friend_msg",
      title: "Message a friend",
      description: "Send a quick check-in message to a friend.",
      points: 25,
      category: "Social Connection",
      difficulty: "medium",
      whyItHelps: "Social connection counteracts isolating tendencies.",
      estimatedTime: "2 mins",
    },
  ],
  large: [
    {
      id: "jpmr_full",
      title: "Practice guided JPMR",
      description: "Do a quick guided muscle relaxation block.",
      points: 50,
      category: "Relaxation",
      difficulty: "large",
      whyItHelps: "JPMR systematically reduces deep muscle tension.",
      estimatedTime: "15 mins",
    },
    {
      id: "walk_20",
      title: "Walk outdoors for 20 minutes",
      description: "Go for a brisk walk around your neighborhood.",
      points: 50,
      category: "Exercise",
      difficulty: "large",
      whyItHelps: "Gentle aerobic exercise decreases stress hormones.",
      estimatedTime: "20 mins",
    },
    {
      id: "meditate_15",
      title: "15-minute body scan meditation",
      description: "Complete a 15-minute body scan mindfulness track.",
      points: 50,
      category: "Mindfulness",
      difficulty: "large",
      whyItHelps: "Mindfulness strengthens emotional resilience.",
      estimatedTime: "15 mins",
    },
    {
      id: "friend_call",
      title: "Call a family member/friend",
      description: "Call a loved one for a quick catch-up.",
      points: 50,
      category: "Social Connection",
      difficulty: "large",
      whyItHelps: "Verbal conversations foster a deep sense of belonging.",
      estimatedTime: "20 mins",
    },
    {
      id: "cook_healthy",
      title: "Cook a fresh healthy meal",
      description: "Prepare a nourishing meal using fresh ingredients.",
      points: 50,
      category: "Nutrition",
      difficulty: "large",
      whyItHelps: "Healthy eating promotes holistic physical and mental health.",
      estimatedTime: "30 mins",
    },
    {
      id: "hobby_30",
      title: "Spend 30 mins on a hobby",
      description: "Focus on a creative project or hobby you enjoy.",
      points: 50,
      category: "Creativity",
      difficulty: "large",
      whyItHelps: "Engaging in hobbies builds identity and reduces pressure.",
      estimatedTime: "30 mins",
    },
  ],
  challenge: [
    {
      id: "steps_5k",
      title: "Walk 5,000 steps today",
      description: "Hit 5,000 steps on your pedometer/phone tracker.",
      points: 75,
      category: "Exercise",
      difficulty: "large",
      whyItHelps: "Staying active releases dopamine and supports focus.",
      estimatedTime: "Daily",
      isDailyChallenge: true,
    },
    {
      id: "detox_2h",
      title: "No social media for 2 hours",
      description: "Avoid browsing social media applications for a solid 2 hours.",
      points: 75,
      category: "Digital Detox",
      difficulty: "medium",
      whyItHelps: "Disconnecting from feeds lowers comparison anxiety.",
      estimatedTime: "2 hours",
      isDailyChallenge: true,
    },
    {
      id: "water_2l",
      title: "Drink 2 liters of water",
      description: "Make sure you drink a full 2 liters of fluids today.",
      points: 75,
      category: "Hydration",
      difficulty: "medium",
      whyItHelps: "Optimal hydration maintains cell energy levels.",
      estimatedTime: "Daily",
      isDailyChallenge: true,
    },
    {
      id: "sleep_11",
      title: "Sleep before 11:00 PM",
      description: "Wind down and turn off lights before 11:00 PM tonight.",
      points: 75,
      category: "Sleep",
      difficulty: "large",
      whyItHelps: "Early sleep cycles optimize deep REM restorative recovery.",
      estimatedTime: "Night",
      isDailyChallenge: true,
    },
  ],
};

/**
 * Backward-compatible TEMPLATES map
 */
export const TEMPLATES: Record<string, GoalTemplate[]> = {
  small: [...ROUTINE_HABIT_CATALOG.small],
  medium: [...ROUTINE_HABIT_CATALOG.medium],
  large: [...ROUTINE_HABIT_CATALOG.large],
  challenge: [...ROUTINE_HABIT_CATALOG.challenge],
};

/**
 * All catalog templates flattened into a single array
 */
export const ALL_ROUTINE_TEMPLATES: readonly GoalTemplate[] = [
  ...ROUTINE_HABIT_CATALOG.small,
  ...ROUTINE_HABIT_CATALOG.medium,
  ...ROUTINE_HABIT_CATALOG.large,
  ...ROUTINE_HABIT_CATALOG.challenge,
];

/**
 * Lookup map by goal ID for fast O(1) resolution
 */
export const ROUTINE_TEMPLATE_BY_ID: ReadonlyMap<string, GoalTemplate> = new Map(
  ALL_ROUTINE_TEMPLATES.map((t) => [t.id, t])
);

export function getRoutineTemplateById(id: string): GoalTemplate | undefined {
  return ROUTINE_TEMPLATE_BY_ID.get(id);
}

export const TIER_TARGET_COUNTS: Record<GoalTier, number> = {
  small: 2,
  medium: 1,
  large: 1,
  challenge: 1,
};

/**
 * 32-bit FNV-1a hash function for strings.
 * Fast, non-cryptographic, completely deterministic across platforms and runtimes.
 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Computes a deterministic score for a template given a user ID, date string, and tier.
 * Same (userId, dateStr, tier, templateId) will ALWAYS produce the exact same score.
 */
export function getTemplateDeterministicScore(
  userId: string,
  dateStr: string,
  tier: GoalTier,
  templateId: string
): number {
  return hashString(`${userId}:${dateStr}:${tier}:${templateId}`);
}

/**
 * Formats an epoch timestamp (ms) as a YYYY-MM-DD UTC date string.
 */
export function formatUtcDateStr(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Calculates a YYYY-MM-DD date string that is N calendar days prior to dateStr.
 */
export function getDateStrDaysAgo(dateStr: string, daysAgo: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const rd = String(date.getUTCDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

/**
 * Determines whether a goal assignment date/timestamp falls within the cooldown window
 * relative to the target dateStr (default 7 calendar days).
 */
export function isGoalInCooldownWindow(
  assignedDateOrTimestamp: string | number,
  todayStr: string,
  cooldownDays = 7
): boolean {
  const cooldownStartStr = getDateStrDaysAgo(todayStr, cooldownDays);
  const assignedDateStr =
    typeof assignedDateOrTimestamp === "number"
      ? formatUtcDateStr(assignedDateOrTimestamp)
      : assignedDateOrTimestamp;
  return assignedDateStr >= cooldownStartStr && assignedDateStr <= todayStr;
}

export interface AssignedGoalRecord {
  goalId: string;
  createdAt: number;
  date?: string;
}

export interface DeterministicSelectionOptions {
  userId: string;
  dateStr: string;
  assignedHistory?: AssignedGoalRecord[];
  cooldownDays?: number;
}

export interface SelectedRoutineGoals {
  selectedSmall: GoalTemplate[];
  selectedMedium: GoalTemplate[];
  selectedLarge: GoalTemplate[];
  selectedChallenge: GoalTemplate[];
  allSelected: GoalTemplate[];
}

/**
 * Selects routine goals for a specific tier using deterministic hashing and 7-day cooldown.
 *
 * Algorithm:
 * 1. Filter out candidate templates that have been assigned within the previous `cooldownDays` days.
 * 2. Deterministically score each eligible template via hashString(userId + dateStr + tier + templateId).
 * 3. Sort eligible templates by score.
 * 4. If eligible pool is sufficient, select targetCount items.
 * 5. If eligible pool is exhausted (fewer than targetCount items):
 *    - Take all eligible items.
 *    - Fill remaining slots from the cooling-down pool, sorting by least-recently assigned first
 *      (furthest in the past), with deterministic score as tie-breaker.
 * 6. Guarantees:
 *    - 100% deterministic (no Math.random).
 *    - Never returns duplicate goal IDs within the tier.
 *    - Never invents goals outside the catalog.
 */
export function selectTierGoalsDeterministically(
  tier: GoalTier,
  targetCount: number,
  userId: string,
  dateStr: string,
  assignedHistory: AssignedGoalRecord[] = [],
  cooldownDays = 7
): GoalTemplate[] {
  const catalogTemplates = ROUTINE_HABIT_CATALOG[tier];
  if (!catalogTemplates || catalogTemplates.length === 0) {
    return [];
  }

  // 1. Identify which goal IDs are within the cooldown window and find their latest assignment time
  const recentGoalIds = new Set<string>();
  const lastAssignedTimestampMap = new Map<string, number>();

  for (const record of assignedHistory) {
    const isRecent = isGoalInCooldownWindow(record.date || record.createdAt, dateStr, cooldownDays);
    if (isRecent) {
      recentGoalIds.add(record.goalId);
    }
    const currentLatest = lastAssignedTimestampMap.get(record.goalId) || 0;
    if (record.createdAt > currentLatest) {
      lastAssignedTimestampMap.set(record.goalId, record.createdAt);
    }
  }

  // 2. Partition into eligible (non-cooldown) and cooldown candidates
  const eligibleTemplates: GoalTemplate[] = [];
  const coolingDownTemplates: GoalTemplate[] = [];

  for (const t of catalogTemplates) {
    if (recentGoalIds.has(t.id)) {
      coolingDownTemplates.push(t);
    } else {
      eligibleTemplates.push(t);
    }
  }

  // 3. Deterministically sort eligible candidates by hash score
  eligibleTemplates.sort((a, b) => {
    const scoreA = getTemplateDeterministicScore(userId, dateStr, tier, a.id);
    const scoreB = getTemplateDeterministicScore(userId, dateStr, tier, b.id);
    return scoreA - scoreB;
  });

  // 4. If enough eligible candidates exist, return the top targetCount
  if (eligibleTemplates.length >= targetCount) {
    return eligibleTemplates.slice(0, targetCount);
  }

  // 5. Candidate exhaustion: we need more templates to satisfy targetCount.
  // Take all eligible candidates first.
  const selected: GoalTemplate[] = [...eligibleTemplates];
  const needed = targetCount - selected.length;

  // Sort cooling-down candidates by least-recent assignment (oldest first).
  // Tie-breaker: deterministic hash score.
  coolingDownTemplates.sort((a, b) => {
    const timeA = lastAssignedTimestampMap.get(a.id) || 0;
    const timeB = lastAssignedTimestampMap.get(b.id) || 0;
    if (timeA !== timeB) {
      return timeA - timeB; // Oldest assignment first (least recent)
    }
    const scoreA = getTemplateDeterministicScore(userId, dateStr, tier, a.id);
    const scoreB = getTemplateDeterministicScore(userId, dateStr, tier, b.id);
    return scoreA - scoreB;
  });

  const fallbackSelected = coolingDownTemplates.slice(0, needed);
  selected.push(...fallbackSelected);

  return selected;
}

/**
 * Top-level deterministic selection for all 4 routine tiers (small, medium, large, challenge).
 * Produces exactly: 2 small, 1 medium, 1 large, 1 challenge (5 total).
 */
export function selectDailyRoutineGoalsDeterministically(
  options: DeterministicSelectionOptions
): SelectedRoutineGoals {
  const { userId, dateStr, assignedHistory = [], cooldownDays = 7 } = options;

  const selectedSmall = selectTierGoalsDeterministically(
    "small",
    TIER_TARGET_COUNTS.small,
    userId,
    dateStr,
    assignedHistory,
    cooldownDays
  );

  const selectedMedium = selectTierGoalsDeterministically(
    "medium",
    TIER_TARGET_COUNTS.medium,
    userId,
    dateStr,
    assignedHistory,
    cooldownDays
  );

  const selectedLarge = selectTierGoalsDeterministically(
    "large",
    TIER_TARGET_COUNTS.large,
    userId,
    dateStr,
    assignedHistory,
    cooldownDays
  );

  const selectedChallenge = selectTierGoalsDeterministically(
    "challenge",
    TIER_TARGET_COUNTS.challenge,
    userId,
    dateStr,
    assignedHistory,
    cooldownDays
  );

  return {
    selectedSmall,
    selectedMedium,
    selectedLarge,
    selectedChallenge,
    allSelected: [
      ...selectedSmall,
      ...selectedMedium,
      ...selectedLarge,
      ...selectedChallenge,
    ],
  };
}
