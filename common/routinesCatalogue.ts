/**
 * Authoritative Routine & Affirmation Definitions for Emotify
 * Based on the approved Emotify specification (Phase 8 & Phase 9).
 */

export interface MorningAffirmationItem {
  id: string;
  text: string;
}

/**
 * Seven pre-written morning affirmations from the approved Emotify specification.
 * Cooldown logic ensures rotation without immediate repetition.
 */
export const MORNING_AFFIRMATIONS: MorningAffirmationItem[] = [
  { id: "MORN_01", text: "I can handle today, one step at a time." },
  { id: "MORN_02", text: "I don't have to be perfect — I just have to try." },
  { id: "MORN_03", text: "I am allowed to make mistakes and still be okay." },
  { id: "MORN_04", text: "Today is a fresh start." },
  { id: "MORN_05", text: "I have people who care about me." },
  { id: "MORN_06", text: "Small steps still count as progress." },
  { id: "MORN_07", text: "I am doing my best, and that is enough." },
];

export const MORNING_ROUTINE_COPY = {
  welcome: "Good morning! ☀️ Before your day gets busy, let's set a little intention.",
  prompt: "Pick one thought to carry with you today, or write your own:",
  customOptionPrompt: "Or write your own thought for today, if you'd like:",
  customPlaceholder: "Write your intention or affirmation here...",
  closing: "Have a good day — I'll check in with you later. 🌱",
  notificationTitle: "Good morning! ☀️",
  notificationBody: "Before your day gets busy, let's set a little intention.",
};

export const EVENING_GRATITUDE_COPY = {
  minimalMild: {
    welcome: "Before you wind down, let's look back at today. 🌙",
    prompt: "Can you think of three small things that went okay today? Even tiny ones count.",
    fieldPrompts: [
      "One thing that went okay:",
      "Another thing, even small:",
      "One more small thing:",
    ],
    requiredEntries: 3,
  },
  moderateSevere: {
    welcome: "Before you wind down, let's notice just one small thing from today.",
    prompt: "One small thing that went okay today:",
    fieldPrompts: [
      "One small thing that went okay today:",
    ],
    examples: [
      "I drank water.",
      "My friend smiled at me.",
      "I finished one task.",
      "I got out of bed.",
    ],
    requiredEntries: 1,
  },
  closing: "Thank you for noticing that. Noticing small good things helps your mind build a habit of hope. Sleep well. 💛",
  notificationTitle: "Good evening 🌙",
  notificationBody: "Before you wind down, let's notice a small thing that went okay today.",
};

export const MICROGOAL_REMINDER_COPY = {
  sixtyMinuteNudges: [
    "It's okay — try now for just 2 minutes. Small steps count.",
    "Missed today's goal? No problem — want a 1-minute breathing break instead?",
  ],
  endOfDaySoftClose: "No worries about today's goal — tomorrow's a fresh start. 🌱",
  notificationTitle: "Emoty • Small steps count",
};

/**
 * Selects an affirmation from the 7 pre-written affirmations using 3-day cooldown.
 */
export function selectMorningAffirmation(
  recentAffirmationIds: string[],
  seed = 0
): MorningAffirmationItem {
  const cooldownSet = new Set(recentAffirmationIds);
  let eligible = MORNING_AFFIRMATIONS.filter((item) => !cooldownSet.has(item.id));
  if (eligible.length === 0) {
    // Cooldown reset if all are in cooldown
    eligible = [...MORNING_AFFIRMATIONS];
  }
  const index = Math.abs(seed) % eligible.length;
  return eligible[index];
}

/**
 * Classifies whether a student should receive the Minimal/Mild (3 entries)
 * or Moderate/Severe (1 entry) gratitude flow.
 */
export function classifyGratitudeBranch(args: {
  triageSeverity?: string;
  phq9Score?: number;
  gad7Score?: number;
}): "minimal_mild" | "moderate_severe" {
  const sev = (args.triageSeverity || "").toLowerCase();
  if (
    sev === "moderate" ||
    sev === "severe" ||
    sev === "critical" ||
    (typeof args.phq9Score === "number" && args.phq9Score >= 10) ||
    (typeof args.gad7Score === "number" && args.gad7Score >= 10)
  ) {
    return "moderate_severe";
  }
  return "minimal_mild";
}
