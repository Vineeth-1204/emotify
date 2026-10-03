/**
 * Reusable Accessible Sensory Grounding Player
 * Priority 9 Step 5B — Canonical Grounding Component
 *
 * Supports both standalone step-by-step interactive mode and contextual overview mode.
 * Features WCAG AA accessibility, screen-reader announcements, gentle haptics,
 * offline-first execution, and idempotent backend persistence.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  AccessibilityInfo,
  StyleProp,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import {
  GroundingProtocol,
  GroundingStep,
  SENSORY_54321_PROTOCOL,
} from "@/constants/GroundingProtocols";
import {
  SeeIcon,
  TouchIcon,
  HearIcon,
  SmellIcon,
  TasteIcon,
} from "@/components/svg/activities/SensoryIcons";

export interface SensoryGroundingPlayerProps {
  protocol?: GroundingProtocol;
  mode?: "interactive" | "overview";
  sourceType?: string;
  attemptId?: any;
  triageId?: any;
  onComplete?: (logId?: string) => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  enableHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SensoryGroundingPlayer({
  protocol = SENSORY_54321_PROTOCOL,
  mode = "interactive",
  sourceType = "self_initiated",
  attemptId,
  triageId,
  onComplete,
  onClose,
  title,
  subtitle,
  themeColor = "#16A34A",
  enableHaptics = true,
  style,
}: SensoryGroundingPlayerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [highestStepReached, setHighestStepReached] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const hasLoggedRef = useRef<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const logSessionMutation = useMutation(api.grounding.logSession);

  // Check reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => setReduceMotion(enabled))
      .catch(() => {});
  }, []);

  const totalSteps = protocol.steps.length;
  const currentStep: GroundingStep = protocol.steps[currentStepIndex] || protocol.steps[0];

  // Screen-reader announcement on step change
  useEffect(() => {
    if (mode === "interactive" && !isCompleted) {
      const announcement = `Step ${currentStep.stepNumber} of ${totalSteps}: ${currentStep.title}. ${currentStep.instruction}`;
      AccessibilityInfo.announceForAccessibility?.(announcement);
    }
  }, [currentStepIndex, mode, isCompleted, currentStep, totalSteps]);

  // Safe trigger haptics
  const triggerHaptic = (type: "step" | "complete") => {
    if (!enableHaptics) return;
    try {
      if (type === "complete") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch (_) {}
  };

  // Safe backend persistence
  const persistSession = async (
    status: "completed" | "partial" | "abandoned",
    steps: number
  ): Promise<string | undefined> => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;

    const duration = Math.max(1, (Date.now() - startTimeRef.current) / 1000);

    try {
      const logId = await logSessionMutation({
        protocolId: protocol.id,
        protocolName: protocol.title,
        sourceType,
        startedAt: startTimeRef.current,
        completedAt: Date.now(),
        durationSeconds: duration,
        stepsCompleted: steps,
        totalSteps,
        status,
        attemptId: attemptId ?? undefined,
        triageId: triageId ?? undefined,
      });
      return logId as string;
    } catch (err) {
      console.warn("Sensory grounding log persistence failed (offline/degraded):", err);
      return undefined;
    }
  };

  // Interactive mode: advance step
  const handleNextStep = () => {
    triggerHaptic("step");

    if (currentStepIndex < totalSteps - 1) {
      const nextIndex = currentStepIndex + 1;
      const nextHighest = Math.max(highestStepReached, nextIndex + 1);
      setHighestStepReached(nextHighest);

      if (!reduceMotion) {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0.2, duration: 100, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      }

      setCurrentStepIndex(nextIndex);
    } else {
      // Reached completion
      handleComplete();
    }
  };

  // Interactive mode: back step
  const handlePrevStep = () => {
    triggerHaptic("step");
    if (currentStepIndex > 0) {
      if (!reduceMotion) {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0.2, duration: 100, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      }
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // Handle full completion
  const handleComplete = async () => {
    triggerHaptic("complete");
    setIsCompleted(true);
    const logId = await persistSession("completed", totalSteps);
    onComplete?.(logId);
  };

  // Handle safe early exit
  const handleSafeExit = async () => {
    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;

    // Only record if meaningful progress (>0 steps reached and >4s elapsed)
    if (!hasLoggedRef.current) {
      if (highestStepReached > 1 && elapsedSeconds >= 5) {
        await persistSession("partial", highestStepReached);
      } else if (elapsedSeconds >= 5) {
        await persistSession("abandoned", 1);
      }
    }

    onClose?.();
  };

  // Render sensory icon component helper
  const renderSenseIcon = (sense: string, size = 36, color?: string, fill?: string) => {
    switch (sense) {
      case "see":
        return <SeeIcon size={size} color={color ?? "#3B82F6"} fillColor={fill ?? "#EFF6FF"} />;
      case "touch":
        return <TouchIcon size={size} color={color ?? "#10B981"} fillColor={fill ?? "#ECFDF5"} />;
      case "hear":
        return <HearIcon size={size} color={color ?? "#F59E0B"} fillColor={fill ?? "#FFFBEB"} />;
      case "smell":
        return <SmellIcon size={size} color={color ?? "#EC4899"} fillColor={fill ?? "#FDF2F8"} />;
      case "taste":
        return <TasteIcon size={size} color={color ?? "#8B5CF6"} fillColor={fill ?? "#FAF5FF"} />;
      default:
        return <SeeIcon size={size} color={color ?? themeColor} />;
    }
  };

  // ==========================================
  // MODE 1: OVERVIEW / CARD MODE (For CBT Support)
  // ==========================================
  if (mode === "overview") {
    return (
      <View style={[styles.overviewContainer, style]} accessible={true} accessibilityLabel="5-4-3-2-1 Sensory Grounding Overview">
        {title && (
          <Text style={[styles.overviewMainTitle, { color: themeColor }]} accessibilityRole="header">
            {title}
          </Text>
        )}
        {subtitle && <Text style={styles.overviewSubtitle}>{subtitle}</Text>}

        <View style={styles.overviewStepList}>
          {protocol.steps.map((step) => (
            <View
              key={step.stepNumber}
              style={styles.overviewStepRow}
              accessible={true}
              accessibilityLabel={`${step.count} ${step.sense}: ${step.instruction}`}
            >
              <View style={[styles.overviewIconWrapper, { backgroundColor: step.fillColor, borderColor: step.color + "30" }]}>
                {renderSenseIcon(step.sense, 24, step.color, step.fillColor)}
              </View>
              <View style={styles.overviewStepTextWrapper}>
                <Text style={styles.overviewStepText}>{step.instruction}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footerTip}>{protocol.footerTip}</Text>

        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: themeColor, marginTop: 14 }]}
          onPress={async () => {
            triggerHaptic("complete");
            const logId = await persistSession("completed", totalSteps);
            onComplete?.(logId);
          }}
          accessibilityRole="button"
          accessibilityLabel="I'm Grounded. Complete grounding exercise."
          accessibilityHint="Records completion of the sensory grounding exercise."
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
          <Text style={styles.primaryActionBtnText}>I Feel Grounded</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==========================================
  // MODE 2: INTERACTIVE STEP-BY-STEP MODE
  // ==========================================

  // Completion screen
  if (isCompleted) {
    return (
      <View style={[styles.cardContainer, style]} accessible={true} accessibilityLabel="Grounding Completed">
        <View style={styles.successIconWrapper}>
          <Ionicons name="checkmark-circle" size={72} color={themeColor} />
        </View>

        <Text style={styles.successTitle} accessibilityRole="header">
          Grounded & Centered
        </Text>
        <Text style={styles.successMessage}>
          You have connected with all 5 senses to bring your awareness back to the present moment. Carry this calm with you.
        </Text>

        <View style={styles.summaryBadgeRow}>
          {protocol.steps.map((step) => (
            <View key={step.stepNumber} style={[styles.miniSenseBadge, { backgroundColor: step.fillColor, borderColor: step.color + "40" }]}>
              {renderSenseIcon(step.sense, 18, step.color, step.fillColor)}
              <Text style={[styles.miniSenseCount, { color: step.color }]}>{step.count}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: themeColor, marginTop: 28 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Finish and Return"
          activeOpacity={0.85}
        >
          <Text style={styles.primaryActionBtnText}>Return</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    );
  }

  // Active step view
  return (
    <View style={[styles.cardContainer, style]} accessible={true} accessibilityLabel={`Grounding Exercise: Step ${currentStep.stepNumber} of ${totalSteps}`}>
      {/* Top Header */}
      <View style={styles.playerHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenHeaderTitle} accessibilityRole="header">
            {title ?? protocol.title}
          </Text>
          <Text style={styles.screenHeaderSub}>
            Step {currentStep.stepNumber} of {totalSteps}
          </Text>
        </View>

        {onClose && (
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleSafeExit}
            accessibilityRole="button"
            accessibilityLabel="Exit grounding exercise"
            accessibilityHint="Exits the current exercise"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress Dots */}
      <View style={styles.progressDotsContainer} accessible={false}>
        {protocol.steps.map((s, idx) => {
          const isCurrent = idx === currentStepIndex;
          const isPassed = idx < currentStepIndex;
          return (
            <View
              key={s.stepNumber}
              style={[
                styles.progressDot,
                isCurrent && [styles.progressDotActive, { backgroundColor: s.color, width: 24 }],
                isPassed && [styles.progressDotPassed, { backgroundColor: themeColor }],
              ]}
            />
          );
        })}
      </View>

      {/* Main Sensory Step Body */}
      <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
        <View style={[styles.iconCircleLarge, { backgroundColor: currentStep.fillColor, borderColor: currentStep.color + "40" }]}>
          {renderSenseIcon(currentStep.sense, 52, currentStep.color, currentStep.fillColor)}
          <View style={[styles.countBadge, { backgroundColor: currentStep.color }]}>
            <Text style={styles.countBadgeText}>{currentStep.count}</Text>
          </View>
        </View>

        <Text style={[styles.stepInstruction, { color: Colors.text }]} accessibilityRole="header">
          {currentStep.instruction}
        </Text>

        <Text style={styles.stepPrompt}>
          {currentStep.prompt}
        </Text>
      </Animated.View>

      <Text style={styles.footerTip}>{protocol.footerTip}</Text>

      {/* Navigation Controls */}
      <View style={styles.navRow}>
        {currentStepIndex > 0 ? (
          <TouchableOpacity
            style={styles.prevBtn}
            onPress={handlePrevStep}
            accessibilityRole="button"
            accessibilityLabel="Go back to previous sense"
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            <Text style={styles.prevBtnText}>Previous</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: currentStep.color }]}
          onPress={handleNextStep}
          accessibilityRole="button"
          accessibilityLabel={
            currentStepIndex === totalSteps - 1
              ? "Complete Grounding Exercise"
              : `Next Sense: ${protocol.steps[currentStepIndex + 1]?.title}`
          }
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {currentStepIndex === totalSteps - 1 ? "Complete" : "Next Sense"}
          </Text>
          <Ionicons
            name={currentStepIndex === totalSteps - 1 ? "checkmark" : "arrow-forward"}
            size={18}
            color={Colors.white}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Interactive Container
  cardContainer: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Theme.spacing.md,
  },
  screenHeaderTitle: {
    fontSize: 18,
    fontFamily: Theme.fontFamily.bold,
    color: "#0F172A", // Slate-900 (High contrast >= 7:1)
  },
  screenHeaderSub: {
    fontSize: 13,
    fontFamily: Theme.fontFamily.medium,
    color: "#64748B", // Slate-500
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginVertical: Theme.spacing.sm,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#CBD5E1",
  },
  progressDotActive: {
    height: 8,
    borderRadius: 4,
  },
  progressDotPassed: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepContent: {
    alignItems: "center",
    paddingVertical: Theme.spacing.md,
  },
  iconCircleLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: Theme.spacing.md,
  },
  countBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.white,
  },
  countBadgeText: {
    color: Colors.white,
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
  },
  stepInstruction: {
    fontSize: 18,
    fontFamily: Theme.fontFamily.bold,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  stepPrompt: {
    fontSize: 14,
    fontFamily: Theme.fontFamily.regular,
    color: "#475569", // Slate-600 (Contrast >= 5.5:1)
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 12,
  },
  footerTip: {
    fontSize: 12,
    fontFamily: Theme.fontFamily.regular,
    color: "#64748B",
    textAlign: "center",
    marginVertical: 10,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Theme.spacing.sm,
    gap: 12,
  },
  prevBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    minHeight: 48,
  },
  prevBtnText: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.medium,
    color: "#475569",
  },
  nextBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    minHeight: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nextBtnText: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.white,
  },

  // Completion screen
  successIconWrapper: {
    alignItems: "center",
    marginVertical: 12,
  },
  successTitle: {
    fontSize: 22,
    fontFamily: Theme.fontFamily.bold,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    fontFamily: Theme.fontFamily.regular,
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  summaryBadgeRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginVertical: 10,
  },
  miniSenseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  miniSenseCount: {
    fontSize: 12,
    fontFamily: Theme.fontFamily.bold,
  },

  // Overview Mode (Contextual CBT)
  overviewContainer: {
    paddingVertical: 10,
    gap: 10,
  },
  overviewMainTitle: {
    fontSize: 17,
    fontFamily: Theme.fontFamily.bold,
    marginBottom: 2,
  },
  overviewSubtitle: {
    fontSize: 13,
    fontFamily: Theme.fontFamily.regular,
    color: "#475569",
    marginBottom: 8,
  },
  overviewStepList: {
    gap: 10,
  },
  overviewStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  overviewIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  overviewStepTextWrapper: {
    flex: 1,
  },
  overviewStepText: {
    fontSize: 14,
    fontFamily: Theme.fontFamily.bold,
    color: "#1E293B", // High contrast
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: Theme.borderRadius.md,
    minHeight: 48,
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.white,
  },
});
