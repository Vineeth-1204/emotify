/**
 * Which colour palette (constants/Colors EmotionPalettes) reflects the student's mood.
 *
 * Only explicit, student-selected moods are used: today's daily check-in and the latest
 * Emotion Map entry. Whichever was recorded most recently wins. No inference, no scores.
 *
 * Difficult moods map to gentle palettes (soft blue / soft slate) rather than mirroring
 * them with red or near-black, so the app never looks alarming for an ordinary low day.
 * Safety screens do not use this theme at all.
 */
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, type PrimaryEmotionId } from "./emotionTaxonomy";

const CHECKIN_THEME: Record<string, string> = {
  good: "happy",
  calm: "calm",
  low: "sad",
  heavy: "peaceful",
};

const PRIMARY_THEME: Record<PrimaryEmotionId, string> = {
  happy: "happy",
  calm: "calm",
  sad: "sad",
  angry: "peaceful",
};

/** Legacy emotion ids that match a palette directly; alarming ones are softened. */
const LEGACY_THEME: Record<string, string> = {
  happy: "happy",
  calm: "calm",
  sad: "sad",
  peaceful: "peaceful",
  excitement: "excitement",
  creative: "creative",
  love: "love",
  anger: "peaceful",
  fearful: "peaceful",
  disgusted: "peaceful",
};

const PRIMARY_IDS = new Set<string>(PRIMARY_EMOTIONS.map((e) => e.id));

function primaryForSecondary(label: string): PrimaryEmotionId | null {
  const needle = label.trim().toLowerCase();
  for (const [primary, secondaries] of Object.entries(SECONDARY_EMOTIONS_BY_PRIMARY)) {
    if (secondaries.some((s) => s.toLowerCase() === needle)) return primary as PrimaryEmotionId;
  }
  return null;
}

export function themeKeyForCheckinMood(mood: string | null | undefined): string | null {
  return (mood && CHECKIN_THEME[mood]) || null;
}

export function themeKeyForEmotionLog(log: { emotion?: string; selectedEmotions?: string[] } | null | undefined): string | null {
  if (!log) return null;
  const candidates = [log.selectedEmotions?.[0], log.emotion].filter((e): e is string => typeof e === "string" && e.length > 0);
  for (const c of candidates) {
    if (PRIMARY_IDS.has(c)) return PRIMARY_THEME[c as PrimaryEmotionId];
  }
  for (const c of candidates) {
    if (LEGACY_THEME[c]) return LEGACY_THEME[c];
    const primary = primaryForSecondary(c);
    if (primary) return PRIMARY_THEME[primary];
  }
  return null;
}

export interface MoodSignals {
  todayCheckin?: { mood?: string; createdAt?: number } | null;
  latestEmotionLog?: { emotion?: string; selectedEmotions?: string[]; createdAt?: number } | null;
}

/** The palette key for the most recent explicit mood, or null for the default theme. */
export function resolveMoodThemeKey({ todayCheckin, latestEmotionLog }: MoodSignals): string | null {
  const checkinKey = themeKeyForCheckinMood(todayCheckin?.mood);
  const logKey = themeKeyForEmotionLog(latestEmotionLog);
  if (checkinKey && logKey) {
    return (latestEmotionLog?.createdAt ?? 0) > (todayCheckin?.createdAt ?? 0) ? logKey : checkinKey;
  }
  return checkinKey ?? logKey;
}
