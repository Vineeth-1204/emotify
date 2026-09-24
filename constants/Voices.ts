export interface VoiceConfig {
  id: string;
  displayName: string;
  voiceId: string;
  description: string;
  previewSampleText: string;
  gender: 'female' | 'male';
  isDefault?: boolean;
}

/**
 * Curated ElevenLabs voice configurations for Emotify AI Companion.
 * Uses official, pre-made ElevenLabs voices supported on all account tiers.
 * Multilingual v2 compatible (supports English, Hindi, Tamil, Telugu, and 25+ more languages).
 */
export const AVAILABLE_VOICES: Record<string, VoiceConfig> = {
  calm: {
    id: "calm",
    displayName: "Calm & Gentle",
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel (Official ElevenLabs premade)
    description: "A soothing, gentle voice for relaxation and mindful reflection",
    previewSampleText: "Hello! Take a slow, gentle breath. I am right here with you.",
    gender: "female",
    isDefault: true,
  },
  warm: {
    id: "warm",
    displayName: "Warm & Friendly",
    voiceId: "MF3mGyEYCl7XYWbV9V6O", // Elli (Official ElevenLabs premade)
    description: "A kind, expressive voice that brings comforting warmth",
    previewSampleText: "Hi there! I am so glad we can chat today. Tell me what's on your mind.",
    gender: "female",
  },
  grounded: {
    id: "grounded",
    displayName: "Deep & Reassuring",
    voiceId: "pNInz6obpgDQGcFmaJgB", // Adam (Official ElevenLabs premade)
    description: "A grounded, steady presence that inspires confidence",
    previewSampleText: "You are doing your best, and that is more than enough for today.",
    gender: "male",
  },
  empathetic: {
    id: "empathetic",
    displayName: "Soft & Empathetic",
    voiceId: "ErXwobaYiN019PkySvjV", // Antoni (Official ElevenLabs premade)
    description: "A soft, compassionate voice dedicated to thoughtful listening",
    previewSampleText: "I hear you, and whatever you are feeling right now is completely valid.",
    gender: "male",
  },
  uplifting: {
    id: "uplifting",
    displayName: "Bright & Uplifting",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Bella (Official ElevenLabs premade)
    description: "A bright, cheerful tone that provides positive encouragement",
    previewSampleText: "Every small step counts. Let's make today a little lighter together!",
    gender: "female",
  },
};

export const DEFAULT_VOICE_KEY = "calm";
export const DEFAULT_VOICE = AVAILABLE_VOICES[DEFAULT_VOICE_KEY];

export function getVoiceByKey(key: string | null | undefined): VoiceConfig {
  if (!key) return DEFAULT_VOICE;
  return AVAILABLE_VOICES[key] || DEFAULT_VOICE;
}

export function getVoiceByVoiceId(voiceId: string | null | undefined): VoiceConfig {
  if (!voiceId) return DEFAULT_VOICE;
  const match = Object.values(AVAILABLE_VOICES).find((v) => v.voiceId === voiceId);
  return match || DEFAULT_VOICE;
}
