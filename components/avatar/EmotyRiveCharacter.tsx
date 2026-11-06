/**
 * Non-native targets (web): the Rive runtime is not bundled, so EmotyAvatar always shows the
 * character illustration. The native implementation lives in EmotyRiveCharacter.native.tsx.
 */
import type { EmotyRiveCharacterProps } from './emotyAvatarConfig';

export function isRiveRuntimeAvailable(): boolean {
  return false;
}

export function EmotyRiveCharacter(_props: EmotyRiveCharacterProps): null {
  return null;
}
