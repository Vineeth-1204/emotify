/**
 * Emoty character configuration: the one place that says which artwork each character uses.
 *
 * Each character has
 * - `fallbackAsset`: the static illustration. Required for a character to be selectable;
 *   it is shown when Rive is unavailable (web, a build without the native module), while the
 *   .riv loads, and whenever the .riv fails. It is also what non-companion screens show.
 * - `riveAsset`: an optional .riv implementing EMOTY_RIVE_CONTRACT (common/avatarEmotion.ts).
 *   Leave it null until real artwork exists; never point it at a placeholder.
 *
 * To add a .riv: put it at assets/rive/emoty_<boy|girl>.riv and set
 *   riveAsset: require('@/assets/rive/emoty_boy.riv'),
 * Screens do not change.
 *
 * The girl character is not in the repository yet. Her reference illustration must be
 * assets/emoty_girl_avatar.jpg (1024x1024 RGB JPG, same illustration style, framing,
 * proportions and soft sky-blue backdrop as emoty_boy_avatar.jpg, head and shoulders
 * centred). Once it exists set:
 *   girl: { riveAsset: null, fallbackAsset: require('@/assets/emoty_girl_avatar.jpg') },
 * Until then the girl preference shows the boy character, as before.
 */
import type { ImageSourcePropType } from 'react-native';
import type { EmotyAvatarState } from '@/common/avatarPresentation';
import type { AvatarEmotion } from '@/common/avatarEmotion';

export type EmotyCharacterId = 'boy' | 'girl';

export interface EmotyCharacterConfig {
  /** Bundled .riv (require() result) implementing EMOTY_RIVE_CONTRACT, or null. */
  riveAsset: number | null;
  /** Static illustration; null means the character is not available yet. */
  fallbackAsset: ImageSourcePropType | null;
  /** Optional eyes-closed frame (same framing as fallbackAsset) for an occasional blink. */
  blink?: ImageSourcePropType;
  /** Optional per-state still frames (same framing); fallbackAsset is used otherwise. */
  expressions?: Partial<Record<EmotyAvatarState, ImageSourcePropType>>;
}

/** A character that is guaranteed to have a fallback illustration. */
export type ResolvedEmotyCharacter = EmotyCharacterConfig & {
  id: EmotyCharacterId;
  fallbackAsset: ImageSourcePropType;
};

// Canonical Emoty Boy Character Illustration
export const CANONICAL_EMOTY_BOY_AVATAR: ImageSourcePropType = require('@/assets/emoty_boy_avatar.jpg');

export const EMOTY_AVATAR_CONFIG: Record<EmotyCharacterId, EmotyCharacterConfig> = {
  boy: { riveAsset: null, fallbackAsset: CANONICAL_EMOTY_BOY_AVATAR },
  girl: { riveAsset: null, fallbackAsset: null },
};

/** Stored preferences use 'male' | 'female'; the avatar API also accepts 'boy' | 'girl'. */
export function toEmotyCharacterId(gender: string | null | undefined): EmotyCharacterId {
  return gender === 'male' || gender === 'boy' ? 'boy' : 'girl';
}

function resolveCharacter(id: EmotyCharacterId): ResolvedEmotyCharacter {
  const character = EMOTY_AVATAR_CONFIG[id];
  if (character.fallbackAsset) {
    return { ...character, id, fallbackAsset: character.fallbackAsset };
  }
  return { ...EMOTY_AVATAR_CONFIG.boy, id: 'boy', fallbackAsset: CANONICAL_EMOTY_BOY_AVATAR };
}

// Resolved once so renders get a stable object (no Rive file reloads on re-render).
const RESOLVED_CHARACTERS: Record<EmotyCharacterId, ResolvedEmotyCharacter> = {
  boy: resolveCharacter('boy'),
  girl: resolveCharacter('girl'),
};

/** The character to render; a character without its own illustration falls back to the boy. */
export function getEmotyCharacter(id: EmotyCharacterId): ResolvedEmotyCharacter {
  return RESOLVED_CHARACTERS[id];
}

/** Props of the Rive renderer (EmotyRiveCharacter); only EmotyAvatar renders it. */
export interface EmotyRiveCharacterProps {
  source: number;
  emotion: AvatarEmotion;
  speaking: boolean;
  reducedMotion: boolean;
  size: number;
  /** The file loaded, the view is ready and the current inputs are applied. */
  onReady: () => void;
  /** Load, contract or runtime failure: the caller shows the illustration instead. */
  onUnavailable: () => void;
}
