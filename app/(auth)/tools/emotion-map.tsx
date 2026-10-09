import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Dimensions,
  Modal,
  Animated,
  ActivityIndicator,
  BackHandler,
  Linking,
  AccessibilityInfo,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors, getColorsForEmotion } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
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
import {
  DeepBreathingActivityIcon,
  MuscleRelaxActivityIcon,
  HabitMicrogoalIcon,
  GroundingIcon,
  JournalActivityIcon,
} from "@/components/svg/activities";
import { EmotyAvatar } from "@/components/avatar/EmotyAvatar";
import { BreathingPlayer } from "@/components/breathing/BreathingPlayer";
import { SensoryGroundingPlayer } from "@/components/grounding/SensoryGroundingPlayer";
import { SENSORY_54321_PROTOCOL } from "@/constants/GroundingProtocols";
import { formatProtocolDuration, resolveActiveBreathingProtocol } from "@/constants/BreathingProtocols";
import { CHECKIN_RETURN_TO } from "@/common/checkinReturn";
import { getGuidedMeditation, openGuidedMeditation } from "@/common/guidedMeditations";
import {
  getIntensityLevel,
  intensityPrompt,
  toneForEmotion,
  toneForFeeling,
  type FeelingTone,
} from "@/common/intensityWording";
import {
  getDiscoveryGroups,
  getPrimaryMeaningChoices,
  nextDiscoveryMode,
  previousDiscoveryMode,
  type DiscoveryMode,
} from "@/common/emotionDiscovery";
import {
  HELP_ME_NOTICE_STEPS,
  NOTICE_STEP_MS,
  getBodySensations,
  includesWholeBody,
  regionsForSensations,
  type BodyRegion,
} from "@/common/bodySensations";
import {
  determineIntervention,
  getRelevantBodyRegions,
  InterventionRoutingResult,
  type CanonicalEmotionKey,
} from "@/common/emotionRouting";
import {
  PRIMARY_EMOTIONS,
  SECONDARY_EMOTIONS_BY_PRIMARY,
  getCanonicalEmotionForRouting,
  PrimaryEmotionId,
} from "@/common/emotionTaxonomy";
import { validateContextualPrimary } from "@/common/phase6EmotionEntry";
import { useLanguage } from "@/context/LanguageContext";
import {
  PRIMARY_EMOTION_CARD_DESCRIPTIONS,
  PRIMARY_EMOTION_CARD_MIN_HEIGHT,
  primaryEmotionCardSelectedColors,
} from "@/common/primaryEmotionCardLayout";

// Phase 3: SecureStore key for pending post-session state (JPMR/Reframe navigate away, then return)
const P3_PENDING_KEY = "emotion_map_phase3_pending";

const { width } = Dimensions.get("window");

const FEATURE_EMOTIONS = [
  { id: "worried", label: "Worried / Scared", shortLabel: "Worried", Icon: WorriedEmotionIcon },
  { id: "sad", label: "Sad", shortLabel: "Sad", Icon: SadEmotionIcon },
  { id: "angry", label: "Angry / Upset", shortLabel: "Angry", Icon: AngryEmotionIcon },
  { id: "tired", label: "Tired / Drained", shortLabel: "Tired", Icon: TiredEmotionIcon },
  { id: "calm", label: "Calm", shortLabel: "Calm", Icon: CalmEmotionIcon },
  { id: "happy", label: "Happy", shortLabel: "Happy", Icon: HappyEmotionIcon },
  { id: "embarrassed", label: "Embarrassed / Ashamed", shortLabel: "Embarrassed", Icon: EmbarrassedEmotionIcon },
  { id: "guilty", label: "Guilty / Regretful", shortLabel: "Guilty", Icon: GuiltyEmotionIcon },
];

interface IntensitySelectorProps {
  value: number;
  onChange: (val: number) => void;
  activeColor?: string;
  /** Tone of the selected feeling: wording and colours describe its strength, not distress. */
  tone: FeelingTone;
}

function IntensitySelector({ value, onChange, activeColor, tone }: IntensitySelectorProps) {
  const level = getIntensityLevel(value, tone);

  const handleDecrement = () => {
    if (value > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < 10) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(value + 1);
    }
  };

  const handleSelect = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onChange(n);
  };

  const renderCircle = (n: number) => {
    const isSelected = value === n;
    const numLevel = getIntensityLevel(n, tone);
    return (
      <TouchableOpacity
        key={n}
        onPress={() => handleSelect(n)}
        style={[
          styles.gridCircle,
          isSelected
            ? { backgroundColor: numLevel.color, borderColor: numLevel.color }
            : styles.gridCircleUnselected,
        ]}
      >
        <Text
          style={[
            styles.gridCircleText,
            { color: isSelected ? Colors.white : Colors.textSecondary },
          ]}
        >
          {n}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.selectorContainer}>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          onPress={handleDecrement}
          style={[styles.stepperBtn, value === 1 && styles.stepperBtnDisabled]}
          disabled={value === 1}
        >
          <Ionicons
            name="remove"
            size={24}
            color={value === 1 ? Colors.textMuted : activeColor || Colors.primary}
          />
        </TouchableOpacity>

        <View style={styles.valueDisplay}>
          <Text style={[styles.intensityNum, { color: level.color }]}>{value}</Text>
          <Text style={[styles.intensityLabel, { color: level.color }]}>{level.text}</Text>
        </View>

        <TouchableOpacity
          onPress={handleIncrement}
          style={[styles.stepperBtn, value === 10 && styles.stepperBtnDisabled]}
          disabled={value === 10}
        >
          <Ionicons
            name="add"
            size={24}
            color={value === 10 ? Colors.textMuted : activeColor || Colors.primary}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.intensityDesc}>{level.desc}</Text>

      <View style={styles.intensityGrid}>
        <View style={styles.gridRow}>
          {[1, 2, 3, 4, 5].map((n) => renderCircle(n))}
        </View>
        <View style={styles.gridRow}>
          {[6, 7, 8, 9, 10].map((n) => renderCircle(n))}
        </View>
      </View>
    </View>
  );
}

export default function EmotionMapScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAppAuth();
  const params = useLocalSearchParams<{ postSession?: string; reset?: string; primaryEmotion?: string }>();
  const contextualPrimary = validateContextualPrimary(params.primaryEmotion);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<"log" | "history">("log");

  // Step 1: Broad emotional state (Primary)
  const [primaryEmotion, setPrimaryEmotion] = useState<PrimaryEmotionId | null>(contextualPrimary);

  // Step 2: More specific feeling (Secondary)
  const [secondaryEmotion, setSecondaryEmotion] = useState<string | null>(null);

  // Kept for backward compatibility and internal consistency with history & routing
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [strongestEmotion, setStrongestEmotion] = useState<string | null>(null);

  // Step 2: "Not sure" opens guided discovery (see common/emotionDiscovery.ts). The check-in only
  // continues once the student picks a feeling; no emotion is ever filled in for them.
  const [discovery, setDiscovery] = useState<DiscoveryMode>({ kind: "choose" });
  const discoveryGroups = primaryEmotion ? getDiscoveryGroups(primaryEmotion) : [];

  // Step 3: Body sensations (sensation-first). Saved as the existing figure regions.
  const [selectedSensations, setSelectedSensations] = useState<string[]>([]);
  // "Not really" after Help me notice. Saved as no regions (the schema has no separate "unsure").
  const [isUnsureBody, setIsUnsureBody] = useState<boolean>(false);
  // Help me notice: null = off, 0..n-1 = highlighting that step, n = finished
  const [noticeIndex, setNoticeIndex] = useState<number | null>(null);

  // Step 4: Intensity
  const [intensity, setIntensity] = useState<number>(5);

  // Step 5: Automatic Intervention Launch Transition
  const [routedIntervention, setRoutedIntervention] = useState<InterventionRoutingResult | null>(null);
  // Emotion the recommendation was routed from; selects the optional guided meditation
  const [routedEmotionKey, setRoutedEmotionKey] = useState<CanonicalEmotionKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Phase 3 — Modal states for inline interventions
  const [showBreathingModal, setShowBreathingModal] = useState(false);
  const [showGroundingModal, setShowGroundingModal] = useState(false);

  // Phase 3 — Post-intervention state
  // emotionLogId: the _id of the emotionLog created in step 4 — used to patch postIntensity
  const [emotionLogId, setEmotionLogId] = useState<string | null>(null);
  // postIntensityValue: the user's self-reported feeling after intervention
  const [postIntensityValue, setPostIntensityValue] = useState<number>(5);
  // postOutcome: simple 3-way result for Emoty followup message
  const [postOutcome, setPostOutcome] = useState<"better" | "same" | "worse" | null>(null);
  const [isSavingPost, setIsSavingPost] = useState(false);

  // Flow Step State
  // 1: Primary emotion selection (Happy, Sad, Angry, Calm)
  // 2: Secondary emotion selection (scoped to primary)
  // 3: Body sensation
  // 4: Intensity
  // 5: Intervention intro (Emoty recommends)
  // 6: Uncertain support (fallback activity)
  // 7: Post-intervention check ("How do you feel now?")
  // 8: Emoty followup message
  const [step, setStep] = useState<number>(contextualPrimary ? 2 : 1);

  // History Tab States
  const [filterDays, setFilterDays] = useState<7 | 30>(7);

  // Convex mutations & queries
  const createEmotionLog = useMutation(api.emotionLogs.create);
  const createEmotionMap = useMutation(api.emotionMaps.create);
  const recordPostIntensity = useMutation(api.emotionLogs.recordPostIntensity);
  const recentLogs = useQuery(api.emotionMaps.getRecentLogs, {
    userId: user?.id ?? "",
  });

  const activePrimaryDef = PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion);
  const activeColors = activePrimaryDef
    ? { primary: activePrimaryDef.themeColor, secondary: activePrimaryDef.themeColor + "33" }
    : getColorsForEmotion(strongestEmotion);

  // Android hardware back navigation
  useEffect(() => {
    const onBackPress = () => {
      if (activeTab === "history") {
        setActiveTab("log");
        return true;
      }
      if (step === 2 && discovery.kind !== "choose") {
        setDiscovery(previousDiscoveryMode(discovery, discoveryGroups.length));
        return true;
      }
      if (step === 2) {
        if (contextualPrimary) {
          router.back();
          return true;
        }
        setStep(1);
        return true;
      }
      if (step === 3) {
        setStep(2);
        return true;
      }
      if (step === 4) {
        setStep(3);
        return true;
      }
      if (step === 5) {
        setStep(1);
        return true;
      }
      if (step === 6) {
        setStep(2);
        return true;
      }
      if (step === 7 || step === 8) {
        router.replace("/(auth)/(tabs)");
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [step, activeTab, router, contextualPrimary, discovery, discoveryGroups.length]);

  // Phase 3 — On mount: check if returning from JPMR/Reframe with pending post-session state
  useEffect(() => {
    if (params.postSession === "1") {
      SecureStore.getItemAsync(P3_PENDING_KEY).then((raw) => {
        if (!raw) return;
        try {
          const pending = JSON.parse(raw);
          // Restore enough state to run the post-intervention check
          if (pending.emotionLogId) setEmotionLogId(pending.emotionLogId);
          if (pending.strongestEmotion) setStrongestEmotion(pending.strongestEmotion);
          if (pending.interventionType) {
            setRoutedIntervention(pending.routedIntervention ?? null);
          }
          setPostIntensityValue(pending.preIntensity ?? 5);
          setStep(7); // jump straight to post-intervention check
          SecureStore.deleteItemAsync(P3_PENDING_KEY).catch(() => {});
        } catch { /* malformed — ignore */ }
      }).catch(() => {});
    }
  }, [params.postSession]);

  useEffect(() => {
    if (params.reset === "1") {
      setStep(1);
      setPrimaryEmotion(null);
      setSecondaryEmotion(null);
      setSelectedSensations([]);
      setIsUnsureBody(false);
      setRoutedIntervention(null);
    }
  }, [params.reset]);

  // Sensations belong to one emotion's list: clear them when the emotion changes
  // (same key as intervention routing)
  const sensationEmotionKey = primaryEmotion ? getCanonicalEmotionForRouting(primaryEmotion, secondaryEmotion) : null;
  useEffect(() => {
    setSelectedSensations([]);
    setIsUnsureBody(false);
  }, [sensationEmotionKey]);

  // Help me notice: advance one region every NOTICE_STEP_MS; stops when leaving step 3
  useEffect(() => {
    if (step !== 3) {
      if (noticeIndex !== null) setNoticeIndex(null);
      return;
    }
    if (noticeIndex === null || noticeIndex >= HELP_ME_NOTICE_STEPS.length) return;
    AccessibilityInfo.announceForAccessibility(HELP_ME_NOTICE_STEPS[noticeIndex].line);
    const timer = setTimeout(() => setNoticeIndex(noticeIndex + 1), NOTICE_STEP_MS);
    return () => clearTimeout(timer);
  }, [step, noticeIndex]);

  // Step 1: User selects a primary emotion
  const handleSelectPrimary = (id: PrimaryEmotionId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPrimaryEmotion(id);
    setSecondaryEmotion(null);
    setStrongestEmotion(id);
    setSelectedEmotions([id]);
    setDiscovery({ kind: "choose" });
  };

  // Step 1 -> Next: Advance to Step 2
  const handleContinueFromStep1 = () => {
    if (!primaryEmotion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDiscovery({ kind: "choose" });
    setStep(2);
  };

  // Step 2: User selects a secondary emotion
  const handleSelectSecondary = (option: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSecondaryEmotion(option);
    setStrongestEmotion(option);
    setSelectedEmotions(primaryEmotion ? [primaryEmotion, option] : [option]);
  };

  // Step 2 -> Next: Advance to Step 3 (Body cues)
  const handleContinueFromStep2 = () => {
    if (!secondaryEmotion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep(3);
  };

  // Step 2: "Not sure" opens guided discovery. Nothing is selected for the student.
  const handleUnsureSecondary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSecondaryEmotion(null);
    setDiscovery({ kind: "explore", group: 0 });
  };

  // "None of these": the next group of feelings, then the broad-emotion meanings
  const handleDiscoveryNone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDiscovery((mode) => nextDiscoveryMode(mode, discoveryGroups.length));
  };
  const handleDiscoveryBack = () => setDiscovery((mode) => previousDiscoveryMode(mode, discoveryGroups.length));

  // A feeling that fits: the normal selection, then the student confirms with Continue
  const handlePickDiscoveredFeeling = (option: string) => {
    handleSelectSecondary(option);
    setDiscovery({ kind: "choose" });
  };

  // A broad emotion that sounds closer: switch to it and show its feelings
  const handlePickBroadMeaning = (id: PrimaryEmotionId) => handleSelectPrimary(id);

  const handleStillNotSure = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDiscovery({ kind: "unresolved" });
  };

  // Explicit choice to leave the check-in for a calming activity (step 6). Nothing is saved there.
  const handleSkipToCalmingActivity = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep(6);
  };

  // Step 3: toggle a body sensation (multi-select)
  const toggleSensation = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsUnsureBody(false);
    setSelectedSensations((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  // Step 3: Help me notice — a short optional body check, skippable at any point
  const handleStartNotice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsUnsureBody(false);
    setNoticeIndex(0);
  };
  const handleSkipNotice = () => setNoticeIndex(HELP_ME_NOTICE_STEPS.length);

  // After Help me notice: nothing stood out. Continue without a sensation; that is a valid answer.
  const handleNothingNoticed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedSensations([]);
    setIsUnsureBody(true);
    setNoticeIndex(null);
    setStep(4);
  };

  // Step 3 -> Next. A sensation is never required.
  const handleContinueFromStep3 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setNoticeIndex(null);
    setStep(4);
  };

  // Phase 2 — Step 6: Uncertain support fallback — launch an existing canonical intervention
  // Uses approved breathing (box_4444) as default gentle activity.
  // No clinical scoring; purely a wellness routing shortcut.
  const handleFallbackIntervention = (type: "breathing" | "grounding" | "jpmr") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    switch (type) {
      case "breathing":
        // Use box_4444 — active, approved
        setRoutedIntervention({
          interventionType: "breathing",
          targetRoute: "breathing",
          title: "Box Breathing",
          studentFacingName: "Let's Breathe",
          recommendedDuration: "3 mins",
          protocolId: "box_4444",
          reason: "A short breathing exercise to help you settle.",
          transitionMessage: "That's completely okay. Let's just do something simple together.",
        });
        setShowBreathingModal(true);
        break;
      case "grounding":
        router.replace({
          pathname: "/(auth)/tools/grounding",
          params: { sourceType: "emotion_checkin_uncertain" },
        } as any);
        break;
      case "jpmr":
        router.replace({
          pathname: "/(auth)/tools/jpmr",
          params: { sourceType: "emotion_checkin_uncertain" },
        } as any);
        break;
    }
  };

  // Step 4 -> Next: Log check-in and determine automatic intervention routing
  const handleContinueFromStep4 = async () => {
    if (!primaryEmotion || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const canonicalEmotion = getCanonicalEmotionForRouting(primaryEmotion, secondaryEmotion);
      const intervention = determineIntervention(canonicalEmotion, intensity);
      setRoutedIntervention(intervention);
      setRoutedEmotionKey(canonicalEmotion);

      // Sensations are saved as the figure regions they name (wording is not in the schema)
      const effectiveRegions = isUnsureBody ? [] : regionsForSensations(canonicalEmotion, selectedSensations);
      // "Not sure" on the specific feeling: only the primary emotion the student chose is saved
      const logEmotion = secondaryEmotion || primaryEmotion;
      const historyLabel = secondaryEmotion || PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion)?.label || primaryEmotion;
      const emotionsList = secondaryEmotion ? [primaryEmotion, secondaryEmotion] : [primaryEmotion];

      // Authoritative emotionLogs insertion — capture logId for Phase 3 post-intensity patch
      const logId = await createEmotionLog({
        emotion: logEmotion,
        strongestEmotion: logEmotion,
        selectedEmotions: emotionsList,
        bodyRegions: effectiveRegions,
        preIntensity: intensity,
      });
      setEmotionLogId(logId as string);

      // Backward-compatible emotionMaps insertion
      const ratingsList = effectiveRegions.map((region) => ({
        region,
        intensity,
      }));

      await createEmotionMap({
        userId: user?.id,
        emotionLabel: historyLabel,
        selectedRegions: effectiveRegions,
        bodyRatings: ratingsList.length > 0 ? ratingsList : [{ region: "General", intensity }],
        averageIntensity: intensity,
        suggestedAction: intervention.title,
        selectedEmotions: emotionsList,
        strongestEmotion: logEmotion,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(5);
    } catch (err) {
      console.error("Failed to log emotion check-in:", err);
      Alert.alert("Error", "Could not record your check-in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase 3 — Save pending state before navigating away to JPMR/Reframe
  // so the user returns to step 7 (post-intervention Emoty check) after completing the tool.
  const savePendingAndNavigate = async (pathname: string, extraParams: Record<string, string> = {}) => {
    const currentEmotion = secondaryEmotion || primaryEmotion || strongestEmotion;
    if (emotionLogId && currentEmotion) {
      const pending = {
        emotionLogId,
        strongestEmotion: currentEmotion,
        preIntensity: intensity,
        routedIntervention: routedIntervention,
        interventionType: routedIntervention?.interventionType,
      };
      await SecureStore.setItemAsync(P3_PENDING_KEY, JSON.stringify(pending)).catch(() => {});
    }
    router.replace({
      pathname: pathname as any,
      params: { sourceType: "emotion_checkin", returnTo: CHECKIN_RETURN_TO, ...extraParams },
    } as any);
  };

  // Phase 3 — Handle genuine intervention completion (inline breathing/grounding)
  const handleInlineInterventionComplete = () => {
    setShowBreathingModal(false);
    setShowGroundingModal(false);
    setPostIntensityValue(Math.max(1, intensity - 1)); // seed with slight improvement as default
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStep(7);
  };

  // Phase 3 — Post-intervention intensity submitted by user
  const handleSubmitPostCheck = async (outcome: "better" | "same" | "worse") => {
    setPostOutcome(outcome);
    setIsSavingPost(true);
    try {
      if (emotionLogId) {
        await recordPostIntensity({
          logId: emotionLogId as any,
          postIntensity: postIntensityValue,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStep(8);
    } catch (err) {
      // Non-blocking: post-intensity is optional telemetry
      console.warn("Post-intensity recording failed (non-blocking):", err);
      setStep(8);
    } finally {
      setIsSavingPost(false);
    }
  };

  // Step 5: Optional guided meditation, opened outside the app. It does not log anything or
  // change the step, so the built-in intervention and the post-check stay exactly as they were.
  const guidedMeditation = getGuidedMeditation(routedEmotionKey);
  const handleOpenGuidedMeditation = async () => {
    Haptics.selectionAsync().catch(() => {});
    const result = await openGuidedMeditation(guidedMeditation, (url) => Linking.openURL(url));
    if (result !== "opened") {
      Alert.alert("Couldn't open the meditation", "You can still try the exercise above.");
    }
  };

  // Step 5: Start the routed intervention — Phase 3 inline where possible, navigate away otherwise
  const handleStartIntervention = () => {
    if (!routedIntervention) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    switch (routedIntervention.interventionType) {
      case "breathing":
        // Inline modal — onComplete goes to step 7
        setShowBreathingModal(true);
        break;
      case "grounding":
        // Inline modal — onComplete goes to step 7
        setShowGroundingModal(true);
        break;
      case "jpmr":
        // Must navigate away; save pending state for return
        savePendingAndNavigate("/(auth)/tools/jpmr");
        break;
      case "reframe":
        // Must navigate away; save pending state for return
        savePendingAndNavigate("/(auth)/tools/reframe");
        break;
      case "microgoals":
        router.replace({
          pathname: "/(auth)/tools/microgoals",
          params: { sourceType: "emotion_checkin" },
        } as any);
        break;
      default:
        setShowBreathingModal(true);
        break;
    }
  };

  // Filter logs for History View
  const logs = recentLogs ?? [];
  const filterLimit = filterDays * 24 * 60 * 60 * 1000;
  const filteredLogs = logs.filter((log: any) => Date.now() - log.createdAt <= filterLimit);

  // Compute frequencies for history
  const emotionCounts: Record<string, number> = {};
  filteredLogs.forEach((log: any) => {
    emotionCounts[log.emotionLabel] = (emotionCounts[log.emotionLabel] || 0) + 1;
  });
  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const mostFrequentEmotion = sortedEmotions.length > 0 ? sortedEmotions[0][0] : null;

  const regionCounts: Record<string, number> = {};
  filteredLogs.forEach((log: any) => {
    log.selectedRegions.forEach((r: string) => {
      regionCounts[r] = (regionCounts[r] || 0) + 1;
    });
  });
  const sortedRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const mostFrequentRegion = sortedRegions.length > 0 ? sortedRegions[0][0] : null;

  const overallAvgIntensity =
    filteredLogs.length > 0
      ? Number(
          (
            filteredLogs.reduce((sum: number, log: any) => sum + log.averageIntensity, 0) /
            filteredLogs.length
          ).toFixed(1)
        )
      : 0;

  // Progress only reflects steps 1–5 (step 6 is an off-ramp, not a progress step)
  const progressSteps = Math.min(step, 5);
  const Progress = () => (
    <View style={styles.progressContainer}>
      <View style={[styles.progressBar, { width: `${(progressSteps / 5) * 100}%` }]} />
    </View>
  );

  const getInterventionIcon = (type?: string) => {
    switch (type) {
      case "breathing":
        return <DeepBreathingActivityIcon size={32} color={Colors.primary} />;
      case "jpmr":
        return <MuscleRelaxActivityIcon size={32} color={Colors.secondary} />;
      case "grounding":
        return <GroundingIcon size={32} color="#16A34A" />;
      case "reframe":
        return <JournalActivityIcon size={32} color="#A855F7" />;
      case "microgoals":
        return <HabitMicrogoalIcon size={32} color="#F59E0B" />;
      default:
        return <DeepBreathingActivityIcon size={32} color={Colors.primary} />;
    }
  };

  // Step 3: sensation options follow the emotion the student chose
  const sensationOptions = getBodySensations(sensationEmotionKey);
  const sensationRegions = regionsForSensations(sensationEmotionKey, selectedSensations);
  const sensationWholeBody = includesWholeBody(sensationEmotionKey, selectedSensations);
  const isNoticing = noticeIndex !== null && noticeIndex < HELP_ME_NOTICE_STEPS.length;
  const noticeFinished = noticeIndex === HELP_ME_NOTICE_STEPS.length;
  const figureColor = activePrimaryDef?.themeColor || Colors.primary;
  // The figure is feedback only: it shows the regions behind the chosen sensations, or the
  // region Help me notice is on. It is not a picker.
  const regionFill = (region: BodyRegion) => {
    if (isNoticing) return HELP_ME_NOTICE_STEPS[noticeIndex!].region === region ? figureColor : "#E2E8F0";
    if (sensationRegions.includes(region)) return figureColor;
    if (sensationWholeBody) return figureColor + "55";
    return "#E2E8F0";
  };

  // Resolve breathing protocol from registry using approved active protocols only.
  // relaxing_478 (4-7-8) remains defined_inactive — never resolved here. Falls back to box_4444.
  const activeBreathingProtocol = resolveActiveBreathingProtocol(routedIntervention?.protocolId);
  // Breathing cards show the length of the session that will actually play
  const interventionDuration =
    routedIntervention?.interventionType === "breathing"
      ? formatProtocolDuration(activeBreathingProtocol)
      : routedIntervention?.recommendedDuration;

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#F4F3FF", "#E0DBFF"]} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 20, 68), paddingBottom: Math.max(insets.bottom, 12) + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Header */}
        <View style={styles.header}>
          <View style={styles.headerNavRow}>
            <TouchableOpacity
              onPress={() => {
                if (activeTab === "history") {
                  setActiveTab("log");
                } else if (step === 2 && discovery.kind !== "choose") {
                  handleDiscoveryBack();
                } else if (step === 2) {
                  if (contextualPrimary) router.back();
                  else setStep(1);
                } else if (step === 3) {
                  setStep(2);
                } else if (step === 4) {
                  setStep(3);
                } else if (step === 5) {
                  setStep(1);
                } else if (step === 6) {
                  setStep(2);
                } else if (step === 7 || step === 8) {
                  router.replace("/(auth)/(tabs)");
                } else {
                  router.back();
                }
              }}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>{t("tools.howImFeelingTitle")}</Text>
          </View>

          {/* Tab Selection */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "log" && styles.tabButtonActive]}
              onPress={() => setActiveTab("log")}
            >
              <Text style={[styles.tabText, activeTab === "log" && styles.tabTextActive]}>
                Guided Check-in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "history" && styles.tabButtonActive]}
              onPress={() => setActiveTab("history")}
            >
              <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
                History & Trends
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "log" && <Progress />}
        </View>

        {/* LOG SENSATION TAB */}
        {activeTab === "log" && (
          <View style={{ width: "100%" }}>
            {/* STEP 1: Broad emotional state (Primary Emotions) */}
            {step === 1 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="neutral" size="md" />
                  <View style={styles.emotySpeechBubble}>
                    <Text style={styles.emotySpeechText}>How are you feeling right now?</Text>
                    <Text style={styles.emotySubtext}>You can start with what feels closest.</Text>
                  </View>
                </View>

                <View style={styles.primaryGrid}>
                  {PRIMARY_EMOTIONS.map((emotion) => {
                    const isSelected = primaryEmotion === emotion.id;
                    const selectedColors = primaryEmotionCardSelectedColors(emotion.themeColor);
                    const IconComponent =
                      emotion.id === "happy"
                        ? HappyEmotionIcon
                        : emotion.id === "sad"
                        ? SadEmotionIcon
                        : emotion.id === "angry"
                        ? AngryEmotionIcon
                        : CalmEmotionIcon;

                    return (
                      // Pressable with a slight scale, not an opacity fade: fading an elevated card
                      // lets its Android shadow show through the card while pressed.
                      <Pressable
                        key={emotion.id}
                        style={({ pressed }) => [
                          styles.primaryCard,
                          isSelected && styles.primaryCardSelected,
                          isSelected && { borderColor: selectedColors.borderColor, backgroundColor: selectedColors.backgroundColor },
                          pressed && styles.primaryCardPressed,
                        ]}
                        onPress={() => handleSelectPrimary(emotion.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected, checked: isSelected }}
                        accessibilityLabel={`${emotion.label}: ${PRIMARY_EMOTION_CARD_DESCRIPTIONS[emotion.id]}`}
                      >
                        <View
                          style={[
                            styles.primaryIconContainer,
                            { backgroundColor: emotion.themeColor + "18" },
                            isSelected && { backgroundColor: selectedColors.iconBackgroundColor },
                          ]}
                        >
                          <IconComponent size={36} color={emotion.themeColor} />
                        </View>
                        <View style={styles.primaryTextContainer}>
                          <Text style={[styles.primaryLabel, isSelected && { color: emotion.themeColor }]}>
                            {emotion.label}
                          </Text>
                          <Text style={styles.primaryDescription}>
                            {PRIMARY_EMOTION_CARD_DESCRIPTIONS[emotion.id]}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.primaryBadge,
                            isSelected && { backgroundColor: emotion.themeColor, borderColor: emotion.themeColor },
                          ]}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark" size={14} color={Colors.white} />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

              </View>
            )}

            {/* STEP 2: Secondary Emotions */}
            {step === 2 && primaryEmotion && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="listening" size="md" />
                  <View style={styles.emotySpeechBubble} accessibilityLiveRegion="polite">
                    {discovery.kind === "choose" && (
                      <>
                        <Text style={styles.emotySpeechText}>
                          Got it. You're feeling {PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion)?.label.toLowerCase()}.
                        </Text>
                        <Text style={styles.emotySubtext}>What's closest to how you're feeling?</Text>
                      </>
                    )}
                    {discovery.kind === "explore" && (
                      <>
                        <Text style={styles.emotySpeechText}>
                          {discovery.group === 0 ? "That's okay. Let's figure it out together." : "How about these?"}
                        </Text>
                        <Text style={styles.emotySubtext}>Does it feel more like…</Text>
                      </>
                    )}
                    {discovery.kind === "broad" && (
                      <>
                        <Text style={styles.emotySpeechText}>{"Let's look at it another way."}</Text>
                        <Text style={styles.emotySubtext}>Which of these sounds closest?</Text>
                      </>
                    )}
                    {discovery.kind === "unresolved" && (
                      <>
                        <Text style={styles.emotySpeechText}>{"That's okay. Some feelings are hard to name."}</Text>
                        <Text style={styles.emotySubtext}>{"Without a feeling, this check-in won't be saved."}</Text>
                      </>
                    )}
                  </View>
                </View>

                {discovery.kind === "choose" && (
                  <View style={styles.secondaryContainer}>
                    <View style={styles.secondaryGrid}>
                      {(SECONDARY_EMOTIONS_BY_PRIMARY[primaryEmotion] || [])
                        .filter((opt) => opt !== "Not sure")
                        .map((option) => {
                          const isSelected = secondaryEmotion === option;
                          const primaryThemeColor =
                            PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion)?.themeColor || Colors.primary;

                          return (
                            <TouchableOpacity
                              key={option}
                              style={[
                                styles.secondaryChip,
                                isSelected && [
                                  styles.secondaryChipSelected,
                                  { backgroundColor: primaryThemeColor, borderColor: primaryThemeColor },
                                ],
                              ]}
                              onPress={() => handleSelectSecondary(option)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: isSelected, checked: isSelected }}
                              activeOpacity={0.8}
                            >
                              {/* Icon is always present and text weight is fixed, so selecting a chip
                                  never changes its width and the wrapped rows do not jump */}
                              <Ionicons
                                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                size={16}
                                color={isSelected ? Colors.white : Colors.textMuted}
                                style={styles.chipIcon}
                              />
                              <Text
                                style={[
                                  styles.secondaryChipText,
                                  isSelected && styles.secondaryChipTextSelected,
                                ]}
                              >
                                {option}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>

                    <TouchableOpacity style={styles.unsureInlineBtn} onPress={handleUnsureSecondary} accessibilityRole="button">
                      <Ionicons name="help-circle-outline" size={18} color={Colors.textMuted} />
                      <Text style={styles.unsureInlineText}>Not sure</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {discovery.kind === "explore" && (
                  // A few of this emotion's feelings at a time; picking one returns to the choices
                  <View style={styles.secondaryContainer}>
                    <View style={styles.secondaryGrid}>
                      {(discoveryGroups[discovery.group] ?? []).map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[styles.secondaryChip, styles.sensationChip]}
                          onPress={() => handlePickDiscoveredFeeling(option)}
                          accessibilityRole="button"
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.secondaryChipText, styles.sensationChipText]}>{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.unsureInlineBtn} onPress={handleDiscoveryNone} accessibilityRole="button">
                      <Text style={[styles.unsureInlineText, { color: Colors.primary }]}>None of these</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {discovery.kind === "broad" && (
                  // The specification's plain meaning of each broad emotion
                  <View style={styles.secondaryContainer}>
                    {getPrimaryMeaningChoices().map((choice) => (
                      <TouchableOpacity
                        key={choice.id}
                        style={styles.meaningCard}
                        onPress={() => handlePickBroadMeaning(choice.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${choice.meaning} ${choice.label}`}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.meaningText}>{choice.meaning}</Text>
                        <Text style={styles.meaningLabel}>{choice.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.unsureInlineBtn} onPress={handleStillNotSure} accessibilityRole="button">
                      <Text style={styles.unsureInlineText}>Still not sure</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {discovery.kind === "unresolved" && (
                  // Stop asking; offer another try, the choices, or a calming activity (nothing saved)
                  <View style={styles.secondaryContainer}>
                    <TouchableOpacity
                      style={styles.unsureInlineBtn}
                      onPress={() => setDiscovery({ kind: "explore", group: 0 })}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.unsureInlineText, { color: Colors.primary }]}>Try again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.unsureInlineBtn}
                      onPress={() => setDiscovery({ kind: "choose" })}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.unsureInlineText, { color: Colors.primary }]}>Back to the feelings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.unsureInlineBtn}
                      onPress={handleSkipToCalmingActivity}
                      accessibilityRole="button"
                      accessibilityHint="Leaves the check-in without saving it"
                    >
                      <Text style={[styles.unsureInlineText, { color: Colors.primary }]}>Do something calming instead</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.navRow}>
                  {discovery.kind === "choose" ? (
                    <>
                      <Button title="Back" onPress={() => setStep(1)} variant="outline" style={styles.halfBtn} />
                      <Button
                        title="Continue"
                        onPress={handleContinueFromStep2}
                        disabled={!secondaryEmotion}
                        style={styles.halfBtn}
                      />
                    </>
                  ) : (
                    <Button title="Back" onPress={handleDiscoveryBack} variant="outline" style={styles.halfBtn} />
                  )}
                </View>
              </View>
            )}

            {/* STEP 3: How does it feel in your body? Sensation-first; the figure is feedback only */}
            {step === 3 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="listening" size="md" />
                  <View style={styles.emotySpeechBubble} accessibilityLiveRegion="polite">
                    {isNoticing ? (
                      <>
                        <Text style={styles.emotySpeechText}>{HELP_ME_NOTICE_STEPS[noticeIndex!].line}</Text>
                        <Text style={styles.emotySubtext}>Just notice. There is nothing to get right.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.emotySpeechText}>
                          {noticeFinished ? "Anything stand out?" : "How does it feel in your body?"}
                        </Text>
                        <Text style={styles.emotySubtext}>Pick anything that fits.</Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.bodyFigureWrap} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Svg width={92} height={148} viewBox="0 0 200 320">
                    <Circle cx={100} cy={35} r={20} fill={regionFill("Head")} />
                    <Path d="M 65 65 L 135 65 L 130 85 L 70 85 Z" fill={regionFill("Shoulders")} />
                    <Path d="M 72 88 L 128 88 L 125 125 L 75 125 Z" fill={regionFill("Chest")} />
                    <Path d="M 75 128 L 125 128 L 120 170 L 80 170 Z" fill={regionFill("Stomach")} />
                    <Path d="M 62 68 L 48 80 L 38 150 L 48 150 L 58 90 Z" fill={regionFill("Hands")} />
                    <Path d="M 138 68 L 152 80 L 162 150 L 152 150 L 142 90 Z" fill={regionFill("Hands")} />
                    <Path d="M 80 173 L 97 173 L 92 295 L 75 295 Z" fill={regionFill("Legs")} />
                    <Path d="M 103 173 L 120 173 L 125 295 L 108 295 Z" fill={regionFill("Legs")} />
                  </Svg>
                </View>

                {isNoticing ? (
                  <View style={styles.noticeFooter}>
                    <View style={styles.noticeDots}>
                      {HELP_ME_NOTICE_STEPS.map((s, i) => (
                        <View key={s.region} style={[styles.noticeDot, i <= noticeIndex! && { backgroundColor: figureColor }]} />
                      ))}
                    </View>
                    <TouchableOpacity style={styles.unsureInlineBtn} onPress={handleSkipNotice} accessibilityRole="button">
                      <Text style={styles.unsureInlineText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.secondaryGrid}>
                      {sensationOptions.map((sensation) => {
                        const isSelected = selectedSensations.includes(sensation.label);
                        return (
                          <TouchableOpacity
                            key={sensation.label}
                            style={[
                              styles.secondaryChip,
                              styles.sensationChip,
                              isSelected && [styles.secondaryChipSelected, { backgroundColor: figureColor, borderColor: figureColor }],
                            ]}
                            onPress={() => toggleSensation(sensation.label)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected }}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                              size={16}
                              color={isSelected ? Colors.white : Colors.textMuted}
                              style={styles.chipIcon}
                            />
                            <Text style={[styles.secondaryChipText, styles.sensationChipText, isSelected && styles.secondaryChipTextSelected]}>
                              {sensation.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {noticeFinished ? (
                      <TouchableOpacity style={styles.unsureInlineBtn} onPress={handleNothingNoticed} accessibilityRole="button">
                        <Text style={styles.unsureInlineText}>Not really</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.unsureInlineBtn}
                        onPress={handleStartNotice}
                        accessibilityRole="button"
                        accessibilityHint="A short guided body check, about 20 seconds"
                      >
                        <Ionicons name="sparkles-outline" size={18} color={Colors.primary} />
                        <Text style={[styles.unsureInlineText, { color: Colors.primary }]}>Help me notice</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.navRow}>
                      <Button title="Back" onPress={() => setStep(2)} variant="outline" style={styles.halfBtn} />
                      <Button title="Continue" onPress={handleContinueFromStep3} style={styles.halfBtn} />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* STEP 4: Intensity */}
            {step === 4 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="neutral" size="md" />
                  <View style={styles.emotySpeechBubble}>
                    <Text style={styles.emotySpeechText}>How strong does it feel right now?</Text>
                    <Text style={styles.emotySubtext}>
                      {intensityPrompt(secondaryEmotion)}
                    </Text>
                  </View>
                </View>
                <IntensitySelector value={intensity} onChange={setIntensity} activeColor={activeColors.primary} tone={toneForEmotion(primaryEmotion)} />
                <View style={styles.navRow}>
                  <Button title="Back" onPress={() => setStep(3)} variant="outline" style={styles.halfBtn} />
                  <Button title={isSubmitting ? "Finding Best Tool..." : "Continue"} onPress={handleContinueFromStep4} disabled={isSubmitting} style={styles.halfBtn} />
                </View>
              </View>
            )}
            {/* STEP 5: Emoty Intervention Intro — Phase 3 */}
            {step === 5 && routedIntervention && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="supportive" size="md" />
                  <View style={styles.emotySpeechBubble}>
                    <Text style={styles.emotySpeechText}>{routedIntervention.transitionMessage}</Text>
                  </View>
                </View>
                <View style={styles.interventionCard}>
                  <View style={styles.interventionHeader}>
                    <View style={styles.interventionIconBox}>{getInterventionIcon(routedIntervention.interventionType)}</View>
                    <Text style={styles.interventionTitle}>{routedIntervention.title}</Text>
                  </View>
                  {/* Full card width and wrapping, so long names never push the duration off the card */}
                  <View style={styles.badgeRow}>
                    <View style={styles.pillTag}><Text style={styles.pillTagText}>{routedIntervention.studentFacingName}</Text></View>
                    <View style={[styles.pillTag, styles.durationPill]}>
                      <Ionicons name="time-outline" size={12} color={Colors.primary} />
                      <Text style={[styles.pillTagText, { color: Colors.primary }]}>{interventionDuration}</Text>
                    </View>
                  </View>
                  <Text style={styles.interventionReason}>{routedIntervention.reason}</Text>
                </View>
                <TouchableOpacity style={styles.startInterventionBtn} onPress={handleStartIntervention} activeOpacity={0.9} accessibilityRole="button">
                  <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.startBtnGradient}>
                    <Text style={styles.startBtnText}>{"Let's start"}</Text>
                    <Ionicons name="arrow-forward" size={20} color={Colors.white} />
                  </LinearGradient>
                </TouchableOpacity>
                {guidedMeditation && (
                  <Pressable
                    style={({ pressed }) => [styles.meditationRow, pressed && styles.meditationRowPressed]}
                    onPress={handleOpenGuidedMeditation}
                    accessibilityRole="link"
                    accessibilityLabel={`Optional guided meditation: ${guidedMeditation.title}`}
                    accessibilityHint="Opens YouTube outside Emotify"
                  >
                    <View style={styles.meditationIconBox}>
                      <Ionicons name="play-circle-outline" size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.meditationTextCol}>
                      <Text style={styles.meditationEyebrow}>Guided meditation · Optional</Text>
                      <Text style={styles.meditationTitle}>{guidedMeditation.title}</Text>
                      <Text style={styles.meditationMeta}>
                        {guidedMeditation.durationLabel ? `YouTube · ${guidedMeditation.durationLabel}` : "YouTube"}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
                <TouchableOpacity style={styles.maybeLaterBtn} onPress={() => router.replace("/(auth)/(tabs)")}>
                  <Text style={styles.maybeLaterText}>Maybe later</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* STEP 6: Uncertain Support — Phase 2. Local UI only, no DB record. 4-7-8 NOT offered. */}
            {step === 6 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="supportive" size="md" />
                  <View style={styles.emotySpeechBubble}>
                    <Text style={styles.emotySpeechText}>{"That's completely okay."}</Text>
                    <Text style={styles.emotySubtext}>You do not have to figure it out right now. Let us just do something that might help you feel a little more settled.</Text>
                  </View>
                </View>
                <View style={styles.fallbackActivityList}>
                  <TouchableOpacity style={styles.fallbackActivityCard} onPress={() => handleFallbackIntervention("breathing")} activeOpacity={0.85}>
                    <View style={styles.fallbackIconBox}><DeepBreathingActivityIcon size={28} color={Colors.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fallbackActivityTitle}>{"Let's breathe"}</Text>
                      <Text style={styles.fallbackActivitySub}>A short breathing exercise</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fallbackActivityCard} onPress={() => handleFallbackIntervention("grounding")} activeOpacity={0.85}>
                    <View style={[styles.fallbackIconBox, { backgroundColor: "#DCFCE7" }]}><GroundingIcon size={28} color="#16A34A" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fallbackActivityTitle}>{"Let's ground myself"}</Text>
                      <Text style={styles.fallbackActivitySub}>Notice what is around you right now</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fallbackActivityCard} onPress={() => handleFallbackIntervention("jpmr")} activeOpacity={0.85}>
                    <View style={[styles.fallbackIconBox, { backgroundColor: "#EDE9FE" }]}><MuscleRelaxActivityIcon size={28} color={Colors.secondary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fallbackActivityTitle}>Try something calming</Text>
                      <Text style={styles.fallbackActivitySub}>Release tension with guided relaxation</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.maybeLaterBtn} onPress={() => router.replace("/(auth)/(tabs)")}>
                  <Text style={styles.maybeLaterText}>Return to Home</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* STEP 7: Post-Intervention Check — Phase 3 */}
            {step === 7 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar state="calm" size="md" />
                  <View style={styles.emotySpeechBubble}>
                    <Text style={styles.emotySpeechText}>Nice. Take a moment.</Text>
                    <Text style={styles.emotySubtext}>How do you feel now compared to before?</Text>
                  </View>
                </View>
                <View style={styles.postCheckRow}>
                  <TouchableOpacity
                    style={[styles.postCheckBtn, styles.postCheckBetter]}
                    onPress={() => handleSubmitPostCheck("better")}
                    disabled={isSavingPost}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="arrow-up" size={22} color="#16A34A" />
                    <Text style={[styles.postCheckLabel, { color: "#16A34A" }]}>A bit better</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.postCheckBtn, styles.postCheckSame]}
                    onPress={() => handleSubmitPostCheck("same")}
                    disabled={isSavingPost}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="remove" size={22} color={Colors.textSecondary} />
                    <Text style={[styles.postCheckLabel, { color: Colors.textSecondary }]}>About the same</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.postCheckBtn, styles.postCheckWorse]}
                    onPress={() => handleSubmitPostCheck("worse")}
                    disabled={isSavingPost}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="arrow-down" size={22} color="#EA580C" />
                    <Text style={[styles.postCheckLabel, { color: "#EA580C" }]}>A bit harder</Text>
                  </TouchableOpacity>
                </View>
                {isSavingPost && <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 12 }} />}
                <TouchableOpacity style={styles.maybeLaterBtn} onPress={() => router.replace("/(auth)/(tabs)")}>
                  <Text style={styles.maybeLaterText}>Skip and go home</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* STEP 8: Emoty Followup — Phase 3 */}
            {step === 8 && (
              <View style={styles.stepCard}>
                <View style={styles.emotyHeaderRow}>
                  <EmotyAvatar
                    state={postOutcome === "better" ? "celebrating" : postOutcome === "worse" ? "supportive" : "calm"}
                    size="md"
                  />
                  <View style={styles.emotySpeechBubble}>
                    {postOutcome === "better" && (
                      <>
                        <Text style={styles.emotySpeechText}>Good. I am glad that helped a little.</Text>
                        <Text style={styles.emotySubtext}>Every small moment of care counts.</Text>
                      </>
                    )}
                    {postOutcome === "same" && (
                      <>
                        <Text style={styles.emotySpeechText}>{"That's okay."}</Text>
                        <Text style={styles.emotySubtext}>Sometimes it takes a little longer. You showed up for yourself today.</Text>
                      </>
                    )}
                    {postOutcome === "worse" && (
                      <>
                        <Text style={styles.emotySpeechText}>Thanks for telling me.</Text>
                        <Text style={styles.emotySubtext}>It is okay to feel that way. Rest if you need to. Your counsellor can help if things feel overwhelming.</Text>
                      </>
                    )}
                  </View>
                </View>
                <TouchableOpacity style={styles.startInterventionBtn} onPress={() => router.replace("/(auth)/(tabs)")} activeOpacity={0.9}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.startBtnGradient}>
                    <Text style={styles.startBtnText}>Back to Home</Text>
                    <Ionicons name="home-outline" size={20} color={Colors.white} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* HISTORY & TRENDS TAB */}
        {activeTab === "history" && (
          <View style={styles.historyContainer}>
            {/* Filter Toggle */}
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterBtn, filterDays === 7 && styles.filterBtnActive]}
                onPress={() => setFilterDays(7)}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    filterDays === 7 && styles.filterBtnTextActive,
                  ]}
                >
                  Last 7 Days
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, filterDays === 30 && styles.filterBtnActive]}
                onPress={() => setFilterDays(30)}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    filterDays === 30 && styles.filterBtnTextActive,
                  ]}
                >
                  Last 30 Days
                </Text>
              </TouchableOpacity>
            </View>

            {filteredLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="journal-outline" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No entries recorded in this period.</Text>
                <Text style={styles.emptySub}>
                  Start logging your physical sensations to see wellness patterns.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Theme.spacing.xl, width: "100%" }}>
                {/* Insights Card */}
                <View style={styles.insightsCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="bulb-outline" size={16} color={Colors.primary} />
                    <Text style={styles.insightsHeader}>WELLNESS INSIGHTS</Text>
                  </View>

                  {mostFrequentEmotion && (
                    <View style={styles.insightItemRow}>
                      <Ionicons
                        name="pulse"
                        size={18}
                        color={Colors.primary}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={styles.insightItemText}>
                        <Text style={{ fontFamily: Theme.fontFamily.bold }}>
                          {mostFrequentEmotion}
                        </Text>{" "}
                        appeared most often this {filterDays === 7 ? "week" : "month"}.
                      </Text>
                    </View>
                  )}

                  {mostFrequentRegion && (
                    <View style={styles.insightItemRow}>
                      <Ionicons
                        name="body"
                        size={18}
                        color={Colors.secondary}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={styles.insightItemText}>
                        <Text style={{ fontFamily: Theme.fontFamily.bold }}>
                          {mostFrequentRegion} tension
                        </Text>{" "}
                        was your most common body sensation.
                      </Text>
                    </View>
                  )}

                  <View style={styles.insightItemRow}>
                    <Ionicons
                      name="thermometer"
                      size={18}
                      color={Colors.success}
                      style={{ marginTop: 2 }}
                    />
                    <Text style={styles.insightItemText}>
                      Your overall average distress intensity was{" "}
                      <Text style={{ fontFamily: Theme.fontFamily.bold }}>
                        {overallAvgIntensity} / 10
                      </Text>
                      .
                    </Text>
                  </View>
                </View>

                {/* Emotion Charts */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Emotion Frequency</Text>
                  {sortedEmotions.map(([emotion, count]) => {
                    const pct = Math.round((count / filteredLogs.length) * 100);
                    return (
                      <View key={emotion} style={styles.freqRow}>
                        <Text style={styles.freqLabel}>{emotion}</Text>
                        <View style={styles.freqBarBg}>
                          <View
                            style={[
                              styles.freqBarFill,
                              { width: `${pct}%`, backgroundColor: Colors.primary },
                            ]}
                          />
                        </View>
                        <Text style={styles.freqValue}>
                          {count} ({pct}%)
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Sensation Charts */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Sensation Areas</Text>
                  {sortedRegions.map(([region, count]) => {
                    const pct = Math.round((count / filteredLogs.length) * 100);
                    return (
                      <View key={region} style={styles.freqRow}>
                        <Text style={styles.freqLabel}>{region}</Text>
                        <View style={styles.freqBarBg}>
                          <View
                            style={[
                              styles.freqBarFill,
                              { width: `${pct}%`, backgroundColor: Colors.secondary },
                            ]}
                          />
                        </View>
                        <Text style={styles.freqValue}>
                          {count} ({pct}%)
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Recent Entries */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Recent Entries</Text>
                  <View style={{ gap: 12 }}>
                    {filteredLogs.slice(0, 10).map((log: any) => (
                      <View key={log._id} style={styles.logRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.logEmotion}>{log.emotionLabel}</Text>
                          <Text style={styles.logRegions}>
                            {log.selectedRegions && log.selectedRegions.length > 0
                              ? log.selectedRegions.join(", ")
                              : "No body location specified"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={[
                              styles.logIntensity,
                              {
                                color: getIntensityLevel(Math.round(log.averageIntensity), toneForFeeling(log.emotionLabel)).color,
                              },
                            ]}
                          >
                            {log.averageIntensity} / 10
                          </Text>
                          <Text style={styles.logDate}>
                            {new Date(log.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {activeTab === "log" && step === 1 && (
        <View style={[styles.primaryFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            title={primaryEmotion ? `Continue with ${PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion)?.label}` : "Continue"}
            onPress={handleContinueFromStep1}
            disabled={!primaryEmotion}
            style={styles.nextBtn}
          />
        </View>
      )}

      {/* Phase 3 — Guided Breathing Modal (inline, completion → step 7) */}
      <Modal
        visible={showBreathingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBreathingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.breathingContainer, { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 12, maxWidth: 360, width: "90%" }]}>
            <BreathingPlayer
              protocol={activeBreathingProtocol}
              sourceType="emotion_map"
              title={routedIntervention?.studentFacingName || "Guided Breathing"}
              subtitle={routedIntervention?.title || "Follow the rhythm to ease tension"}
              themeColor={Colors.primary}
              onComplete={(_result) => {
                // Genuine completion — advance to Emoty post-intervention check
                handleInlineInterventionComplete();
              }}
              onClose={() => {
                // User stopped early — do not record as completed; just close modal
                setShowBreathingModal(false);
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Phase 3 — Grounding Modal (inline, completion → step 7) */}
      <Modal
        visible={showGroundingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGroundingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.breathingContainer, { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 8, maxWidth: 380, width: "94%", maxHeight: "90%" }]}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
              <SensoryGroundingPlayer
                protocol={SENSORY_54321_PROTOCOL}
                mode="interactive"
                sourceType="emotion_map"
                themeColor="#16A34A"
                onClose={() => {
                  // User exited early — do not record as completed
                  setShowGroundingModal(false);
                }}
                onComplete={(_logId) => {
                  // Genuine completion — advance to Emoty post-intervention check
                  handleInlineInterventionComplete();
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Theme.spacing.lg, paddingTop: 50, paddingBottom: 100 },
  header: { marginBottom: Theme.spacing.lg },
  headerNavRow: { flexDirection: "row", alignItems: "center", marginBottom: Theme.spacing.md },
  backBtn: { marginRight: Theme.spacing.md },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: Theme.borderRadius.md,
    padding: 3,
    marginBottom: Theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: Theme.borderRadius.md - 2,
  },
  tabButtonActive: {
    backgroundColor: Colors.white,
    ...Theme.shadows.tertiary,
  },
  tabText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  progressContainer: {
    height: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.primary,
  },
  stepCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.secondary,
    width: "100%",
  },
  emotyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: Theme.spacing.lg,
  },
  emotySpeechBubble: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emotySpeechText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: 4,
  },
  emotySubtext: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  // Level 1: Primary Emotions
  primaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: Theme.spacing.md,
    justifyContent: "space-between",
  },
  primaryCard: {
    width: "48%",
    minHeight: PRIMARY_EMOTION_CARD_MIN_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: Theme.borderRadius.xl,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "flex-start",
    ...Theme.shadows.tertiary,
    position: "relative",
  },
  // Same elevation as unselected cards (no jump on Android); selection shows through the
  // border, opaque tint, label colour and check badge.
  primaryCardSelected: {
    backgroundColor: Colors.white,
  },
  primaryCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  primaryTextContainer: {
    alignItems: "center",
    width: "100%",
    flex: 1,
  },
  primaryLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    lineHeight: 22,
    color: Colors.text,
  },
  primaryDescription: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    lineHeight: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 3,
    paddingHorizontal: 2,
  },
  primaryBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  primaryFooter: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: 10,
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },

  // Level 2: Secondary Emotions
  secondaryContainer: {
    marginVertical: Theme.spacing.md,
  },
  secondaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  secondaryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  secondaryChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  secondaryChipText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
  },
  // Same weight as unselected text so the chip keeps its width
  secondaryChipTextSelected: {
    color: Colors.white,
  },
  chipIcon: {
    marginRight: 6,
  },
  // Step 2 discovery: broad-emotion meanings from the specification
  meaningCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
  },
  meaningText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
  },
  meaningLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Step 3 sensation chips: long labels wrap inside the chip instead of overflowing
  sensationChip: {
    maxWidth: "100%",
  },
  sensationChipText: {
    flexShrink: 1,
  },
  bodyFigureWrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Theme.spacing.md,
  },
  noticeFooter: {
    alignItems: "center",
    marginTop: Theme.spacing.sm,
  },
  noticeDots: {
    flexDirection: "row",
    gap: 8,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: Theme.spacing.lg,
  },
  emotionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  emotionChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "15",
  },
  emotionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  emotionTextSelected: {
    color: Colors.primary,
  },
  chipCheckBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  selectionCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Theme.spacing.md,
    paddingHorizontal: 4,
  },
  selectionCountText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.primary,
  },
  strongestList: {
    gap: 10,
    marginVertical: Theme.spacing.md,
  },
  strongestCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  strongestCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "12",
  },
  strongestText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  strongestTextSelected: {
    color: Colors.primary,
  },
  nextBtn: { marginTop: Theme.spacing.md, borderRadius: Theme.borderRadius.lg },
  navRow: {
    flexDirection: "row",
    gap: Theme.spacing.md,
    marginTop: Theme.spacing.lg,
  },
  halfBtn: { flex: 1, borderRadius: Theme.borderRadius.lg },
  selectorContainer: {
    alignItems: "center",
    marginVertical: Theme.spacing.md,
    width: "100%",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  stepperBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadows.tertiary,
  },
  stepperBtnDisabled: {
    opacity: 0.5,
  },
  valueDisplay: {
    alignItems: "center",
    minWidth: 100,
  },
  intensityNum: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 56,
    lineHeight: 62,
  },
  intensityLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    marginTop: -4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  intensityDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    minHeight: 36,
  },
  intensityGrid: {
    width: "100%",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  gridRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    width: "100%",
  },
  gridCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  gridCircleUnselected: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  gridCircleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
  },
  interventionCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    marginVertical: Theme.spacing.md,
  },
  interventionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: Theme.spacing.sm,
  },
  interventionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  interventionTitle: {
    flex: 1,
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginBottom: Theme.spacing.md,
  },
  pillTag: {
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.primary + "15",
  },
  durationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary + "10",
  },
  pillTagText: {
    flexShrink: 1,
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
  },
  interventionReason: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  startInterventionBtn: {
    marginTop: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    overflow: "hidden",
  },
  startBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  startBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.white,
  },
  meditationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    marginTop: Theme.spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: Colors.white,
  },
  meditationRowPressed: {
    transform: [{ scale: 0.98 }],
  },
  meditationIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.primary + "12",
  },
  meditationTextCol: {
    flex: 1,
  },
  meditationEyebrow: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
  },
  meditationTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    marginTop: 2,
  },
  meditationMeta: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  maybeLaterBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  maybeLaterText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textMuted,
  },
  // Phase 2 — Uncertainty UI styles
  unsureInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Theme.borderRadius.full,
  },
  unsureInlineText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textMuted,
  },
  fallbackActivityList: {
    gap: 10,
    marginBottom: Theme.spacing.lg,
  },
  fallbackActivityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: Theme.borderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  fallbackIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackActivityTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: 2,
  },
  fallbackActivitySub: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  historyContainer: { width: "100%" },

  filterRow: {
    flexDirection: "row",
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  filterBtnTextActive: {
    color: Colors.white,
  },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl * 2,
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadows.tertiary,
  },
  emptyText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginTop: Theme.spacing.md,
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  insightsCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    ...Theme.shadows.tertiary,
  },
  insightsHeader: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    color: Colors.primary,
    letterSpacing: 1,
  },
  insightItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  insightItemText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    ...Theme.shadows.tertiary,
  },
  statsCardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: Theme.spacing.md,
  },
  freqRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  freqLabel: {
    width: 100,
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.text,
  },
  freqBarBg: {
    flex: 1,
    height: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    overflow: "hidden",
  },
  freqBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  freqValue: {
    width: 60,
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logEmotion: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
  },
  logRegions: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  logIntensity: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
  },
  logDate: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  breathingContainer: {
    alignItems: "center",
    ...Theme.shadows.primary,
  },
  // Phase 3 — Post-intervention check (step 7) styles
  postCheckRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
    width: "100%",
    justifyContent: "center",
  },
  postCheckBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1.5,
  },
  postCheckLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    textAlign: "center",
  },
  postCheckBetter: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  postCheckSame: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  postCheckWorse: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
});

