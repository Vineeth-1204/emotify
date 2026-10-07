/**
 * Mitra-Led MicroGoal Screen
 * Phase 4 — Conversational Wellbeing Entry Point
 *
 * Flow:
 * Mitra suggests one small goal → user accepts [Let's do it] or declines [Not now]
 * → user performs task → genuine completion → Mitra post-goal check ("How did that feel?")
 * → contextual encouragement → return Home.
 *
 * Strictly non-clinical: zero dependency on PHQ-9, GAD-7, PQ-16, or triage.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  BackHandler,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { useThemeColors } from "@/context/MoodThemeContext";
import { useAvatar } from "@/context/AvatarContext";
import { EmotyAvatar, MitraAvatar, AvatarState } from "@/components/avatar/EmotyAvatar";
import { CalmPointToken } from "@/components/svg/system";
import { getLocalDateString } from "@/utils/date";

type FlowStep = "loading" | "suggesting" | "performing" | "reflection" | "reinforced" | "deferred" | "all_completed";

interface ReflectionOption {
  id: string;
  label: string;
  response: string;
  avatarState: AvatarState;
}

const REFLECTION_OPTIONS: ReflectionOption[] = [
  {
    id: "better",
    label: "Better",
    response: "Glad that helped a little.",
    avatarState: "happy",
  },
  {
    id: "same",
    label: "Same",
    response: "That's okay. Not everything feels different right away.",
    avatarState: "calm",
  },
  {
    id: "harder",
    label: "Harder",
    response: "Thanks for telling me. We don't have to force it.",
    avatarState: "supportive",
  },
  {
    id: "no_difference",
    label: "Didn't notice a difference",
    response: "That's completely fine. Small steps add up over time.",
    avatarState: "calm",
  },
];

export default function MitraGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { avatarName, avatarGender } = useAvatar();
  const todayStr = getLocalDateString();

  const [step, setStep] = useState<FlowStep>("loading");
  const [activeGoalId, setActiveGoalId] = useState<Id<"microGoals"> | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState<ReflectionOption | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;
  const autoStartHandledRef = useRef(false);

  // Convex Queries & Mutations
  const suggestedQuery = useQuery(api.microGoals.getMitraSuggestedGoal, { dateStr: todayStr });
  const acceptGoalMutation = useMutation(api.microGoals.acceptMitraGoal);
  const skipGoalMutation = useMutation(api.microGoals.skipMitraGoal);
  const completeGoalMutation = useMutation(api.microGoals.completeGoalWithFeeling);

  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(15);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Sync initial query state
  useEffect(() => {
    if (suggestedQuery === undefined) return;

    if (suggestedQuery === null || suggestedQuery.status === "all_completed") {
      setStep("all_completed");
    } else if (suggestedQuery.status === "active") {
      setActiveGoalId(suggestedQuery._id as Id<"microGoals">);
      setStep(params.start === "1" && autoStartHandledRef.current ? "performing" : "suggesting");
    } else {
      // Suggested unpersisted goal
      setStep("suggesting");
    }
    animateIn();
  }, [suggestedQuery, params.start]);

  // Android Back Handler
  useEffect(() => {
    const onBackPress = () => {
      if (step === "performing") {
        // Return to suggestion without marking complete
        setStep("suggesting");
        animateIn();
        return true;
      }
      if (step === "reflection") {
        // Goal completion in progress; allow returning home
        handleReturnHome();
        return true;
      }
      handleReturnHome();
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [step]);

  const handleReturnHome = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/(tabs)");
    }
  };

  // User accepts the goal: [Let's do it]
  const handleAcceptGoal = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      const res = await acceptGoalMutation({ dateStr: todayStr });
      if (res && res.id) {
        setActiveGoalId(res.id);
      }
      setStep("performing");
      animateIn();
    } catch (e: any) {
      console.warn("Could not accept goal:", e);
      // Fallback: still advance to performing view
      setStep("performing");
      animateIn();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Home's Start action uses the same accepted-goal flow and API as this screen's CTA.
  useEffect(() => {
    if (
      params.start !== "1" ||
      suggestedQuery === undefined ||
      suggestedQuery === null ||
      suggestedQuery.status === "all_completed" ||
      autoStartHandledRef.current
    ) {
      return;
    }
    autoStartHandledRef.current = true;
    if (suggestedQuery.status === "active") {
      setActiveGoalId(suggestedQuery._id as Id<"microGoals">);
      setStep("performing");
      animateIn();
      return;
    }
    void handleAcceptGoal();
  }, [params.start, suggestedQuery]);

  // User chooses: [Not now]
  const handleNotNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsSubmitting(true);
    try {
      if (activeGoalId) {
        await skipGoalMutation({ id: activeGoalId });
      }
    } catch (e: any) {
      console.warn("Could not skip goal:", e);
    } finally {
      setIsSubmitting(false);
      setStep("deferred");
      animateIn();
    }
  };

  // User genuinely completed the task
  const handleMarkDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep("reflection");
    animateIn();
  };

  // User answers "How did that feel?"
  const handleSelectFeeling = async (option: ReflectionOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedFeeling(option);
    setIsSubmitting(true);

    try {
      if (activeGoalId) {
        await completeGoalMutation({
          id: activeGoalId,
          feelingAfter: option.id,
          dateStr: todayStr,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      console.warn("Error recording goal completion:", e);
    } finally {
      setIsSubmitting(false);
      setStep("reinforced");
      animateIn();
    }
  };

  // Goal details to display
  const goalTitle = suggestedQuery?.goalTitle || "Take a Screen Break";
  const goalDesc =
    suggestedQuery?.goalDescription ||
    "Take a few minutes to step away from your screen and stretch.";

  // Determine avatar state based on flow step
  const getAvatarState = (): AvatarState => {
    switch (step) {
      case "suggesting":
        return "encouraging";
      case "performing":
        return "calm";
      case "reflection":
        return "listening";
      case "reinforced":
        return selectedFeeling?.avatarState || "happy";
      case "deferred":
        return "calm";
      case "all_completed":
        return "happy";
      default:
        return "idle";
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#F8FAFC", "#EEF2FF", "#F1F5F9"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={handleReturnHome}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{avatarName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading state */}
        {step === "loading" && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* STEP 1: Mitra Suggestion */}
        {step === "suggesting" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Mitra Avatar */}
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            {/* Conversational prompt */}
            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                I've got a small thing you could try.
              </Text>
            </View>

            {/* Goal presentation card */}
            <View style={styles.goalCard}>
              <View style={styles.goalIconCircle}>
                <Ionicons name="leaf-outline" size={24} color={colors.primary} />
              </View>
              <Text style={styles.goalTitle}>{goalTitle}</Text>
              <Text style={styles.goalDescription}>{goalDesc}</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={handleAcceptGoal}
                disabled={isSubmitting}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Let's do it"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Let's do it</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNotNow}
                disabled={isSubmitting}
                style={styles.secondaryBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Not now"
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                  Not now
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* STEP 2: Task Execution */}
        {step === "performing" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                Take your time.
              </Text>
              <Text style={styles.mitraSubLeadText}>
                Whenever you're done, let me know below.
              </Text>
            </View>

            <View style={styles.inProgressCard}>
              <Text style={styles.inProgressGoalTitle}>{goalTitle}</Text>
              <Text style={styles.inProgressGoalDesc}>{goalDesc}</Text>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={handleMarkDone}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="I did it"
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>I did it</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("suggesting")}
                style={styles.secondaryBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                  Back
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* STEP 3: Post-Completion Check */}
        {step === "reflection" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                Nice — that's done.
              </Text>
              <Text style={styles.mitraSubLeadText}>
                How did that feel?
              </Text>
            </View>

            {/* 4 Reflection Options */}
            <View style={styles.optionsList}>
              {REFLECTION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleSelectFeeling(opt)}
                  disabled={isSubmitting}
                  style={[
                    styles.reflectionOptionBtn,
                    { borderColor: colors.border || "#E2E8F0" },
                  ]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <Text style={[styles.reflectionOptionText, { color: colors.text }]}>
                    {opt.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* STEP 4: Contextual Reinforcement */}
        {step === "reinforced" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                {selectedFeeling?.response || "Nice. You got that done."}
              </Text>
            </View>

            {/* Calm Points badge */}
            <View style={styles.rewardSummaryRow}>
              <CalmPointToken size={22} />
              <Text style={styles.rewardSummaryText}>+10 Calm Points added</Text>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={handleReturnHome}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Return Home"
              >
                <Text style={styles.primaryBtnText}>Return Home</Text>
                <Ionicons name="home-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* STEP 5: Deferred ("Not now") */}
        {step === "deferred" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                No problem. We can try something else later.
              </Text>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={handleReturnHome}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Back to Home"
              >
                <Text style={styles.primaryBtnText}>Back to Home</Text>
                <Ionicons name="home-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* STEP 6: All Completed for Today */}
        {step === "all_completed" && (
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.avatarWrap}>
              <MitraAvatar
                gender={avatarGender}
                state={getAvatarState()}
                size="lg"
              />
            </View>

            <View style={styles.speechBubble}>
              <Text style={styles.mitraLeadText}>
                You're all set for today.
              </Text>
              <Text style={styles.mitraSubLeadText}>
                You've completed your daily routine goals. Feel free to explore other tools or rest.
              </Text>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={handleReturnHome}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Back to Home"
              >
                <Text style={styles.primaryBtnText}>Back to Home</Text>
                <Ionicons name="home-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  centerBox: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  contentCard: {
    alignItems: "center",
    width: "100%",
  },
  avatarWrap: {
    marginBottom: 16,
    alignItems: "center",
  },
  speechBubble: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 20,
    alignItems: "center",
    maxWidth: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mitraLeadText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: "#1E293B",
    textAlign: "center",
    lineHeight: 24,
  },
  mitraSubLeadText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
  },
  goalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  goalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  goalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  goalDescription: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
  },
  inProgressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inProgressGoalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 19,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  inProgressGoalDesc: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  optionsList: {
    width: "100%",
    gap: 10,
    marginBottom: 20,
  },
  reflectionOptionBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  reflectionOptionText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 16,
  },
  rewardSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 24,
  },
  rewardSummaryText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: "#16A34A",
  },
  actionsContainer: {
    width: "100%",
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
  },
});
