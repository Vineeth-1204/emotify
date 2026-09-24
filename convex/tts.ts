import { v } from "convex/values";
import { action } from "./_generated/server";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[]
    );
  }
  return btoa(binary);
}

function sanitizeTextForTTS(input: string): string {
  // Strip markdown formatting symbols, URLs, and excessive whitespace
  let clean = input
    .replace(/\*+/g, "")
    .replace(/#+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Cap at 800 characters to protect free-tier quotas and keep latency minimal
  if (clean.length > 800) {
    clean = clean.slice(0, 800) + "...";
  }
  return clean;
}

export interface TTSActionResult {
  success: boolean;
  audioBase64?: string;
  format?: string;
  error?: string;
  message?: string;
}

/**
 * Shared helper for ElevenLabs Text-to-Speech synthesis.
 */
async function performElevenLabsTTS(rawText: string, voiceId: string): Promise<TTSActionResult> {
  const trimmed = rawText?.trim();
  if (!trimmed) {
    return {
      success: false,
      error: "EMPTY_TEXT",
      message: "Text cannot be empty for voice synthesis.",
    };
  }

  const cleanText = sanitizeTextForTTS(trimmed);

  // Retrieve ElevenLabs API key from server environment
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY environment variable is not set on Convex.");
    return {
      success: false,
      error: "API_KEY_NOT_CONFIGURED",
      message: "ElevenLabs API key is not configured on the Convex backend.",
    };
  }

  // Validate voiceId format (alphanumeric, 10-40 characters)
  const validVoiceIdRegex = /^[a-zA-Z0-9_-]{10,40}$/;
  if (!validVoiceIdRegex.test(voiceId)) {
    return {
      success: false,
      error: "INVALID_VOICE_ID",
      message: "Invalid ElevenLabs voice identifier.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      voiceId
    )}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: "eleven_multilingual_v2", // Multilingual v2 supports English, Hindi, Tamil, Telugu, etc.
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      console.warn(`ElevenLabs API returned authorization error (HTTP ${response.status}).`);
      return {
        success: false,
        error: "AUTH_ERROR",
        message: "ElevenLabs authentication failed. Please verify your API key.",
      };
    }

    if (response.status === 429) {
      console.warn("ElevenLabs API rate limit or quota exceeded.");
      return {
        success: false,
        error: "RATE_LIMITED",
        message: "ElevenLabs quota or rate limit exceeded.",
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(`ElevenLabs API failed with HTTP ${response.status}:`, errorText);
      return {
        success: false,
        error: "TTS_ERROR",
        message: `Voice synthesis failed with HTTP ${response.status}.`,
      };
    }

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return {
        success: false,
        error: "EMPTY_AUDIO",
        message: "ElevenLabs returned an empty audio response.",
      };
    }

    const base64Audio = arrayBufferToBase64(buffer);

    return {
      success: true,
      audioBase64: base64Audio,
      format: "mp3",
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort =
      err?.name === "AbortError" ||
      err?.message === "AbortError" ||
      err?.message?.includes("abort");

    console.warn("ElevenLabs request failed:", err?.message || err);

    return {
      success: false,
      error: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
      message: isAbort
        ? "Voice generation timed out."
        : "Failed to connect to voice synthesis service.",
    };
  }
}

/**
 * Generate Speech using ElevenLabs Text-to-Speech API.
 * The ElevenLabs secret API key resides strictly on the server and is NEVER exposed to clients.
 */
export const generateSpeech = action({
  args: {
    text: v.string(),
    voiceId: v.string(),
  },
  handler: async (ctx, args): Promise<TTSActionResult> => {
    return await performElevenLabsTTS(args.text, args.voiceId);
  },
});

/**
 * Generate Voice Preview sample for a given voice ID.
 */
export const getVoicePreview = action({
  args: {
    voiceId: v.string(),
    sampleText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TTSActionResult> => {
    const text =
      args.sampleText ||
      "Hello! Take a gentle breath. I am right here to support you.";
    return await performElevenLabsTTS(text, args.voiceId);
  },
});
