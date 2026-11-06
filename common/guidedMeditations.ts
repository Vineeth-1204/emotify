/**
 * Optional guided meditations for the Emotion Map check-in.
 *
 * Source: the product specification ("priyanka app .docx", "Step 2 – Choose the strongest
 * emotion"), which links one YouTube meditation to each of the eight canonical emotions.
 * URLs are copied verbatim from that document; a test re-reads it to keep them in sync.
 *
 * These are optional extras shown next to the built-in intervention. They never replace it,
 * never change routing, and are opened outside the app (no embedded player).
 *
 * Pure TypeScript: no React Native imports, so it can be unit tested.
 */
import type { CanonicalEmotionKey } from "./emotionRouting";

export interface GuidedMeditation {
  emotion: CanonicalEmotionKey;
  title: string;
  url: string;
  /** Only where the specification states a length (in the video title). */
  durationLabel?: string;
}

export const GUIDED_MEDITATIONS: Record<CanonicalEmotionKey, GuidedMeditation> = {
  worried: {
    emotion: "worried",
    title: "Meditation for Anxiety",
    url: "https://www.youtube.com/watch?v=O-6f5wQXSu8",
  },
  angry: {
    emotion: "angry",
    title: "Anger Release Meditation",
    url: "https://www.youtube.com/watch?v=DBgr2t0TrIk",
    durationLabel: "5 min",
  },
  embarrassed: {
    emotion: "embarrassed",
    title: "Shame and Self-Compassion",
    url: "https://www.youtube.com/watch?v=_25TJ0geBnc",
  },
  guilty: {
    emotion: "guilty",
    title: "Release Shame and Guilt",
    url: "https://www.youtube.com/watch?v=-0fqumgiQC4",
    durationLabel: "5 min",
  },
  sad: {
    emotion: "sad",
    title: "Meditation for Sadness and Hopelessness",
    url: "https://www.youtube.com/watch?v=HM7oTRPwtUQ",
  },
  tired: {
    emotion: "tired",
    title: "Yoga Nidra Full Body Scan",
    url: "https://www.youtube.com/watch?v=lCuCb4O4_w0",
    durationLabel: "10 min",
  },
  happy: {
    emotion: "happy",
    title: "Morning Meditation for a Happy Mind",
    url: "https://www.youtube.com/watch?v=dRAqsc4sz7Y",
    durationLabel: "5 min",
  },
  calm: {
    emotion: "calm",
    title: "Daily Calm: Be Present",
    url: "https://www.youtube.com/watch?v=ZToicYcHIOU",
  },
};

// Only the canonical watch form with an 11-character video id, over https.
const YOUTUBE_WATCH_URL = /^https:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;

export function isApprovedYouTubeUrl(url: unknown): url is string {
  return typeof url === "string" && YOUTUBE_WATCH_URL.test(url);
}

/** The meditation for an emotion, or null when none is configured or its URL is not valid. */
export function getGuidedMeditation(emotion: CanonicalEmotionKey | null | undefined): GuidedMeditation | null {
  if (!emotion) return null;
  const meditation = GUIDED_MEDITATIONS[emotion];
  return meditation && isApprovedYouTubeUrl(meditation.url) ? meditation : null;
}

export type OpenMeditationResult = "opened" | "invalid" | "failed";

/**
 * Opens the meditation with the given opener (the app passes Linking.openURL).
 * Never throws: an invalid URL is not opened, and an opener failure is reported as "failed".
 */
export async function openGuidedMeditation(
  meditation: GuidedMeditation | null,
  open: (url: string) => Promise<unknown>
): Promise<OpenMeditationResult> {
  if (!meditation || !isApprovedYouTubeUrl(meditation.url)) return "invalid";
  try {
    await open(meditation.url);
    return "opened";
  } catch {
    return "failed";
  }
}
