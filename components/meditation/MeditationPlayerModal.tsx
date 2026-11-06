import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import type { GuidedMeditation } from "@/common/guidedMeditations";

interface MeditationPlayerModalProps {
  visible: boolean;
  meditation: GuidedMeditation | null;
  emotionColor?: string;
  onClose: () => void;
  onComplete: (meditationTitle: string) => void;
}

export function MeditationPlayerModal({
  visible,
  meditation,
  emotionColor = Colors.primary,
  onClose,
  onComplete,
}: MeditationPlayerModalProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [hasCompleted, setHasCompleted] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Default duration is 300s (5 mins) or 180s (3 mins)
  const totalSeconds = meditation?.durationLabel?.includes("10")
    ? 600
    : meditation?.durationLabel?.includes("5")
    ? 300
    : 180;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for calming visual
  useEffect(() => {
    if (!visible) return;

    if (isPlaying) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.stopAnimation();
    }
  }, [visible, isPlaying, pulseAnim]);

  // Session Timer
  useEffect(() => {
    if (!visible || !isPlaying || hasCompleted) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= totalSeconds) {
          clearInterval(interval);
          handleFinish(true);
          return totalSeconds;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, isPlaying, hasCompleted, totalSeconds]);

  // Reset state on open
  useEffect(() => {
    if (visible) {
      setElapsedSeconds(0);
      setIsPlaying(true);
      setHasCompleted(false);
    }
  }, [visible]);

  const handleTogglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsPlaying((prev) => !prev);
  };

  const handleFinish = (auto: boolean = false) => {
    if (hasCompleted) return;
    setHasCompleted(true);
    setIsPlaying(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onComplete(meditation?.title || "Guided Meditation");
  };

  const handleOpenExternal = () => {
    if (meditation?.url) {
      Linking.openURL(meditation.url).catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));

  if (!meditation) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.eyebrow, { color: emotionColor }]}>
                GUIDED MEDITATION · {meditation.emotion.toUpperCase()}
              </Text>
              <Text style={styles.title} numberOfLines={2}>
                {meditation.title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close meditation"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Calming Visual / Breathing Halo */}
          <View style={styles.visualContainer}>
            <Animated.View
              style={[
                styles.pulseCircleOuter,
                {
                  borderColor: emotionColor + "33",
                  backgroundColor: emotionColor + "15",
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View
                style={[
                  styles.pulseCircleInner,
                  { backgroundColor: emotionColor + "25", borderColor: emotionColor + "55" },
                ]}
              >
                <Ionicons
                  name={isPlaying ? "leaf-outline" : "pause-circle-outline"}
                  size={52}
                  color={emotionColor}
                />
              </View>
            </Animated.View>
            <Text style={styles.guideTip}>
              {isPlaying ? "Focus on your breathing. Inhale gently, exhale slowly." : "Meditation paused"}
            </Text>
          </View>

          {/* Progress Slider Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPercent}%`, backgroundColor: emotionColor },
                ]}
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(elapsedSeconds)}</Text>
              <Text style={styles.timeText}>{formatTime(totalSeconds)}</Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.auxBtn}
              onPress={() => setIsMuted((prev) => !prev)}
              accessibilityLabel={isMuted ? "Unmute tone" : "Mute tone"}
            >
              <Ionicons
                name={isMuted ? "volume-mute-outline" : "volume-medium-outline"}
                size={22}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playBtn, { backgroundColor: emotionColor }]}
              onPress={handleTogglePlay}
              accessibilityLabel={isPlaying ? "Pause meditation" : "Play meditation"}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={28}
                color={Colors.white}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.auxBtn}
              onPress={handleOpenExternal}
              accessibilityLabel="Open in YouTube"
              accessibilityHint="Opens external video"
            >
              <Ionicons name="logo-youtube" size={22} color="#DC2626" />
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.completeBtn, { backgroundColor: emotionColor }]}
              onPress={() => handleFinish(false)}
              activeOpacity={0.88}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[emotionColor, Colors.primaryDark || emotionColor]}
                style={styles.completeGradient}
              >
                <Text style={styles.completeText}>Finish & Check In</Text>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.dismissText}>Leave for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Theme.spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    ...Theme.shadows.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    color: Colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  visualContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  pulseCircleOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseCircleInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  guideTip: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 12,
  },
  progressContainer: {
    marginVertical: 14,
  },
  progressTrack: {
    height: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  timeText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    marginVertical: 10,
  },
  auxBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadows.secondary,
  },
  footerActions: {
    marginTop: 16,
    gap: 8,
  },
  completeBtn: {
    borderRadius: Theme.borderRadius.lg,
    overflow: "hidden",
  },
  completeGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  completeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.white,
  },
  dismissBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  dismissText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textMuted,
  },
});
