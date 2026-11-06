import type { PrimaryEmotionId } from "./emotionTaxonomy";

export const PRIMARY_EMOTION_CARD_MIN_HEIGHT = 176;

export const PRIMARY_EMOTION_CARD_DESCRIPTIONS: Record<PrimaryEmotionId, string> = {
  happy: "Positive or uplifted",
  sad: "Low or feeling down",
  angry: "Upset or frustrated",
  calm: "Peaceful or relaxed",
};

/**
 * A solid (opaque) tint of `hex` over white.
 *
 * Elevated cards must have an opaque background: on Android a translucent background
 * (e.g. themeColor + "10") lets the elevation shadow show through as a grey block.
 */
export function solidTint(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 0xff;
    return Math.round(255 + (c - 255) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`.toUpperCase();
}

/** Selected-card colours for one emotion: every card uses the same recipe. */
export function primaryEmotionCardSelectedColors(themeColor: string) {
  return {
    borderColor: themeColor,
    backgroundColor: solidTint(themeColor, 0.08),
    iconBackgroundColor: solidTint(themeColor, 0.2),
  };
}
