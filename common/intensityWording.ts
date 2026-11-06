/**
 * Wording and colours for the check-in's 1–10 intensity scale.
 *
 * The number is the strength of the feeling the student chose, not a distress score. Captions
 * therefore follow the feeling's tone: a very strong happy or calm feeling is described as such,
 * and a very strong difficult feeling is described without implying a crisis. Safety assessment
 * lives elsewhere (screening, triage, crisis detection) and is not driven by this caption.
 *
 * Band labels use the specification's suggested anchors ("Light", "Medium", "Strong",
 * "Very Strong"), extended with "Very light" for 1–2. Captions are new wording pending
 * product/client approval. The 1–10 values, band boundaries and storage are unchanged.
 *
 * Pure TypeScript, no React Native imports.
 */
import type { CanonicalEmotionKey } from "./emotionRouting";
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, type PrimaryEmotionId } from "./emotionTaxonomy";

export type FeelingTone = "positive" | "calming" | "difficult";

const TONE_BY_EMOTION: Record<CanonicalEmotionKey, FeelingTone> = {
  happy: "positive",
  calm: "calming",
  sad: "difficult",
  angry: "difficult",
  worried: "difficult",
  embarrassed: "difficult",
  guilty: "difficult",
  tired: "difficult",
};

/** Tone of the check-in's emotion (broad emotion or routing key); unknown -> difficult (previous behaviour). */
export function toneForEmotion(emotion: CanonicalEmotionKey | PrimaryEmotionId | null | undefined): FeelingTone {
  return (emotion && TONE_BY_EMOTION[emotion as CanonicalEmotionKey]) || "difficult";
}

/** Tone of a saved feeling label (History): a broad emotion or one of its feelings. */
export function toneForFeeling(label: string | null | undefined): FeelingTone {
  const needle = (label ?? "").trim().toLowerCase();
  const primary = PRIMARY_EMOTIONS.find((e) => e.id === needle || e.label.toLowerCase() === needle);
  if (primary) return toneForEmotion(primary.id);
  for (const [id, feelings] of Object.entries(SECONDARY_EMOTIONS_BY_PRIMARY)) {
    if (feelings.some((f) => f !== "Not sure" && f.toLowerCase() === needle)) return toneForEmotion(id as PrimaryEmotionId);
  }
  return "difficult";
}

/** Same 1–10 bands as before: 1–2, 3–4, 5–6, 7–8, 9–10. */
export function intensityBand(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 2) return 0;
  if (value <= 4) return 1;
  if (value <= 6) return 2;
  if (value <= 8) return 3;
  return 4;
}

export const INTENSITY_BAND_LABELS = ["Very light", "Light", "Medium", "Strong", "Very strong"] as const;

const CAPTIONS: Record<FeelingTone, readonly string[]> = {
  positive: [
    "A faint good feeling.",
    "A gentle good feeling.",
    "A clear, steady good feeling.",
    "A strong good feeling.",
    "A very strong good feeling right now.",
  ],
  calming: [
    "Just a little settled.",
    "Somewhat settled.",
    "Steady and settled.",
    "Deeply settled.",
    "Very calm and at ease.",
  ],
  difficult: [
    "Barely there. You can just notice it.",
    "Noticeable, but you can carry on with your day.",
    "Quite noticeable. It may be hard to focus.",
    "Strong. It's hard to ignore right now.",
    "Very strong. It's taking up a lot of your attention right now.",
  ],
};

const COLORS: Record<FeelingTone, readonly string[]> = {
  // Warm ramp that deepens without turning alarm-red
  positive: ["#65A30D", "#CA8A04", "#D97706", "#B45309", "#92400E"],
  // Cool ramp: deeper means more settled
  calming: ["#0D9488", "#0891B2", "#0284C7", "#2563EB", "#4F46E5"],
  // Unchanged from the previous scale
  difficult: ["#10B981", "#3B82F6", "#F59E0B", "#EA580C", "#EF4444"],
};

export interface IntensityLevel {
  text: string;
  desc: string;
  color: string;
}

export function getIntensityLevel(value: number, tone: FeelingTone): IntensityLevel {
  const band = intensityBand(value);
  return { text: INTENSITY_BAND_LABELS[band], desc: CAPTIONS[tone][band], color: COLORS[tone][band] };
}

/** Emoty's prompt for the selected feeling, e.g. "Rate how relieved you feel, from 1 to 10." */
export function intensityPrompt(feeling: string | null | undefined): string {
  if (!feeling) return "Rate how strong it feels, from 1 to 10.";
  if (feeling.toLowerCase() === "missing someone") return "Rate how much you're missing someone, from 1 to 10.";
  return `Rate how ${feeling.toLowerCase()} you feel, from 1 to 10.`;
}
