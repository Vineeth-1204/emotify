import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import Svg, { Path, Circle, Ellipse, Defs, LinearGradient, Stop, G } from 'react-native-svg';

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

export interface MitraAvatarProps {
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
  state: rawState = 'idle',
  size: rawSize = 140,
  ageGroup = '13-18',
  interactive = true,
  onPress,
  accessibilityLabel,
  style
}) => {
  const size = typeof rawSize === 'number' ? rawSize : (SIZE_MAP[rawSize] ?? 140);
  const state: AvatarState = rawState === 'neutral' ? 'idle' : rawState === 'grounding' ? 'calm' : (rawState as AvatarState);

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
      // 4s Inhale (expand to 1.12), 4s Exhale (contract to 0.94)
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.12,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.94,
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
          toValue: -14,
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
      // Very gentle, low-frequency natural breathing sway (cheapest animation)
      activeAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.03,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0.98,
            duration: 2500,
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
      // Steady hold for worried, sad, angry, supportive
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

  // Color theme per state
  const getAvatarPalette = () => {
    switch (state) {
      case 'happy':
      case 'celebrating':
        return {
          bodyGradStart: '#FEF08A',
          bodyGradEnd: '#FACC15',
          bodyStroke: '#CA8A04',
          cheekColor: '#F43F5E',
          accentColor: '#EAB308',
        };
      case 'calm':
      case 'breathing':
        return {
          bodyGradStart: '#E0F2FE',
          bodyGradEnd: '#BAE6FD',
          bodyStroke: '#0284C7',
          cheekColor: '#38BDF8',
          accentColor: '#0EA5E9',
        };
      case 'sad':
      case 'tired':
        return {
          bodyGradStart: '#E2E8F0',
          bodyGradEnd: '#CBD5E1',
          bodyStroke: '#64748B',
          cheekColor: '#94A3B8',
          accentColor: '#475569',
        };
      case 'worried':
        return {
          bodyGradStart: '#FFEDD5',
          bodyGradEnd: '#FED7AA',
          bodyStroke: '#EA580C',
          cheekColor: '#FB923C',
          accentColor: '#F97316',
        };
      case 'angry':
        return {
          bodyGradStart: '#FFE4E6',
          bodyGradEnd: '#FECDD3',
          bodyStroke: '#E11D48',
          cheekColor: '#FB7185',
          accentColor: '#F43F5E',
        };
      case 'supportive':
        // Serious, grounded, calm support palette — no loud saturation
        return {
          bodyGradStart: '#F0FDF4',
          bodyGradEnd: '#DCFCE7',
          bodyStroke: '#15803D',
          cheekColor: '#86EFAC',
          accentColor: '#16A34A',
        };
      default: // idle, listening, thinking, encouraging
        return {
          bodyGradStart: '#FEF9C3',
          bodyGradEnd: '#FDE047',
          bodyStroke: '#D97706',
          cheekColor: '#FB7185',
          accentColor: '#F59E0B',
        };
    }
  };

  const palette = getAvatarPalette();

  // Spoken accessibility description
  const defaultLabel = `Mitra avatar, currently in ${state} state`;

  const tiltInterpolation = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '4deg'],
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
            <LinearGradient id="mitraBodyGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.bodyGradStart} />
              <Stop offset="100%" stopColor={palette.bodyGradEnd} />
            </LinearGradient>
            <LinearGradient id="mitraEarGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={palette.bodyGradStart} />
              <Stop offset="100%" stopColor={palette.accentColor} />
            </LinearGradient>
          </Defs>

          {/* Gentle Shadow */}
          <Ellipse cx="50" cy="94" rx="28" ry="5" fill="#000000" opacity="0.08" />

          {/* Mitra Soft Rounded Ears / Head Tufts */}
          <Circle cx="30" cy="22" r="8" fill="url(#mitraEarGrad)" stroke={palette.bodyStroke} strokeWidth="2.5" />
          <Circle cx="70" cy="22" r="8" fill="url(#mitraEarGrad)" stroke={palette.bodyStroke} strokeWidth="2.5" />
          <Circle cx="30" cy="22" r="4" fill="#FFFFFF" opacity="0.3" />
          <Circle cx="70" cy="22" r="4" fill="#FFFFFF" opacity="0.3" />

          {/* Mitra Organic Rounded Silhouette */}
          <Path
            d="M50 18C30 18 20 32 20 54C20 74 32 88 50 88C68 88 80 74 80 54C80 32 70 18 50 18Z"
            fill="url(#mitraBodyGrad)"
            stroke={palette.bodyStroke}
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* Chest Light Reflection */}
          <Ellipse cx="50" cy="30" rx="14" ry="7" fill="#FFFFFF" opacity="0.35" />

          {/* Soft Blushing Cheeks */}
          <Circle cx="32" cy="58" r="5" fill={palette.cheekColor} opacity={state === 'supportive' ? 0.2 : 0.45} />
          <Circle cx="68" cy="58" r="5" fill={palette.cheekColor} opacity={state === 'supportive' ? 0.2 : 0.45} />

          {/* Facial Features (Eyes, Brows, Mouth) dynamically per state */}
          {renderFace(state, palette, ageGroup)}

          {/* Soft Hands / Body accents */}
          {renderHands(state, palette)}
        </Svg>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Sub-renderer for facial expressions
function renderFace(state: AvatarState, palette: any, ageGroup: '13-18' | '19-24') {
  const isTeen = ageGroup === '13-18';
  const strokeColor = palette.bodyStroke;

  switch (state) {
    case 'happy':
    case 'celebrating':
      return (
        <G>
          {/* Uplifted joyous curved eyes */}
          <Path d="M34 46C37 42 42 42 45 46" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" fill="none" />
          <Path d="M55 46C58 42 63 42 66 46" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* Big happy smile */}
          <Path d="M39 58C43 68 57 68 61 58" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" fill="#FFFFFF" />
        </G>
      );

    case 'calm':
    case 'breathing':
      return (
        <G>
          {/* Resting peaceful eyes */}
          <Path d="M34 48C37 52 43 52 46 48" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <Path d="M54 48C57 52 63 52 66 48" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" fill="none" />
          {/* Gentle serene closed smile */}
          <Path d="M43 60C47 64 53 64 57 60" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'sad':
      return (
        <G>
          {/* Downward tilted gentle brows */}
          <Path d="M34 40L44 43" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M66 40L56 43" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
          {/* Gentle compassionate eyes */}
          <Circle cx="39" cy="48" r="3.5" fill={strokeColor} />
          <Circle cx="61" cy="48" r="3.5" fill={strokeColor} />
          <Circle cx="38" cy="46" r="1.2" fill="#FFFFFF" />
          <Circle cx="60" cy="46" r="1.2" fill="#FFFFFF" />
          {/* Soft downturned mouth */}
          <Path d="M43 64C47 60 53 60 57 64" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'worried':
      return (
        <G>
          {/* Concerned raised inner brows */}
          <Path d="M35 41Q41 38 45 42" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <Path d="M65 41Q59 38 55 42" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {/* Attentive watchful round eyes */}
          <Circle cx="40" cy="48" r="4" fill={strokeColor} />
          <Circle cx="60" cy="48" r="4" fill={strokeColor} />
          <Circle cx="39" cy="46" r="1.4" fill="#FFFFFF" />
          <Circle cx="59" cy="46" r="1.4" fill="#FFFFFF" />
          {/* Slightly wavy tense mouth */}
          <Path d="M43 62Q47 59 50 62Q53 65 57 62" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'angry':
      return (
        <G>
          {/* Slanted resolute brows */}
          <Path d="M33 39L45 44" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          <Path d="M67 39L55 44" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          {/* Firm eyes */}
          <Circle cx="40" cy="48" r="3.5" fill={strokeColor} />
          <Circle cx="60" cy="48" r="3.5" fill={strokeColor} />
          {/* Firm straight mouth */}
          <Path d="M42 62H58" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" />
        </G>
      );

    case 'tired':
      return (
        <G>
          {/* Drooping heavy eyelids */}
          <Path d="M34 47H46" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          <Path d="M54 47H66" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          {/* Small relaxed mouth */}
          <Circle cx="50" cy="62" r="3" fill="none" stroke={strokeColor} strokeWidth="2.5" />
        </G>
      );

    case 'thinking':
      return (
        <G>
          {/* One brow raised */}
          <Path d="M34 38Q40 37 45 40" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <Path d="M55 41Q60 41 66 41" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {/* Eyes looking up and to the right */}
          <Circle cx="42" cy="45" r="3.5" fill={strokeColor} />
          <Circle cx="62" cy="45" r="3.5" fill={strokeColor} />
          <Circle cx="43" cy="44" r="1.2" fill="#FFFFFF" />
          <Circle cx="63" cy="44" r="1.2" fill="#FFFFFF" />
          {/* Pensive small mouth */}
          <Path d="M47 62Q52 61 56 63" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'listening':
      return (
        <G>
          {/* Soft open welcoming eyes */}
          <Circle cx="39" cy="47" r="3.8" fill={strokeColor} />
          <Circle cx="61" cy="47" r="3.8" fill={strokeColor} />
          <Circle cx="38" cy="45" r="1.5" fill="#FFFFFF" />
          <Circle cx="60" cy="45" r="1.5" fill="#FFFFFF" />
          {/* Gentle attentive smile */}
          <Path d="M44 60C47 63 53 63 56 60" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </G>
      );

    case 'supportive':
      // Priority 1 Safety State: Steady, grounded, calm, deeply supportive
      return (
        <G>
          {/* Calm, level reassuring brows */}
          <Path d="M34 42H44" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M56 42H66" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
          {/* Steady, kind, present eyes */}
          <Circle cx="39" cy="48" r="3.5" fill={strokeColor} />
          <Circle cx="61" cy="48" r="3.5" fill={strokeColor} />
          <Circle cx="38" cy="46" r="1.3" fill="#FFFFFF" />
          <Circle cx="60" cy="46" r="1.3" fill="#FFFFFF" />
          {/* Reassuring calm line */}
          <Path d="M43 61H57" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
        </G>
      );

    default: // idle / encouraging
      return (
        <G>
          {/* Friendly standard open eyes */}
          <Circle cx="39" cy="47" r="3.8" fill={strokeColor} />
          <Circle cx="61" cy="47" r="3.8" fill={strokeColor} />
          <Circle cx="38" cy="45" r="1.4" fill="#FFFFFF" />
          <Circle cx="60" cy="45" r="1.4" fill="#FFFFFF" />
          {/* Friendly soft smile */}
          <Path d="M42 59C46 64 54 64 58 59" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </G>
      );
  }
}

// Sub-renderer for hands / posture
function renderHands(state: AvatarState, palette: any) {
  const strokeColor = palette.bodyStroke;
  const fillColor = palette.bodyGradEnd;

  if (state === 'encouraging') {
    // Both small hands placed warmly on chest
    return (
      <G>
        <Circle cx="40" cy="74" r="5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
        <Circle cx="60" cy="74" r="5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
      </G>
    );
  }

  if (state === 'worried') {
    // Hands tucked close inward
    return (
      <G>
        <Circle cx="36" cy="72" r="4.5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
        <Circle cx="64" cy="72" r="4.5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
      </G>
    );
  }

  if (state === 'celebrating') {
    // Hands raised joyfully
    return (
      <G>
        <Circle cx="20" cy="48" r="5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
        <Circle cx="80" cy="48" r="5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
      </G>
    );
  }

  // Normal resting hands at side
  return (
    <G>
      <Circle cx="26" cy="72" r="4.5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
      <Circle cx="74" cy="72" r="4.5" fill={fillColor} stroke={strokeColor} strokeWidth="2" />
    </G>
  );
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
