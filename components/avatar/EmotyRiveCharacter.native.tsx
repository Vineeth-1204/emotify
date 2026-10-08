/**
 * The only place the app talks to the Rive runtime.
 *
 * Renders an Emoty .riv that implements EMOTY_RIVE_CONTRACT and drives it purely through
 * state machine inputs: the file is loaded once per character, and emotion / speaking /
 * reduced-motion changes are input updates on the same view, never a remount.
 *
 * Any failure (runtime missing from the build, file, artboard, state machine or input
 * mismatch) reports onUnavailable so EmotyAvatar keeps showing the illustration.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type * as RiveModule from '@rive-app/react-native';
import { EMOTY_RIVE_CONTRACT } from '@/common/avatarEmotion';
import type { EmotyRiveCharacterProps } from './emotyAvatarConfig';

type RiveRuntime = typeof RiveModule;
type RiveViewRef = RiveModule.RiveViewRef;

let runtime: RiveRuntime | null | undefined;

/** Loads the runtime on first use; null when the native module is not in this build (e.g. Expo Go). */
function loadRiveRuntime(): RiveRuntime | null {
  if (runtime === undefined) {
    try {
      runtime = require('@rive-app/react-native') as RiveRuntime;
    } catch (error) {
      if (__DEV__) console.warn('[EmotyAvatar] Rive runtime unavailable, showing the illustration.', error);
      runtime = null;
    }
  }
  return runtime;
}

export function isRiveRuntimeAvailable(): boolean {
  return loadRiveRuntime() !== null;
}

export function EmotyRiveCharacter(props: EmotyRiveCharacterProps) {
  const rive = loadRiveRuntime();
  if (!rive) return null;
  return <RiveCharacter rive={rive} {...props} />;
}

function RiveCharacter({
  rive,
  source,
  emotion,
  speaking,
  reducedMotion,
  size,
  onReady,
  onUnavailable,
}: EmotyRiveCharacterProps & { rive: RiveRuntime }) {
  const { riveFile, error } = rive.useRiveFile(source);
  const { riveViewRef, setHybridRef } = rive.useRive();

  // Latest callbacks without re-running effects when the parent re-renders
  const callbacks = useRef({ onReady, onUnavailable });
  callbacks.current = { onReady, onUnavailable };
  const failed = useRef(false);
  const fail = (reason: unknown) => {
    if (failed.current) return;
    failed.current = true;
    if (__DEV__) console.warn('[EmotyAvatar] Rive character unavailable, showing the illustration.', reason);
    callbacks.current.onUnavailable();
  };

  useEffect(() => {
    if (error) fail(error);
  }, [error]);

  // useRive reports null when the view never became ready
  useEffect(() => {
    if (riveViewRef === null) fail('Rive view did not become ready');
  }, [riveViewRef]);

  const { inputs, emotionValues } = EMOTY_RIVE_CONTRACT;
  const apply = (view: RiveViewRef | null | undefined, update: (v: RiveViewRef) => void) => {
    if (!view || failed.current) return;
    try {
      update(view);
    } catch (e) {
      fail(e);
    }
  };

  useEffect(() => {
    apply(riveViewRef, (v) => v.setNumberInputValue(inputs.emotion, emotionValues[emotion]));
  }, [riveViewRef, emotion]);

  useEffect(() => {
    apply(riveViewRef, (v) => v.setBooleanInputValue(inputs.speaking, speaking));
  }, [riveViewRef, speaking]);

  useEffect(() => {
    apply(riveViewRef, (v) => v.setBooleanInputValue(inputs.reducedMotion, reducedMotion));
  }, [riveViewRef, reducedMotion]);

  // Declared after the input effects so the first visible frame already shows the right emotion
  useEffect(() => {
    if (riveViewRef && !failed.current) callbacks.current.onReady();
  }, [riveViewRef]);

  if (!riveFile) return null;

  return (
    <View style={[styles.frame, { width: size, height: size }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <rive.RiveView
        file={riveFile}
        artboardName={EMOTY_RIVE_CONTRACT.artboard}
        stateMachineName={EMOTY_RIVE_CONTRACT.stateMachine}
        autoPlay={true}
        fit={rive.Fit.Cover}
        hybridRef={setHybridRef}
        onError={fail}
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
});
