import type { PrimaryEmotionId } from "./emotionTaxonomy";

export const PRIMARY_EMOTION_CARD_MIN_HEIGHT = 176;

export const PRIMARY_EMOTION_CARD_DESCRIPTIONS: Record<PrimaryEmotionId, string> = {
  happy: "Positive or uplifted",
  sad: "Low or feeling down",
  angry: "Upset or frustrated",
  calm: "Peaceful or relaxed",
};
