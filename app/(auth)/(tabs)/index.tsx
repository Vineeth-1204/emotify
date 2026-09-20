import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Dimensions, Animated, Modal, TextInput, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Theme } from "@/constants/Theme";
import { EMOTIONS } from "@/constants/Screening";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { Button } from "@/components/ui/Button";
import { getDisplayLevel } from "@/utils/triage";
import { generateInsightMessage } from "@/utils/insights";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as SecureStore from "expo-secure-store";
import { useAvatar } from "@/context/AvatarContext";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { CalmPointToken, PlantProgress } from "@/components/svg/system";
import { HappyEmotionIcon, CalmEmotionIcon, SadEmotionIcon, WorriedEmotionIcon, renderEmotionIcon } from "@/components/svg/emotions";
import { MindfulnessActivityIcon, MuscleRelaxActivityIcon, JournalActivityIcon, HabitMicrogoalIcon } from "@/components/svg/activities";

const { width } = Dimensions.get('window');

const TOTAL_QUESTIONS = 47; // PHQ9:9 + GAD7:7 + PQ16:16 + WSAS:5 + ReQoL10:10
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
  const { avatarState, setAvatarState, ageCohort, getDialogue } = useAvatar();

  const [hasCheckedInToday, setHasCheckedInToday] = React.useState(true);
  const [showCheckInModal, setShowCheckInModal] = React.useState(false);
  const [selectedEmotionId, setSelectedEmotionId] = React.useState<string | null>(null);
  const [selectedHomeCard, setSelectedHomeCard] = React.useState<string | null>(null);
  const [selectedIntensity, setSelectedIntensity] = React.useState<number>(5);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = React.useState(false);
  const createLog = useMutation(api.emotionLogs.create);

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

  const appUser = useQuery(api.users.getByClerkId, user?.id ? {
    clerkId: user.id,
  } : "skip");

  const latestScreening = useQuery(api.screening.getLatest, user?.id ? {
    userId: user.id,
  } : "skip");

  const latestTriage = useQuery(api.triage.getLatest, user?.id ? {
    userId: user.id,
  } : "skip");

  const recentEmotions = useQuery(api.emotionLogs.getRecent, user?.id ? {
    userId: user.id,
  } : "skip");

  const recentJpmr = useQuery(api.jpmrLogs.getRecent, user?.id ? {
    userId: user.id,
  } : "skip");

  const reinforcement = useQuery(api.reinforcement.generatePositiveMessage, user?.id ? {
    userId: user.id,
  } : "skip");

  const appointments = useQuery(api.appointments.getTwoWayAppointmentsForPatient, user?.id ? { userId: user.id } : "skip");
  const streakInfo = useQuery(api.microGoals.getStreak, user?.id ? { userId: user.id } : "skip");
  const gamification = useQuery(api.microGoals.getGamificationStats);

  const updateWellness = useMutation(api.wellness.updateProfile);

  React.useEffect(() => {
    if (user?.id) {
      updateWellness({ userId: user.id });
    }
  }, [user?.id]);

  const isScreeningComplete = (appUser ? !!appUser.screeningComplete : false) && latestTriage?.level !== "force_retest";

  // Mount detection for daily check-in
  React.useEffect(() => {
    async function checkTodayCheckIn() {
      if (!user?.id || !isScreeningComplete) return;
      try {
        const todayStr = new Date().toISOString().split('T')[0];
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
  }, [user?.id, isScreeningComplete]);

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

  // Active emotion mapping for display
  const activeEmotion = recentEmotions && recentEmotions.length > 0 ? recentEmotions[0].emotion : null;
  const activeEmotionObj = EMOTIONS.find(e => e.id === activeEmotion);

  const tools = [
    { 
      id: 'emotion-map', 
      title: 'Quick Check', 
      sub: 'Body Scan', 
      renderIcon: (c: string) => <MindfulnessActivityIcon size={24} color={c} />, 
      route: '/(auth)/tools/emotion-map', 
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
      title: 'Reframe Now', 
      sub: 'Thoughts', 
      renderIcon: (c: string) => <JournalActivityIcon size={24} color={c} />, 
      route: '/(auth)/tools/reframe', 
      restricted: isSevere, 
      locked: !isScreeningComplete 
    },
    { 
      id: 'microgoals', 
      title: 'MicroGoals', 
      sub: 'Habits', 
      renderIcon: (c: string) => <HabitMicrogoalIcon size={24} color={c} />, 
      route: '/(auth)/tools/microgoals', 
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

  const handleCheckInSubmit = async () => {
    if (!user?.id || !selectedEmotionId) return;
    setIsSubmittingCheckIn(true);
    try {
      await createLog({
        userId: user.id,
        emotion: selectedEmotionId,
        bodyRegions: [],
        preIntensity: selectedIntensity,
        postIntensity: selectedIntensity,
      });

      // Update Mitra Avatar state to reflect the emotional tone
      if (selectedEmotionId === "happy") setAvatarState("happy");
      else if (selectedEmotionId === "calm") setAvatarState("calm");
      else if (selectedIntensity >= 7) setAvatarState("breathing");
      else setAvatarState("listening");

      const todayStr = new Date().toISOString().split('T')[0];
      await SecureStore.setItemAsync(`last_checkin_date_${user.id}`, todayStr);
      setShowCheckInModal(false);
      setHasCheckedInToday(true);
      Alert.alert("Mood Logged!", "Mitra and your dashboard have updated to support you.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not save your check-in. Please try again.");
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  const handleInlineCheckIn = async (emotionId: string, intensity: number = 5) => {
    if (!user?.id) return;
    setIsSubmittingCheckIn(true);
    try {
      await createLog({
        userId: user.id,
        emotion: emotionId,
        bodyRegions: [],
        preIntensity: intensity,
        postIntensity: intensity,
      });

      // Update Mitra Avatar state
      if (emotionId === "happy") setAvatarState("happy");
      else if (emotionId === "calm") setAvatarState("calm");
      else if (intensity >= 7) setAvatarState("breathing");
      else setAvatarState("listening");

      const todayStr = new Date().toISOString().split('T')[0];
      await SecureStore.setItemAsync(`last_checkin_date_${user.id}`, todayStr);
      setHasCheckedInToday(true);
      Alert.alert("Mood Logged!", "Mitra and your dashboard have updated to support you.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not save your check-in. Please try again.");
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) return "Good Morning";
    if (hours >= 12 && hours < 17) return "Good Afternoon";
    if (hours >= 17 && hours < 22) return "Good Evening";
    return "Good Night";
  };

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

        {/* Mitra Interactive Hero Card */}
        <View style={styles.mitraHeroCard}>
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC'] as any}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.mitraHeroContent}>
            <View style={styles.mitraAvatarCol}>
              <MitraAvatar 
                state={avatarState} 
                size={ageCohort === "13-18" ? "md" : "sm"} 
              />
            </View>
            <View style={styles.mitraBubbleCol}>
              <View style={styles.mitraSpeechBubble}>
                <Text style={styles.mitraSpeechText}>
                  {hasCheckedInToday
                    ? (activeEmotionObj ? `You logged feeling ${activeEmotionObj.label.toLowerCase()} today. I'm right here with you.` : getDialogue("checkinPrompt"))
                    : getDialogue("greeting")}
                </Text>
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
                  {streakInfo?.currentStreak ? `${streakInfo.currentStreak} day streak` : "Start your wellness streak"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 4-Card Illustrated Mood Check-in */}
        {isScreeningComplete && !hasCheckedInToday && (
          <View style={styles.inlineCheckInContainer}>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC'] as any}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.inlineCheckInHeaderRow}>
              <View style={styles.sparkleBadge}>
                <Ionicons name="sparkles" size={12} color={colors.primary} />
                <Text style={styles.sparkleBadgeText}>DAILY MOOD CHECK-IN</Text>
              </View>
            </View>
            <Text style={styles.inlineCheckInTitle}>How are you feeling right now, {alias}?</Text>
            <Text style={styles.inlineCheckInSubtitle}>Tap the card that best captures your state:</Text>

            {/* 4 Cards Grid */}
            <View style={styles.homeCardsGrid}>
              {[
                { 
                  id: "good", 
                  title: "Good", 
                  sub: "Energized, joyful", 
                  backendCode: "happy", 
                  color: "#F59E0B",
                  Icon: HappyEmotionIcon 
                },
                { 
                  id: "calm", 
                  title: "Calm", 
                  sub: "Peaceful, centered", 
                  backendCode: "calm", 
                  color: "#10B981",
                  Icon: CalmEmotionIcon 
                },
                { 
                  id: "low", 
                  title: "Low", 
                  sub: "Down, tired, drained", 
                  backendCode: "sad", 
                  color: "#3B82F6",
                  Icon: SadEmotionIcon 
                },
                { 
                  id: "heavy", 
                  title: "Heavy", 
                  sub: "Worried, tense, angry", 
                  backendCode: "worried", 
                  color: "#8B5CF6",
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
                      if (card.backendCode === "happy") setAvatarState("happy");
                      else if (card.backendCode === "calm") setAvatarState("calm");
                      else setAvatarState("listening");
                    }}
                    style={[
                      styles.homeMoodCard,
                      { backgroundColor: card.color + '0E', borderColor: isSelected ? card.color : card.color + '28' },
                      isSelected && { borderWidth: 2, backgroundColor: card.color + '22' }
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.homeMoodIconBox, { backgroundColor: card.color + '20' }]}>
                      <card.Icon size={32} />
                    </View>
                    <Text style={[styles.homeMoodTitle, { color: card.color }]}>{card.title}</Text>
                    <Text style={styles.homeMoodSub}>{card.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 4-Pill Intensity Selector */}
            {selectedHomeCard && (
              <View style={styles.intensityContainer}>
                <Text style={styles.intensityHeader}>Intensity Level:</Text>
                <View style={styles.intensityPillsRow}>
                  {[
                    { label: "A little", val: 2 },
                    { label: "Some", val: 5 },
                    { label: "A lot", val: 7 },
                    { label: "Overwhelming", val: 9 },
                  ].map((p) => {
                    const isPillSelected = selectedIntensity === p.val;
                    return (
                      <TouchableOpacity
                        key={p.val}
                        onPress={() => setSelectedIntensity(p.val)}
                        style={[
                          styles.intensityPill,
                          isPillSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                        ]}
                      >
                        <Text style={[styles.intensityPillText, isPillSelected && { color: "#FFFFFF" }]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Button
                  title="Confirm Check-In"
                  onPress={() => {
                    if (selectedEmotionId) {
                      handleInlineCheckIn(selectedEmotionId, selectedIntensity);
                    }
                  }}
                  loading={isSubmittingCheckIn}
                  style={{ marginTop: 14 }}
                />
              </View>
            )}
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

        {/* Combined Wellbeing Companion (If screening complete) */}
        {isScreeningComplete && (
          <View style={styles.companionContainer}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.companionCard}
            >
              {/* Top Row: Current State Header */}
              <View style={styles.companionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.companionLabel}>YOUR WELLBEING COMPANION</Text>
                  <View style={styles.companionBadge}>
                    <View style={[styles.statusDot, { backgroundColor: colors.accentLight || '#10B981' }]} />
                    <Text style={styles.companionBadgeText}>{displayLevel}</Text>
                  </View>
                </View>
                <Ionicons name="pulse" size={28} color="rgba(255,255,255,0.8)" />
              </View>

              {/* Middle Section: Insights / Recommendations */}
              <Text style={styles.companionMessage}>{recommendation}</Text>

              {/* Bottom Section: Positive Reinforcement */}
              {reinforcement && (
                <View style={styles.companionGrowthBox}>
                  <View style={styles.companionGrowthIcon}>
                    <Ionicons name="sparkles" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.companionGrowthTitle}>DAILY INSPIRATION</Text>
                    <Text style={styles.companionGrowthText}>{reinforcement.message}</Text>
                  </View>
                </View>
              )}
            </LinearGradient>
            <View style={[styles.heroGlow, { backgroundColor: colors.primary }]} />
          </View>
        )}

        {/* Visual Clinical Metrics (PHQ-9 & GAD-7) */}
        {isScreeningComplete && (
          <View style={styles.scoreRow}>
            {/* PHQ-9 Depression card */}
            <View style={styles.scoreCard}>
              <View style={styles.scoreHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="pulse-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.scoreBadgeMini}>
                  <Text style={[styles.scoreBadgeMiniText, { color: phq9Score >= 10 ? colors.error : colors.success }]}>
                    {phq9Score <= 4 ? "Minimal" : phq9Score <= 9 ? "Mild" : phq9Score <= 14 ? "Moderate" : "Severe"}
                  </Text>
                </View>
              </View>
              <Text style={styles.scoreValue}>{phq9Score}<Text style={styles.scoreMax}>/27</Text></Text>
              <Text style={styles.scoreLabel}>PHQ-9 DEPRESSION</Text>

              <View style={styles.metricTrack}>
                <View
                  style={[
                    styles.metricFill,
                    {
                      width: `${Math.min((phq9Score / 27) * 100, 100)}%`,
                      backgroundColor: phq9Score <= 9 ? colors.success : phq9Score <= 14 ? colors.warning : colors.error
                    }
                  ]}
                />
              </View>
              <Text style={styles.metricDesc}>Lower score = better mood</Text>
            </View>

            {/* GAD-7 Anxiety card */}
            <View style={styles.scoreCard}>
              <View style={styles.scoreHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.secondary + '15' }]}>
                  <Ionicons name="heart-outline" size={18} color={colors.secondary} />
                </View>
                <View style={styles.scoreBadgeMini}>
                  <Text style={[styles.scoreBadgeMiniText, { color: gad7Score >= 10 ? colors.error : colors.success }]}>
                    {gad7Score <= 4 ? "Minimal" : gad7Score <= 9 ? "Mild" : gad7Score <= 14 ? "Moderate" : "Severe"}
                  </Text>
                </View>
              </View>
              <Text style={styles.scoreValue}>{gad7Score}<Text style={styles.scoreMax}>/21</Text></Text>
              <Text style={styles.scoreLabel}>GAD-7 ANXIETY</Text>

              <View style={styles.metricTrack}>
                <View
                  style={[
                    styles.metricFill,
                    {
                      width: `${Math.min((gad7Score / 21) * 100, 100)}%`,
                      backgroundColor: gad7Score <= 9 ? colors.success : gad7Score <= 14 ? colors.warning : colors.error
                    }
                  ]}
                />
              </View>
              <Text style={styles.metricDesc}>Lower score = calmer mind</Text>
            </View>
          </View>
        )}

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
              const todayStr = new Date().toISOString().split('T')[0];
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

        <Text style={styles.sectionTitle}>Therapeutic Tools</Text>

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

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Daily Check-In Modal Form */}
      <Modal
        visible={showCheckInModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Daily Check-In</Text>
            <Text style={styles.modalSubtitle}>How are you feeling right now? We'll tailor your experience today.</Text>

            <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
              {EMOTIONS.map((emotion) => {
                const isSelected = selectedEmotionId === emotion.id;
                return (
                  <TouchableOpacity
                    key={emotion.id}
                    onPress={() => setSelectedEmotionId(emotion.id)}
                    style={[
                      styles.modalOptionCard,
                      { backgroundColor: emotion.color + '0D', borderColor: emotion.color + '30' },
                      isSelected && { borderColor: emotion.color, backgroundColor: emotion.color + '22', borderWidth: 2 }
                    ]}
                  >
                    <View style={[{ marginBottom: 6 }, isSelected && { transform: [{ scale: 1.1 }] }]}>
                      {renderEmotionIcon(emotion.id, 32)}
                    </View>
                    <Text style={[styles.modalOptionText, isSelected && { color: emotion.color, fontFamily: Theme.fontFamily.bold }]}>
                      {emotion.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Skip"
                onPress={() => setShowCheckInModal(false)}
                variant="outline"
                style={{ flex: 1 }}
              />
              <Button
                title="Set Mood"
                onPress={handleCheckInSubmit}
                disabled={!selectedEmotionId}
                loading={isSubmittingCheckIn}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </View>
      </Modal>

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
              <MitraAvatar state="celebrating" size="md" />
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
  mitraHeroCard: {
    borderRadius: 20,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    ...Theme.shadows.primary,
  } as const,
  mitraHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  } as const,
  mitraAvatarCol: {
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
  mitraBubbleCol: {
    flex: 1,
  } as const,
  mitraSpeechBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  } as const,
  mitraSpeechText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    ...Theme.shadows.tertiary,
  } as const,
  homeMoodIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  },
  intensityContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  } as const,
  intensityHeader: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  intensityPillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  } as const,
  intensityPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  } as const,
  intensityPillText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.text,
  },
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
  // Wellbeing Companion styles
  companionContainer: {
    marginBottom: Theme.spacing.xl,
    position: 'relative',
  } as const,
  companionCard: {
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.primary,
  } as const,
  companionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  } as const,
  companionLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  companionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
  } as const,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  companionBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  companionMessage: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 14,
  },
  companionGrowthBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    ...Theme.shadows.tertiary,
  } as const,
  companionGrowthIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  } as const,
  companionGrowthTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  companionGrowthText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
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
  };
}



