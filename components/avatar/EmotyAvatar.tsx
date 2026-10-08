import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
} from 'react-native';
import { useAvatar } from '@/context/AvatarContext';
import { resolveAvatarPresentationState } from '@/common/avatarPresentation';
import { AVATAR_EMOTION_STATE, avatarEmotionForState, type AvatarEmotion } from '@/common/avatarEmotion';
import { getEmotyCharacter, toEmotyCharacterId } from './emotyAvatarConfig';
import { EmotyRiveCharacter, isRiveRuntimeAvailable } from './EmotyRiveCharacter';

export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'calm'
  | 'happy'
  | 'sad'
  | 'worried'
  | 'angry'
  | 'tired'
  | 'breathing'
  | 'encouraging'
  | 'celebrating'
  | 'supportive';

export type AvatarGender = 'female' | 'male' | 'girl' | 'boy';

export interface EmotyAvatarProps {
  gender?: AvatarGender;
  /** Presentation state, normally from getEmotyPresence(); drives aura and the illustration. */
  state?: AvatarState | 'neutral' | 'grounding';
  /** Animated-character emotion; derived from `state` when omitted. */
  emotion?: AvatarEmotion;
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ageGroup?: '13-18' | '19-24';
  interactive?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: any;
  /** True while Emoty is actively speaking (e.g. voice playback): shows a soft halo pulse. */
  speaking?: boolean;
  /**
   * Companion presence: render the animated (Rive) character when the character has one.
   * Pickers, lists and decorative uses leave this off and always show the illustration.
   */
  live?: boolean;
}


export const SIZE_MAP: Record<string, number> = {
  xs: 32,
  sm: 48,
  md: 80,
  lg: 140,
  xl: 180,
};

export interface StateAuraConfig {
  ringColor: string;
  ringWidth: number;
  shadowColor: string;
  shadowOpacity: number;
}

export const STATE_AURA_MAP: Record<AvatarState, StateAuraConfig> = {
  calm: {
    ringColor: '#67E8F9', // Soothing sky cyan border
    ringWidth: 2,
    shadowColor: '#06B6D4',
    shadowOpacity: 0.25,
  },
  happy: {
    ringColor: '#FCD34D', // Warm friendly sunshine gold
    ringWidth: 2,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
  },
  listening: {
    ringColor: '#93C5FD', // Soft listening periwinkle
    ringWidth: 2,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.28,
  },
  thinking: {
    ringColor: '#C4B5FD', // Contemplative lavender
    ringWidth: 2,
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.25,
  },
  breathing: {
    ringColor: '#5EEAD4', // Calming breathwork mint
    ringWidth: 2.5,
    shadowColor: '#14B8A6',
    shadowOpacity: 0.32,
  },
  encouraging: {
    ringColor: '#86EFAC', // Refreshing uplifting leaf green
    ringWidth: 2,
    shadowColor: '#22C55E',
    shadowOpacity: 0.25,
  },
  celebrating: {
    ringColor: '#F472B6', // Joyful sparkling rose
    ringWidth: 2.5,
    shadowColor: '#EC4899',
    shadowOpacity: 0.35,
  },
  supportive: {
    ringColor: '#A78BFA', // Grounded protective violet
    ringWidth: 2.5,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
  },
  worried: {
    ringColor: '#FDBA74', // Gentle warm apricot
    ringWidth: 1.5,
    shadowColor: '#FB923C',
    shadowOpacity: 0.2,
  },
  sad: {
    ringColor: '#CBD5E1', // Subdued soft slate
    ringWidth: 1.5,
    shadowColor: '#64748B',
    shadowOpacity: 0.15,
  },
  angry: {
    ringColor: '#FCA5A5', // De-escalating soft coral
    ringWidth: 2,
    shadowColor: '#EF4444',
    shadowOpacity: 0.22,
  },
  tired: {
    ringColor: '#E2E8F0', // Soft quiet mist
    ringWidth: 1.5,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
  },
  idle: {
    ringColor: '#E0E7FF', // Clean gentle neutral lavender border
    ringWidth: 1.5,
    shadowColor: '#6366F1',
    shadowOpacity: 0.18,
  },
};

/**
 * EmotyAvatar — Canonical Production Visual Component.
 *
 * Renders the student's Emoty character (artwork from emotyAvatarConfig.ts) in one of the
 * 13 approved presentation states. With `live`, a character that has a .riv is rendered by
 * the Rive state machine (EmotyRiveCharacter), driven by the 5-emotion contract in
 * common/avatarEmotion.ts; the illustration stays as the loading and failure fallback.
 */
export const EmotyAvatar: React.FC<EmotyAvatarProps> = ({
  gender: propGender,
  state: propState,
  emotion: propEmotion,
  size: rawSize = 140,
  ageGroup = '13-18',
  interactive = true,
  onPress,
  accessibilityLabel,
  style,
  speaking = false,
  live = false,
}) => {
  // Gracefully read context if available without crashing outside provider
  let contextGender: 'female' | 'male' = 'female';
  try {
    const avatarCtx = useAvatar();
    if (avatarCtx?.avatarGender) {
      contextGender = avatarCtx.avatarGender;
    }
  } catch (e) {
    contextGender = 'female';
  }

  const rawGender = propGender || contextGender;
  const effectiveGender = toEmotyCharacterId(rawGender);

  const size = typeof rawSize === 'number' ? rawSize : (SIZE_MAP[rawSize] ?? 140);
  const rawState = propState ?? (propEmotion ? AVATAR_EMOTION_STATE[propEmotion] : 'idle');
  const state: AvatarState = resolveAvatarPresentationState({
    explicitAvatarState: rawState,
    defaultState: 'idle',
  });
  const emotion: AvatarEmotion = propEmotion ?? avatarEmotionForState(state);

  const character = getEmotyCharacter(effectiveGender);
  const imageSource = character.expressions?.[state] ?? character.fallbackAsset;

  // Rive character: only for companion presence, only when the character has a .riv and the
  // runtime is in this build. Status is tracked per source so switching character starts over.
  const riveSource = live && character.riveAsset != null && isRiveRuntimeAvailable() ? character.riveAsset : null;
  const [riveLoad, setRiveLoad] = useState<{ source: number | null; status: 'loading' | 'ready' | 'failed' }>({
    source: null,
    status: 'loading',
  });
  const riveStatus = riveLoad.source === riveSource ? riveLoad.status : 'loading';
  const showRive = riveSource !== null && riveStatus !== 'failed';
  const riveReady = showRive && riveStatus === 'ready';
  const handleRiveReady = useCallback(() => setRiveLoad({ source: riveSource, status: 'ready' }), [riveSource]);
  const handleRiveUnavailable = useCallback(() => setRiveLoad({ source: riveSource, status: 'failed' }), [riveSource]);

  // Track image loading failure for safe fail-closed rendering
  const [imageError, setImageError] = useState(false);

  // Accessibility: Native Reduced Motion check and event listener
  const [reduceMotion, setReduceMotion] = useState(false);

  // Gentle entrance (settle-in) once we know whether motion is allowed
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!isMounted) return;
      setReduceMotion(enabled);
      if (enabled) {
        enterAnim.setValue(1);
      } else {
        Animated.timing(enterAnim, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
      sub?.remove?.();
    };
  }, []);

  // Animation values (all at rest = no movement)
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const liftAnim = useRef(new Animated.Value(0)).current; // translateY in px
  const tiltAnim = useRef(new Animated.Value(0)).current; // rotation in degrees
  const haloAnim = useRef(new Animated.Value(0)).current; // speaking halo opacity

  // Movement scales with size so small avatars stay calm
  const amp = Math.max(1, Math.min(4, size * 0.03));

  // Per-state motion: a short intro gesture, a few ambient cycles, then settle to rest.
  // A ready Rive character animates itself, so the frame stays still.
  useEffect(() => {
    if (reduceMotion || riveReady) {
      scaleAnim.setValue(1);
      liftAnim.setValue(0);
      tiltAnim.setValue(0);
      return;
    }

    const plan = buildStateMotion(state, { scale: scaleAnim, lift: liftAnim, tilt: tiltAnim }, amp);
    const steps: Animated.CompositeAnimation[] = [plan.intro];
    if (plan.ambient) {
      steps.push(Animated.loop(plan.ambient, { iterations: plan.cycles }));
    }
    const motion = Animated.sequence(steps);
    motion.start(({ finished }) => {
      if (finished && plan.cycles !== -1) {
        settleToRest({ scale: scaleAnim, lift: liftAnim, tilt: tiltAnim }, plan.keepTilt).start();
      }
    });

    return () => motion.stop();
  }, [state, reduceMotion, amp, riveReady]);

  // Speaking: soft halo pulse only while Emoty is actively speaking
  useEffect(() => {
    if (!speaking) {
      Animated.timing(haloAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    if (reduceMotion) {
      haloAnim.setValue(0.6);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 0.85, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 0.3, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [speaking, reduceMotion]);

  // Occasional natural blink, only when the illustration provides an eyes-closed frame
  const blinkAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!character.blink || reduceMotion) return;
    if (riveReady) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const scheduleBlink = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.delay(90),
          Animated.timing(blinkAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        ]).start(() => !cancelled && scheduleBlink());
      }, 3500 + Math.random() * 3500);
    };
    scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [character.blink, reduceMotion, riveReady]);

  const isHero = size >= 140;
  const aura = STATE_AURA_MAP[state] ?? STATE_AURA_MAP.idle;
  const effectiveRingWidth = isHero
    ? 2
    : size >= 48
      ? aura.ringWidth
      : Math.min(aura.ringWidth, 1.5);

  const defaultLabel = `Emoty avatar, currently in ${state} presentation state`;

  const tiltInterpolation = tiltAnim.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-10deg', '10deg'],
  });
  const enterScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const enterOpacity = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const innerSize = size - effectiveRingWidth * 2;
  const heroImageScale = isHero ? 1.07 : 1.0;
  const heroImageTranslateY = isHero ? size * 0.025 : 0;
  const imageTransform = [{ scale: heroImageScale }, { translateY: heroImageTranslateY }];

  const content = (
    <Animated.View style={[styles.avatarWrapper, { opacity: enterOpacity }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.speakingHalo,
          {
            width: size + 10,
            height: size + 10,
            borderRadius: (size + 10) / 2,
            borderColor: aura.ringColor,
            opacity: haloAnim,
          },
        ]}
      />
      {isHero && (
        <View
          style={[
            styles.heroAmbientHalo,
            {
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              backgroundColor: aura.ringColor + '0D',
            },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.avatarCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: effectiveRingWidth,
            borderColor: isHero ? aura.ringColor + 'E6' : aura.ringColor,
            shadowColor: aura.shadowColor,
            shadowOpacity: isHero ? aura.shadowOpacity * 0.8 : aura.shadowOpacity,
            shadowRadius: isHero ? 14 : 6,
            shadowOffset: isHero ? { width: 0, height: 4 } : { width: 0, height: 2 },
            elevation: isHero ? 5 : 3,
            transform: [
              { translateY: liftAnim },
              { scale: Animated.multiply(scaleAnim, enterScale) },
              { rotate: tiltInterpolation },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.imageClipContainer,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
            },
          ]}
        >
          {!riveReady && imageError && (
            <View
              style={[
                styles.fallbackContainer,
                {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2,
                },
              ]}
            >
              <Text style={[styles.fallbackInitial, { fontSize: Math.max(size * 0.4, 12) }]}>
                E
              </Text>
            </View>
          )}
          {!riveReady && !imageError && (
            <Image
              source={imageSource}
              style={[
                styles.avatarImage,
                {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2,
                  transform: imageTransform,
                },
              ]}
              resizeMode="cover"
              onError={() => setImageError(true)}
              accessible={false}
            />
          )}
          {character.blink && !riveReady && (
            <Animated.Image
              source={character.blink}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2,
                  opacity: blinkAnim,
                  transform: imageTransform,
                },
              ]}
              resizeMode="cover"
              accessible={false}
            />
          )}
          {showRive && riveSource !== null && (
            // Same framing as the illustration; hidden until the first emotion is applied
            <View
              key={riveSource}
              style={[StyleSheet.absoluteFillObject, styles.riveLayer, { opacity: riveReady ? 1 : 0, transform: imageTransform }]}
              pointerEvents="none"
            >
              <EmotyRiveCharacter
                source={riveSource}
                emotion={emotion}
                speaking={speaking}
                reducedMotion={reduceMotion}
                size={innerSize}
                onReady={handleRiveReady}
                onUnavailable={handleRiveUnavailable}
              />
            </View>
          )}
          {isHero && <View style={[styles.heroInnerRim, { borderRadius: innerSize / 2 }]} />}
        </View>
      </Animated.View>
    </Animated.View>
  );

  return (
    <View
      style={[styles.container, { width: size, height: size }, style]}
      accessible={true}
      accessibilityRole={interactive && onPress ? 'button' : 'image'}
      accessibilityLabel={accessibilityLabel || defaultLabel}
    >
      {interactive && onPress ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={styles.touchable}
        >
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmbientHalo: {
    position: 'absolute',
  },
  speakingHalo: {
    position: 'absolute',
    borderWidth: 3,
  },
  avatarCircle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2FE', // Soft matching sky base matching image tone
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  imageClipContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riveLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    backgroundColor: '#E0F2FE',
  },
  heroInnerRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    pointerEvents: 'none',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0E7FF',
  },
  fallbackInitial: {
    fontWeight: '700',
    color: '#4F46E5',
  },
});

interface MotionValues {
  scale: Animated.Value;
  lift: Animated.Value;
  tilt: Animated.Value;
}

interface StateMotion {
  intro: Animated.CompositeAnimation;
  ambient: Animated.CompositeAnimation | null;
  /** Ambient repetitions before settling; -1 = for as long as the state lasts. */
  cycles: number;
  /** Keep the current lean when settling (listening). */
  keepTilt?: boolean;
}

const ease = Easing.inOut(Easing.sin);

function to(value: Animated.Value, toValue: number, duration: number) {
  return Animated.timing(value, { toValue, duration, easing: ease, useNativeDriver: true });
}

function springTo(value: Animated.Value, toValue: number) {
  return Animated.spring(value, { toValue, tension: 70, friction: 7, useNativeDriver: true });
}

function settleToRest(v: MotionValues, keepTilt = false) {
  const moves = [to(v.scale, 1, 600), to(v.lift, 0, 600)];
  if (!keepTilt) moves.push(to(v.tilt, 0, 600));
  return Animated.parallel(moves);
}

/** Calm float: a slow rise with a barely-there breath, then back down. */
function floatCycle(v: MotionValues, amp: number, period: number) {
  return Animated.sequence([
    Animated.parallel([to(v.lift, -amp, period), to(v.scale, 1.02, period)]),
    Animated.parallel([to(v.lift, 0, period), to(v.scale, 1, period)]),
  ]);
}

/** Restrained breath with no vertical movement (supportive / low-energy states). */
function quietBreath(v: MotionValues, period: number) {
  return Animated.sequence([to(v.scale, 1.015, period), to(v.scale, 1, period)]);
}

export function buildStateMotion(state: AvatarState, v: MotionValues, amp: number): StateMotion {
  const reset = (keepTilt = false) => settleToRest(v, keepTilt);

  switch (state) {
    case 'happy':
      // Greeting: settle in, then a small friendly wave
      return {
        intro: Animated.sequence([
          reset(),
          Animated.parallel([springTo(v.lift, -amp * 1.5), springTo(v.scale, 1.04)]),
          Animated.parallel([springTo(v.lift, 0), springTo(v.scale, 1)]),
          to(v.tilt, 3, 240),
          to(v.tilt, -2, 240),
          to(v.tilt, 0, 240),
        ]),
        ambient: floatCycle(v, amp, 3200),
        cycles: 3,
      };
    case 'encouraging':
      // Two small nods
      return {
        intro: Animated.sequence([
          reset(),
          to(v.lift, -amp * 1.4, 180),
          to(v.lift, 0, 220),
          to(v.lift, -amp, 160),
          to(v.lift, 0, 240),
        ]),
        ambient: floatCycle(v, amp, 3200),
        cycles: 3,
      };
    case 'celebrating':
      // One happy hop, a smaller echo, then calm
      return {
        intro: Animated.sequence([
          reset(),
          Animated.parallel([springTo(v.lift, -amp * 2), to(v.scale, 1.04, 220)]),
          Animated.parallel([springTo(v.lift, 0), to(v.scale, 1, 260)]),
          springTo(v.lift, -amp),
          springTo(v.lift, 0),
        ]),
        ambient: floatCycle(v, amp, 3000),
        cycles: 2,
      };
    case 'listening':
      // Attentive lean that stays while listening
      return {
        intro: Animated.sequence([reset(), Animated.parallel([springTo(v.tilt, 2), to(v.scale, 1.015, 400)])]),
        ambient: floatCycle(v, amp * 0.6, 3600),
        cycles: 2,
        keepTilt: true,
      };
    case 'thinking':
      // Slow contemplative sway, only while thinking
      return {
        intro: reset(),
        ambient: Animated.sequence([
          Animated.parallel([to(v.tilt, 1.5, 1600), to(v.scale, 1.02, 1600)]),
          Animated.parallel([to(v.tilt, -1.5, 1600), to(v.scale, 1, 1600)]),
        ]),
        cycles: -1,
      };
    case 'breathing':
      // Somatic pacing: 4s in, 4s out, for the whole exercise
      return {
        intro: reset(),
        ambient: Animated.sequence([to(v.scale, 1.025, 4000), to(v.scale, 0.985, 4000)]),
        cycles: -1,
      };
    case 'supportive':
      return { intro: reset(), ambient: quietBreath(v, 2600), cycles: 3 };
    case 'sad':
    case 'worried':
    case 'tired':
    case 'angry':
      return { intro: reset(), ambient: quietBreath(v, 2800), cycles: 2 };
    case 'idle':
    case 'calm':
    default:
      return { intro: reset(), ambient: floatCycle(v, amp, 3400), cycles: 4 };
  }
}
