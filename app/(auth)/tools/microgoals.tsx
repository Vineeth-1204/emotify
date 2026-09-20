import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Modal, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAvatar } from "@/context/AvatarContext";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { CalmPointToken } from "@/components/svg/system";
import {
  HappyEmotionIcon,
  CalmEmotionIcon,
  SadEmotionIcon,
  WorriedEmotionIcon,
  AngryEmotionIcon,
  TiredEmotionIcon,
} from "@/components/svg/emotions";

const { width } = Dimensions.get('window');

const MOODS = [
  { label: "Great", value: "great", Icon: HappyEmotionIcon },
  { label: "Good", value: "good", Icon: CalmEmotionIcon },
  { label: "Okay", value: "okay", Icon: CalmEmotionIcon },
  { label: "Low", value: "low", Icon: SadEmotionIcon },
  { label: "Stressed", value: "stressed", Icon: WorriedEmotionIcon },
  { label: "Tired", value: "tired", Icon: TiredEmotionIcon },
  { label: "Frustrated", value: "frustrated", Icon: AngryEmotionIcon }
];

const COMPLETED_CONGRATS = [
  "Nice! Small wins stack up.",
  "You did it. Your brain likes routine.",
  "Every tiny step matters.",
  "Great job showing up for yourself.",
  "You've just trained your mind to choose calm."
];

const BADGES_DEFINITIONS = [
  { id: "first_step", name: "First Step", desc: "Complete First Goal", icon: "footsteps-outline", color: "#10B981" },
  { id: "beginner_streak", name: "Beginner Streak", desc: "3 Day Streak", icon: "flame-outline", color: "#3B82F6" },
  { id: "consistent", name: "Consistent", desc: "7 Day Streak", icon: "flash-outline", color: "#EF4444" },
  { id: "strong_mind", name: "Strong Mind", desc: "14 Day Streak", icon: "shield-outline", color: "#EC4899" },
  { id: "habit_builder", name: "Habit Builder", desc: "30 Day Streak", icon: "heart-outline", color: "#F59E0B" },
  { id: "calm_builder", name: "Calm Builder", desc: "100 Coins Earned", icon: "ribbon-outline", color: "#8B5CF6" }
];

function getXpRangeForLevel(level: number) {
  const levels = [
    { lvl: 1, min: 0, max: 100 },
    { lvl: 2, min: 100, max: 250 },
    { lvl: 3, min: 250, max: 450 },
    { lvl: 4, min: 450, max: 700 },
    { lvl: 5, min: 700, max: 1000 },
    { lvl: 6, min: 1000, max: 1400 },
    { lvl: 7, min: 1400, max: 1900 },
    { lvl: 8, min: 1900, max: 2500 },
    { lvl: 9, min: 2500, max: 3200 },
    { lvl: 10, min: 3200, max: 5000 },
  ];
  return levels.find(l => l.lvl === level) || { lvl: level, min: 3200, max: 10000 };
}

export default function MicroGoalsScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const insets = useSafeAreaInsets();

  // Convex Queries
  const todayCheckin = useQuery(api.microGoals.getTodayCheckin);
  const dailyGoals = useQuery(api.microGoals.getTodayGoals, { userId: user?.id ?? "" });
  const streakInfo = useQuery(api.microGoals.getStreak, { userId: user?.id ?? "" });
  const gamification = useQuery(api.microGoals.getGamificationStats);
  const weeklyMission = useQuery(api.microGoals.getWeeklyMission);
  const monthlyChallenge = useQuery(api.microGoals.getMonthlyChallenge);
  const badgesEarned = useQuery(api.microGoals.getBadges, { userId: user?.id ?? "" });
  const goalHistory = useQuery(api.microGoals.getGoalHistory, { userId: user?.id ?? "" });
  const weeklySummary = useQuery(api.microGoals.getWeeklySummary, { userId: user?.id ?? "" });

  // Convex Mutations
  const submitCheckin = useMutation(api.microGoals.submitMorningCheckin);
  const completeGoalWithFeeling = useMutation(api.microGoals.completeGoalWithFeeling);
  const scheduleGoalRelative = useMutation(api.microGoals.scheduleGoalRelative);
  const snoozeGoal = useMutation(api.microGoals.snoozeGoal);
  const skipGoal = useMutation(api.microGoals.skipGoal);

  // States
  const [activeTab, setActiveTab] = useState<"goals" | "progress" | "history">("goals");
  const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [isMutationLoading, setIsMutationLoading] = useState(false);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [isScheduleVisible, setIsScheduleVisible] = useState(false);
  const [isFeelingVisible, setIsFeelingVisible] = useState(false);
  const [isCelebrationVisible, setIsCelebrationVisible] = useState(false);
  const [isSnoozeVisible, setIsSnoozeVisible] = useState(false);

  // Completion awards data
  const [rewardData, setRewardData] = useState<{ xp: number; coins: number; levelUp: boolean; perfectDay: boolean; newLevel: number } | null>(null);

  if (
    dailyGoals === undefined ||
    streakInfo === undefined ||
    gamification === undefined ||
    weeklyMission === undefined ||
    monthlyChallenge === undefined ||
    badgesEarned === undefined ||
    goalHistory === undefined
  ) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const completedCount = dailyGoals.filter((g: any) => g.completed).length;
  const totalGoalsCount = dailyGoals.length;
  const progressPercent = totalGoalsCount > 0 ? completedCount / totalGoalsCount : 0;

  // Level computation logic
  const currentLevel = gamification?.level || 1;
  const xpVal = gamification?.xp || 0;
  const coinsVal = gamification?.coins || 0;
  const levelRange = getXpRangeForLevel(currentLevel);
  const xpProgress = xpVal - levelRange.min;
  const xpNeeded = levelRange.max - levelRange.min;
  const xpPercent = Math.min(1, Math.max(0, xpProgress / xpNeeded));

  // Handler functions
  const handleMoodSelect = async (mood: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    setIsCheckinLoading(true);
    try {
      await submitCheckin({ mood });
    } catch (e: any) {
      Alert.alert("Check-in Failed", e.message || "Failed to submit check-in. Try again.");
    } finally {
      setIsCheckinLoading(false);
    }
  };

  const handleOpenGoalDetails = (goal: any) => {
    setSelectedGoal(goal);
    setIsDetailsVisible(true);
  };

  const handleOpenRelativeScheduling = () => {
    setIsDetailsVisible(false);
    setIsScheduleVisible(true);
  };

  const handleScheduleSelect = async (minutes: number) => {
    if (!selectedGoal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setIsMutationLoading(true);
    try {
      await scheduleGoalRelative({ id: selectedGoal._id, offsetMinutes: minutes });
      setIsScheduleVisible(false);
      setSelectedGoal(null);
      Alert.alert("Goal Scheduled", `Goal set for relative reminder.`);
    } catch (e: any) {
      Alert.alert("Scheduling Error", e.message || "Could not schedule goal.");
    } finally {
      setIsMutationLoading(false);
    }
  };

  const handleOpenSnooze = (goal: any) => {
    setSelectedGoal(goal);
    setIsSnoozeVisible(true);
  };

  const handleSnoozeSelect = async (minutes: number) => {
    if (!selectedGoal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setIsMutationLoading(true);
    try {
      await snoozeGoal({ id: selectedGoal._id, snoozeMinutes: minutes });
      setIsSnoozeVisible(false);
      setSelectedGoal(null);
      Alert.alert("Goal Snoozed", `Goal snoozed for ${minutes} minutes.`);
    } catch (e: any) {
      Alert.alert("Snooze Error", e.message || "Could not snooze goal.");
    } finally {
      setIsMutationLoading(false);
    }
  };

  const handleTriggerComplete = (goal: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    setSelectedGoal(goal);
    setIsFeelingVisible(true);
  };

  const handleCompleteWithFeeling = async (feeling: string) => {
    if (!selectedGoal) return;
    setIsFeelingVisible(false);
    setIsMutationLoading(true);
    try {
      const res = await completeGoalWithFeeling({ id: selectedGoal._id, feelingAfter: feeling });
      if (res.success) {
        setRewardData({
          xp: res.xpAward || 10,
          coins: res.coinsAward || 10,
          levelUp: !!res.levelUp,
          perfectDay: !!res.perfectDayBonus,
          newLevel: res.newLevel || currentLevel
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        setIsCelebrationVisible(true);
      }
    } catch (e: any) {
      Alert.alert("Error completing goal", e.message || "Something went wrong.");
    } finally {
      setIsMutationLoading(false);
      setSelectedGoal(null);
    }
  };

  const handleSkip = async (goal: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setIsMutationLoading(true);
    try {
      await skipGoal({ id: goal._id });
    } catch (e: any) {
      Alert.alert("Skip Failed", e.message || "Could not skip goal.");
    } finally {
      setIsMutationLoading(false);
    }
  };

  // Filter CBT goals (completed CBT sessions) vs Condition assigned goals
  const cbtGoals = (dailyGoals || []).filter(
    (g) =>
      Boolean(g.cbtSessionId) ||
      g.category?.toLowerCase() === "cbt" ||
      g.category?.toLowerCase() === "cbt_recommended" ||
      g.category?.toLowerCase()?.includes("cbt")
  );

  const conditionGoals = (dailyGoals || []).filter(
    (g) =>
      !(
        Boolean(g.cbtSessionId) ||
        g.category?.toLowerCase() === "cbt" ||
        g.category?.toLowerCase() === "cbt_recommended" ||
        g.category?.toLowerCase()?.includes("cbt")
      )
  );

  const renderGoalItem = (goal: any, isCbtType: boolean) => {
    const diffColors: Record<string, string> = {
      easy: "#10B981",
      medium: "#F59E0B",
      large: "#8B5CF6",
      very_small: "#3B82F6"
    };
    const diffColor = diffColors[goal.difficulty] || "#64748B";

    return (
      <View
        key={goal._id}
        style={[
          styles.goalCard,
          goal.completed && styles.goalCardCompleted,
          goal.isDailyChallenge && styles.challengeGoalCard,
          isCbtType ? styles.cbtGoalCardBorder : styles.conditionGoalCardBorder
        ]}
      >
        {/* Left checkbox */}
        <TouchableOpacity
          style={[styles.checkbox, goal.completed && styles.checkboxActive]}
          onPress={() => !goal.completed && handleTriggerComplete(goal)}
          disabled={goal.completed || goal.skipped}
        >
          {goal.completed && <Ionicons name="checkmark" size={16} color="#FFF" />}
        </TouchableOpacity>

        {/* Mid Details */}
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => handleOpenGoalDetails(goal)}
          disabled={goal.completed || goal.skipped}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
            {isCbtType ? (
              <View style={styles.cbtBadge}>
                <Ionicons name="sparkles" size={10} color="#6D28D9" style={{ marginRight: 2 }} />
                <Text style={styles.cbtBadgeText}>CBT GOAL</Text>
              </View>
            ) : (
              <View style={styles.assignedBadge}>
                <Ionicons name="fitness-outline" size={10} color="#047857" style={{ marginRight: 2 }} />
                <Text style={styles.assignedBadgeText}>PATIENT GOAL</Text>
              </View>
            )}

            {goal.isDailyChallenge && (
              <View style={styles.challengeBadge}>
                <Text style={styles.challengeBadgeText}>CHALLENGE</Text>
              </View>
            )}

            <View style={[styles.diffIndicator, { backgroundColor: diffColor + "15" }]}>
              <Text style={[styles.diffIndicatorText, { color: diffColor }]}>
                {goal.difficulty.toUpperCase().replace("_", " ")}
              </Text>
            </View>
          </View>

          <Text style={[styles.goalTitleText, goal.completed && styles.goalTextCompleted]}>
            {goal.goalTitle}
          </Text>
          <Text style={styles.goalDescText} numberOfLines={1}>{goal.goalDescription}</Text>

          {goal.aiReason ? (
            <View style={styles.aiReasonBox}>
              <Ionicons name="bulb-outline" size={11} color="#6D28D9" style={{ marginRight: 4 }} />
              <Text style={styles.aiReasonText} numberOfLines={1}>
                {goal.aiReason}
              </Text>
            </View>
          ) : null}

          {goal.scheduledTime ? (
            <View style={styles.scheduledRow}>
              <Ionicons name="alarm-outline" size={12} color="#6D28D9" style={{ marginRight: 4 }} />
              <Text style={styles.scheduledText}>
                Scheduled: {new Date(goal.scheduledTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Right Points/XP award badge */}
        <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginLeft: 6 }}>
          <View style={styles.xpRewardBadge}>
            <Text style={styles.xpRewardText}>+{goal.xpAwarded || goal.points} XP</Text>
          </View>
          {!goal.completed && !goal.skipped && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => handleOpenGoalDetails(goal)} style={styles.smallCircleButton}>
                <Ionicons name="alarm-outline" size={16} color="#6D28D9" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSkip(goal)} style={styles.smallCircleButton}>
                <Ionicons name="close" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F4F3FF', '#E0DBFF']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(30, insets.top),
            paddingBottom: Math.max(20, insets.bottom + 20),
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back navigation & Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>MicroGoals Hub</Text>
          <Text style={styles.subtitle}>Build consistency with tiny, restorative daily habits.</Text>
        </View>

        {/* 1. GAMIFICATION HUB HEADER */}
        <View style={styles.gamificationHub}>
          <View style={styles.xpRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>LVL {currentLevel}</Text>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpBar, { width: `${xpPercent * 100}%` }]} />
              <Text style={styles.xpProgressLabel}>{xpProgress} / {xpNeeded} XP</Text>
            </View>
          </View>

          <View style={styles.economyRow}>
            <View style={styles.ecoItem}>
              <View style={{ marginBottom: 2 }}>
                <CalmPointToken size={22} />
              </View>
              <Text style={styles.ecoVal}>{coinsVal}</Text>
              <Text style={styles.ecoLbl}>Coins</Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.ecoItem}>
              <Ionicons name="flame" size={22} color="#EF4444" style={{ marginBottom: 2 }} />
              <Text style={styles.ecoVal}>{streakInfo?.currentStreak ?? 0} Days</Text>
              <Text style={styles.ecoLbl}>Active Streak</Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.ecoItem}>
              <Ionicons name="snow" size={22} color="#3B82F6" style={{ marginBottom: 2 }} />
              <Text style={styles.ecoVal}>{streakInfo?.frozen ? "Active" : "Ready"}</Text>
              <Text style={styles.ecoLbl}>Freeze Lock</Text>
            </View>
          </View>
        </View>

        {/* Tab Selection */}
        <View style={styles.tabsRow}>
          {[
            { id: "goals", label: "Daily Goals" },
            { id: "progress", label: "Missions" },
            { id: "history", label: "Analytics" }
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, activeTab === tab.id && styles.tabButtonActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                setActiveTab(tab.id as any);
              }}
            >
              <Text style={[styles.tabButtonText, activeTab === tab.id && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ==========================================
            TAB 1: TODAY'S GOALS & CHECK-IN
            ========================================== */}
        {activeTab === "goals" && (
          <View style={styles.tabSection}>
            <View style={{ width: '100%', gap: 12 }}>
              {/* Morning checkin check */}
              {!todayCheckin ? (
                <View style={styles.glassCard}>
                  <Text style={styles.checkinTitle}>Morning Check-in</Text>
                  <Text style={styles.checkinSubtitle}>How are you feeling today? Your choice will adapt today's wellness plan.</Text>

                  {isCheckinLoading ? (
                    <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 20 }} />
                  ) : (
                    <View style={styles.moodGrid}>
                      {MOODS.map(mood => (
                        <TouchableOpacity
                          key={mood.value}
                          style={styles.moodBtn}
                          onPress={() => handleMoodSelect(mood.value)}
                        >
                          <Text style={styles.moodText}>{mood.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.moodBanner}>
                  <Ionicons name="sunny-outline" size={20} color="#6D28D9" style={{ marginRight: 8 }} />
                  <Text style={styles.moodBannerText}>
                    Today's check-in: <Text style={{ fontWeight: 'bold' }}>{todayCheckin.mood.toUpperCase()}</Text>. Focus is adjusted.
                  </Text>
                </View>
              )}

              {/* Progress bar */}
              {totalGoalsCount > 0 && (
                <View style={styles.glassCard}>
                  <View style={styles.progressBarRow}>
                    <Text style={styles.progressTitle}>Daily Focus Progress</Text>
                    <Text style={styles.progressValText}>{completedCount} of {totalGoalsCount} completed</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${progressPercent * 100}%` }]} />
                  </View>
                </View>
              )}

              {/* PART 1: CBT COMPLETED / RECOMMENDED GOALS */}
              <View style={styles.sectionHeaderContainer}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="sparkles" size={18} color="#7C3AED" />
                  <Text style={styles.sectionTitleText}>CBT Session Goals</Text>
                  <View style={styles.sectionBadgeCbt}>
                    <Text style={styles.sectionBadgeCbtText}>{cbtGoals.length} Active</Text>
                  </View>
                </View>
                <Text style={styles.sectionSubtext}>
                  Behavioral activation goals generated after completing CBT exercises.
                </Text>
              </View>

              {cbtGoals.length === 0 ? (
                <View style={styles.emptyCardBox}>
                  <Ionicons name="sparkles-outline" size={24} color="#A78BFA" style={{ marginBottom: 4 }} />
                  <Text style={styles.emptyCardTitle}>No CBT Goals Active Today</Text>
                  <Text style={styles.emptyCardDesc}>
                    Complete a CBT therapy exercise to unlock personalized post-session goals.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {cbtGoals.map((goal) => renderGoalItem(goal, true))}
                </View>
              )}

              {/* PART 2: PATIENT CONDITION ASSIGNED GOALS */}
              <View style={[styles.sectionHeaderContainer, { marginTop: 14 }]}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="fitness-outline" size={18} color="#059669" />
                  <Text style={styles.sectionTitleText}>Patient Condition Goals</Text>
                  <View style={styles.sectionBadgeAssigned}>
                    <Text style={styles.sectionBadgeAssignedText}>{conditionGoals.length} Active</Text>
                  </View>
                </View>
                <Text style={styles.sectionSubtext}>
                  Habits & daily goals assigned based on your health condition & screening.
                </Text>
              </View>

              {conditionGoals.length === 0 ? (
                <View style={styles.emptyCardBox}>
                  <Ionicons name="heart-outline" size={24} color="#34D399" style={{ marginBottom: 4 }} />
                  <Text style={styles.emptyCardTitle}>No Condition Goals Assigned Today</Text>
                  <Text style={styles.emptyCardDesc}>
                    Complete your morning check-in to generate daily condition assigned goals.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {conditionGoals.map((goal) => renderGoalItem(goal, false))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ==========================================
            TAB 2: MISSIONS & BADGES
            ========================================== */}
        {activeTab === "progress" && (
          <View style={styles.tabSection}>
            {/* Weekly Missions */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Weekly Missions</Text>
              <Text style={styles.checkinSubtitle}>Resets every Monday. Complete all tracks to earn bonus rewards.</Text>

              {weeklyMission ? (
                <View style={{ gap: 12, marginTop: 10 }}>
                  {/* Goal count track */}
                  <View style={styles.missionProgressBox}>
                    <View style={styles.missionHeaderRow}>
                      <Text style={styles.missionLabelText}>Complete 18 MicroGoals</Text>
                      <Text style={styles.missionProgressVal}>{weeklyMission.goalCountCurrent} / {weeklyMission.goalCountTarget}</Text>
                    </View>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionBar, { width: `${Math.min(1, weeklyMission.goalCountCurrent / weeklyMission.goalCountTarget) * 100}%` }]} />
                    </View>
                  </View>

                  {/* JPMR count track */}
                  <View style={styles.missionProgressBox}>
                    <View style={styles.missionHeaderRow}>
                      <Text style={styles.missionLabelText}>Complete JPMR Relaxation Twice</Text>
                      <Text style={styles.missionProgressVal}>{weeklyMission.jpmrCurrent} / {weeklyMission.jpmrTarget}</Text>
                    </View>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionBar, { width: `${Math.min(1, weeklyMission.jpmrCurrent / weeklyMission.jpmrTarget) * 100}%` }]} />
                    </View>
                  </View>

                  {/* Journaling track */}
                  <View style={styles.missionProgressBox}>
                    <View style={styles.missionHeaderRow}>
                      <Text style={styles.missionLabelText}>Journal Your Emotion Logs 5 Days</Text>
                      <Text style={styles.missionProgressVal}>{weeklyMission.journalCurrent} / {weeklyMission.journalTarget}</Text>
                    </View>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionBar, { width: `${Math.min(1, weeklyMission.journalCurrent / weeklyMission.journalTarget) * 100}%` }]} />
                    </View>
                  </View>

                  <View style={styles.missionRewardFooter}>
                    <Text style={styles.rewardText}>Reward: 100 Coins | 500 XP</Text>
                    {weeklyMission.completed && (
                      <View style={styles.completedMissionTag}>
                        <Text style={styles.completedTagText}>CLAIMED</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <ActivityIndicator size="small" color={Colors.primary} />
              )}
            </View>

            {/* Monthly Challenge */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Monthly Challenge</Text>
              {monthlyChallenge ? (
                <View style={{ gap: 12, marginTop: 10 }}>
                  <View style={styles.missionProgressBox}>
                    <View style={styles.missionHeaderRow}>
                      <Text style={styles.missionLabelText}>Complete 70 Habit Goals</Text>
                      <Text style={styles.missionProgressVal}>{monthlyChallenge.goalCountCurrent} / {monthlyChallenge.goalCountTarget}</Text>
                    </View>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionBar, { backgroundColor: '#8B5CF6', width: `${Math.min(1, monthlyChallenge.goalCountCurrent / monthlyChallenge.goalCountTarget) * 100}%` }]} />
                    </View>
                  </View>

                  <View style={styles.missionProgressBox}>
                    <View style={styles.missionHeaderRow}>
                      <Text style={styles.missionLabelText}>Reach 20 Day Streak</Text>
                      <Text style={styles.missionProgressVal}>{monthlyChallenge.streakCurrent} / {monthlyChallenge.streakTarget}</Text>
                    </View>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionBar, { backgroundColor: '#8B5CF6', width: `${Math.min(1, monthlyChallenge.streakCurrent / monthlyChallenge.streakTarget) * 100}%` }]} />
                    </View>
                  </View>

                  <View style={styles.monthlyRewardBox}>
                    <Text style={styles.rewardText}>Exclusive Reward: {monthlyChallenge.badgeRewardName} Badge</Text>
                    {monthlyChallenge.completed && (
                      <View style={[styles.completedMissionTag, { backgroundColor: '#8B5CF6' }]}>
                        <Text style={styles.completedTagText}>UNLOCKED</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <ActivityIndicator size="small" color={Colors.primary} />
              )}
            </View>

            {/* Badges Cabinet */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Badge Cabinet</Text>
              <View style={styles.badgesGrid}>
                {BADGES_DEFINITIONS.map(badge => {
                  const isEarned = badgesEarned.some(b => b.badgeId === badge.id);
                  return (
                    <View key={badge.id} style={[styles.badgeItemBox, !isEarned && styles.badgeLocked]}>
                      <View style={[styles.badgeIcon, { backgroundColor: isEarned ? badge.color + "15" : "#E2E8F0" }]}>
                        <Ionicons name={badge.icon as any} size={28} color={isEarned ? badge.color : "#94A3B8"} />
                      </View>
                      <Text style={styles.badgeNameText}>{badge.name}</Text>
                      <Text style={styles.badgeDescText}>{badge.desc}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ==========================================
            TAB 3: ANALYTICS & GOAL HISTORY
            ========================================== */}
        {activeTab === "history" && (
          <View style={styles.tabSection}>
            {/* Short Stats Summary */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Wellbeing Impact Analytics</Text>
              <View style={styles.analyticsRow}>
                <View style={styles.analyticBlock}>
                  <Text style={styles.analyticVal}>{(weeklySummary as any)?.completionRate ? `${Math.round((weeklySummary as any).completionRate)}%` : "0%"}</Text>
                  <Text style={styles.analyticLbl}>Completion Rate</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.analyticBlock}>
                  <Text style={styles.analyticVal}>{(goalHistory ?? []).filter(g => g.completed).length}</Text>
                  <Text style={styles.analyticLbl}>All Completed</Text>
                </View>
              </View>
            </View>

            {/* Mood Before vs After completion logs */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Feeling Shifts (After vs Before)</Text>
              {goalHistory.filter(g => g.completed && g.feelingAfter).length === 0 ? (
                <Text style={styles.emptyText}>Complete goals and track your feelings to view dynamic shifts here.</Text>
              ) : (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {goalHistory.filter(g => g.completed && g.feelingAfter).slice(0, 5).map(g => {
                    let feelLabel = "Same";
                    let badgeBg = "#F1F5F9";
                    let badgeColor = "#64748B";
                    if (g.feelingAfter === "better") {
                      feelLabel = "Better";
                      badgeBg = "#D1FAE5";
                      badgeColor = "#065F46";
                    } else if (g.feelingAfter === "worse") {
                      feelLabel = "Worse";
                      badgeBg = "#FEE2E2";
                      badgeColor = "#991B1B";
                    }

                    return (
                      <View key={g._id} style={styles.historyRowItem}>
                        <Text style={styles.historyRowTitle}>{g.goalTitle}</Text>
                        <View style={[styles.feelingBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.feelingBadgeText, { color: badgeColor, fontWeight: '700' }]}>{feelLabel}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Completed Logs Timeline */}
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>History Timeline</Text>
              {goalHistory.length === 0 ? (
                <Text style={styles.emptyText}>Your goal timeline is empty. Start today!</Text>
              ) : (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {goalHistory.slice(0, 15).map(g => (
                    <View key={g._id} style={styles.historyTimelineCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyGoalName, g.skipped && { textDecorationLine: 'line-through', color: '#94A3B8' }]}>
                          {g.goalTitle}
                        </Text>
                        <Text style={styles.historyGoalDate}>
                          {new Date(g.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <View style={[styles.statusTag, { backgroundColor: g.completed ? "#D1FAE5" : "#F1F5F9" }]}>
                        <Text style={[styles.statusTagText, { color: g.completed ? "#065F46" : "#64748B" }]}>
                          {g.completed ? "COMPLETED" : g.skipped ? "SKIPPED" : "PENDING"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* DETAIL DRAWER / POPUP */}
      <Modal visible={isDetailsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedGoal && (
              <View style={{ width: '100%' }}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Goal Details</Text>
                  <TouchableOpacity onPress={() => setIsDetailsVisible(false)}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.detailsTitle}>{selectedGoal.goalTitle}</Text>
                <Text style={styles.detailsDesc}>{selectedGoal.goalDescription}</Text>

                <View style={styles.detailCard}>
                  <Ionicons name="leaf-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Category</Text>
                    <Text style={styles.detailVal}>{selectedGoal.category}</Text>
                  </View>
                </View>

                <View style={styles.detailCard}>
                  <Ionicons name="help-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Clinical Benefit</Text>
                    <Text style={styles.detailVal}>Helps to calm cortisol and lower physical distress.</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <Button
                    title="Schedule Reminder"
                    onPress={handleOpenRelativeScheduling}
                    style={styles.actionBtn}
                    variant="primary"
                  />
                  <Button
                    title="Mark Completed Now"
                    onPress={() => {
                      setIsDetailsVisible(false);
                      handleTriggerComplete(selectedGoal);
                    }}
                    style={styles.actionBtnOutline}
                    variant="outline"
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* SMART RELATIVE SCHEDULING MODAL */}
      <Modal visible={isScheduleVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Smart Schedule</Text>
              <TouchableOpacity onPress={() => setIsScheduleVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.checkinSubtitle}>Choose relative delay from current time. Reminders will notify you automatically.</Text>

            <View style={styles.relativeGrid}>
              {[
                { label: "Start Now", min: 1 },
                { label: "In 10 Minutes", min: 10 },
                { label: "In 30 Minutes", min: 30 },
                { label: "In 1 Hour", min: 60 },
                { label: "This Evening", min: 180 },
                { label: "Before Bed", min: 300 }
              ].map(opt => (
                <TouchableOpacity
                  key={opt.label}
                  style={styles.relativeBtn}
                  onPress={() => handleScheduleSelect(opt.min)}
                >
                  <Text style={styles.relativeBtnText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* SNOOZE PANEL */}
      <Modal visible={isSnoozeVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Snooze Reminder</Text>
              <TouchableOpacity onPress={() => setIsSnoozeVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.checkinSubtitle}>Delay this action for a short break:</Text>

            <View style={styles.relativeGrid}>
              {[
                { label: "Snooze 10m", min: 10 },
                { label: "Snooze 30m", min: 30 },
                { label: "Snooze 1h", min: 60 }
              ].map(opt => (
                <TouchableOpacity
                  key={opt.label}
                  style={styles.relativeBtn}
                  onPress={() => handleSnoozeSelect(opt.min)}
                >
                  <Text style={styles.relativeBtnText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* POST-COMPLETION FEELING INPUT */}
      <Modal visible={isFeelingVisible} transparent animationType="fade">
        <View style={styles.feelingOverlay}>
          <View style={styles.feelingModalContent}>
            <Text style={styles.feelingPromptTitle}>Reflective Moment</Text>
            <Text style={styles.feelingPromptDesc}>How do you feel after completing this wellness action?</Text>

            <View style={styles.feelingActionRow}>
              {[
                { label: "Better", val: "better" },
                { label: "Same", val: "same" },
                { label: "Worse", val: "worse" }
              ].map(opt => (
                <TouchableOpacity
                  key={opt.val}
                  style={styles.feelingCardOption}
                  onPress={() => handleCompleteWithFeeling(opt.val)}
                >
                  <Text style={styles.feelingCardOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* CELEBRATION MODAL */}
      <Modal visible={isCelebrationVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.celebrationContent}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <MitraAvatar state="celebrating" size="md" />
            </View>
            <Text style={styles.celebrationTitle}>Brilliant Job!</Text>
            <Text style={styles.celebrationMessage}>
              You earned <Text style={{ fontWeight: 'bold', color: Colors.primary }}>+{rewardData?.xp} XP</Text> and <Text style={{ fontWeight: 'bold', color: '#D97706' }}>+{rewardData?.coins} Coins</Text>!
            </Text>

            {rewardData?.levelUp && (
              <View style={styles.levelUpNotice}>
                <Ionicons name="trophy" size={24} color="#F59E0B" style={{ marginRight: 8 }} />
                <Text style={styles.levelUpText}>LEVELED UP! Reached Level {rewardData.newLevel}</Text>
              </View>
            )}

            {rewardData?.perfectDay && (
              <View style={styles.perfectDayNotice}>
                <Ionicons name="star" size={24} color="#10B981" style={{ marginRight: 8 }} />
                <Text style={styles.perfectDayText}>PERFECT DAY BONUS! +100 XP</Text>
              </View>
            )}

            <Button
              title="Awesome"
              onPress={() => setIsCelebrationVisible(false)}
              style={[styles.actionBtn, { marginTop: 20 }]}
            />
          </View>
        </View>
      </Modal>

      {isMutationLoading && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F3FF',
  },
  content: {
    padding: Theme.spacing.lg,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    marginBottom: Theme.spacing.md,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: Theme.spacing.xs,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  gamificationHub: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: Theme.spacing.md + 2,
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    ...Theme.shadows.tertiary,
    marginBottom: Theme.spacing.md,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: Theme.spacing.md,
  },
  levelBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
  },
  levelText: {
    color: Colors.white,
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  xpTrack: {
    flex: 1,
    height: 24,
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  xpBar: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  xpProgressLabel: {
    alignSelf: 'center',
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: Colors.text,
    zIndex: 1,
  },
  economyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  ecoItem: {
    alignItems: 'center',
  },
  ecoIcon: {
    fontSize: 22,
  },
  ecoVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.text,
    marginTop: 2,
  },
  ecoLbl: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 9,
    color: Colors.textSecondary,
  },
  verticalDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    padding: 4,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabButtonText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  tabButtonTextActive: {
    color: Colors.white,
  },
  tabSection: {
    width: '100%',
    gap: Theme.spacing.md,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: Theme.spacing.lg,
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    ...Theme.shadows.tertiary,
    marginBottom: Theme.spacing.md,
  },
  checkinTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 4,
  },
  checkinSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Theme.spacing.md,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodBtn: {
    backgroundColor: '#FAF5FF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8DFFA',
    paddingVertical: Theme.spacing.xs + 2,
    paddingHorizontal: Theme.spacing.sm,
  },
  moodText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.text,
  },
  moodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#E8DFFA',
    padding: Theme.spacing.md,
    borderRadius: 18,
    width: '100%',
  },
  moodBannerText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: Colors.text,
  },
  progressBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Theme.spacing.xs,
  },
  progressTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.text,
  },
  progressValText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#FAF9FF',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: Colors.text,
    width: '100%',
    marginBottom: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  goalCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Theme.spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EBE9FE',
    ...Theme.shadows.tertiary,
    alignItems: 'center',
  },
  goalCardCompleted: {
    opacity: 0.6,
    backgroundColor: '#F8FAFC',
  },
  challengeGoalCard: {
    borderColor: '#F59E0B',
    borderWidth: 1.8,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  challengeBadge: {
    backgroundColor: '#D97706',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  challengeBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontFamily: Theme.fontFamily.bold,
  },
  diffIndicator: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  diffIndicatorText: {
    fontSize: 8,
    fontFamily: Theme.fontFamily.bold,
  },
  goalTitleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: Colors.text,
    marginTop: 2,
  },
  goalTextCompleted: {
    textDecorationLine: 'line-through',
  },
  goalDescText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  scheduledText: {
    fontSize: 9,
    color: '#6D28D9',
    fontFamily: Theme.fontFamily.bold,
  },
  xpRewardBadge: {
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E8DFFA',
  },
  xpRewardText: {
    color: Colors.primary,
    fontSize: 10,
    fontFamily: Theme.fontFamily.bold,
  },
  smallCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FAF5FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DFFA',
  },
  missionProgressBox: {
    width: '100%',
    marginBottom: 8,
  },
  missionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  missionLabelText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.text,
  },
  missionProgressVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
  },
  missionTrack: {
    height: 6,
    backgroundColor: '#FAF9FF',
    borderRadius: 3,
    overflow: 'hidden',
  },
  missionBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  missionRewardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: Theme.spacing.xs + 2,
    marginTop: 4,
  },
  rewardText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: '#D97706',
  },
  completedMissionTag: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  completedTagText: {
    color: '#FFF',
    fontSize: 8,
    fontFamily: Theme.fontFamily.bold,
  },
  monthlyRewardBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: Theme.spacing.xs + 2,
    marginTop: 4,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    justifyContent: 'space-between',
  },
  badgeItemBox: {
    width: (width - 76) / 3,
    alignItems: 'center',
    marginVertical: 4,
  },
  badgeLocked: {
    opacity: 0.4,
  },
  badgeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeNameText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: Colors.text,
    textAlign: 'center',
  },
  badgeDescText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 7,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 1,
  },
  analyticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  analyticBlock: {
    alignItems: 'center',
    flex: 1,
  },
  analyticVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: Colors.primary,
  },
  analyticLbl: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 10,
    color: Colors.textSecondary,
  },
  historyRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#FAF9FF',
  },
  historyRowTitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.text,
  },
  feelingBadge: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E8DFFA',
  },
  feelingBadgeText: {
    fontSize: 9,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.primary,
  },
  historyTimelineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: Theme.spacing.md,
  },
  historyGoalName: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.text,
  },
  historyGoalDate: {
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusTag: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusTagText: {
    fontSize: 8,
    fontFamily: Theme.fontFamily.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Theme.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : 28,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Theme.spacing.md,
  },
  modalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: Colors.text,
  },
  detailsTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: Colors.primary,
    marginBottom: Theme.spacing.xs,
  },
  detailsDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Theme.spacing.md,
  },
  detailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F8FF',
    borderRadius: 16,
    padding: Theme.spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  detailLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: Colors.textSecondary,
  },
  detailVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.text,
    marginTop: 2,
  },
  modalActions: {
    marginTop: Theme.spacing.md,
    gap: 8,
  },
  relativeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.xs,
  },
  relativeBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9F8FF',
    borderWidth: 1.5,
    borderColor: '#EDE9FE',
    borderRadius: 18,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
  },
  relativeBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.text,
  },
  feelingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feelingModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: Theme.spacing.lg,
    width: width - 48,
    alignItems: 'center',
  },
  feelingPromptTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: Colors.primary,
    marginBottom: 6,
  },
  feelingPromptDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
  },
  feelingActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: Theme.spacing.xs,
  },
  feelingCardOption: {
    flex: 1,
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#EDE9FE',
    borderRadius: 16,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
  },
  feelingCardOptionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.text,
  },
  celebrationContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Theme.spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  celebrationTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: '#D97706',
    marginBottom: Theme.spacing.xs,
  },
  celebrationMessage: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  levelUpNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    padding: Theme.spacing.md,
    borderRadius: 18,
    marginTop: Theme.spacing.md,
  },
  levelUpText: {
    color: '#D97706',
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  perfectDayNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: Theme.spacing.md,
    borderRadius: 18,
    marginTop: Theme.spacing.sm,
  },
  perfectDayText: {
    color: '#065F46',
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  actionBtn: {
    width: '100%',
  },
  actionBtnOutline: {
    width: '100%',
  },
  sectionHeaderContainer: {
    marginTop: 6,
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: Colors.text,
  },
  sectionBadgeCbt: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  sectionBadgeCbtText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: '#6D28D9',
  },
  sectionBadgeAssigned: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sectionBadgeAssignedText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: '#047857',
  },
  sectionSubtext: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  cbtGoalCardBorder: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF5FF',
  },
  conditionGoalCardBorder: {
    borderColor: '#E2E8F0',
  },
  cbtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cbtBadgeText: {
    fontSize: 9,
    fontFamily: Theme.fontFamily.bold,
    color: '#6D28D9',
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  assignedBadgeText: {
    fontSize: 9,
    fontFamily: Theme.fontFamily.bold,
    color: '#047857',
  },
  emptyCardBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 16,
    padding: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 4,
  },
  emptyCardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: Colors.text,
    marginTop: 2,
  },
  emptyCardDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  aiReasonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  aiReasonText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: '#6D28D9',
    flex: 1,
  },
});
