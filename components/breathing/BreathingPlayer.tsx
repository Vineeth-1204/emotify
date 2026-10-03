/**
 * Canonical Accessible Breathing Player
 * Priority 9 Step 4B - Single Reusable UI Component
 *
 * Implements WCAG AA accessibility, screen reader live regions, reduced motion compliance,
 * optional tactile haptic pacing, and resilient backend persistence.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  AccessibilityInfo,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import {
  BreathingPhase,
  BreathingProtocol,
  BREATHING_PROTOCOLS,
} from "@/constants/BreathingProtocols";
import {
  useBreathingEngine,
  BreathingSessionResult,
} from "@/hooks/useBreathingEngine";

export interface BreathingPlayerProps {
  protocol?: BreathingProtocol;
  sourceType?: string;
  attemptId?: any;
  triageId?: any;
  targetCycles?: number;
  targetDurationSeconds?: number;
  autoStart?: boolean;
  onComplete?: (result: BreathingSessionResult) => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  enableHaptics?: boolean;
}

export function BreathingPlayer({
  protocol = BREATHING_PROTOCOLS.paced_444,
  sourceType = "self_initiated",
  attemptId,
  triageId,
  targetCycles,
  targetDurationSeconds,
  autoStart = true,
  onComplete,
  onClose,
  title,
  subtitle,
  themeColor = Colors.primary,
  enableHaptics = true,
}: BreathingPlayerProps) {
  const logSessionMutation = useMutation(api.breathing.logSession);

  // Accessibility state
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState<string>("");

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const hasLoggedRef = useRef<boolean>(false);

  // Check reduced motion setting
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      sub?.remove();
    };
  }, []);

  // Safe haptic feedback trigger
  const triggerHaptic = (phase: BreathingPhase) => {
    if (!enableHaptics || reduceMotion) return;
    try {
      if (phase === "INHALE") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } else if (phase === "HOLD" || phase === "REST") {
        Haptics.selectionAsync().catch(() => {});
      } else if (phase === "EXHALE") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch {
      // Haptics optional; ignore if unavailable
    }
  };

  // Safe persistence handler (offline resilient)
  const persistSession = async (result: BreathingSessionResult) => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;

    try {
      await logSessionMutation({
        protocolId: result.protocolId,
        protocolName: result.protocolName,
        sourceType,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        durationSeconds: result.durationSeconds,
        cyclesCompleted: result.cyclesCompleted,
        targetCycles: result.targetCycles,
        status: result.status,
        attemptId: attemptId ?? undefined,
        triageId: triageId ?? undefined,
      });
    } catch (persistErr) {
      // Local session completion is NOT invalidated if network persistence fails
      console.warn("Breathing persistence deferred/offline:", persistErr);
    }
  };

  // Phase transition visual and sensory handler
  const handlePhaseChange = (newPhase: BreathingPhase, cycleIndex: number) => {
    triggerHaptic(newPhase);

    // Announce to screen reader
    const phaseLabel = protocol.phaseLabels[newPhase];
    const announcement = `${phaseLabel.accessibilityVoice}. Cycle ${cycleIndex} of ${engine.targetCycles}.`;
    setScreenReaderAnnouncement(announcement);

    if (reduceMotion) {
      scaleAnim.setValue(1);
      return;
    }

    // Drive fluid animation according to phase
    const phaseDurationMs =
      newPhase === "INHALE"
        ? protocol.inhaleSeconds * 1000
        : newPhase === "HOLD"
          ? protocol.holdSeconds * 1000
          : newPhase === "EXHALE"
            ? protocol.exhaleSeconds * 1000
            : protocol.restSeconds * 1000;

    if (newPhase === "INHALE") {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1.45,
          duration: Math.max(300, phaseDurationMs),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: Math.max(300, phaseDurationMs),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (newPhase === "EXHALE") {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: Math.max(300, phaseDurationMs),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: Math.max(300, phaseDurationMs),
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handleComplete = (result: BreathingSessionResult) => {
    persistSession(result);
    onComplete?.(result);
  };

  const handleStop = (result: BreathingSessionResult) => {
    if (result.status === "partial") {
      persistSession(result);
    }
    onClose?.();
  };

  // Core canonical engine
  const engine = useBreathingEngine({
    protocol,
    targetCycles,
    targetDurationSeconds,
    autoStart,
    onPhaseChange: handlePhaseChange,
    onComplete: handleComplete,
    onStop: handleStop,
  });

  const activePhaseConfig = protocol.phaseLabels[engine.phase];
  const isRunning = engine.state === "ACTIVE";
  const isPaused = engine.state === "PAUSED";
  const isComplete = engine.state === "COMPLETED";

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="none"
      accessibilityLabel={`Guided breathing: ${protocol.name}`}
    >
      {/* Hidden live region for screen reader announcements */}
      <View
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        style={styles.srOnly}
      >
        <Text>{screenReaderAnnouncement}</Text>
      </View>

      {/* Header Info */}
      <View style={styles.header}>
        <Text style={styles.title}>{title || protocol.name}</Text>
        <Text style={styles.subtitle}>
          {subtitle || activePhaseConfig.instruction}
        </Text>
      </View>

      {/* Central Visual Pacer */}
      <View style={styles.visualContainer}>
        {/* Background glow circle */}
        <Animated.View
          style={[
            styles.glowCircle,
            {
              backgroundColor: themeColor,
              opacity: reduceMotion ? 0.25 : pulseAnim,
              transform: [{ scale: reduceMotion ? 1 : scaleAnim }],
            },
          ]}
        />

        {/* Foreground interactive circle */}
        <View
          style={[
            styles.pacerCircle,
            { borderColor: themeColor, backgroundColor: themeColor + "15" },
          ]}
          accessible={true}
          accessibilityLabel={`${activePhaseConfig.display}. ${engine.phaseTimeRemainingSeconds} seconds remaining in this phase.`}
        >
          <Text style={[styles.phaseTitle, { color: themeColor }]}>
            {activePhaseConfig.display}
          </Text>
          <Text style={styles.phaseCountdown}>
            {engine.phaseTimeRemainingSeconds}s
          </Text>
        </View>
      </View>

      {/* Cycle & Overall Progress */}
      <View style={styles.progressRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Cycle</Text>
          <Text style={styles.metricValue}>
            {engine.currentCycleIndex} of {engine.targetCycles}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Time Remaining</Text>
          <Text style={styles.metricValue}>
            {Math.floor(engine.sessionRemainingSeconds / 60)}:
            {(engine.sessionRemainingSeconds % 60).toString().padStart(2, "0")}
          </Text>
        </View>
      </View>

      {/* Primary Control Buttons */}
      <View style={styles.controlsRow}>
        {isRunning && (
          <TouchableOpacity
            style={[styles.controlBtn, styles.pauseBtn]}
            onPress={engine.pause}
            accessibilityRole="button"
            accessibilityLabel="Pause breathing exercise"
            accessibilityHint="Pauses the exercise timer and animation"
          >
            <Ionicons name="pause" size={22} color={Colors.text} />
            <Text style={styles.controlBtnText}>Pause</Text>
          </TouchableOpacity>
        )}

        {isPaused && (
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: themeColor }]}
            onPress={engine.resume}
            accessibilityRole="button"
            accessibilityLabel="Resume breathing exercise"
            accessibilityHint="Resumes the exercise timer"
          >
            <Ionicons name="play" size={22} color="#FFFFFF" />
            <Text style={[styles.controlBtnText, { color: "#FFFFFF" }]}>
              Resume
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlBtn, styles.stopBtn]}
          onPress={() => {
            engine.stop();
            onClose?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={isComplete ? "Done" : "Stop and Exit"}
          accessibilityHint="Ends the breathing session"
        >
          <Ionicons
            name={isComplete ? "checkmark" : "close"}
            size={22}
            color="#EF4444"
          />
          <Text style={[styles.controlBtnText, { color: "#EF4444" }]}>
            {isComplete ? "Done" : "Stop & Exit"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: Theme.spacing.lg,
    width: "100%",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    marginBottom: Theme.spacing.xl,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 20,
  },
  visualContainer: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Theme.spacing.lg,
  },
  glowCircle: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  pacerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  phaseTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    letterSpacing: 0.5,
  },
  phaseCountdown: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xxl,
    color: Colors.text,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    backgroundColor: Colors.card || "#F8F7FF",
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    marginVertical: Theme.spacing.lg,
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border || "#E2E8F0",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: Theme.spacing.md,
    width: "100%",
    justifyContent: "center",
  },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Theme.borderRadius.full,
    minWidth: 120,
    minHeight: 48,
    gap: 6,
  },
  pauseBtn: {
    backgroundColor: Colors.border || "#E2E8F0",
  },
  stopBtn: {
    backgroundColor: "#FEE2E2",
  },
  controlBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
});
