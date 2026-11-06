import { normalizeEmotionKey, type CanonicalEmotionKey } from "./emotionRouting";

export interface IntensityAnchor {
  level: 1 | 2 | 3 | 4;
  label: string;
  emoji: string;
  color: string;
  description: string;
}

export const INTENSITY_ANCHORS: readonly IntensityAnchor[] = [
  { level: 1, label: "A little", emoji: "🟢", color: "#22C55E", description: "Light and manageable" },
  { level: 2, label: "Some", emoji: "🟡", color: "#EAB308", description: "Noticeable feeling" },
  { level: 3, label: "A lot", emoji: "🟠", color: "#F97316", description: "Strong and heavy" },
  { level: 4, label: "Overwhelming", emoji: "🔴", color: "#EF4444", description: "Very hard to carry" },
] as const;

/** Maps 1-10 numerical scale into 4-anchor scale (1=A little, 2=Some, 3=A lot, 4=Overwhelming) */
export function map10ScaleToAnchor(val: number): 1 | 2 | 3 | 4 {
  if (val <= 3) return 1;
  if (val <= 6) return 2;
  if (val <= 8) return 3;
  return 4;
}

export type ReassessmentBranch = "improved" | "unchanged" | "worse";

export interface ReassessmentResult {
  preAnchor: number;
  postAnchor: number;
  delta: number; // postAnchor - preAnchor (negative means improved)
  branch: ReassessmentBranch;
  supportiveHeading: string;
  supportiveBody: string;
  primaryActionRoute: string;
  primaryActionLabel: string;
  showHelplineOption: boolean;
}

/**
 * Evaluates pre- vs post-intervention observation and calculates the delta and branch.
 * - Improved: delta < 0
 * - Unchanged: delta === 0 (and not overwhelming)
 * - Worse: delta > 0 or post is Overwhelming (anchor 4)
 */
export function evaluateReassessment(
  preIntensity: number,
  postIntensity: number,
  options?: { preIsAnchor?: boolean }
): ReassessmentResult {
  const preAnchor = options?.preIsAnchor ? preIntensity : map10ScaleToAnchor(preIntensity);
  const postAnchor = postIntensity > 4 ? map10ScaleToAnchor(postIntensity) : postIntensity;
  const delta = postAnchor - preAnchor;

  if (delta < 0) {
    return {
      preAnchor,
      postAnchor,
      delta,
      branch: "improved",
      supportiveHeading: "Nice — that helped a little!",
      supportiveBody: "Want to try one small thing to keep the good feeling going?",
      primaryActionRoute: "/(auth)/tools/microgoals",
      primaryActionLabel: "Try a MicroGoal",
      showHelplineOption: false,
    };
  }

  if (delta === 0 && postAnchor < 4) {
    return {
      preAnchor,
      postAnchor,
      delta,
      branch: "unchanged",
      supportiveHeading: "That's okay — some feelings take a bit longer.",
      supportiveBody: "You showed up for yourself today. Would you like to try a small habit or talk with someone who can help?",
      primaryActionRoute: "/(auth)/tools/microgoals",
      primaryActionLabel: "Try a MicroGoal",
      showHelplineOption: true,
    };
  }

  // Worse or still overwhelming
  return {
    preAnchor,
    postAnchor,
    delta,
    branch: "worse",
    supportiveHeading: "Thanks for telling us how you feel.",
    supportiveBody: "Some big feelings are hard to carry alone. Would you like to talk to someone who can help right now?",
    primaryActionRoute: "/(auth)/tools/appointments",
    primaryActionLabel: "Connect with a counsellor",
    showHelplineOption: true,
  };
}

/**
 * Returns introductory supportive copy for the auto-routed activity based on emotion and intensity.
 */
export function getIntroSupportiveMessage(emotion: string, intensityAnchor: number): string {
  const key = normalizeEmotionKey(emotion);
  if (key === "happy" && intensityAnchor <= 2) {
    return "That's lovely to hear! Want to try a little gratitude activity to keep that good feeling going?";
  }
  if (intensityAnchor >= 3) {
    return "That sounds like a lot to carry right now. Let's try something calming together — just a few minutes.";
  }
  return "Let's take a calm moment together.";
}
