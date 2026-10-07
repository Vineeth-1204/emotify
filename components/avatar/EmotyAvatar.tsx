import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  Animated,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
  ImageSourcePropType,
} from 'react-native';
import { useAvatar } from '@/context/AvatarContext';
import { resolveAvatarPresentationState } from '@/common/avatarPresentation';

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
  state?: AvatarState | 'neutral' | 'grounding';
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ageGroup?: '13-18' | '19-24';
  interactive?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: any;
}

// Backward compatibility alias
export type MitraAvatarProps = EmotyAvatarProps;

export const SIZE_MAP: Record<string, number> = {
  xs: 32,
  sm: 48,
  md: 80,
  lg: 140,
  xl: 180,
};

// Canonical Emoty Boy Character Illustration
export const CANONICAL_EMOTY_BOY_AVATAR: ImageSourcePropType = require('@/assets/emoty_boy_avatar.jpg');

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
 * Renders the authoritative Emoty boy character visual (assets/emoty_boy_avatar.jpg)
 * while preserving the complete AI-3 avatar architecture and 13 approved states.
 */
export const EmotyAvatar: React.FC<EmotyAvatarProps> = ({
  gender: propGender,
  state: rawState = 'idle',
  size: rawSize = 140,
  ageGroup = '13-18',
  interactive = true,
  onPress,
  accessibilityLabel,
  style,
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
  const isMale = rawGender === 'male' || rawGender === 'boy';
  const effectiveGender: 'female' | 'male' = isMale ? 'male' : 'female';

  const size = typeof rawSize === 'number' ? rawSize : (SIZE_MAP[rawSize] ?? 140);
  const state: AvatarState = resolveAvatarPresentationState({
    explicitAvatarState: rawState,
    defaultState: 'idle',
  });

  // Track image loading failure for safe fail-closed rendering
  const [imageError, setImageError] = useState(false);

  // Accessibility: Native Reduced Motion check and event listener
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
      sub?.remove?.();
    };
  }, []);

  // Animation values
  const breathAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;

  // Active animation loop controller
  useEffect(() => {
    if (reduceMotion) {
      breathAnim.setValue(1);
      bounceAnim.setValue(0);
      swayAnim.setValue(0);
      return;
    }

    let activeAnim: Animated.CompositeAnimation | null = null;

    if (state === 'breathing') {
      // 4s Inhale, 4s Exhale smooth somatic pacing (subtle 1.025 to 0.985)
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.025,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.985,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
      activeAnim.start();
    } else if (state === 'celebrating') {
      // Subtle positive elevation that gracefully settles
      Animated.sequence([
        Animated.spring(bounceAnim, {
          toValue: -6,
          tension: 70,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 0,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (state === 'thinking') {
      // Subtle contemplative pacing
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.018,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.992,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      activeAnim.start();
    } else if (state === 'listening') {
      // Attentive presence with a calm, subtle head tilt and gentle rise
      Animated.parallel([
        Animated.spring(swayAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 1.015,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (state === 'idle' || state === 'calm') {
      // Very gentle, resting companion breath
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.012,
            duration: 3200,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.99,
            duration: 3200,
            useNativeDriver: true,
          }),
        ])
      );
      activeAnim.start();
    } else {
      // Subdued / calm settling for other states
      Animated.parallel([
        Animated.timing(breathAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }

    return () => {
      activeAnim?.stop();
    };
  }, [state, reduceMotion]);

  const isHero = size >= 140;
  const aura = STATE_AURA_MAP[state] ?? STATE_AURA_MAP.idle;
  const effectiveRingWidth = isHero
    ? 2
    : size >= 48
      ? aura.ringWidth
      : Math.min(aura.ringWidth, 1.5);

  const defaultLabel = `Emoty avatar, currently in ${state} presentation state`;

  const tiltInterpolation = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isHero ? ['0deg', '1.4deg'] : ['0deg', '2.0deg'],
  });

  const innerSize = size - effectiveRingWidth * 2;
  const heroImageScale = isHero ? 1.07 : 1.0;
  const heroImageTranslateY = isHero ? size * 0.025 : 0;

  const content = (
    <View style={styles.avatarWrapper}>
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
              { scale: breathAnim },
              { translateY: bounceAnim },
              { rotate: tiltInterpolation },
            ],
          },
        ]}
      >
        {imageError ? (
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
        ) : (
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
            <Image
              source={CANONICAL_EMOTY_BOY_AVATAR}
              style={[
                styles.avatarImage,
                {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2,
                  transform: [
                    { scale: heroImageScale },
                    { translateY: heroImageTranslateY },
                  ],
                },
              ]}
              resizeMode="cover"
              onError={() => setImageError(true)}
              accessible={false}
            />
            {isHero && <View style={[styles.heroInnerRim, { borderRadius: innerSize / 2 }]} />}
          </View>
        )}
      </Animated.View>
    </View>
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

// Canonical backward compatibility export
export const MitraAvatar = EmotyAvatar;

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
