import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Animated, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import Svg, { Path, Circle, Ellipse, Defs, LinearGradient, Stop, G, Rect } from 'react-native-svg';
import { useAvatar } from '@/context/AvatarContext';

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

export interface MitraAvatarProps {
  gender?: AvatarGender;
  state?: AvatarState | 'neutral' | 'grounding';
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ageGroup?: '13-18' | '19-24';
  interactive?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: any;
}

const SIZE_MAP: Record<string, number> = {
  xs: 32,
  sm: 48,
  md: 80,
  lg: 140,
  xl: 180,
};

export const MitraAvatar: React.FC<MitraAvatarProps> = ({
  gender: propGender,
  state: rawState = 'idle',
  size: rawSize = 140,
  ageGroup = '13-18',
  interactive = true,
  onPress,
  accessibilityLabel,
  style,
}) => {
  // Gracefully fallback to context avatarGender if prop not passed, or 'female'
  let contextGender: 'female' | 'male' = 'female';
  try {
    const avatarCtx = useAvatar();
    if (avatarCtx?.avatarGender) {
      contextGender = avatarCtx.avatarGender;
    }
  } catch (e) {
    // If rendered outside AvatarProvider, fallback safely to female
    contextGender = 'female';
  }

  const rawGender = propGender || contextGender;
  const isMale = rawGender === 'male' || rawGender === 'boy';
  const effectiveGender: 'female' | 'male' = isMale ? 'male' : 'female';

  const size = typeof rawSize === 'number' ? rawSize : (SIZE_MAP[rawSize] ?? 140);
  const state: AvatarState =
    rawState === 'neutral' ? 'idle' : rawState === 'grounding' ? 'calm' : (rawState as AvatarState);

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
      // 4s Inhale, 4s Exhale
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.08,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.95,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
      activeAnim.start();
    } else if (state === 'celebrating') {
      // Upward celebratory bounce that decays
      Animated.sequence([
        Animated.spring(bounceAnim, {
          toValue: -12,
          tension: 120,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 0,
          tension: 80,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (state === 'idle' || state === 'calm') {
      // Very gentle, low-frequency natural breathing sway
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.025,
            duration: 2600,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.985,
            duration: 2600,
            useNativeDriver: true,
          }),
        ])
      );
      activeAnim.start();
    } else if (state === 'listening') {
      // Subtle alert head tilt
      Animated.spring(swayAnim, {
        toValue: 1,
        tension: 90,
        friction: 5,
        useNativeDriver: true,
      }).start();
    } else {
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

  // Color theme & clothing styling per state and gender
  const palette = useMemo(() => {
    // Warm, welcoming, neutral human skin tone
    const skinBase = '#FEE8D6';
    const skinShadow = '#F5CCA0';
    const skinBlush = '#F87171';

    // Hair colors
    const hairGirl = '#3D2314';
    const hairGirlHighlight = '#5C3822';
    const hairBoy = '#2C1810';
    const hairBoyHighlight = '#4A2D1F';

    // Clothing & Aura
    if (effectiveGender === 'female') {
      return {
        skinBase,
        skinShadow,
        skinBlush,
        hairBase: hairGirl,
        hairHighlight: hairGirlHighlight,
        shirtColor: '#6366F1', // Lavender / Indigo
        shirtCollar: '#EEF2FF',
        haloStart: '#EEF2FF',
        haloEnd: '#E0E7FF',
        haloBorder: '#C7D2FE',
        strokeColor: '#312E81',
      };
    } else {
      return {
        skinBase,
        skinShadow,
        skinBlush,
        hairBase: hairBoy,
        hairHighlight: hairBoyHighlight,
        shirtColor: '#0D9488', // Calming Teal / Emerald
        shirtCollar: '#F0FDFA',
        haloStart: '#F0FDFA',
        haloEnd: '#CCFBF1',
        haloBorder: '#99F6E4',
        strokeColor: '#134E4A',
      };
    }
  }, [effectiveGender]);

  const defaultLabel = `Mitra ${effectiveGender === 'female' ? 'Girl' : 'Boy'} avatar, currently in ${state} state`;

  const tiltInterpolation = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '3.5deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [
            { scale: breathAnim },
            { translateY: bounceAnim },
            { rotate: tiltInterpolation },
          ],
        },
        style,
      ]}
      accessible={true}
      accessibilityRole={interactive ? 'button' : 'image'}
      accessibilityLabel={accessibilityLabel || defaultLabel}
    >
      <TouchableOpacity
        activeOpacity={interactive ? 0.85 : 1}
        disabled={!interactive && !onPress}
        onPress={onPress}
        style={styles.touchable}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            {/* Skin Gradient */}
            <LinearGradient id="mitraSkinGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.skinBase} />
              <Stop offset="100%" stopColor={palette.skinShadow} />
            </LinearGradient>

            {/* Hair Gradient */}
            <LinearGradient id="mitraHairGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.hairHighlight} />
              <Stop offset="100%" stopColor={palette.hairBase} />
            </LinearGradient>

            {/* Aura Halo Background Gradient */}
            <LinearGradient id="mitraHaloGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={palette.haloStart} />
              <Stop offset="100%" stopColor={palette.haloEnd} />
            </LinearGradient>

            {/* Clothing Gradient */}
            <LinearGradient id="mitraShirtGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.shirtColor} />
              <Stop offset="100%" stopColor={palette.strokeColor} />
            </LinearGradient>
          </Defs>

          {/* Gentle Calming Halo Background Circle */}
          <Circle
            cx="50"
            cy="50"
            r="47"
            fill="url(#mitraHaloGrad)"
            stroke={palette.haloBorder}
            strokeWidth="1.5"
          />

          {/* Shoulders / Shirt */}
          <Path
            d="M20 96 C22 75 36 68 50 68 C64 68 78 75 80 96 Z"
            fill="url(#mitraShirtGrad)"
          />

          {/* Shirt Collar / Crew Neck Accent */}
          <Path
            d="M42 68 C42 74 58 74 58 68 Z"
            fill={palette.shirtCollar}
            opacity="0.9"
          />

          {/* Neck */}
          <Rect
            x="44"
            y="56"
            width="12"
            height="14"
            rx="5"
            fill="url(#mitraSkinGrad)"
          />

          {/* Neck Shadow under chin */}
          <Ellipse cx="50" cy="58" rx="7" ry="2" fill="#E2A875" opacity="0.35" />

          {/* Back Hair for Girl variant */}
          {!isMale && (
            <Path
              d="M23 44 C20 62 23 76 29 80 C32 80 34 72 34 66 C28 58 26 48 28 40 Z
                 M77 44 C80 62 77 76 71 80 C68 80 66 72 66 66 C72 58 74 48 72 40 Z"
              fill={palette.hairBase}
            />
          )}

          {/* Human Face Shape */}
          <Path
            d="M30 38 C30 24 38 18 50 18 C62 18 70 24 70 38 C70 52 62 60 50 60 C38 60 30 52 30 38 Z"
            fill="url(#mitraSkinGrad)"
          />

          {/* Soft Blushing Cheeks */}
          <Circle
            cx="37"
            cy="45"
            r="3.5"
            fill={palette.skinBlush}
            opacity={state === 'supportive' ? 0.3 : 0.45}
          />
          <Circle
            cx="63"
            cy="45"
            r="3.5"
            fill={palette.skinBlush}
            opacity={state === 'supportive' ? 0.3 : 0.45}
          />

          {/* Front Hair - Girl vs Boy Styling */}
          {isMale ? (
            // Boy: Modern neat textured short hair with gentle side-part sweep
            <G>
              <Path
                d="M28 35 C27 22 36 14 50 14 C64 14 73 22 72 35 C70 28 66 22 58 20 C48 18 36 22 31 29 C29 31 28 33 28 35 Z"
                fill="url(#mitraHairGrad)"
              />
              {/* Short sideburns */}
              <Path d="M29 33 C29 38 31 40 31 40" stroke={palette.hairBase} strokeWidth="2.5" strokeLinecap="round" />
              <Path d="M71 33 C71 38 69 40 69 40" stroke={palette.hairBase} strokeWidth="2.5" strokeLinecap="round" />
            </G>
          ) : (
            // Girl: Soft stylish gentle curved bangs and side bob strands
            <G>
              <Path
                d="M27 36 C26 22 35 14 50 14 C65 14 74 22 73 36 C71 27 64 21 54 20 C42 19 33 24 28 32 Z"
                fill="url(#mitraHairGrad)"
              />
              {/* Soft forehead strand accent */}
              <Path
                d="M32 23 C40 24 46 29 48 33 C45 30 38 27 32 28 Z"
                fill={palette.hairBase}
                opacity="0.9"
              />
              {/* Gentle side ear strands */}
              <Path d="M29 36 C28 43 31 48 31 48" stroke={palette.hairBase} strokeWidth="2.8" strokeLinecap="round" />
              <Path d="M71 36 C72 43 69 48 69 48" stroke={palette.hairBase} strokeWidth="2.8" strokeLinecap="round" />
            </G>
          )}

          {/* Human Face Features per AvatarState */}
          {renderHumanFace(state, '#27170E')}
        </Svg>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Expressive, compassionate human face expressions
function renderHumanFace(state: AvatarState, strokeColor: string) {
  switch (state) {
    case 'happy':
    case 'celebrating':
      return (
        <G>
          {/* Joyous crescent curved eyes */}
          <Path d="M36 38 C38 34 43 34 45 38" stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <Path d="M55 38 C57 34 62 34 64 38" stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          {/* Uplifted warm smile with slight open laugh */}
          <Path d="M42 47 C45 53 55 53 58 47 Z" fill="#FFFFFF" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
        </G>
      );

    case 'calm':
    case 'breathing':
      return (
        <G>
          {/* Serene resting closed eyes */}
          <Path d="M36 39 C39 42 43 42 46 39" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <Path d="M54 39 C57 42 61 42 64 39" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          {/* Gentle tranquil smile */}
          <Path d="M44 48 C47 51 53 51 56 48" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'listening':
      return (
        <G>
          {/* Attentive soft brown eyes with bright reflection */}
          <Circle cx="40" cy="38" r="3.2" fill={strokeColor} />
          <Circle cx="60" cy="38" r="3.2" fill={strokeColor} />
          <Circle cx="39" cy="37" r="1.1" fill="#FFFFFF" />
          <Circle cx="59" cy="37" r="1.1" fill="#FFFFFF" />
          {/* Soft friendly listening smile */}
          <Path d="M44 48 C47 51 53 51 56 48" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'thinking':
      return (
        <G>
          {/* One thoughtful raised eyebrow */}
          <Path d="M36 32 C39 30 44 32 46 33" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Path d="M55 33 C58 33 63 33 65 33" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {/* Thoughtful eyes looking slightly upward */}
          <Circle cx="41" cy="37" r="3" fill={strokeColor} />
          <Circle cx="61" cy="37" r="3" fill={strokeColor} />
          <Circle cx="42" cy="36" r="1" fill="#FFFFFF" />
          <Circle cx="62" cy="36" r="1" fill="#FFFFFF" />
          {/* Small gentle pensive mouth */}
          <Path d="M46 48 C49 47 53 49 55 48" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'supportive':
      // Priority 1 Safety State: Grounded, deeply reassuring, calm comforting presence
      return (
        <G>
          {/* Reassuring calm level brows */}
          <Path d="M36 34 H44" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M56 34 H64" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
          {/* Kind, warm, present eyes */}
          <Circle cx="40" cy="39" r="3" fill={strokeColor} />
          <Circle cx="60" cy="39" r="3" fill={strokeColor} />
          <Circle cx="39" cy="38" r="1" fill="#FFFFFF" />
          <Circle cx="59" cy="38" r="1" fill="#FFFFFF" />
          {/* Reassuring gentle smile */}
          <Path d="M44 48 C47 51 53 51 56 48" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'sad':
      return (
        <G>
          {/* Downward empathetic brows */}
          <Path d="M36 33 L44 36" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M64 33 L56 36" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
          {/* Compassionate gentle eyes */}
          <Circle cx="40" cy="39" r="3" fill={strokeColor} />
          <Circle cx="60" cy="39" r="3" fill={strokeColor} />
          <Circle cx="39" cy="38" r="0.9" fill="#FFFFFF" />
          <Circle cx="59" cy="38" r="0.9" fill="#FFFFFF" />
          {/* Soft empathetic mouth */}
          <Path d="M45 50 C48 48 52 48 55 50" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'worried':
      return (
        <G>
          {/* Concerned raised inner brows */}
          <Path d="M36 35 C40 33 44 36 44 36" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Path d="M64 35 C60 33 56 36 56 36" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {/* Attentive watchful eyes */}
          <Circle cx="40" cy="39" r="3.2" fill={strokeColor} />
          <Circle cx="60" cy="39" r="3.2" fill={strokeColor} />
          <Circle cx="39" cy="38" r="1" fill="#FFFFFF" />
          <Circle cx="59" cy="38" r="1" fill="#FFFFFF" />
          {/* Slightly tense small mouth */}
          <Path d="M45 49 C48 47 52 50 55 48" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'angry':
      return (
        <G>
          {/* Resolute level brows */}
          <Path d="M36 34 L44 37" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
          <Path d="M64 34 L56 37" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
          <Circle cx="40" cy="39" r="3" fill={strokeColor} />
          <Circle cx="60" cy="39" r="3" fill={strokeColor} />
          {/* Calm, firm line holding space */}
          <Path d="M44 49 H56" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        </G>
      );

    case 'tired':
      return (
        <G>
          {/* Drooping relaxed eyelids */}
          <Path d="M36 38 H44" stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" />
          <Path d="M56 38 H64" stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" />
          {/* Soft relaxed mouth */}
          <Circle cx="50" cy="48" r="2.2" fill="none" stroke={strokeColor} strokeWidth="1.8" />
        </G>
      );

    default: // idle, encouraging
      return (
        <G>
          {/* Friendly natural brows */}
          <Path d="M36 34 C39 33 43 33 45 35" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <Path d="M55 35 C57 33 61 33 64 34" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {/* Friendly bright eyes with warm reflection dots */}
          <Circle cx="40" cy="39" r="3.2" fill={strokeColor} />
          <Circle cx="60" cy="39" r="3.2" fill={strokeColor} />
          <Circle cx="39" cy="37.5" r="1.1" fill="#FFFFFF" />
          <Circle cx="59" cy="37.5" r="1.1" fill="#FFFFFF" />
          {/* Sweet friendly smile */}
          <Path d="M43 47 C46 51 54 51 57 47" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </G>
      );
  }
}

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
});
