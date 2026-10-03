import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  Dimensions,
} from "react-native";
import Svg, {
  Path,
  Circle,
  Rect,
  G,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { JPMRStep } from "./types";
import { Theme } from "@/constants/Theme";
import { Colors } from "@/constants/Colors";

const { width } = Dimensions.get("window");

interface JPMRStepIllustrationProps {
  step: JPMRStep;
  isTensing: boolean;
  style?: any;
}

export const JPMRStepIllustration: React.FC<JPMRStepIllustrationProps> = ({
  step,
  isTensing,
  style,
}) => {
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Check reduced motion accessibility
  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setReduceMotion(enabled);
      })
      .catch(() => {});

    const listener = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (enabled) => {
        if (isMounted) setReduceMotion(enabled);
      }
    );

    return () => {
      isMounted = false;
      listener?.remove?.();
    };
  }, []);

  // Pulse animation for target muscle group (disabled when reduceMotion is enabled)
  useEffect(() => {
    if (reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: isTensing ? 1.15 : 1.08,
          duration: isTensing ? 800 : 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: isTensing ? 800 : 1200,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [reduceMotion, isTensing, step.focusArea]);

  const activeColor = isTensing ? "#F43F5E" : "#10B981";
  const activeGlow = isTensing ? "rgba(244, 63, 94, 0.4)" : "rgba(16, 185, 129, 0.35)";
  const baseSilhouetteColor = "#334155";

  // Anatomical SVG rendering for the 15 focus areas
  const renderAnatomySvg = () => {
    const isTarget = (areas: string[]) => areas.includes(step.focusArea);

    const headColor = isTarget(["face_jaw", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const neckColor = isTarget(["neck", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const shouldersColor = isTarget(["shoulders", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const chestColor = isTarget(["chest", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const stomachColor = isTarget(["stomach", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const backColor = isTarget(["back", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const upperArmsColor = isTarget(["upper_arms", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const forearmsColor = isTarget(["forearms", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const handsColor = isTarget(["hands", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const thighsColor = isTarget(["thighs", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const calvesColor = isTarget(["calves", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    const feetColor = isTarget(["feet", "intro", "full_body"])
      ? activeColor
      : baseSilhouetteColor;

    return (
      <Svg width={110} height={150} viewBox="0 0 110 150">
        <Defs>
          <LinearGradient id="jpmrAura" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={activeColor} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={activeColor} stopOpacity={0.0} />
          </LinearGradient>
        </Defs>

        {/* Ambient aura when reflection or full body */}
        {(step.focusArea === "reflection" || step.focusArea === "full_body" || step.focusArea === "intro") && (
          <Circle cx={55} cy={75} r={50} fill="url(#jpmrAura)" />
        )}

        <G>
          {/* Head & Face */}
          <Circle
            cx={55}
            cy={22}
            r={13}
            fill={headColor}
            stroke={isTarget(["face_jaw"]) ? activeColor : "#475569"}
            strokeWidth={isTarget(["face_jaw"]) ? 2.5 : 1}
          />

          {/* Neck */}
          <Rect
            x={52}
            y={35}
            width={6}
            height={8}
            rx={2}
            fill={neckColor}
          />

          {/* Shoulders / Trapezius */}
          <Path
            d="M34 45 C42 41 68 41 76 45 L74 53 L36 53 Z"
            fill={shouldersColor}
            stroke={isTarget(["shoulders"]) ? activeColor : "none"}
            strokeWidth={isTarget(["shoulders"]) ? 2 : 0}
          />

          {/* Chest & Torso */}
          <Rect
            x={39}
            y={52}
            width={32}
            height={20}
            rx={4}
            fill={chestColor}
            stroke={isTarget(["chest"]) ? activeColor : "none"}
            strokeWidth={isTarget(["chest"]) ? 2 : 0}
          />

          {/* Stomach & Abdomen */}
          <Rect
            x={41}
            y={71}
            width={28}
            height={16}
            rx={3}
            fill={stomachColor}
            stroke={isTarget(["stomach", "back"]) ? activeColor : "none"}
            strokeWidth={isTarget(["stomach", "back"]) ? 2 : 0}
          />

          {/* Upper Arms */}
          <Rect
            x={26}
            y={48}
            width={9}
            height={18}
            rx={4}
            fill={upperArmsColor}
          />
          <Rect
            x={75}
            y={48}
            width={9}
            height={18}
            rx={4}
            fill={upperArmsColor}
          />

          {/* Forearms */}
          <Rect
            x={24}
            y={68}
            width={8}
            height={18}
            rx={3}
            fill={forearmsColor}
          />
          <Rect
            x={78}
            y={68}
            width={8}
            height={18}
            rx={3}
            fill={forearmsColor}
          />

          {/* Hands & Fists */}
          <Circle
            cx={28}
            cy={90}
            r={6}
            fill={handsColor}
            stroke={isTarget(["hands"]) ? activeColor : "none"}
            strokeWidth={isTarget(["hands"]) ? 2 : 0}
          />
          <Circle
            cx={82}
            cy={90}
            r={6}
            fill={handsColor}
            stroke={isTarget(["hands"]) ? activeColor : "none"}
            strokeWidth={isTarget(["hands"]) ? 2 : 0}
          />

          {/* Thighs */}
          <Rect
            x={42}
            y={89}
            width={11}
            height={24}
            rx={4}
            fill={thighsColor}
          />
          <Rect
            x={57}
            y={89}
            width={11}
            height={24}
            rx={4}
            fill={thighsColor}
          />

          {/* Calves */}
          <Rect
            x={43}
            y={115}
            width={9}
            height={20}
            rx={3}
            fill={calvesColor}
          />
          <Rect
            x={58}
            y={115}
            width={9}
            height={20}
            rx={3}
            fill={calvesColor}
          />

          {/* Feet */}
          <Rect
            x={39}
            y={136}
            width={14}
            height={6}
            rx={2}
            fill={feetColor}
            stroke={isTarget(["feet"]) ? activeColor : "none"}
            strokeWidth={isTarget(["feet"]) ? 1.5 : 0}
          />
          <Rect
            x={57}
            y={136}
            width={14}
            height={6}
            rx={2}
            fill={feetColor}
            stroke={isTarget(["feet"]) ? activeColor : "none"}
            strokeWidth={isTarget(["feet"]) ? 1.5 : 0}
          />
        </G>
      </Svg>
    );
  };

  const a11yText = `Demonstration illustration for ${step.title}. Currently ${
    isTensing ? "tensing" : "releasing"
  } ${step.muscleGroup}. Action: ${step.actionPrompt}`;

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={a11yText}
      accessibilityHint="Demonstrates the muscle group and action for this relaxation step"
    >
      {/* Top Header Row with Demonstration Status */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Local Visual Guide</Text>
        </View>

        <View
          style={[
            styles.phasePill,
            { backgroundColor: isTensing ? "rgba(244, 63, 94, 0.2)" : "rgba(16, 185, 129, 0.2)" },
          ]}
        >
          <View
            style={[
              styles.phaseDot,
              { backgroundColor: isTensing ? "#F43F5E" : "#10B981" },
            ]}
          />
          <Text
            style={[
              styles.phaseText,
              { color: isTensing ? "#FB7185" : "#34D399" },
            ]}
          >
            {isTensing ? "TENSE (5s)" : "RELEASE (8s)"}
          </Text>
        </View>
      </View>

      {/* Main Illustration Body */}
      <View style={styles.contentRow}>
        {/* Anatomical Silhouette with Pulse */}
        <Animated.View
          style={[
            styles.svgWrapper,
            {
              transform: [{ scale: pulseAnim }],
              shadowColor: activeColor,
            },
          ]}
        >
          {renderAnatomySvg()}
        </Animated.View>

        {/* Anatomical Step Instructions */}
        <View style={styles.textContainer}>
          <Text style={styles.muscleTitle}>{step.muscleGroup}</Text>
          <Text style={styles.actionPrompt} numberOfLines={3}>
            {step.actionPrompt}
          </Text>
          <View style={styles.cueContainer}>
            <Text style={styles.cueText}>
              {isTensing
                ? "Notice physical tension"
                : "Notice warmth and softness"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - Theme.spacing.lg * 2,
    height: 190,
    borderRadius: 20,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#7C3AED",
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "space-between",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.4)",
  },
  badgeText: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  phasePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  phaseText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingTop: 4,
  },
  svgWrapper: {
    width: 100,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  textContainer: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "center",
  },
  muscleTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F8FAFC",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  actionPrompt: {
    fontSize: 12,
    lineHeight: 17,
    color: "#CBD5E1",
    marginBottom: 8,
    fontWeight: "500",
  },
  cueContainer: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    borderLeftWidth: 2,
    borderLeftColor: "#7C3AED",
  },
  cueText: {
    fontSize: 11,
    color: "#A78BFA",
    fontWeight: "600",
  },
});
