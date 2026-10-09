/**
 * Guided emotion discovery for the check-in's "Not sure" option.
 *
 * Uses only existing approved wording:
 * - the feeling labels in SECONDARY_EMOTIONS_BY_PRIMARY (unchanged identifiers), shown a few
 *   at a time as "Does it feel more like…";
 * - the product specification's "Simple meaning" for each broad emotion (emotion table,
 *   rows E01 Happy, E02 Calm, E03 Sad, E05 Angry), to re-check the broad emotion.
 *
 * Pattern from the specification's support mode: offer a few "closest" choices, and when it is
 * still unclear, stop asking and offer a gentle activity. No emotion is ever filled in.
 *
 * Pure TypeScript, no React Native imports.
 */
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, type PrimaryEmotionId } from "./emotionTaxonomy";

/** Most feelings shown at once, so each choice stays small. */
export const DISCOVERY_GROUP_MAX = 4;

/** The broad emotion's feelings (without "Not sure") in balanced groups, in taxonomy order. */
export function getDiscoveryGroups(primary: PrimaryEmotionId): string[][] {
  const feelings = (SECONDARY_EMOTIONS_BY_PRIMARY[primary] ?? []).filter((f) => f !== "Not sure");
  if (feelings.length === 0) return [];
  const groupCount = Math.ceil(feelings.length / DISCOVERY_GROUP_MAX);
  const size = Math.ceil(feelings.length / groupCount);
  const groups: string[][] = [];
  for (let i = 0; i < feelings.length; i += size) groups.push(feelings.slice(i, i + size));
  return groups;
}

/** Specification "Simple meaning" for each broad emotion offered in the check-in. */
export const PRIMARY_EMOTION_MEANINGS: Record<PrimaryEmotionId, string> = {
  happy: "I feel good or something nice happened.",
  calm: "I feel safe, relaxed, and okay.",
  sad: "Something hurts me or I feel low.",
  angry: "I feel hurt, annoyed, or treated badly.",
};

/** Broad emotions in the same order as step 1, with their meanings. */
export function getPrimaryMeaningChoices(): { id: PrimaryEmotionId; label: string; meaning: string }[] {
  return PRIMARY_EMOTIONS.map((e) => ({ id: e.id, label: e.label, meaning: PRIMARY_EMOTION_MEANINGS[e.id] }));
}

/**
 * Where the student is in step 2:
 * - choose: the normal feeling chips
 * - explore: "Does it feel more like…" for one group of the broad emotion's feelings
 * - broad: "Which of these sounds closest?" using the broad emotions' meanings
 * - unresolved: still not sure; try again, go back, or leave for an activity (nothing saved)
 */
export type DiscoveryMode =
  | { kind: "choose" }
  | { kind: "explore"; group: number }
  | { kind: "broad" }
  | { kind: "unresolved" };

/** "None of these": next group, then the broad-emotion check. */
export function nextDiscoveryMode(mode: DiscoveryMode, groupCount: number): DiscoveryMode {
  if (mode.kind === "choose") return { kind: "explore", group: 0 };
  if (mode.kind === "explore") {
    return mode.group + 1 < groupCount ? { kind: "explore", group: mode.group + 1 } : { kind: "broad" };
  }
  return { kind: "unresolved" };
}

/** Back one step inside discovery; from the first group back to the normal choices. */
export function previousDiscoveryMode(mode: DiscoveryMode, groupCount: number): DiscoveryMode {
  if (mode.kind === "explore") return mode.group > 0 ? { kind: "explore", group: mode.group - 1 } : { kind: "choose" };
  if (mode.kind === "broad") return groupCount > 0 ? { kind: "explore", group: groupCount - 1 } : { kind: "choose" };
  if (mode.kind === "unresolved") return { kind: "broad" };
  return mode;
}
