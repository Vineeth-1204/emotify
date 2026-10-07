import { PRIMARY_EMOTIONS, PrimaryEmotionId } from "./emotionTaxonomy";

/** Maps a daily check-in mood into the existing Emotion Map primary taxonomy. */
export function getEmotionMapPrimaryForDailyMood(mood: string | null | undefined): PrimaryEmotionId | null {
  switch (mood) {
    case "good":
    case "happy":
      return "happy";
    case "calm":
      return "calm";
    case "low":
    case "sad":
    // Heavy is a daily mood, not a taxonomy value. The existing Sad primary
    // explicitly includes “heavy” in its description, so it is the bridge fallback.
    case "heavy":
    case "worried":
      return "sad";
    default:
      return null;
  }
}

export type DailyCheckinNextStep =
  | { kind: "stay_home" }
  | { kind: "open_emotion_flow"; primaryEmotion: PrimaryEmotionId };

/** Existing check-ins may be updated without launching a duplicate emotion journey. */
export function getDailyCheckinNextStep(
  mood: string | null | undefined,
  isUpdating: boolean,
): DailyCheckinNextStep {
  if (isUpdating) return { kind: "stay_home" };
  const primaryEmotion = getEmotionMapPrimaryForDailyMood(mood);
  return primaryEmotion
    ? { kind: "open_emotion_flow", primaryEmotion }
    : { kind: "stay_home" };
}

export function validateContextualPrimary(value: string | string[] | undefined): PrimaryEmotionId | null {
  if (typeof value !== "string") return null;
  return PRIMARY_EMOTIONS.some((emotion) => emotion.id === value)
    ? value as PrimaryEmotionId
    : null;
}
