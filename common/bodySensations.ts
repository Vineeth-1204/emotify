/**
 * Body sensations for the guided check-in ("How does it feel in your body?").
 *
 * Source: the product specification ("priyanka app .docx"), emotion table, column
 * "Possible body sensations" (rows E01–E08). Wording is kept as written there.
 *
 * Each sensation maps to the existing body-figure regions (Head, Shoulders, Chest, Stomach,
 * Hands, Legs) only when it names a part of the body the figure has. Sensations about the whole
 * body light the whole figure as feedback but are not saved as a region; sensations with no
 * matching region (throat, arms, "wanting to hide") are not saved as a region either. The
 * current schema stores regions only (emotionLogs.bodyRegions / emotionMaps.selectedRegions);
 * sensation wording is not persisted.
 *
 * Pure TypeScript, no React Native imports.
 */
import type { CanonicalEmotionKey } from "./emotionRouting";

export const BODY_REGIONS = ["Head", "Shoulders", "Chest", "Stomach", "Hands", "Legs"] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export interface BodySensation {
  label: string;
  /** Figure regions this sensation is located in (saved with the check-in). */
  regions: BodyRegion[];
  /** Felt across the whole body: highlights the full figure, saves no region. */
  wholeBody?: boolean;
}

const at = (label: string, ...regions: BodyRegion[]): BodySensation => ({ label, regions });
const whole = (label: string): BodySensation => ({ label, regions: [], wholeBody: true });
const unplaced = (label: string): BodySensation => ({ label, regions: [] });

export const BODY_SENSATIONS: Record<CanonicalEmotionKey, BodySensation[]> = {
  // E01 Happy: Warm chest; relaxed face; smiling; light body; relaxed shoulders; lots of energy
  happy: [
    at("Warm chest", "Chest"),
    at("Relaxed face", "Head"),
    at("Smiling", "Head"),
    whole("Light body"),
    at("Relaxed shoulders", "Shoulders"),
    whole("Lots of energy"),
  ],
  // E02 Calm: Relaxed shoulders; slow breathing; relaxed chest; relaxed stomach; relaxed hands; peaceful body
  calm: [
    at("Relaxed shoulders", "Shoulders"),
    at("Slow breathing", "Chest"),
    at("Relaxed chest", "Chest"),
    at("Relaxed stomach", "Stomach"),
    at("Relaxed hands", "Hands"),
    whole("Peaceful body"),
  ],
  // E03 Sad: Heavy chest; lump in throat; tears; heavy head; tired body; heavy legs; low energy
  sad: [
    at("Heavy chest", "Chest"),
    unplaced("Lump in throat"),
    at("Tears", "Head"),
    at("Heavy head", "Head"),
    whole("Tired body"),
    at("Heavy legs", "Legs"),
    whole("Low energy"),
  ],
  // E04 Worried / Scared: Tight chest; fast heartbeat; fast breathing; upset stomach; shaky hands;
  // sweaty hands; tight shoulders; restless legs
  worried: [
    at("Tight chest", "Chest"),
    at("Fast heartbeat", "Chest"),
    at("Fast breathing", "Chest"),
    at("Upset stomach", "Stomach"),
    at("Shaky hands", "Hands"),
    at("Sweaty hands", "Hands"),
    at("Tight shoulders", "Shoulders"),
    at("Restless legs", "Legs"),
  ],
  // E05 Angry / Upset: Hot face; tight jaw; tight hands; tight shoulders; tight chest; fast heartbeat;
  // tense body; restless body
  angry: [
    at("Hot face", "Head"),
    at("Tight jaw", "Head"),
    at("Tight hands", "Hands"),
    at("Tight shoulders", "Shoulders"),
    at("Tight chest", "Chest"),
    at("Fast heartbeat", "Chest"),
    whole("Tense body"),
    whole("Restless body"),
  ],
  // E06 Embarrassed / Ashamed: Hot face; red face; tight chest; lump in throat; upset stomach;
  // tense body; shaky feeling; wanting to hide
  embarrassed: [
    at("Hot face", "Head"),
    at("Red face", "Head"),
    at("Tight chest", "Chest"),
    unplaced("Lump in throat"),
    at("Upset stomach", "Stomach"),
    whole("Tense body"),
    whole("Shaky feeling"),
    unplaced("Wanting to hide"),
  ],
  // E07 Guilty / Regretful: Heavy chest; sinking feeling in stomach; tight stomach; lump in throat;
  // heavy body; tight shoulders; low energy
  guilty: [
    at("Heavy chest", "Chest"),
    at("Sinking feeling in stomach", "Stomach"),
    at("Tight stomach", "Stomach"),
    unplaced("Lump in throat"),
    whole("Heavy body"),
    at("Tight shoulders", "Shoulders"),
    whole("Low energy"),
  ],
  // E08 Tired / Drained: Heavy eyes; heavy head; weak legs; tired arms; heavy body; slow body;
  // little energy; hard to move
  tired: [
    at("Heavy eyes", "Head"),
    at("Heavy head", "Head"),
    at("Weak legs", "Legs"),
    unplaced("Tired arms"),
    whole("Heavy body"),
    whole("Slow body"),
    whole("Little energy"),
    whole("Hard to move"),
  ],
};

export function getBodySensations(emotion: CanonicalEmotionKey | null | undefined): BodySensation[] {
  return (emotion && BODY_SENSATIONS[emotion]) || [];
}

/** Regions to save for the chosen sensations (only those offered for this emotion), in figure order. */
export function regionsForSensations(emotion: CanonicalEmotionKey | null | undefined, labels: string[]): BodyRegion[] {
  const chosen = getBodySensations(emotion).filter((s) => labels.includes(s.label));
  const regions = new Set(chosen.flatMap((s) => s.regions));
  return BODY_REGIONS.filter((r) => regions.has(r));
}

/** True when a chosen sensation is felt across the whole body (the figure lights up fully). */
export function includesWholeBody(emotion: CanonicalEmotionKey | null | undefined, labels: string[]): boolean {
  return getBodySensations(emotion).some((s) => s.wholeBody && labels.includes(s.label));
}

/**
 * "Help me notice": a short, optional body check. Each step highlights one region for
 * NOTICE_STEP_MS (4 steps ≈ 18 s). Plain noticing only: no breathing pattern, no meaning attached.
 */
export const HELP_ME_NOTICE_STEPS: { region: BodyRegion; line: string }[] = [
  { region: "Head", line: "Notice your head and face." },
  { region: "Shoulders", line: "Now your shoulders." },
  { region: "Chest", line: "Now your chest." },
  { region: "Stomach", line: "Now your stomach." },
];
export const NOTICE_STEP_MS = 4500;
