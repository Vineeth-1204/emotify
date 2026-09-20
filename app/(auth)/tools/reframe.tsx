import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated
} from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation, useAction } from "convex/react";
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
import { CounsellorBadgeIcon, CalmPointToken } from "@/components/svg/system";
import {
  SightSensoryIcon,
  TouchSensoryIcon,
  SoundSensoryIcon,
  SmellSensoryIcon,
  TasteSensoryIcon,
} from "@/components/svg/activities/SensoryIcons";
import {
  HappyEmotionIcon,
  CalmEmotionIcon,
  SadEmotionIcon,
  WorriedEmotionIcon,
  AngryEmotionIcon,
  EmbarrassedEmotionIcon,
  GuiltyEmotionIcon,
  TiredEmotionIcon,
} from "@/components/svg/emotions";

const { width } = Dimensions.get("window");

// Helper to translate step keys to user-friendly progress values
const getProgressPercent = (step: string) => {
  switch (step) {
    case "understanding": return 15;
    case "clarification": return 35;
    case "guided_discovery": return 55;
    case "reflection": return 75;
    case "balanced_thought": return 85;
    case "belief": return 90;
    case "emotion_after": return 95;
    case "recovery_coach": return 100;
    default: return 0;
  }
};

// Custom Stepper/Grid Selector for Belief (0% to 100%)
interface BeliefSelectorProps {
  value: number;
  onChange: (val: number) => void;
}
function BeliefSelector({ value, onChange }: BeliefSelectorProps) {
  const percentageOptions = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  
  const handleSelect = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onChange(n);
  };

  const getLabel = (v: number) => {
    if (v <= 20) return "Skeptical";
    if (v <= 50) return "Somewhat doubtful";
    if (v <= 80) return "Believable & helpful";
    return "Fully believe this thought";
  };

  return (
    <View style={styles.selectorContainer}>
      <View style={styles.valueDisplay}>
        <Text style={[styles.intensityNum, { color: Colors.primary }]}>{value}%</Text>
        <View style={[styles.badgeContainer, { backgroundColor: Colors.primary }]}>
          <Text style={styles.badgeText}>{getLabel(value)}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
        {percentageOptions.map((n) => {
          const isSelected = value === n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => handleSelect(n)}
              style={[
                styles.gridCircle,
                { width: 56, height: 56, borderRadius: 28 },
                isSelected
                  ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
                  : styles.gridCircleUnselected
              ]}
            >
              <Text style={[styles.gridCircleText, { fontSize: 13, color: isSelected ? Colors.white : Colors.textSecondary }]}>
                {n}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Custom Stepper/Grid Selector for Emotion (0 to 10)
interface IntensitySelectorProps {
  value: number;
  onChange: (val: number) => void;
}
function IntensitySelector({ value, onChange }: IntensitySelectorProps) {
  const levelLabels = [
    { text: "Minimal", color: "#10B981" },
    { text: "Minimal", color: "#10B981" },
    { text: "Mild", color: "#3B82F6" },
    { text: "Mild", color: "#3B82F6" },
    { text: "Moderate", color: "#F59E0B" },
    { text: "Moderate", color: "#F59E0B" },
    { text: "Severe", color: "#EA580C" },
    { text: "Severe", color: "#EA580C" },
    { text: "Extreme", color: "#EF4444" },
    { text: "Extreme", color: "#EF4444" },
    { text: "Extreme", color: "#EF4444" }
  ];

  const handleSelect = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onChange(n);
  };

  const level = levelLabels[value];

  return (
    <View style={styles.selectorContainer}>
      <View style={styles.valueDisplay}>
        <Text style={[styles.intensityNum, { color: level.color }]}>{value}</Text>
        <View style={[styles.badgeContainer, { backgroundColor: level.color }]}>
          <Text style={styles.badgeText}>{level.text}</Text>
        </View>
      </View>

      <View style={styles.intensityGrid}>
        <View style={styles.gridRow}>
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const isSelected = value === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => handleSelect(n)}
                style={[
                  styles.gridCircle,
                  isSelected ? { backgroundColor: levelLabels[n].color, borderColor: levelLabels[n].color } : styles.gridCircleUnselected
                ]}
              >
                <Text style={[styles.gridCircleText, { color: isSelected ? Colors.white : Colors.textSecondary }]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.gridRow}>
          {[6, 7, 8, 9, 10].map((n) => {
            const isSelected = value === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => handleSelect(n)}
                style={[
                  styles.gridCircle,
                  isSelected ? { backgroundColor: levelLabels[n].color, borderColor: levelLabels[n].color } : styles.gridCircleUnselected
                ]}
              >
                <Text style={[styles.gridCircleText, { color: isSelected ? Colors.white : Colors.textSecondary }]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function ReframeScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const insets = useSafeAreaInsets();

  // Convex endpoints
  const startSession = useMutation(api.cbt.startSession);
  const selectBalancedThought = useMutation(api.cbt.selectBalancedThought);
  const submitBeliefRating = useMutation(api.cbt.submitBeliefRating);
  const submitEmotionAfterRating = useMutation(api.cbt.submitEmotionAfterRating);
  const acceptGoal = useMutation(api.cbt.acceptGoal);
  const skipGoal = useMutation(api.cbt.skipGoal);
  const endSession = useMutation(api.cbt.endSession);
  const submitMessage = useAction(api.cbt.submitMessage);
  const recommendGoal = useAction(api.cbt.recommendGoalAction);

  // States
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedThoughtIndex, setSelectedThoughtIndex] = useState<number | null>(null);
  const [editedBalancedThought, setEditedBalancedThought] = useState("");
  const [beliefScore, setBeliefScore] = useState(50);
  const [emotionAfter, setEmotionAfter] = useState(5);
  const [goalRec, setGoalRec] = useState<any | null>(null);
  const [goalLoading, setGoalLoading] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  // Support mode states
  const [supportTab, setSupportTab] = useState<string | null>(null);
  const [breathStage, setBreathStage] = useState("Breathe In...");
  const breathAnim = useRef(new Animated.Value(1)).current;

  const scrollRef = useRef<ScrollView>(null);

  // Initial session fetch
  useEffect(() => {
    handleSessionInit();
  }, []);

  const handleSessionInit = async () => {
    try {
      setLoading(true);
      const res = await startSession({ forceNew: false });
      if (res.resumed) {
        setActiveSession(res.session);
        setShowResumeModal(true);
      } else {
        setActiveSession(res.session);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Authentication required", "Please sign in to access CBT counselling.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartFresh = async () => {
    try {
      setShowResumeModal(false);
      setLoading(true);
      const res = await startSession({ forceNew: true });
      setActiveSession(res.session);
      setSelectedThoughtIndex(null);
      setEditedBalancedThought("");
      setSupportTab(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Scroll to bottom when conversation changes or loading state changes
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [activeSession?.conversation, aiLoading]);

  // Support Mode Breathing Animation loop
  useEffect(() => {
    if (supportTab === "breathing") {
      runBreathingCycle();
    }
  }, [supportTab]);

  const runBreathingCycle = () => {
    setBreathStage("Breathe In...");
    Animated.timing(breathAnim, {
      toValue: 2.2,
      duration: 4000,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) return;
      
      setBreathStage("Hold...");
      setTimeout(() => {
        setBreathStage("Breathe Out...");
        Animated.timing(breathAnim, {
          toValue: 1.0,
          duration: 4000,
          useNativeDriver: true
        }).start(({ finished: f }) => {
          if (f) runBreathingCycle();
        });
      }, 3000);
    });
  };

  // Submit dynamic user message
  const handleSendMessage = async (msgOverride?: string) => {
    const textToSend = msgOverride || inputText;
    if (!textToSend.trim() || !activeSession) return;

    setInputText("");
    setAiLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const res: any = await submitMessage({
        sessionId: activeSession._id,
        content: textToSend
      });

      // Refetch session
      const updatedSession = await startSession({ forceNew: false });
      setActiveSession(updatedSession.session);

      // Handle custom outputs returned by the AI response payload
      if (res.thoughtsOptions) {
        setEditedBalancedThought(res.thoughtsOptions[0]);
        setSelectedThoughtIndex(0);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Connection error", "Unable to send message. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  // Skip a challenge question in Guided Discovery
  const handleSkipQuestion = () => {
    handleSendMessage("I want to skip this question.");
  };

  // Select a balanced thought and edit it
  const handleSelectThought = (index: number, text: string) => {
    setSelectedThoughtIndex(index);
    setEditedBalancedThought(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleContinueBalancedThought = async () => {
    if (!editedBalancedThought.trim() || !activeSession) return;
    setAiLoading(true);
    try {
      await selectBalancedThought({
        sessionId: activeSession._id,
        thought: editedBalancedThought
      });
      const updated = await startSession({ forceNew: false });
      setActiveSession(updated.session);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleContinueBelief = async () => {
    if (!activeSession) return;
    setAiLoading(true);
    try {
      await submitBeliefRating({
        sessionId: activeSession._id,
        score: beliefScore
      });
      const updated = await startSession({ forceNew: false });
      setActiveSession(updated.session);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleContinueEmotionAfter = async () => {
    if (!activeSession) return;
    setAiLoading(true);
    try {
      await submitEmotionAfterRating({
        sessionId: activeSession._id,
        intensity: emotionAfter
      });
      const updated = await startSession({ forceNew: false });
      setActiveSession(updated.session);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleGoalSelect = (goalId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedGoals(prev => {
      if (prev.includes(goalId)) {
        return prev.filter(id => id !== goalId);
      }
      if (prev.length >= 2) {
        return [prev[1], goalId];
      }
      return [...prev, goalId];
    });
  };

  const handleAcceptGoal = async () => {
    if (!activeSession) return;
    if (selectedGoals.length !== 2) {
      Alert.alert("Select Goals", "Please select exactly 2 goals to add to your checklist.");
      return;
    }
    setLoading(true);
    try {
      await acceptGoal({ 
        sessionId: activeSession._id, 
        selectedGoalIds: selectedGoals 
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(auth)/(tabs)/tools");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save goals. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipGoal = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await skipGoal({ sessionId: activeSession._id });
      router.replace("/(auth)/(tabs)/tools");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.replace("/(auth)/(tabs)/tools");
  };

  const handleEndSessionEarly = () => {
    if (!activeSession) return;
    Alert.alert(
      "End CBT Session?",
      "Are you sure you want to end this session early? Your progress will be saved but the session will complete.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await endSession({ sessionId: activeSession._id });
              router.replace("/(auth)/(tabs)/tools");
            } catch (e) {
              console.error(e);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (loading || !activeSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Connecting to clinical companion...</Text>
      </View>
    );
  }

  // BRANCH 1: Resume Active Session Prompt Modal
  if (showResumeModal) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#F4F7FB", "#EEF3FF"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.resumeContent, { paddingTop: insets.top + 40 }]}>
          <View style={styles.logoWrapper}>
            <Ionicons name="chatbubbles" size={56} color={Colors.primary} />
          </View>
          <Text style={styles.resumeTitle}>Ongoing Session Found</Text>
          <Text style={styles.resumeSub}>
            You have an active therapeutic conversation from recently. Would you like to resume it, or start a new support journey?
          </Text>

          <Button
            title="Resume Session"
            onPress={() => setShowResumeModal(false)}
            style={styles.actionBtn}
          />
          <Button
            title="Start Fresh"
            variant="outline"
            onPress={handleStartFresh}
            style={[styles.actionBtnOutline, { marginTop: Theme.spacing.md }]}
            textStyle={{ color: Colors.primary }}
          />
        </View>
      </View>
    );
  }

  const { currentStep, conversation, sessionStatus } = activeSession;
  const progress = getProgressPercent(currentStep);

  // BRANCH 2: High Risk Safety Mode
  if (sessionStatus === "safety_mode") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#FFF5F5", "#FEE2E2"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 30 }]}>
          <View style={styles.safetyHeader}>
            <Ionicons name="shield-half" size={64} color={Colors.severe} />
            <Text style={styles.safetyTitle}>Crisis Safety Support</Text>
            <Text style={styles.safetySub}>
              We have paused our reflection session. Your physical and emotional safety are the absolute highest priority.
            </Text>
          </View>

          <View style={styles.safetyCard}>
            <Text style={styles.safetyCardTitle}>Emergency Helpline Contacts</Text>
            <Text style={styles.safetyText}>
              If you are in distress, feeling overwhelmed, or experiencing self-harm urges, please contact support immediately:
            </Text>
            
            <View style={styles.helplineRow}>
              <Ionicons name="call" size={20} color={Colors.severe} />
              <Text style={styles.helplineVal}>Suicide & Crisis Lifeline: Call or Text 988</Text>
            </View>

            <View style={styles.helplineRow}>
              <Ionicons name="chatbubble-ellipses" size={20} color={Colors.severe} />
              <Text style={styles.helplineVal}>Crisis Text Line: Text HOME to 741741</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
              <CounsellorBadgeIcon size={20} color={Colors.severe} />
              <Text style={[styles.safetyAlertDesc, { flex: 1, marginTop: 0 }]}>
                A school counselor has been alerted to reach out to you within the application to provide follow-up care.
              </Text>
            </View>
          </View>

          <Button
            title="Return to Dashboard"
            onPress={() => router.replace("/(auth)/(tabs)/tools")}
            style={[styles.actionBtn, { backgroundColor: Colors.severe }]}
          />
        </ScrollView>
      </View>
    );
  }

  // BRANCH 3: Support Mode (Pause on CBT, Grounding/Mindfulness focus)
  if (sessionStatus === "support_mode") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#F0FDF4", "#DCFCE7"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 30 }]}>
          <View style={styles.safetyHeader}>
            <Ionicons name="heart-half" size={64} color="#16A34A" />
            <Text style={[styles.safetyTitle, { color: "#16A34A" }]}>Gentle Pause</Text>
            <Text style={styles.safetySub}>
              It's completely okay if you don't feel like analyzing your thoughts right now. Let's practice a grounding activity.
            </Text>
          </View>

          {!supportTab ? (
            <View style={styles.supportOptionsGrid}>
              <TouchableOpacity style={styles.supportOptionBtn} onPress={() => setSupportTab("breathing")}>
                <Ionicons name="pulse" size={28} color="#16A34A" />
                <Text style={styles.supportOptionTitle}>Calming Breathing</Text>
                <Text style={styles.supportOptionDesc}>Rhythmic 4-3-4 respiration guide.</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportOptionBtn} onPress={() => setSupportTab("grounding")}>
                <Ionicons name="finger-print" size={28} color="#16A34A" />
                <Text style={styles.supportOptionTitle}>Sensory Grounding</Text>
                <Text style={styles.supportOptionDesc}>5-4-3-2-1 focusing activity.</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportOptionBtn} onPress={() => setSupportTab("writing")}>
                <Ionicons name="document-text" size={28} color="#16A34A" />
                <Text style={styles.supportOptionTitle}>Free Writing</Text>
                <Text style={styles.supportOptionDesc}>Write with zero pressure or analysis.</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.supportOptionBtn} onPress={async () => {
                // Recommend simple goal: drink water
                setLoading(true);
                try {
                  if (activeSession) {
                    await acceptGoal({ sessionId: activeSession._id });
                  }
                  router.replace("/(auth)/(tabs)");
                } catch(e) { console.error(e) } finally { setLoading(false) }
              }}>
                <Ionicons name="water" size={28} color="#16A34A" />
                <Text style={styles.supportOptionTitle}>One Simple Action</Text>
                <Text style={styles.supportOptionDesc}>Drink a glass of water today.</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.glassCard}>
              <TouchableOpacity onPress={() => setSupportTab(null)} style={styles.backSupportBtn}>
                <Ionicons name="arrow-back" size={20} color="#16A34A" />
                <Text style={{ color: "#16A34A", fontFamily: Theme.fontFamily.bold, marginLeft: 4 }}>Other activities</Text>
              </TouchableOpacity>

              {supportTab === "breathing" && (
                <View style={{ alignItems: "center", paddingVertical: 30 }}>
                  <Animated.View style={[styles.breathCircle, { transform: [{ scale: breathAnim }] }]}>
                    <Text style={styles.breathLabel}>{breathStage}</Text>
                  </Animated.View>
                  <Text style={styles.breathTip}>Sync your breathing with the circle.</Text>
                </View>
              )}

              {supportTab === "grounding" && (
                <View style={{ paddingVertical: 10, gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <SightSensoryIcon size={24} color="#16A34A" />
                    <Text style={[styles.groundingStep, { flex: 1 }]}>5 things you can SEE around you.</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <TouchSensoryIcon size={24} color="#16A34A" />
                    <Text style={[styles.groundingStep, { flex: 1 }]}>4 things you can TOUCH physically.</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <SoundSensoryIcon size={24} color="#16A34A" />
                    <Text style={[styles.groundingStep, { flex: 1 }]}>3 things you can HEAR in the environment.</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <SmellSensoryIcon size={24} color="#16A34A" />
                    <Text style={[styles.groundingStep, { flex: 1 }]}>2 things you can SMELL.</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <TasteSensoryIcon size={24} color="#16A34A" />
                    <Text style={[styles.groundingStep, { flex: 1 }]}>1 thing you can TASTE.</Text>
                  </View>
                  <Text style={styles.breathTip}>Take your time to focus on each sense slowly.</Text>
                </View>
              )}

              {supportTab === "writing" && (
                <View>
                  <Text style={styles.stepSub}>Jot down whatever is in your head. Nobody else will see this text.</Text>
                  <TextInput
                    style={[styles.textArea, { minHeight: 150 }]}
                    multiline
                    placeholder="Start writing here..."
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              )}
            </View>
          )}

          <Button
            title="Complete Session"
            onPress={async () => {
              setLoading(true);
              try {
                await endSession({ sessionId: activeSession._id });
                router.replace("/(auth)/(tabs)/tools");
              } catch(e){} finally{ setLoading(false) }
            }}
            style={[styles.actionBtn, { backgroundColor: "#16A34A", marginTop: 24 }]}
          />
        </ScrollView>
      </View>
    );
  }

  // BRANCH 4: Complete Screen (Session is successfully finished)
  if (currentStep === "completed") {
    const tensionReduced = (activeSession.emotionBefore ?? 0) - (activeSession.emotionAfter ?? 0);
    const reductionPercent = activeSession.emotionBefore ? Math.round((tensionReduced / activeSession.emotionBefore) * 100) : 0;
    
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#F4F7FB", "#EEF3FF"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40 }]}>
          <View style={styles.successIconWrapper}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
          </View>
          <Text style={styles.resumeTitle}>Session Complete</Text>
          <Text style={styles.encouragingText}>You did an amazing job taking time for your mind today.</Text>

          <View style={styles.summaryResultCard}>
            <Text style={styles.resultPercentage}>
              {reductionPercent > 0 ? `${reductionPercent}%` : "0%"}
            </Text>
            <Text style={styles.resultLabel}>Emotional Tension Reduced</Text>

            <View style={styles.resultDetailRow}>
              <Text style={styles.resultVal}>{activeSession.emotionBefore}/10 before</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.textSecondary} />
              <Text style={styles.resultVal}>{activeSession.emotionAfter}/10 after</Text>
            </View>
          </View>

          <View style={styles.goalFeedbackCard}>
            <Text style={styles.goalFeedbackTitle}>Behavioural Goal Scheduled</Text>
            <Text style={styles.goalFeedbackText}>
              {activeSession.goalCompletion
                ? `"${activeSession.recommendedGoal?.title}" has been added to your daily win-list. Check it off when you complete it!`
                : "You skipped scheduling a micro-goal today, which is totally okay. Be gentle with yourself."}
            </Text>
          </View>

          <Button
            title="Back to Dashboard"
            onPress={() => router.replace("/(auth)/(tabs)/tools")}
            style={styles.actionBtn}
          />
        </ScrollView>
      </View>
    );
  }

  // Helper to determine if we are in chat mode steps
  const isChatStep = ["understanding", "clarification", "guided_discovery", "reflection"].includes(currentStep);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#F4F7FB", "#EEF3FF"]} style={StyleSheet.absoluteFill} />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 95 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(16, insets.top) }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handlePauseSession} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
              <Text style={styles.headerBtnText}>Pause</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Reframing Thoughts</Text>

            <View style={styles.headerBtn} />
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
        </View>

        {/* CHAT MESSAGES DISPLAY */}
        {isChatStep && (
          <ScrollView
            ref={scrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {conversation.map((msg: any, i: number) => {
              const isUser = msg.role === "user";
              return (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    isUser ? styles.userBubble : styles.assistantBubble
                  ]}
                >
                  <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
                    {msg.content}
                  </Text>
                </View>
              );
            })}

            {aiLoading && (
              <View style={[styles.messageBubble, styles.assistantBubble, styles.loadingBubble]}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.typingText}>Counselor is reflecting...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* STEP 5: Balanced Thought Option Selector */}
        {currentStep === "balanced_thought" && (
          <ScrollView 
            style={styles.specialCardScroll} 
            contentContainerStyle={{ paddingBottom: 120 }} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.glassCard}>
              <Text style={styles.stepTitle}>Select a Balanced Thought</Text>
              <Text style={styles.stepSub}>Select the perspective that fits best. You can customize the words below:</Text>
              
              {activeSession.balancedThoughtsOptions?.map((thought: string, i: number) => {
                const isSelected = selectedThoughtIndex === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.thoughtChoiceCard,
                      isSelected && styles.thoughtChoiceCardSelected
                    ]}
                    onPress={() => handleSelectThought(i, thought)}
                  >
                    <Text style={[styles.thoughtChoiceText, isSelected && { color: Colors.primary }]}>
                      {thought}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.editLabel}>Edit Balanced Thought:</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                value={editedBalancedThought}
                onChangeText={setEditedBalancedThought}
                placeholder="Edit the selected reframe here..."
                placeholderTextColor={Colors.textMuted}
                textAlignVertical="top"
              />

              <Button
                title="Save Balanced Thought"
                onPress={handleContinueBalancedThought}
                disabled={!editedBalancedThought.trim() || aiLoading}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        )}

        {/* STEP 6: Belief Slider */}
        {currentStep === "belief" && (
          <ScrollView 
            style={styles.specialCardScroll} 
            contentContainerStyle={{ paddingBottom: 120 }} 
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.glassCard}>
              <Text style={styles.stepTitle}>Belief in Balanced Thought</Text>
              <Text style={styles.stepSub}>How much do you believe in this new perspective right now?</Text>
              
              <View style={styles.reframeSummaryBox}>
                <Text style={styles.summaryLabel}>Your Balanced Thought:</Text>
                <Text style={styles.summaryText}>"{activeSession.balancedThought}"</Text>
              </View>

              <BeliefSelector value={beliefScore} onChange={setBeliefScore} />

              <Button
                title="Confirm & Continue"
                onPress={handleContinueBelief}
                disabled={aiLoading}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        )}

        {/* STEP 7: Emotion Intensity After */}
        {currentStep === "emotion_after" && (
          <ScrollView 
            style={styles.specialCardScroll} 
            contentContainerStyle={{ paddingBottom: 120 }} 
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.glassCard}>
              <Text style={styles.stepTitle}>Check Emotion Level Again</Text>
              <Text style={styles.stepSub}>How strong does the emotional distress feel now?</Text>

              <IntensitySelector value={emotionAfter} onChange={setEmotionAfter} />

              <Button
                title="Continue to Recovery Coach"
                onPress={handleContinueEmotionAfter}
                disabled={aiLoading}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        )}

        {/* STEP 8: CBT Session Complete - Redirects to recovery plan */}
        {currentStep === "recovery_coach" && (
          <ScrollView 
            style={styles.specialCardScroll} 
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 20 }} 
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.glassCard}>
              <View style={{ alignItems: "center", marginVertical: 20 }}>
                <MitraAvatar state="celebrating" size="md" />
              </View>
              <Text style={styles.stepTitle}>Reflection Completed!</Text>
              <Text style={styles.stepSub}>
                Great work! You have successfully completed today's cognitive reframing reflection.
              </Text>
              
              <View style={styles.reframeSummaryBox}>
                <Text style={styles.summaryLabel}>Your New Balanced Thought:</Text>
                <Text style={styles.summaryText}>"{activeSession.balancedThought || "I can take things one step at a time."}"</Text>
              </View>
              
              <Text style={[styles.stepSub, { marginTop: Theme.spacing.md, marginBottom: Theme.spacing.lg }]}>
                Next, let's establish a set of micro-actions to support this new perspective in your daily life.
              </Text>

              <Button
                title="Add Goals to My Checklist"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  router.replace({
                    pathname: "/(auth)/tools/recovery-plan",
                    params: { sessionId: activeSession._id }
                  });
                }}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        )}

        {/* INPUT ACTIONS FOR CHAT MODES */}
        {isChatStep && (
          <View style={styles.inputContainer}>
            {currentStep === "clarification" ? (
              <View style={styles.clarificationOptionsContainer}>
                {activeSession.clarificationOptions?.map((opt: string, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.clarificationChoiceBtn}
                    onPress={() => handleSendMessage(opt)}
                  >
                    <Text style={styles.clarificationChoiceBtnText}>{opt}</Text>
                    <Ionicons name="arrow-forward-circle" size={24} color={Colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.inputBar}>
                <TextInput
                  style={[styles.textInput, { maxHeight: 100 }]}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Share your thoughts here..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                

                <TouchableOpacity
                  onPress={() => handleSendMessage()}
                  disabled={!inputText.trim() || aiLoading}
                  style={[
                    styles.sendBtn,
                    (!inputText.trim() || aiLoading) && styles.sendBtnDisabled
                  ]}
                >
                  <Ionicons name="send" size={18} color={Colors.white} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7FB"
  },
  loadingText: {
    marginTop: 16,
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary
  },
  resumeContent: {
    flex: 1,
    padding: Theme.spacing.lg,
    justifyContent: "center",
    alignItems: "center"
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(124, 92, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Theme.spacing.xl
  },
  resumeTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Theme.spacing.md
  },
  resumeSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Theme.spacing.xxl,
    lineHeight: 22,
    paddingHorizontal: 20
  },
  header: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 12
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Theme.spacing.md,
    height: 48
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 60
  },
  headerBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginLeft: 2
  },
  headerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    color: Colors.text,
    textAlign: "center"
  },
  progressContainer: {
    height: 4,
    backgroundColor: "#E2E8F0",
    marginTop: 10,
    overflow: "hidden"
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.primary
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: Theme.spacing.md,
    paddingBottom: 100
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 20,
    padding: 14,
    marginBottom: Theme.spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },
  userBubble: {
    backgroundColor: Colors.primary,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    backgroundColor: Colors.white,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4
  },
  messageText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    lineHeight: 20
  },
  userMessageText: {
    color: Colors.white
  },
  assistantMessageText: {
    color: Colors.text
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.8
  },
  typingText: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: Colors.white,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  textInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    color: Colors.text
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center"
  },
  sendBtnDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5
  },
  skipQuestionBtn: {
    paddingHorizontal: 12,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.textMuted
  },
  skipBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: Colors.textSecondary
  },
  clarificationOptionsContainer: {
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm
  },
  clarificationChoiceBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: Theme.spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  },
  clarificationChoiceBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    marginRight: Theme.spacing.md
  },
  specialCardScroll: {
    flex: 1,
    padding: Theme.spacing.md
  },
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
    marginBottom: Theme.spacing.xl
  },
  stepTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 19,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 6
  },
  stepSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Theme.spacing.lg,
    lineHeight: 18
  },
  thoughtChoiceCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E8E5FF",
    borderRadius: 16,
    padding: 16,
    marginBottom: Theme.spacing.md
  },
  thoughtChoiceCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F4F3FF"
  },
  thoughtChoiceText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 19
  },
  editLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    marginTop: Theme.spacing.md,
    marginBottom: 8
  },
  textArea: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: Theme.borderRadius.sm,
    padding: Theme.spacing.md,
    color: Colors.text,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Theme.spacing.lg
  },
  actionBtn: {
    width: "100%",
    borderRadius: Theme.borderRadius.md,
    height: 52,
    backgroundColor: Colors.primary
  },
  actionBtnOutline: {
    width: "100%",
    borderRadius: Theme.borderRadius.md,
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: "transparent"
  },
  reframeSummaryBox: {
    backgroundColor: "#F4F3FF",
    borderWidth: 1,
    borderColor: "#E8E5FF",
    borderRadius: 16,
    padding: 16,
    marginBottom: Theme.spacing.xl
  },
  summaryLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.primary,
    textTransform: "uppercase",
    marginBottom: 4
  },
  summaryText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 19,
    fontStyle: "italic"
  },
  selectorContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: Theme.spacing.xl
  },
  valueDisplay: {
    alignItems: "center",
    marginBottom: Theme.spacing.lg
  },
  intensityNum: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.hero,
    lineHeight: 46
  },
  badgeContainer: {
    borderRadius: Theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6
  },
  badgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.white
  },
  horizontalScroll: {
    paddingHorizontal: Theme.spacing.sm,
    gap: Theme.spacing.sm
  },
  intensityGrid: {
    width: "100%",
    gap: Theme.spacing.sm
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Theme.spacing.sm
  },
  gridCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center"
  },
  gridCircleUnselected: {
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC"
  },
  gridCircleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15
  },
  goalLoadingWrapper: {
    paddingVertical: 100,
    justifyContent: "center",
    alignItems: "center"
  },
  goalLoadingText: {
    marginTop: Theme.spacing.md,
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center"
  },
  goalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4
  },
  coachTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: Colors.text
  },
  goalCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 20,
    marginBottom: Theme.spacing.sm
  },
  goalCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F4F3FF",
    borderWidth: 2,
  },
  goalMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Theme.spacing.sm
  },
  goalCategory: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.8
  },
  goalDuration: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.textSecondary
  },
  goalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 17,
    color: Colors.text,
    marginBottom: Theme.spacing.xs
  },
  goalDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.md
  },
  whyBox: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 12
  },
  whyText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18
  },
  successIconWrapper: {
    alignSelf: "center",
    marginBottom: Theme.spacing.md,
    marginTop: 20
  },
  encouragingText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Theme.spacing.xl,
    paddingHorizontal: 20
  },
  summaryResultCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
    marginBottom: Theme.spacing.lg
  },
  resultPercentage: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 48,
    color: Colors.success,
    lineHeight: 52
  },
  resultLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.text,
    marginTop: 4,
    marginBottom: Theme.spacing.md
  },
  resultDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Theme.spacing.sm
  },
  resultVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary
  },
  goalFeedbackCard: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 20,
    padding: 16,
    width: "100%",
    marginBottom: Theme.spacing.xxl
  },
  goalFeedbackTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: "#16A34A",
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 0.5
  },
  goalFeedbackText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20
  },
  scrollContent: {
    padding: Theme.spacing.lg,
    alignItems: "center",
    paddingBottom: 60
  },
  safetyHeader: {
    alignItems: "center",
    marginBottom: Theme.spacing.xl
  },
  safetyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 22,
    color: Colors.severe,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.xs
  },
  safetySub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10
  },
  safetyCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 24,
    padding: 20,
    width: "100%",
    marginBottom: Theme.spacing.xxl
  },
  safetyCardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8
  },
  safetyText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.md
  },
  helplineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Theme.spacing.sm,
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 12,
    marginBottom: Theme.spacing.sm
  },
  helplineVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.severe,
    flex: 1
  },
  safetyAlertDesc: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: Theme.spacing.md,
    lineHeight: 18
  },
  supportOptionsGrid: {
    width: "100%",
    gap: Theme.spacing.md,
    marginBottom: 10
  },
  supportOptionBtn: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: "#DCFCE7",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  supportOptionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: "#16A34A",
    marginTop: 8,
    marginBottom: 2
  },
  supportOptionDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary
  },
  backSupportBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Theme.spacing.md,
    alignSelf: "flex-start"
  },
  breathCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 2,
    borderColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Theme.spacing.xxl
  },
  breathLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: "#16A34A"
  },
  breathTip: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8
  },
  groundingStep: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Theme.spacing.md
  }
});
