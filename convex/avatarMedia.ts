/**
 * Binary avatar delivery for Convex HTTP router.
 * Provides optimized in-memory JPEG byte buffers for Emotify boy and girl avatars.
 */
import {
  BOY_AVATAR_NOTIFICATION_BASE64,
  GIRL_AVATAR_NOTIFICATION_BASE64,
} from "./avatarAssets";
import type { AvatarCharacterId } from "../common/avatarNotification";

export function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let cachedBoyBytes: Uint8Array | null = null;
let cachedGirlBytes: Uint8Array | null = null;

export function getAvatarBytes(character: AvatarCharacterId): Uint8Array | null {
  if (character === "boy") {
    if (!cachedBoyBytes) {
      cachedBoyBytes = decodeBase64(BOY_AVATAR_NOTIFICATION_BASE64);
    }
    return cachedBoyBytes;
  }
  if (character === "girl") {
    if (!cachedGirlBytes) {
      cachedGirlBytes = decodeBase64(GIRL_AVATAR_NOTIFICATION_BASE64);
    }
    return cachedGirlBytes;
  }
  return null;
}

export function isValidAvatarCharacter(char: string): char is AvatarCharacterId {
  return char === "boy" || char === "girl";
}
