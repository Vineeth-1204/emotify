import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Dimensions, Animated, Modal, TextInput, Image, Linking } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Theme } from "@/constants/Theme";
import { EMOTIONS } from "@/constants/Screening";
import {
  getDailyCheckinNextStep,
  getEmotionMapPrimaryForDailyMood,
} from "@/common/phase6EmotionEntry";
import { getCurrentEmotyAction } from "@/common/homeEmotyAction";
import { getEmotyPresence, type CheckinMood } from "@/common/emotyPresence";
import { EmotyPresence } from "@/components/avatar/EmotyPresence";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { Button } from "@/components/ui/Button";
import { getDisplayLevel } from "@/utils/triage";
import { generateInsightMessage } from "@/utils/insights";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useAvatar } from "@/context/AvatarContext";
import { useLanguage } from "@/context/LanguageContext";
import { EmotyAvatar } from "@/components/avatar/EmotyAvatar";
import { HELPLINE_DIAL_URL } from "@/common/crisisResources";
import { resolveAvatarPresentationState } from "@/common/avatarPresentation";
import { CalmPointToken, PlantProgress } from "@/components/svg/system";
import { HappyEmotionIcon, CalmEmotionIcon, SadEmotionIcon, WorriedEmotionIcon } from "@/components/svg/emotions";
import { MindfulnessActivityIcon, MuscleRelaxActivityIcon, JournalActivityIcon, HabitMicrogoalIcon, BreathingIcon, GroundingIcon } from "@/components/svg/activities";
import { ACTIVE_SCREENING_QUESTIONS_COUNT } from "@/constants/Screening";
import { getLocalDateString } from "@/utils/date";

const { width } = Dimensions.get('window');

const TOTAL_QUESTIONS = ACTIVE_SCREENING_QUESTIONS_COUNT;
const SCREENING_STORE_KEY = "screening_progress";

function getAppointmentTimeLeft(startTime: number, endTime: number, now: number): string | null {
  if (now > endTime) return null; // already passed

  if (now >= startTime && now <= endTime) {
    const diffMs = endTime - now;
    const mins = Math.floor(diffMs / (60 * 1000));
    const secs = Math.floor((diffMs % (60 * 1000)) / 1000);
    return `Ongoing (${mins} mins ${secs} sec left)`;
  }

  const diffMs = startTime - now;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) {
    return `${diffSecs} sec left`;
  }

  if (diffMins < 60) {
    const secs = diffSecs % 60;
    return `${diffMins} mins ${secs} sec left`;
  }

  if (diffHrs < 24) {
    const mins = diffMins % 60;
    return `${diffHrs} hrs ${mins} mins left`;
  }

  const hrs = diffHrs % 24;
  return `${diffDays} days ${hrs} hrs left`;
}

function AppointmentCountdown({
  startTime,
  endTime,
  colors,
}: {
  startTime: number;
  endTime: number;
  colors: any;
}) {
  const [timeLeft, setTimeLeft] = React.useState<string | null>(() =>
    getAppointmentTimeLeft(startTime, endTime, Date.now())
  );
  const [isOngoing, setIsOngoing] = React.useState(() => {
    const now = Date.now();
    return now >= startTime && now <= endTime;
  });

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const left = getAppointmentTimeLeft(startTime, endTime, now);
      setTimeLeft(left);
      setIsOngoing(now >= startTime && now <= endTime);
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, endTime]);

  if (!timeLeft) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <Ionicons
        name="time-outline"
        size={14}
        color={isOngoing ? '#EF4444' : colors.primary}
      />
      <Text style={{
        fontFamily: Theme.fontFamily.bold,
        fontSize: 13,
        color: isOngoing ? '#EF4444' : colors.primary
      }}>
        {timeLeft}
      </Text>
    </View>
  );
}

function ToolCard({
  tool,
  colors,
  styles,
  onPress,
  isFullWidth
}: {
  tool: any;
  colors: any;
  styles: any;
  onPress: () => void;
  isFullWidth: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const { width } = Dimensions.get('window');

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 100,
      friction: 6
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 6
    }).start();
  };

  const getToolColors = (id: string) => {
    switch (id) {
      case 'emotion-map':
        return { bg: '#F0FDF4', border: '#DCFCE7', accent: '#22C55E' };
      case 'jpmr':
        return { bg: '#EFF6FF', border: '#DBEAFE', accent: '#3B82F6' };
      case 'reframe':
        return { bg: '#FAF5FF', border: '#F3E8FF', accent: '#A855F7' };
      case 'microgoals':
        return { bg: '#FFF7ED', border: '#FFEDD5', accent: '#F97316' };
      default:
        return { bg: '#FFFFFF', border: '#F1F5F9', accent: colors.primary };
    }
  };

  const toolColor = getToolColors(tool.id);

  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
      <TouchableOpacity
        style={[
          styles.toolCard,
          isFullWidth && { width: width - Theme.spacing.lg * 2, backgroundColor: '#FFFFFF' },
          { backgroundColor: toolColor.bg, borderColor: toolColor.border, borderWidth: 1.5 },
          tool.locked && { opacity: 0.6 }
        ]}
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        <View style={[{ alignItems: 'center', width: '100%' }, isFullWidth && { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }]}>
          <View style={[isFullWidth ? { flexDirection: 'row', alignItems: 'center', gap: 16 } : { alignItems: 'center' }]}>
            <View style={[
              styles.toolIconContainer,
              { backgroundColor: '#FFFFFF' },
              isFullWidth && { marginBottom: 0, width: 52, height: 52 }
            ]}>
              {tool.renderIcon ? tool.renderIcon(toolColor.accent) : <Ionicons name="apps-outline" size={24} color={toolColor.accent} />}
              {tool.locked && (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={12} color="#475569" />
                </View>
              )}
            </View>
            <View style={[isFullWidth ? { alignItems: 'flex-start' } : { alignItems: 'center' }]}>
              <Text style={[styles.toolTitle, { color: colors.text }, isFullWidth && { textAlign: 'left', fontSize: 18 }]}>{tool.title}</Text>
              <Text style={[styles.toolSub, { color: toolColor.accent }, isFullWidth && { textAlign: 'left', marginTop: 2 }]}>{tool.sub}</Text>
            </View>
          </View>
          {isFullWidth ? (
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          ) : (
            <View style={[styles.toolAccessBadge, { backgroundColor: toolColor.accent + '12' }]}>
              <Ionicons name="chevron-forward" size={12} color={toolColor.accent} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const [overallProgress, setOverallProgress] = React.useState(0);
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory as any) as any;
  const { setAvatarState, ageCohort, getDialogue, avatarName, avatarGender, isSafetyActive } = useAvatar();
  const { t } = useLanguage();
  // Set when the student arrives here straight from finishing the screening.
  const { from: arrivedFrom } = useLocalSearchParams<{ from?: string }>();

  const todayCheckin = useQuery(api.microGoals.getTodayCheckin, { dateStr: getLocalDateString() });
  const suggestedGoal = useQuery(api.microGoals.getEmotySuggestedGoal, { dateStr: getLocalDateString() });
  const submitMorningCheckin = useMutation(api.microGoals.submitMorningCheckin);

  // Phase 5: Local session dismissal state for guided follow-ups (respects user agency without database clutter)
  const [dismissedEmotionFollowup, setDismissedEmotionFollowup] = React.useState(false);
  const [dismissedGoalFollowup, setDismissedGoalFollowup] = React.useState(false);

  const [hasCheckedInToday, setHasCheckedInToday] = React.useState(true);
  const [isEditingCheckIn, setIsEditingCheckIn] = React.useState(false);
  const [selectedEmotionId, setSelectedEmotionId] = React.useState<string | null>(null);
  const [selectedHomeCard, setSelectedHomeCard] = React.useState<string | null>(null);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = React.useState(false);

  // Form State - Attendance Auto-prompt
  const [showAttendancePrompt, setShowAttendancePrompt] = React.useState(false);
  const [attendanceAppt, setAttendanceAppt] = React.useState<any>(null);
  const [attendanceYes, setAttendanceYes] = React.useState<boolean | null>(null);
  const [thankYou, setThankYou] = React.useState(false);
  const [rating, setRating] = React.useState("5");
  const [feedback, setFeedback] = React.useState("");
  const [reason, setReason] = React.useState("");
  const completeAppointment = useMutation(api.appointments.completeAppointment);

  // Reload screening progress every time this tab is focused
  useFocusEffect(
    React.useCallback(() => {
      async function loadProgress() {
        if (!user?.id) return;
        try {
          const key = `${SCREENING_STORE_KEY}_${user.id}`;
          const saved = await SecureStore.getItemAsync(key);
          if (saved) {
            const parsed = JSON.parse(saved) as Record<string, (number | null)[]>;
            const totalAnswered = Object.values(parsed).reduce(
              (sum, arr) => sum + arr.filter((a) => a !== null).length,
              0
            );
            setOverallProgress(Math.round((totalAnswered / TOTAL_QUESTIONS) * 100));
          } else {
            setOverallProgress(0);
          }
        } catch (e) {
          setOverallProgress(0);
        }
      }
      loadProgress();
    }, [user?.id])
  );

  const { isAuthenticated } = useAppAuth();
  const { isAuthenticated: isConvexAuthed } = useConvexAuth();
  const isReady = Boolean(isAuthenticated && isConvexAuthed && user?.id);

  const appUser = useQuery(api.users.getByClerkId, isReady ? {
    clerkId: user!.id,
  } : "skip");

  const latestScreening = useQuery(api.screening.getLatest, isReady ? {
    userId: user!.id,
  } : "skip");

  const latestTriage = useQuery(api.triage.getLatest, isReady ? {
    userId: user!.id,
  } : "skip");

  const recentEmotions = useQuery(api.emotionLogs.getRecent, isReady ? {
    userId: user!.id,
  } : "skip");

  const recentJpmr = useQuery(api.jpmrLogs.getRecent, isReady ? {
    userId: user!.id,
  } : "skip");

  const reinforcement = useQuery(api.reinforcement.generatePositiveMessage, isReady ? {
    userId: user!.id,
  } : "skip");

  const appointments = useQuery(api.appointments.getTwoWayAppointmentsForPatient, isReady ? { userId: user!.id } : "skip");
  const streakInfo = useQuery(api.microGoals.getStreak, isReady ? { userId: user!.id, dateStr: getLocalDateString() } : "skip");
  const gamification = useQuery(api.microGoals.getGamificationStats, isReady ? {} : "skip");
  const dailyGoals = useQuery(api.microGoals.getTodayGoals, isReady ? { userId: user!.id, dateStr: getLocalDateString() } : "skip");
  const completeGoalMutation = useMutation(api.microGoals.completeGoal);

  const handleToggleHabit = async (habit: any) => {
    if (habit.completed || habit.skipped) return;
    try {
      await completeGoalMutation({ id: habit._id, dateStr: getLocalDateString() });
    } catch (err: any) {
      console.warn("Could not complete habit:", err?.message || err);
    }
  };

  // Phase 5: Determine single primary Emoty next action derived from existing state
  const todayDateStr = getLocalDateString();
  const hasLoggedEmotionToday = React.useMemo(() => {
    if (!recentEmotions || recentEmotions.length === 0) return false;
    const latest = recentEmotions[0];
    if (!latest?.createdAt) return false;
    const latestDateStr = new Date(latest.createdAt).toISOString().split("T")[0];
    return latestDateStr === todayDateStr;
  }, [recentEmotions, todayDateStr]);

  const currentEmotyAction = React.useMemo(() => {
    return getCurrentEmotyAction({
      hasCheckedInToday,
      hasLoggedEmotionToday,
      dismissedEmotionFollowup,
      suggestedGoalStatus: suggestedGoal?.status,
      dismissedGoalFollowup,
    });
  }, [hasCheckedInToday, hasLoggedEmotionToday, dismissedEmotionFollowup, suggestedGoal, dismissedGoalFollowup]);

  const updateWellness = useMutation(api.wellness.updateProfile);

  React.useEffect(() => {
    if (user?.id) {
      updateWellness({ userId: user.id, timezoneOffsetMinutes: new Date().getTimezoneOffset() });
    }
  }, [user?.id]);

  const isScreeningComplete = (appUser ? !!appUser.screeningComplete : false) && latestTriage?.level !== "force_retest";

  // Mount detection for daily check-in (synced with Convex dailyCheckins & SecureStore)
  React.useEffect(() => {
    if (todayCheckin !== undefined) {
      setHasCheckedInToday(Boolean(todayCheckin));
      if (todayCheckin?.mood) {
        const moodToCard: Record<string, { cardId: string; backendCode: string }> = {
          good: { cardId: "good", backendCode: "happy" },
          happy: { cardId: "good", backendCode: "happy" },
          calm: { cardId: "calm", backendCode: "calm" },
          low: { cardId: "low", backendCode: "sad" },
          sad: { cardId: "low", backendCode: "sad" },
          heavy: { cardId: "heavy", backendCode: "worried" },
          worried: { cardId: "heavy", backendCode: "worried" },
        };
        const mapped = moodToCard[todayCheckin.mood];
        if (mapped) {
          setSelectedHomeCard(mapped.cardId);
          setSelectedEmotionId(mapped.backendCode);
        }
      }
      return;
    }
    async function checkTodayCheckIn() {
      if (!user?.id || !isScreeningComplete) return;
      try {
        const todayStr = getLocalDateString();
        const key = `last_checkin_date_${user.id}`;
        const lastCheckin = await SecureStore.getItemAsync(key);
        if (lastCheckin !== todayStr) {
          setHasCheckedInToday(false);
        } else {
          setHasCheckedInToday(true);
        }
      } catch (e) {
        console.error(e);
      }
    }
    checkTodayCheckIn();
  }, [user?.id, isScreeningComplete, todayCheckin]);

  // Mount detection for attendance prompt
  React.useEffect(() => {
    if (!appointments) return;
    const now = Date.now();
    for (const appt of appointments) {
      // Check if accepted and NOT yet feedback completed
      if (appt.status === 'accepted' && !appt.isFeedbackCompleted && appt.date && appt.time) {
        try {
          // Parse using same logic
          const match = appt.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
          let timeMs = 0;
          if (match) {
            let [_, hours, mins, modifier] = match;
            let h = parseInt(hours, 10);
            if (modifier.toUpperCase() === 'PM' && h < 12) h += 12;
            if (modifier.toUpperCase() === 'AM' && h === 12) h = 0;
            const d = new Date(`${appt.date}T${h.toString().padStart(2, '0')}:${mins}:00`);
            timeMs = d.getTime();
          } else {
            timeMs = new Date(`${appt.date} ${appt.time}`).getTime();
          }

          if (now > timeMs) {
            setAttendanceAppt(appt);
            setShowAttendancePrompt(true);
            break;
          }
        } catch (e) { }
      }
    }
  }, [appointments]);

  const handleAttendanceSubmit = async (attendedVal: "yes" | "no") => {
    try {
      await completeAppointment({
        appointmentId: attendanceAppt._id,
        attended: attendedVal,
        rating: attendedVal === "yes" ? parseInt(rating) : undefined,
        feedback: attendedVal === "yes" ? feedback : undefined,
        reason: attendedVal === "no" ? reason : undefined
      });
      setShowAttendancePrompt(false);
      setAttendanceYes(null);
      setThankYou(true);

      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true })
      ]).start();

      setTimeout(() => {
        setThankYou(false);
      }, 2000);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (appUser === undefined || latestScreening === undefined || latestTriage === undefined || appointments === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const alias = appUser?.alias || "there";

  const displayLevel = isScreeningComplete
    ? (latestTriage ? getDisplayLevel(latestTriage.level as any) : "Assessment Pending")
    : "Initial Screening Required";

  const phq9Score = latestScreening?.phq9_total ?? 0;
  const gad7Score = latestScreening?.gad7_total ?? 0;

  const { recommendation } = isScreeningComplete
    ? generateInsightMessage({
      triage_level: latestTriage?.level as any || 'mild',
      alias,
      recentEmotions: recentEmotions ?? [],
      recentTools: recentJpmr ?? [],
    })
    : {
      recommendation: "Welcome to Emotify! Please complete your initial screening test to assess your wellbeing and unlock personalized therapeutic tools."
    };

  const isSevere = latestTriage && ["severe", "suicide_flag", "psychosis_flag"].includes(latestTriage.level);

  const homePresence = getEmotyPresence({
    scene: "home",
    action: currentEmotyAction,
    highRisk: !!isSevere,
    justScreened: arrivedFrom === "screening" && currentEmotyAction === "checkin",
    safetyActive: isSafetyActive,
  });
  const checkinPresence = getEmotyPresence({
    scene: "checkin",
    selectedMood: selectedHomeCard as CheckinMood | null,
    safetyActive: isSafetyActive,
  });

  // Active emotion mapping for display
  const activeEmotion = recentEmotions && recentEmotions.length > 0 ? recentEmotions[0].emotion : null;
  const activeEmotionObj = EMOTIONS.find(e => e.id === activeEmotion);

  const tools = [
    { 
      id: 'emotion-map', 
      title: t("tools.howImFeelingTitle"),
      sub: t("tools.howImFeelingTag"),
      renderIcon: (c: string) => <MindfulnessActivityIcon size={24} color={c} />, 
      route: '/(auth)/tools/emotion-map', 
      locked: !isScreeningComplete 
    },
    { 
      id: 'breathing', 
      title: 'Breathing', 
      sub: 'Mindfulness', 
      renderIcon: (c: string) => <BreathingIcon size={24} color={c} />, 
      route: '/(auth)/tools/breathing', 
      locked: !isScreeningComplete 
    },
    { 
      id: 'grounding', 
      title: 'Grounding', 
      sub: 'Sensory', 
      renderIcon: (c: string) => <GroundingIcon size={24} color={c} />, 
      route: '/(auth)/tools/grounding', 
      locked: !isScreeningComplete 
    },
    { 
      id: 'jpmr', 
      title: 'Relax Now', 
      sub: 'Relaxation', 
      renderIcon: (c: string) => <MuscleRelaxActivityIcon size={24} color={c} />, 
      route: '/(auth)/tools/jpmr', 
      locked: !isScreeningComplete 
    },
    { 
      id: 'reframe', 
      title: 'Think Differently', 
      sub: 'Thoughts', 
      renderIcon: (c: string) => <JournalActivityIcon size={24} color={c} />, 
      route: '/(auth)/tools/reframe', 
      restricted: isSevere, 
      locked: !isScreeningComplete 
    },
    { 
      id: 'microgoals', 
      title: 'Small Steps', 
      sub: 'Habits', 
      renderIcon: (c: string) => <HabitMicrogoalIcon size={24} color={c} />, 
      route: '/(auth)/tools/emoty-goal', 
      locked: !isScreeningComplete 
    }
  ];

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleInlineCheckIn = async (emotionId: string) => {
    if (!user?.id) return;
    const wasEditingCheckIn = isEditingCheckIn;
    setIsSubmittingCheckIn(true);
    try {
      // Priority 7: Clean domain boundary - inline check-in writes strictly to dailyCheckins (no shadow write to emotionLogs)
      const todayStr = getLocalDateString();
      const moodMap: Record<string, string> = {
        happy: "good",
        calm: "calm",
        sad: "low",
        worried: "heavy",
      };
      const dailyMood = moodMap[emotionId] || "calm";
      await submitMorningCheckin({
        mood: dailyMood,
        dateStr: todayStr,
        allowUpdate: true,
      });

      // Update Emoty Avatar state using authoritative presentation resolver
      setAvatarState(resolveAvatarPresentationState({ userEmotion: emotionId, defaultState: "listening" }));

      await SecureStore.setItemAsync(`last_checkin_date_${user.id}`, todayStr);
      setHasCheckedInToday(true);
      setIsEditingCheckIn(false);

      setSelectedEmotionId(emotionId);
      const nextStep = getDailyCheckinNextStep(dailyMood, wasEditingCheckIn);
      if (nextStep.kind === "open_emotion_flow") {
        router.push({
          pathname: "/(auth)/tools/emotion-map",
          params: { primaryEmotion: nextStep.primaryEmotion },
        } as any);
      }
    } catch (e) {
      console.error(e);
      Alert.alert(t("common.error"), "Could not save your check-in. Please try again.");
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) return t("home.greetingMorning");
    if (hours >= 12 && hours < 17) return t("home.greetingAfternoon");
    if (hours >= 17 && hours < 22) return t("home.greetingEvening");
    return t("home.greetingNight");
  };

  const currentMoodCode = hasCheckedInToday
    ? (selectedEmotionId || todayCheckin?.mood || "calm")
    : (todayCheckin?.mood || "calm");
  const loggedMoodLabel = currentMoodCode === "good" || currentMoodCode === "happy"
    ? t("home.moodGood") 
    : currentMoodCode === "calm"
    ? t("home.moodCalm") 
    : currentMoodCode === "low" || currentMoodCode === "sad"
    ? t("home.moodLow") 
    : currentMoodCode === "heavy" || currentMoodCode === "worried"
    ? t("home.moodHeavy") 
    : t("home.moodCalm");

  const acknowledgedMood = ({ happy: "good", calm: "calm", sad: "low", worried: "heavy" } as Record<string, string>)[selectedEmotionId ?? ""] ?? todayCheckin?.mood;
  const emotionMapPrimary = getEmotionMapPrimaryForDailyMood(acknowledgedMood);
  const emotionFollowupCopy = acknowledgedMood === "good" || acknowledgedMood === "happy"
    ? "Glad you're feeling good today! Want to explore what's behind that feeling?"
    : acknowledgedMood === "calm"
      ? "Nice and calm. Would you like to take a quiet moment to explore that with me?"
      : acknowledgedMood === "low" || acknowledgedMood === "sad"
        ? "I hear you. Feeling low is tough—want to talk through it with me?"
        : acknowledgedMood === "heavy" || acknowledgedMood === "worried"
          ? "Sounds like things are feeling heavy right now. Let's look at what's going on together."
          : "Thanks for checking in! Would you like to tell me a little more about how you're feeling?";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Floating Glows */}
      <View style={[styles.glowBall, { top: -50, right: -50, backgroundColor: colors.primary + '15' }]} />
      <View style={[styles.glowBall, { bottom: 100, left: -50, backgroundColor: colors.secondary + '10' }]} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.greeting}>{getGreeting()}, {alias}</Text>
              <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.pointsBadge, { backgroundColor: colors.surface, borderColor: '#E2E8F0', borderWidth: 1 }]}>
                <CalmPointToken size={18} />
                <Text style={[styles.pointsBadgeText, { color: colors.text }]}>
                  {gamification?.coins ?? (appUser?.coins ?? 0)}
                </Text>
              </View>
              <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {alias.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Safety & Crisis Support Card when triage indicates high distress */}
        {isSevere && (
          <View style={styles.safetyCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={styles.safetyIconContainer}>
                <Ionicons name="shield-checkmark" size={22} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyTitle}>{t("home.safetyEmergencyTitle")}</Text>
                <Text style={styles.safetySubtitle}>{t("home.safetyEmergencySubtitle")}</Text>
              </View>
            </View>
            <View style={styles.safetyActionsRow}>
              <TouchableOpacity
                style={styles.safetyActionBtnPrimary}
                onPress={() => Linking.openURL(HELPLINE_DIAL_URL)}
                accessibilityRole="button"
                accessibilityLabel={t("home.helplineCallAction")}
                activeOpacity={0.85}
              >
                <Ionicons name="call" size={15} color="#FFFFFF" />
                <Text style={styles.safetyActionTextPrimary}>{t("home.helplineCallAction")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.safetyActionBtnSecondary}
                onPress={() => router.push('/(auth)/tools/appointments' as any)}
                accessibilityRole="button"
                accessibilityLabel={t("home.counselorConnectAction")}
                activeOpacity={0.85}
              >
                <Ionicons name="people" size={15} color="#DC2626" />
                <Text style={styles.safetyActionTextSecondary}>{t("home.counselorConnectAction")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.safetyActionBtnSecondary}
                onPress={() => router.push('/(auth)/tools/jpmr' as any)}
                accessibilityRole="button"
                accessibilityLabel={t("home.calmResetAction")}
                activeOpacity={0.85}
              >
                <Ionicons name="leaf" size={15} color="#059669" />
                <Text style={[styles.safetyActionTextSecondary, { color: "#059669" }]}>{t("home.calmResetAction")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Emoty Interactive Hero Card */}
        <View style={styles.emotyHeroCard}>
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC'] as any}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.emotyHeroContent}>
            <TouchableOpacity
              style={styles.emotyAvatarCol}
              activeOpacity={0.8}
              onPress={() => router.push('/(auth)/tools/companion' as any)}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${avatarName}`}
            >
              <EmotyAvatar 
                gender={avatarGender}
                state={homePresence.avatarState} 
                size={ageCohort === "13-18" ? "md" : "sm"} 
                live
              />
              <View style={[styles.avatarNameBadge, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.avatarNameBadgeText, { color: colors.primary }]}>{avatarName}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.emotyBubbleCol}>
              <View style={styles.emotySpeechBubble}>
                {/* Contextual Speech Text */}
                <Text style={styles.emotySpeechText}>
                  {homePresence.line
                    ? homePresence.line
                    : currentEmotyAction === "checkin"
                    ? `${getGreeting()}, ${alias}. Take a moment to check in with how you're feeling today.`
                    : currentEmotyAction === "emotion_followup"
                    ? emotionFollowupCopy
                    : currentEmotyAction === "goal_suggestion"
                    ? t("home.goalSuggestedCopy", { companionName: avatarName })
                    : "You're all caught up for today! Feel free to rest, or explore any tool below whenever you like."}
                </Text>

                {/* Primary Emoty Next Action (At most ONE at a time) */}
                {currentEmotyAction === "emotion_followup" && (
                  <View style={styles.emotyContextualActionRow}>
                    <TouchableOpacity
                      style={[styles.emotyActionBtnPrimary, { backgroundColor: colors.primary }]}
                      activeOpacity={0.85}
                      onPress={() => router.push({
                        pathname: '/(auth)/tools/emotion-map',
                        params: emotionMapPrimary ? { primaryEmotion: emotionMapPrimary } : {},
                      } as any)}
                      accessibilityRole="button"
                      accessibilityLabel="Talk to me about how you feel"
                    >
                      <Ionicons name="chatbubbles" size={13} color="#FFFFFF" />
                      <Text style={styles.emotyActionBtnTextPrimary}>Talk to me</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.emotyActionBtnSecondary}
                      activeOpacity={0.7}
                      onPress={() => setDismissedEmotionFollowup(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Maybe later"
                    >
                      <Text style={[styles.emotyActionBtnTextSecondary, { color: colors.textSecondary }]}>Maybe later</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {currentEmotyAction === "goal_suggestion" && suggestedGoal && (
                  <View style={styles.emotyGoalContainer}>
                    <View style={styles.emotyGoalTitleRow}>
                      <Ionicons name="sparkles" size={13} color="#16A34A" />
                      <Text style={[styles.emotyGoalPillTitle, { color: '#15803D' }]} numberOfLines={2}>
                        {suggestedGoal.goalTitle}
                      </Text>
                    </View>
                    {!!suggestedGoal.goalDescription && (
                      <Text style={styles.emotyGoalDescription} numberOfLines={2}>
                        {suggestedGoal.goalDescription}
                      </Text>
                    )}
                    <View style={styles.emotyContextualActionRow}>
                      <TouchableOpacity
                        style={[styles.emotyActionBtnPrimary, { backgroundColor: '#16A34A' }]}
                        activeOpacity={0.85}
                        onPress={() => router.push({
                          pathname: '/(auth)/tools/emoty-goal',
                          params: { start: '1' },
                        } as any)}
                        accessibilityRole="button"
                        accessibilityLabel={`Start: ${suggestedGoal.goalTitle}`}
                      >
                        <Text style={styles.emotyActionBtnTextPrimary}>Start</Text>
                        <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.emotyActionBtnSecondary}
                        activeOpacity={0.7}
                        onPress={() => setDismissedGoalFollowup(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Not now"
                      >
                        <Text style={[styles.emotyActionBtnTextSecondary, { color: colors.textSecondary }]}>Not now</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {currentEmotyAction === "all_caught_up" && (
                  <View style={[styles.emotyGoalPill, {
                    backgroundColor: '#F0FDF4',
                    borderColor: '#BBF7D0',
                    borderWidth: 1,
                  }]}>
                    <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                    <Text style={[styles.emotyGoalPillTitle, { color: '#15803D' }]}>
                      {suggestedGoal?.status === "all_completed"
                        ? "Today's activity complete. Nice work!"
                        : "You're all caught up for today."}
                    </Text>
                  </View>
                )}

                {/* Instant Action CTA Pill to open companion */}
                <TouchableOpacity
                  style={[styles.chatCtaPill, { backgroundColor: colors.primary + '12' }]}
                  activeOpacity={0.8}
                  onPress={() => router.push('/(auth)/tools/companion' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Chat with ${avatarName}`}
                >
                  <Ionicons name="chatbubble-ellipses" size={13} color={colors.primary} />
                  <Text style={[styles.chatCtaText, { color: colors.primary }]}>
                    {t("home.companionCta", { companionName: avatarName })}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.growthRow}>
                <PlantProgress 
                  stage={
                    !streakInfo?.currentStreak || streakInfo.currentStreak <= 1
                      ? "seed"
                      : streakInfo.currentStreak <= 3
                      ? "sprout"
                      : streakInfo.currentStreak <= 7
                      ? "plant"
                      : "garden"
                  } 
                  size={20} 
                />
                <Text style={styles.growthText}>
                  {streakInfo?.currentStreak ? t("home.moodStreakDays", { count: streakInfo.currentStreak }) : t("home.moodStreak")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* PRIMARY COMPANION INTERACTION: DAILY CHECK-IN SECTION */}
        {isScreeningComplete && (!hasCheckedInToday || isEditingCheckIn) && (
          <View style={styles.inlineCheckInContainer}>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC'] as any}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.inlineCheckInHeaderRow}>
              <View style={styles.sparkleBadge}>
                <Ionicons name="sparkles" size={12} color={colors.primary} />
                <Text style={styles.sparkleBadgeText}>{t("home.moodStreak")}</Text>
              </View>
            </View>
            <Text style={styles.inlineCheckInTitle}>{t("home.moodPrompt")}</Text>
            <Text style={styles.inlineCheckInSubtitle}>{t("home.moodSubtitle")}</Text>

            {/* 4 Cards Grid */}
            <View style={styles.homeCardsGrid}>
              {[
                { 
                  id: "good", 
                  title: t("home.moodGood"), 
                  sub: t("home.moodDescGood"), 
                  backendCode: "happy", 
                  color: "#F59E0B",
                  bgSelected: "#FFFBEB",
                  Icon: HappyEmotionIcon 
                },
                { 
                  id: "calm", 
                  title: t("home.moodCalm"), 
                  sub: t("home.moodDescCalm"), 
                  backendCode: "calm", 
                  color: "#10B981",
                  bgSelected: "#F0FDF4",
                  Icon: CalmEmotionIcon 
                },
                { 
                  id: "low", 
                  title: t("home.moodLow"), 
                  sub: t("home.moodDescLow"), 
                  backendCode: "sad", 
                  color: "#3B82F6",
                  bgSelected: "#EFF6FF",
                  Icon: SadEmotionIcon 
                },
                { 
                  id: "heavy", 
                  title: t("home.moodHeavy"), 
                  sub: t("home.moodDescHeavy"), 
                  backendCode: "worried", 
                  color: "#8B5CF6",
                  bgSelected: "#FAF5FF",
                  Icon: WorriedEmotionIcon 
                },
              ].map((card) => {
                const isSelected = selectedHomeCard === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    onPress={() => {
                      setSelectedHomeCard(card.id);
                      setSelectedEmotionId(card.backendCode);
                      setAvatarState(resolveAvatarPresentationState({ userEmotion: card.backendCode, defaultState: "listening" }));
                    }}
                    style={[
                      styles.homeMoodCard,
                      {
                        backgroundColor: isSelected ? card.bgSelected : '#FFFFFF',
                        borderColor: isSelected ? card.color : '#E2E8F0',
                        borderWidth: isSelected ? 2 : 1,
                      }
                    ]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.title}: ${card.sub}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.homeMoodIconBox, { backgroundColor: isSelected ? card.color + '25' : card.color + '12' }]}>
                      <card.Icon size={30} />
                    </View>
                    <Text style={[styles.homeMoodTitle, { color: card.color }]}>{card.title}</Text>
                    <Text style={styles.homeMoodSub}>{card.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Daily mood confirmation */}
            {selectedHomeCard && (
              <View style={styles.intensityContainer}>
                <EmotyPresence presence={checkinPresence} size="xs" style={{ marginTop: 14 }} />
                <Button
                  title={isSubmittingCheckIn ? t("common.saving") : t("common.confirm")}
                  onPress={() => {
                    if (selectedEmotionId) {
                      handleInlineCheckIn(selectedEmotionId);
                    }
                  }}
                  loading={isSubmittingCheckIn}
                  disabled={!selectedEmotionId || isSubmittingCheckIn}
                  style={{ marginTop: 14, minHeight: 48 }}
                />

                {isEditingCheckIn && (
                  <TouchableOpacity
                    onPress={() => setIsEditingCheckIn(false)}
                    style={{ marginTop: 10, alignItems: 'center', padding: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.cancel")}
                  >
                    <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 13, color: colors.textSecondary }}>
                      {t("common.cancel")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* DAILY CHECK-IN — ALREADY COMPLETED STATE */}
        {isScreeningComplete && hasCheckedInToday && !isEditingCheckIn && (
          <View style={styles.completedCheckInContainer}>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC'] as any}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.completedCheckInRow}>
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <View style={styles.completedBadgeRow}>
                  <View style={styles.completedBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                    <Text style={styles.completedBadgeText}>{t("home.checkInCompactTitle")}</Text>
                  </View>
                </View>
                <Text style={styles.completedMoodTitle} numberOfLines={1}>
                  {t("home.checkInMoodToday", { mood: loggedMoodLabel })}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setIsEditingCheckIn(true)}
                style={[styles.updateCheckInBtn, { backgroundColor: colors.primary + '14' }]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t("home.updateCheckIn")}
              >
                <Ionicons name="create-outline" size={14} color={colors.primary} />
                <Text style={[styles.updateCheckInBtnText, { color: colors.primary }]}>
                  {t("home.updateCheckIn")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Onboarding Banner Card (If screening not complete) */}
        {!isScreeningComplete && (
          <TouchableOpacity
            style={styles.onboardingCard}
            activeOpacity={0.9}
            onPress={() => router.push('/(auth)/screening' as any)}
          >
            <LinearGradient
              colors={['#4F46E5', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.onboardingGradient}
            >
              <View style={styles.onboardingHeader}>
                <View style={styles.onboardingIconContainer}>
                  <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.onboardingTitle}>Unlock Your Wellbeing Path</Text>
                  <Text style={styles.onboardingProgressText}>Screening {overallProgress}% Complete</Text>
                </View>
              </View>

              <Text style={styles.onboardingDesc}>
                {recommendation}
              </Text>

              <View style={styles.onboardingProgressBg}>
                <View style={[styles.onboardingProgressBar, { width: `${overallProgress}%` }]} />
              </View>

              <View style={styles.onboardingBtn}>
                <Text style={styles.onboardingBtnText}>
                  {overallProgress > 0 ? "Resume Assessment" : "Start Assessment"}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#4F46E5" />
              </View>
            </LinearGradient>
            <View style={[styles.heroGlow, { backgroundColor: '#7C3AED' }]} />
          </TouchableOpacity>
        )}

        {/* 4. TODAY'S HABITS SECTION (Replaces legacy wellbeing companion card) */}
        {isScreeningComplete && (
          <View style={styles.habitsSection}>
            <View style={styles.habitsHeaderRow}>
              <View style={styles.habitsTitleRow}>
                <Text style={styles.habitsTitle}>Today's Habits</Text>
                {Array.isArray(dailyGoals) && dailyGoals.length > 0 && (
                  <View style={styles.habitsBadge}>
                    <Text style={styles.habitsBadgeText}>
                      {dailyGoals.filter((g: any) => g.completed).length}/{dailyGoals.length}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/tools/microgoals' as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View all habits"
              >
                <Text style={styles.habitsViewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {/* Habit Cards or Empty State */}
            {dailyGoals && dailyGoals.length > 0 ? (
              <View style={styles.habitsList}>
                {dailyGoals.slice(0, 4).map((habit: any) => {
                  const isCompleted = habit.completed;
                  return (
                    <TouchableOpacity
                      key={habit._id}
                      style={[
                        styles.habitItemCard,
                        isCompleted && styles.habitItemCardCompleted,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => router.push('/(auth)/tools/microgoals' as any)}
                      accessibilityRole="button"
                      accessibilityLabel={`${habit.goalTitle}, ${isCompleted ? 'completed' : 'not completed'}`}
                    >
                      {/* Interactive checkbox */}
                      <TouchableOpacity
                        style={[
                          styles.habitCheckbox,
                          isCompleted && styles.habitCheckboxCompleted,
                        ]}
                        onPress={() => handleToggleHabit(habit)}
                        disabled={isCompleted || habit.skipped}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isCompleted }}
                        accessibilityLabel={`Mark ${habit.goalTitle} as ${isCompleted ? 'completed' : 'done'}`}
                      >
                        {isCompleted && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                      </TouchableOpacity>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.habitTitle,
                            isCompleted && styles.habitTitleCompleted,
                          ]}
                          numberOfLines={1}
                        >
                          {habit.goalTitle}
                        </Text>
                        {!!habit.goalDescription && (
                          <Text style={styles.habitDesc} numberOfLines={1}>
                            {habit.goalDescription}
                          </Text>
                        )}
                      </View>

                      {habit.points ? (
                        <View style={styles.habitPointsPill}>
                          <CalmPointToken size={13} />
                          <Text style={styles.habitPointsText}>+{habit.points}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.habitsEmptyCard}
                activeOpacity={0.85}
                onPress={() => router.push('/(auth)/tools/emoty-goal' as any)}
                accessibilityRole="button"
                accessibilityLabel="Start a small step today"
              >
                <LinearGradient
                  colors={['#FFFFFF', '#F8FAFC'] as any}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.habitsEmptyContent}>
                  <View style={[styles.habitsEmptyIconCircle, { backgroundColor: colors.primary + '15' }]}>
                    <HabitMicrogoalIcon size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.habitsEmptyTitle}>No habits scheduled yet</Text>
                    <Text style={styles.habitsEmptySubtitle}>Build routine with a gentle small step today.</Text>
                  </View>
                  <View style={[styles.habitsEmptyBtn, { backgroundColor: colors.primary }]}>
                    <Text style={styles.habitsEmptyBtnText}>Add</Text>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 5. SMALL STEPS & ACTIONABLE WELLBEING TOOLS */}
        <Text style={styles.sectionTitle}>{t("home.quickToolsTitle")}</Text>

        {/* Tools Grid */}
        <View style={styles.toolsGrid}>
          {tools.map((tool) => (
            <View key={tool.id}>
              <ToolCard
                tool={tool}
                colors={colors}
                styles={styles}
                isFullWidth={false}
                onPress={() => {
                  if (tool.locked) {
                    Alert.alert("Locked Module", "Please complete your initial Screening Test first to unlock therapeutic tools.");
                  } else if (tool.restricted) {
                    Alert.alert("Counselor Recommended", "This tool is best used with professional guidance during high distress.");
                  } else {
                    router.push(tool.route as any);
                  }
                }}
              />
            </View>
          ))}
        </View>

        {/* 6. EXISTING SECONDARY CONTENT: APPOINTMENTS & METRICS */}
        {/* Clinical Appointments Section */}
        {isScreeningComplete && (
          <View style={styles.appointmentSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Theme.spacing.md, marginTop: 8 }}>
              <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 20, color: colors.text }}>Today's Appointments</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/tools/appointments' as any)}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>View More</Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const todayStr = getLocalDateString();
              const todaysAppts = appointments?.filter((appt: any) => appt.date === todayStr && (appt.status === "accepted" || appt.status === "pending")) || [];

              if (todaysAppts.length === 0) {
                return (
                  <TouchableOpacity
                    style={styles.appointmentPromoCard}
                    activeOpacity={0.9}
                    onPress={() => router.push('/(auth)/tools/appointments' as any)}
                  >
                    <LinearGradient
                      colors={['#FFFFFF', '#F8FAFC'] as any}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.appointmentPromoRow}>
                      <View style={[styles.appointmentIconCircle, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.appointmentPromoTitle}>No sessions scheduled today</Text>
                        <Text style={styles.appointmentPromoSub}>Connect with your counselor for personal guidance.</Text>
                      </View>
                      <View style={styles.appointmentPromoBtn}>
                        <Text style={styles.appointmentPromoBtnText}>Schedule</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }

              return (
                <View style={{ gap: 12 }}>
                  {todaysAppts.map((appt: any) => {
                    return (
                      <View key={appt._id} style={styles.appointmentCard}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.95)', 'rgba(239, 246, 255, 0.95)'] as any}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.appointmentRow}>
                          <View style={[styles.appointmentIconCircle, { backgroundColor: colors.primary + '15' }]}>
                            <Ionicons name="calendar" size={22} color={colors.primary} />
                          </View>
                          <View style={styles.appointmentContent}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={styles.appointmentDate}>{appt.title}</Text>
                              <View style={styles.liveBadge}>
                                <Text style={styles.liveBadgeText}>{appt.status.toUpperCase()}</Text>
                              </View>
                            </View>
                            <Text style={styles.appointmentTime}>{appt.time}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        )}

        {/* Visual Wellbeing Metrics (Humanized, Student-Friendly) */}
        {isScreeningComplete && (() => {
          const emotionalPercentage = Math.round(((27 - phq9Score) / 27) * 100);
          const calmnessPercentage = Math.round(((21 - gad7Score) / 21) * 100);

          return (
            <View style={styles.scoreRow}>
              {/* Emotional Balance card */}
              <View style={styles.scoreCard}>
                <View style={styles.scoreHeaderRow}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="pulse-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.scoreBadgeMini}>
                    <Text style={[styles.scoreBadgeMiniText, { color: phq9Score >= 10 ? colors.error : colors.success }]}>
                      {phq9Score <= 4 ? t("home.badgeOptimal") : phq9Score <= 9 ? t("home.badgeGood") : phq9Score <= 14 ? t("home.badgeBalanced") : t("home.badgeNeedsCare")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.scoreValue}>{emotionalPercentage}<Text style={styles.scoreMax}>%</Text></Text>
                <Text style={styles.scoreLabel}>{t("home.emotionalBalance")}</Text>

                <View style={styles.metricTrack}>
                  <View
                    style={[
                      styles.metricFill,
                      {
                        width: `${Math.min(Math.max(emotionalPercentage, 5), 100)}%`,
                        backgroundColor: phq9Score <= 9 ? colors.success : phq9Score <= 14 ? colors.warning : colors.error
                      }
                    ]}
                  />
                </View>
                <Text style={styles.metricDesc}>{t("home.emotionalBalanceDesc")}</Text>
              </View>

              {/* Mind Calmness card */}
              <View style={styles.scoreCard}>
                <View style={styles.scoreHeaderRow}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.secondary + '15' }]}>
                    <Ionicons name="heart-outline" size={18} color={colors.secondary} />
                  </View>
                  <View style={styles.scoreBadgeMini}>
                    <Text style={[styles.scoreBadgeMiniText, { color: gad7Score >= 10 ? colors.error : colors.success }]}>
                      {gad7Score <= 4 ? t("home.badgeSerene") : gad7Score <= 9 ? t("home.badgeCalm") : gad7Score <= 14 ? t("home.badgeMildTension") : t("home.badgeNeedsCare")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.scoreValue}>{calmnessPercentage}<Text style={styles.scoreMax}>%</Text></Text>
                <Text style={styles.scoreLabel}>{t("home.mindCalmness")}</Text>

                <View style={styles.metricTrack}>
                  <View
                    style={[
                      styles.metricFill,
                      {
                        width: `${Math.min(Math.max(calmnessPercentage, 5), 100)}%`,
                        backgroundColor: gad7Score <= 7 ? colors.success : gad7Score <= 12 ? colors.warning : colors.error
                      }
                    ]}
                  />
                </View>
                <Text style={styles.metricDesc}>{t("home.mindCalmnessDesc")}</Text>
              </View>
            </View>
          );
        })()}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* 6. ATTENDANCE PROMPT MODAL */}
      <Modal visible={showAttendancePrompt} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity onPress={() => setShowAttendancePrompt(false)} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 8 }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>Did you attend appointment today?</Text>
            {attendanceAppt && (
              <Text style={{ color: '#64748B', textAlign: 'center', marginBottom: 20 }}>{attendanceAppt.title}</Text>
            )}

            {attendanceYes === null ? (
              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                <TouchableOpacity onPress={() => setAttendanceYes(true)} style={[{ padding: 12, borderRadius: 8, alignItems: 'center' }, { backgroundColor: '#10b981', flex: 1 }]}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Yes</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setAttendanceYes(false)} style={[{ padding: 12, borderRadius: 8, alignItems: 'center' }, { backgroundColor: '#ef4444', flex: 1 }]}><Text style={{ color: '#fff', fontWeight: 'bold' }}>No</Text></TouchableOpacity>
              </View>
            ) : attendanceYes === true ? (
              <View>
                <Text style={{ color: colors.text, marginBottom: 8, fontFamily: Theme.fontFamily.bold, textAlign: 'center' }}>Rate your session</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={`att-s-${star}`} onPress={() => setRating(star.toString())}>
                      <Ionicons name={parseInt(rating) >= star ? "star" : "star-outline"} size={40} color="#F59E0B" />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput placeholder="How did it go?" value={feedback} onChangeText={setFeedback} multiline style={[{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }, { height: 80, backgroundColor: colors.background, color: colors.text }]} placeholderTextColor={'#94a3b8'} />
                <TouchableOpacity onPress={() => handleAttendanceSubmit("yes")} style={[{ padding: 12, borderRadius: 8, alignItems: 'center' }, { backgroundColor: colors.primary, marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Submit Feedback</Text></TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={{ color: colors.text, marginBottom: 8, fontFamily: Theme.fontFamily.bold }}>Reason for not attending</Text>
                <TextInput placeholder="Why couldn't you make it?" value={reason} onChangeText={setReason} multiline style={[{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }, { height: 80, backgroundColor: colors.background, color: colors.text }]} placeholderTextColor={'#94a3b8'} />
                <TouchableOpacity onPress={() => handleAttendanceSubmit("no")} style={[{ padding: 12, borderRadius: 8, alignItems: 'center' }, { backgroundColor: colors.primary, marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Submit Reason</Text></TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* THANK YOU OVERLAY */}
      {thankYou && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10000, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background + 'EE' }]}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center', backgroundColor: '#FFFFFF', padding: 32, borderRadius: 24 }}>
            <View style={{ marginBottom: 16 }}>
              <EmotyAvatar state="celebrating" size="md" />
            </View>
            <Text style={{ fontSize: 28, fontFamily: Theme.fontFamily.bold, color: colors.primary }}>Thank You!</Text>
          </Animated.View>
        </View>
      )}

    </View>
  );
}

function stylesFactory(colors: any) {
  return {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glowBall: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  } as const,
  content: {
    padding: Theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: 150, // Generous padding so bottom tab bar never obscures buttons or content
  },
  header: {
    marginBottom: Theme.spacing.xxl,
  },
  greeting: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: colors.text,
    marginBottom: 4,
  },
  date: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: colors.textSecondary,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    ...Theme.shadows.tertiary,
  } as const,
  avatarText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  moodStatusBadge: {
    borderWidth: 1.5,
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  moodStatusText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    ...Theme.shadows.tertiary,
  } as const,
  pointsBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
  },
  emotyHeroCard: {
    borderRadius: 20,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    ...Theme.shadows.primary,
  } as const,
  emotyHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  } as const,
  emotyAvatarCol: {
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
  avatarNameBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  } as const,
  avatarNameBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
  },
  chatCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  } as const,
  chatCtaText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
  },
  emotyGoalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'stretch',
  } as const,
  emotyGoalPillTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  emotyGoalDescription: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: '#3F5F4B',
    marginTop: 2,
  },
  emotyGoalPillAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  } as const,
  emotyGoalPillActionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: '#16A34A',
  },
  emotyBubbleCol: {
    flex: 1,
  } as const,
  emotySpeechBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  } as const,
  emotySpeechText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  emotyContextualActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  } as const,
  emotyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    ...Theme.shadows.tertiary,
  } as const,
  emotyActionBtnTextPrimary: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  emotyActionBtnSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  } as const,
  emotyActionBtnTextSecondary: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
  },
  emotyGoalContainer: {
    marginTop: 8,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  } as const,
  emotyGoalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  } as const,
  growthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as const,
  growthText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  homeCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  } as const,
  homeMoodCard: {
    width: '48%',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    elevation: 0,
    shadowOpacity: 0,
  } as const,
  homeMoodIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  } as const,
  homeMoodTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    marginBottom: 2,
  },
  homeMoodSub: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  intensityContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  } as const,
  // Completed checkin styles
  completedCheckInContainer: {
    borderRadius: 20,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    ...Theme.shadows.primary,
  } as const,
  completedCheckInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  } as const,
  completedBadgeRow: {
    marginBottom: 4,
  } as const,
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  } as const,
  completedBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: '#059669',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as const,
  completedMoodTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  } as const,
  updateCheckInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexShrink: 0,
  } as const,
  updateCheckInBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  } as const,
  // Inline mood checkin styles
  inlineCheckInContainer: {
    borderRadius: 20,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    ...Theme.shadows.primary,
  } as const,
  inlineCheckInHeaderRow: {
    marginBottom: 6,
  },
  sparkleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  sparkleBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  inlineCheckInTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 4,
    marginTop: 4,
  },
  inlineCheckInSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: Theme.spacing.md,
    lineHeight: 18,
  },
  inlineMoodScroll: {
    paddingVertical: 4,
    gap: 10,
    flexDirection: 'row',
  } as const,
  inlineMoodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    ...Theme.shadows.tertiary,
  } as const,
  inlineEmojiBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  inlineMoodEmoji: {
    fontSize: 18,
  },
  inlineMoodText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: colors.text,
    textAlign: 'left',
  },
  // Onboarding styles (when screening not complete)
  onboardingCard: {
    marginBottom: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.xl,
    overflow: 'hidden',
    ...Theme.shadows.primary,
  } as const,
  onboardingGradient: {
    padding: Theme.spacing.xl,
  } as const,
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  } as const,
  onboardingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  onboardingTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  onboardingProgressText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  onboardingDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    marginBottom: 16,
  },
  onboardingProgressBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  } as const,
  onboardingProgressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  onboardingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 10,
    ...Theme.shadows.tertiary,
  } as const,
  onboardingBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: '#4F46E5',
  },
  // Today's Habits Section styles (Phase 1)
  habitsSection: {
    marginBottom: Theme.spacing.xl,
  } as const,
  habitsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  } as const,
  habitsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as const,
  habitsTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  },
  habitsBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  } as const,
  habitsBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
  },
  habitsViewAllText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
  habitsList: {
    gap: 10,
  } as const,
  habitItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    ...Theme.shadows.tertiary,
  } as const,
  habitItemCardCompleted: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  } as const,
  habitCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  } as const,
  habitCheckboxCompleted: {
    backgroundColor: colors.success || '#10B981',
    borderColor: colors.success || '#10B981',
  } as const,
  habitTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  habitDesc: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  habitPointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  } as const,
  habitPointsText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  habitsEmptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Theme.shadows.tertiary,
  } as const,
  habitsEmptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  } as const,
  habitsEmptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  habitsEmptyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  },
  habitsEmptySubtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  habitsEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  } as const,
  habitsEmptyBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  // Stats Section
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Theme.spacing.xl,
  } as const,
  scoreCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...Theme.shadows.tertiary,
  } as const,
  scoreHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 6,
  } as const,
  scoreBadgeMini: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scoreBadgeMiniText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  scoreValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 22,
    color: colors.text,
  },
  scoreMax: {
    fontSize: 11,
    fontFamily: Theme.fontFamily.medium,
    color: colors.textMuted,
  },
  scoreLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  } as const,
  metricTrack: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    width: '100%',
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden',
  } as const,
  metricFill: {
    height: '100%',
    borderRadius: 2,
  },
  metricDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 8,
    color: colors.textMuted,
  },
  // Clinical Appointments Section
  appointmentSection: {
    marginBottom: Theme.spacing.xl,
  },
  appointmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    ...Theme.shadows.tertiary,
    marginBottom: 10,
    position: 'relative',
  } as const,
  appointmentRow: {
    flexDirection: 'row',
    padding: Theme.spacing.lg,
    alignItems: 'center',
    gap: 14,
    zIndex: 1,
  } as const,
  appointmentIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  appointmentContent: {
    flex: 1,
  },
  appointmentDate: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: colors.text,
  },
  appointmentTime: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  liveBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  // Appointments promo styles
  appointmentPromoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.08)',
    ...Theme.shadows.tertiary,
    marginBottom: 10,
    position: 'relative',
  } as const,
  appointmentPromoRow: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
  } as const,
  appointmentPromoTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  },
  appointmentPromoSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  appointmentPromoBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    ...Theme.shadows.tertiary,
  } as const,
  appointmentPromoBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  // Section and Tools Grid
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: colors.text,
    marginBottom: Theme.spacing.md,
    marginTop: 8,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  } as const,
  toolCard: {
    width: (Dimensions.get('window').width - Theme.spacing.lg * 2 - 14) / 2,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    alignItems: 'flex-start',
    ...Theme.shadows.tertiary,
  } as const,
  toolIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  } as const,
  toolEmoji: {
    fontSize: 20,
  },
  toolTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    textAlign: 'left',
  },
  toolSub: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'left',
  },
  toolAccessBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'flex-end',
  } as const,
  lockOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  heroGlow: {
    position: 'absolute',
    bottom: -10,
    left: '10%',
    width: '80%',
    height: 20,
    opacity: 0.12,
    borderRadius: 20,
  } as const,
  // Modal overlay
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.primary,
  },
  modalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 24,
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 16,
  } as const,
  modalOptionCard: {
    width: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 80,
  } as const,
  modalOptionEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  modalOptionText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  } as const,
  // Safety Card styles
  safetyCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    ...Theme.shadows.secondary,
  } as const,
  safetyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
  safetyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: '#991B1B',
    marginBottom: 2,
  },
  safetySubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  safetyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  } as const,
  safetyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  } as const,
  safetyActionTextPrimary: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  safetyActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  } as const,
  safetyActionTextSecondary: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#DC2626',
  },
  };
}



