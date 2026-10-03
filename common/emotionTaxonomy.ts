/**
 * Centralized Deterministic Emotion Taxonomy (Phase 3A)
 * 
 * Provides hierarchical 2-level emotion discovery:
 * Level 1: Broad emotional state (Happy, Sad, Angry, Calm)
 * Level 2: Descriptive wellness/self-reflection labels relevant to that broad state
 * 
 * ABSOLUTE CLINICAL BOUNDARY:
 * - Descriptive wellness & self-reflection labels only.
 * - These are NOT clinical diagnoses or psychological findings.
 * - Prohibited from inferring diagnostic categories or clinical severity.
 */

import { CanonicalEmotionKey } from "./emotionRouting";

export type PrimaryEmotionId = "happy" | "sad" | "angry" | "calm";

export interface PrimaryEmotion {
  id: PrimaryEmotionId;
  label: string;
  emoji: string;
  color: string;
  themeColor: string;
  description: string;
}

export const PRIMARY_EMOTIONS: PrimaryEmotion[] = [
  { id: "happy", label: "Happy", emoji: "😊", color: "#EAB308", themeColor: "#EAB308", description: "Positive, energized, or uplifted" },
  { id: "sad", label: "Sad", emoji: "😢", color: "#3B82F6", themeColor: "#3B82F6", description: "Low, heavy, or feeling down" },
  { id: "angry", label: "Angry", emoji: "😠", color: "#EF4444", themeColor: "#EF4444", description: "Upset, frustrated, or tense" },
  { id: "calm", label: "Calm", emoji: "😌", color: "#10B981", themeColor: "#10B981", description: "Settled, steady, or relaxed" },
];

export const SECONDARY_EMOTIONS_BY_PRIMARY: Record<PrimaryEmotionId, string[]> = {
  happy: [
    "Excited",
    "Proud",
    "Grateful",
    "Relieved",
    "Content",
    "Hopeful",
    "Connected",
    "Not sure",
  ],
  sad: [
    "Lonely",
    "Disappointed",
    "Hurt",
    "Empty",
    "Left out",
    "Missing someone",
    "Hopeless",
    "Not sure",
  ],
  angry: [
    "Frustrated",
    "Irritated",
    "Annoyed",
    "Hurt",
    "Resentful",
    "Overwhelmed",
    "Not sure",
  ],
  calm: [
    "Peaceful",
    "Relaxed",
    "Content",
    "Safe",
    "Comfortable",
    "Balanced",
    "Not sure",
  ],
};

/**
 * Rephrasing prompts for Phase 2 "I'm not sure" behavior at Level 2.
 */
export const UNCERTAINTY_REPHRASINGS: Record<PrimaryEmotionId, { prompt: string; examples: string }> = {
  happy: {
    prompt: "That's okay.",
    examples: "Does it feel more like excitement, being proud, feeling grateful, or something else?",
  },
  sad: {
    prompt: "That's okay.",
    examples: "Does it feel more like loneliness, disappointment, feeling empty, or something else?",
  },
  angry: {
    prompt: "That's okay.",
    examples: "Does it feel more like frustration, irritation, being hurt, or something else?",
  },
  calm: {
    prompt: "That's okay.",
    examples: "Does it feel more like peace, feeling relaxed, feeling safe, or something else?",
  },
};

/**
 * Maps a secondary emotion back to its canonical emotion key for deterministic intervention routing.
 * Falls back to the primary emotion's canonical key if no specific mapping or if "Not sure".
 */
export function getCanonicalEmotionForRouting(
  primary: PrimaryEmotionId,
  secondary: string | null | undefined
): CanonicalEmotionKey {
  if (!secondary || secondary.toLowerCase() === "not sure") {
    return primary;
  }

  const s = secondary.trim().toLowerCase();

  // Secondary feelings with distinct canonical routing alignments
  if (s === "lonely" || s === "disappointed" || s === "empty" || s === "left out" || s === "missing someone" || s === "hopeless") {
    return "sad";
  }
  if (s === "frustrated" || s === "irritated" || s === "annoyed" || s === "resentful") {
    return "angry";
  }
  if (s === "excited" || s === "proud" || s === "grateful" || s === "relieved" || s === "hopeful" || s === "connected") {
    return "happy";
  }
  if (s === "peaceful" || s === "relaxed" || s === "safe" || s === "comfortable" || s === "balanced") {
    return "calm";
  }
  if (s === "overwhelmed") {
    // Overwhelmed within anger/upset maps to angry routing
    return "angry";
  }
  if (s === "hurt") {
    // Hurt can belong to either angry or sad depending on primary broad state
    return primary === "angry" ? "angry" : "sad";
  }
  if (s === "content") {
    // Content can belong to happy or calm depending on primary broad state
    return primary === "happy" ? "happy" : "calm";
  }

  // Default fallback to primary emotion
  return primary;
}
