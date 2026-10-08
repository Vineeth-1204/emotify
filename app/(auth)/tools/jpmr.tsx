import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, Animated, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Svg, { Circle, Path, G } from "react-native-svg";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAvatar } from "@/context/AvatarContext";
import { EmotyAvatar } from "@/components/avatar/EmotyAvatar";
import { CalmPointToken } from "@/components/svg/system";
import { JPMR_STEPS, JPMRStep, JPMRMediaViewer, PlayState } from "@/components/jpmr";

const { width } = Dimensions.get('window');

const getIntensityLabel = (value: number) => {
  if (value <= 2) return { text: "Minimal", desc: "Barely noticeable, very mild physical or emotional presence.", color: '#10B981' };
  if (value <= 4) return { text: "Mild", desc: "Noticeable but easily managed and does not disrupt activities.", color: '#3B82F6' };
  if (value <= 6) return { text: "Moderate", desc: "Quite noticeable, distracting, but you can still function.", color: '#F59E0B' };
  if (value <= 8) return { text: "Severe", desc: "Strong distress, hard to ignore, significantly impacts focus.", color: '#EA580C' };
  return { text: "Extreme", desc: "Overwhelming distress, demands complete attention and intervention.", color: '#EF4444' };
};

interface IntensitySelectorProps {
  value: number;
  onChange: (val: number) => void;
  activeColor?: string;
}

function IntensitySelector({ value, onChange, activeColor }: IntensitySelectorProps) {
  const level = getIntensityLabel(value);

  const handleDecrement = () => {
    if (value > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < 10) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      onChange(value + 1);
    }
  };

  const handleSelect = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    onChange(n);
  };

  const renderCircle = (n: number) => {
    const isSelected = value === n;
    const numLevel = getIntensityLabel(n || 1);
    return (
      <TouchableOpacity
        key={n}
        onPress={() => handleSelect(n)}
        style={[
          styles.gridCircle,
          isSelected
            ? {
              backgroundColor: numLevel.color,
              borderColor: numLevel.color,
              shadowColor: numLevel.color,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4
            }
            : styles.gridCircleUnselected
        ]}
      >
        <Text
          style={[
            styles.gridCircleText,
            { color: isSelected ? Colors.white : Colors.textSecondary }
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
          style={[styles.stepperBtn, value === 0 && styles.stepperBtnDisabled]}
          disabled={value === 0}
        >
          <Ionicons name="remove" size={24} color={value === 0 ? Colors.textMuted : (activeColor || Colors.primary)} />
        </TouchableOpacity>

        <View style={styles.valueDisplay}>
          <Text style={[styles.intensityNum, { color: level.color }]}>{value}</Text>
          <View style={[styles.badgeContainer, { backgroundColor: level.color }]}>
            <Text style={styles.badgeText}>{level.text}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleIncrement}
          style={[styles.stepperBtn, value === 10 && styles.stepperBtnDisabled]}
          disabled={value === 10}
        >
          <Ionicons name="add" size={24} color={value === 10 ? Colors.textMuted : (activeColor || Colors.primary)} />
        </TouchableOpacity>
      </View>

      <View style={styles.descCard}>
        <Text style={styles.intensityDesc}>{level.desc}</Text>
      </View>

      <View style={styles.intensityGrid}>
        <View style={styles.gridRow}>
          {[0, 1, 2, 3, 4, 5].map((n) => renderCircle(n))}
        </View>
        <View style={styles.gridRow}>
          {[6, 7, 8, 9, 10].map((n) => renderCircle(n))}
        </View>
      </View>
    </View>
  );
}




export default function JPMRScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sourceType?: string;
    attemptId?: string;
    triageId?: string;
  }>();
  const { user } = useAppAuth();
  const { setAvatarState } = useAvatar();

  const [step, setStep] = useState(1);
  const [preIntensity, setPreIntensity] = useState(5);
  const [postIntensity, setPostIntensity] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [improvement, setImprovement] = useState(0);

  // Provenance context (defaulting to self_initiated unless passed via params/session)
  const [sessionProvenance, setSessionProvenance] = useState<{
    sourceType?: string;
    attemptId?: string;
    triageId?: string;
  }>({
    sourceType: params.sourceType || "self_initiated",
    attemptId: params.attemptId,
    triageId: params.triageId,
  });

  useEffect(() => {
    if (params.sourceType || params.attemptId || params.triageId) {
      setSessionProvenance({
        sourceType: params.sourceType || "self_initiated",
        attemptId: params.attemptId,
        triageId: params.triageId,
      });
    }
  }, [params.sourceType, params.attemptId, params.triageId]);

  // Guided Session States
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [playState, setPlayState] = useState<PlayState>('SPEAK_TENSE');
  const [countdown, setCountdown] = useState(5);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [waitingForProceed, setWaitingForProceed] = useState(false);

  const insets = useSafeAreaInsets();
  const jpmrVideosFromConvex = useQuery(api.jpmrVideos.getJpmrVideos);

  const currentStepData = JPMR_STEPS[activeStep];
  const videoUri = (jpmrVideosFromConvex && jpmrVideosFromConvex[activeStep])
    ? jpmrVideosFromConvex[activeStep]
    : null;

  // Load saved session if exists
  useEffect(() => {
    const checkSavedSession = async () => {
      if (!user) return;
      try {
        const saved = await SecureStore.getItemAsync(`jpmr_in_progress_${user.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          Alert.alert(
            "Resume Relaxation?",
            `You have an incomplete session at Step ${parsed.activeStep + 1} (${JPMR_STEPS[parsed.activeStep]?.title || 'Intro'}). Would you like to resume?`,
            [
              {
                text: "Start Fresh",
                style: "destructive",
                onPress: async () => {
                  await SecureStore.deleteItemAsync(`jpmr_in_progress_${user.id}`).catch(() => { });
                }
              },
              {
                text: "Resume",
                style: "default",
                onPress: () => {
                  setPreIntensity(parsed.preIntensity ?? 5);
                  setElapsedTime(parsed.elapsedTime ?? 0);
                  setStartedAt(parsed.startedAt ?? Date.now());
                  setActiveStep(parsed.activeStep ?? 0);
                  if (parsed.sourceType || parsed.attemptId || parsed.triageId) {
                    setSessionProvenance({
                      sourceType: parsed.sourceType || "self_initiated",
                      attemptId: parsed.attemptId,
                      triageId: parsed.triageId,
                    });
                  }
                  setStep(2);
                  setPlayState('SPEAK_TENSE');
                  setWaitingForProceed(false);
                  setIsPlaying(true);
                }
              }
            ]
          );
        }
      } catch (e) {
        console.error("Error loading saved session", e);
      }
    };

    checkSavedSession();
  }, [user]);

  // Save session progress helper
  const saveProgress = async (stepIdx: number, preVal: number, elapsed: number, startVal: number) => {
    if (!user) return;
    try {
      const data = {
        activeStep: stepIdx,
        preIntensity: preVal,
        elapsedTime: elapsed,
        startedAt: startVal,
        sourceType: sessionProvenance.sourceType,
        attemptId: sessionProvenance.attemptId,
        triageId: sessionProvenance.triageId,
      };
      await SecureStore.setItemAsync(`jpmr_in_progress_${user.id}`, JSON.stringify(data));
    } catch (e) {
      console.error("Error saving JPMR progress", e);
    }
  };

  useEffect(() => {
    if (step === 2 && user && startedAt > 0) {
      saveProgress(activeStep, preIntensity, elapsedTime, startedAt);
    }
  }, [activeStep, preIntensity, step, user]);

  const createLog = useMutation(api.jpmrLogs.create);

  // TTS cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  // Overall session timer
  useEffect(() => {
    let interval: any;
    if (isPlaying && step === 2) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, step]);

  // Session state sequencer
  useEffect(() => {
    let timer: any;

    if (!isPlaying || step !== 2) {
      Speech.stop();
      return;
    }

    const currentStepData = JPMR_STEPS[activeStep];
    if (!currentStepData) return;

    if (playState === 'SPEAK_TENSE') {
      Speech.stop();
      Speech.speak(currentStepData.tenseScript, {
        rate: 0.8,
        onDone: () => {
          setPlayState('TENSE_WAITING');
        },
        onError: (e) => {
          console.error("TTS error", e);
          setPlayState('TENSE_WAITING');
        }
      });
    } else if (playState === 'TENSE_COUNTDOWN') {
      if (countdown > 0) {
        timer = setTimeout(() => {
          setCountdown(countdown - 1);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }, 1000);
      } else {
        setPlayState('SPEAK_RELEASE');
      }
    } else if (playState === 'SPEAK_RELEASE') {
      Speech.stop();
      Speech.speak(currentStepData.releaseScript, {
        rate: 0.8,
        onDone: () => {
          const releaseCountdownVal = (activeStep === 0) ? 6 : 8;
          setPlayState('RELEASE_COUNTDOWN');
          setCountdown(releaseCountdownVal);
        },
        onError: () => {
          const releaseCountdownVal = (activeStep === 0) ? 6 : 8;
          setPlayState('RELEASE_COUNTDOWN');
          setCountdown(releaseCountdownVal);
        }
      });
    } else if (playState === 'RELEASE_COUNTDOWN') {
      if (countdown > 0) {
        timer = setTimeout(() => {
          setCountdown(countdown - 1);
        }, 1000);
      } else {
        if (activeStep < JPMR_STEPS.length - 1) {
          setIsPlaying(false);
          setWaitingForProceed(true);
        } else {
          setIsPlaying(false);
          Speech.stop();
          setStep(3); // completion page
        }
      }
    }

    return () => {
      clearTimeout(timer);
    };
  }, [isPlaying, playState, activeStep, countdown, step]);

  const handleStartSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    setStartedAt(Date.now());
    setStep(2);
    setActiveStep(0);
    setPlayState('SPEAK_TENSE');
    setCountdown(5);
    setElapsedTime(0);
    setWaitingForProceed(false);
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    Speech.stop();
    if (user && startedAt > 0) {
      saveProgress(activeStep, preIntensity, elapsedTime, startedAt);
    }
  };

  const handleResume = () => {
    setIsPlaying(true);
  };

  const handleStartTensing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    if (activeStep === 0 || activeStep === JPMR_STEPS.length - 1) {
      setPlayState('SPEAK_RELEASE');
    } else {
      setPlayState('TENSE_COUNTDOWN');
      setCountdown(5);
    }
  };

  const handleCirclePress = () => {
    if (playState === 'TENSE_WAITING') {
      handleStartTensing();
    } else if (waitingForProceed) {
      handleProceedToNextStep();
    }
  };

  const handleBackPress = () => {
    if (step === 2) {
      Alert.alert(
        "Exit Relaxation?",
        "Would you like to save your progress so you can resume later, or discard this session?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              setIsPlaying(false);
              Speech.stop();
              if (user) {
                await SecureStore.deleteItemAsync(`jpmr_in_progress_${user.id}`).catch(() => { });
              }
              router.back();
            }
          },
          {
            text: "Save & Exit",
            style: "default",
            onPress: async () => {
              setIsPlaying(false);
              Speech.stop();
              if (user && startedAt > 0) {
                await saveProgress(activeStep, preIntensity, elapsedTime, startedAt);
              }
              router.back();
            }
          }
        ]
      );
    } else {
      router.back();
    }
  };

  const handleStopSession = () => {
    Alert.alert(
      "Stop Session?",
      "Are you sure you want to end this relaxation session? Your progress will not be saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: () => {
            setIsPlaying(false);
            Speech.stop();
            setWaitingForProceed(false);
            if (user) {
              SecureStore.deleteItemAsync(`jpmr_in_progress_${user.id}`).catch(() => { });
            }
            setStep(1);
          }
        }
      ]
    );
  };

  const handleProceedToNextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    const nextStep = activeStep + 1;
    setActiveStep(nextStep);
    setPlayState('SPEAK_TENSE');
    setCountdown(5);
    setWaitingForProceed(false);
    setIsPlaying(true);
  };

  const handleSavePostIntensity = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await SecureStore.deleteItemAsync(`jpmr_in_progress_${user.id}`).catch(() => { });
      await createLog({
        userId: user.id,
        completed: true,
        durationSeconds: elapsedTime,
        preIntensity,
        postIntensity,
        startedAt,
        completedAt: Date.now(),
        sourceType: sessionProvenance.sourceType || "self_initiated",
        attemptId: sessionProvenance.attemptId ? (sessionProvenance.attemptId as any) : undefined,
        triageId: sessionProvenance.triageId ? (sessionProvenance.triageId as any) : undefined,
      });

      const diff = preIntensity - postIntensity;
      const percent = preIntensity > 0 ? Math.round((diff / preIntensity) * 100) : 0;
      setImprovement(percent);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(4);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not save relaxation session. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = ((activeStep + 1) / JPMR_STEPS.length) * 100;
  const strokeDashoffset = 440 - (440 * progress) / 100;

  const renderCircleContent = () => {
    switch (playState) {
      case 'SPEAK_TENSE':
      case 'SPEAK_RELEASE':
        return (
          <View style={styles.circleContent}>
            <Ionicons name="volume-medium-outline" size={30} color={Colors.primary} />
            <Text style={[styles.circleLabel, { color: Colors.primary }]}>Listen</Text>
          </View>
        );
      case 'TENSE_WAITING':
        return (
          <View style={styles.circleContent}>
            <Ionicons name="play" size={28} color={Colors.primary} />
            <Text style={[styles.circleLabel, { color: Colors.primary }]}>Start</Text>
          </View>
        );
      case 'TENSE_COUNTDOWN':
        return (
          <View style={styles.circleContent}>
            <Text style={[styles.circleValue, { color: '#EA580C' }]}>{countdown}</Text>
            <Text style={[styles.circleLabel, { color: '#EA580C' }]}>Tense</Text>
          </View>
        );
      case 'RELEASE_COUNTDOWN':
        return (
          <View style={styles.circleContent}>
            <Text style={[styles.circleValue, { color: '#10B981' }]}>{countdown}</Text>
            <Text style={[styles.circleLabel, { color: '#10B981' }]}>Release</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#F4F3FF', '#E0DBFF']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* STEP 1: Introduction Screen */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Guided JPMR Relaxation</Text>
            <View style={{ alignItems: "center", marginVertical: 14 }}>
              <EmotyAvatar state="breathing" size="lg" />
            </View>
            <Text style={styles.subtitle}>
              This is a guided relaxation to release muscle tension. Find a comfortable seat or lie down. It takes about 12 minutes. Press Start when ready.
            </Text>

            <View style={styles.ratingCard}>
              <Text style={styles.ratingHeading}>Rate your current body tension</Text>
              <IntensitySelector
                value={preIntensity}
                onChange={setPreIntensity}
                activeColor={Colors.primary}
              />
            </View>

            <Button
              title="Start Session"
              onPress={handleStartSession}
              style={styles.actionBtn}
            />
          </View>
        )}

        {/* STEP 2: Guided Session Player */}
        {step === 2 && currentStepData && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>{currentStepData.title}</Text>
            <Text style={styles.subtitle}>Step {activeStep + 1} of {JPMR_STEPS.length}</Text>

            <JPMRMediaViewer
              stepIndex={activeStep}
              stepData={currentStepData}
              playState={playState}
              videoUri={videoUri}
              isPlaying={isPlaying}
            />

            <TouchableOpacity
              activeOpacity={playState === 'TENSE_WAITING' || waitingForProceed ? 0.7 : 1}
              onPress={handleCirclePress}
              disabled={!(playState === 'TENSE_WAITING' || waitingForProceed)}
              style={styles.playerWrapper}
            >
              <Svg width={130} height={130} viewBox="0 0 130 130">
                <Circle
                  cx={65}
                  cy={65}
                  r={52}
                  stroke="#EBE9FE"
                  strokeWidth={6}
                  fill="transparent"
                />
                <Circle
                  cx={65}
                  cy={65}
                  r={52}
                  stroke={Colors.primary}
                  strokeWidth={6}
                  fill="transparent"
                  strokeDasharray={327}
                  strokeDashoffset={327 - (327 * progress) / 100}
                  strokeLinecap="round"
                  transform="rotate(-90 65 65)"
                />
              </Svg>
              <View style={styles.circleContentOverlay}>
                {renderCircleContent()}
              </View>
            </TouchableOpacity>

            <View style={styles.subtitleCard}>
              <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.subtitleText}>
                {playState === 'SPEAK_TENSE' || playState === 'TENSE_WAITING' || playState === 'TENSE_COUNTDOWN'
                  ? currentStepData.tenseScript
                  : currentStepData.releaseScript}
              </Text>
            </View>

            <Text style={styles.timerText}>{formatTime(elapsedTime)} elapsed</Text>

            {playState === 'TENSE_WAITING' ? (
              <Button
                title={
                  activeStep === 0
                    ? "Start Breathing"
                    : activeStep === JPMR_STEPS.length - 1
                      ? "Start Reflection"
                      : "Start Tensing"
                }
                onPress={handleStartTensing}
                style={styles.actionBtn}
              />
            ) : waitingForProceed ? (
              <Button
                title={`Start ${JPMR_STEPS[activeStep + 1]?.title || 'Next'}`}
                onPress={handleProceedToNextStep}
                style={styles.actionBtn}
              />
            ) : (
              <View style={styles.controlRow}>
                {isPlaying ? (
                  <TouchableOpacity style={styles.controlBtn} onPress={handlePause}>
                    <Ionicons name="pause" size={28} color={Colors.white} />
                    <Text style={styles.controlBtnText}>Pause Relaxation</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.controlBtn} onPress={handleResume}>
                    <Ionicons name="play" size={28} color={Colors.white} />
                    <Text style={styles.controlBtnText}>Resume Relaxation</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* STEP 3: Completion & Rating Screen */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Great — you've finished JPMR.</Text>
            <Text style={styles.subtitle}>How do you feel now?</Text>

            <View style={styles.ratingCard}>
              <IntensitySelector
                value={postIntensity}
                onChange={setPostIntensity}
                activeColor={Colors.primary}
              />
            </View>

            <Button
              title="Save & Continue"
              onPress={handleSavePostIntensity}
              loading={isSubmitting}
              style={styles.actionBtn}
            />
          </View>
        )}

        {/* STEP 4: Comparison & Dashboard Redirects */}
        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Session Summary</Text>
            <View style={{ alignItems: "center", marginVertical: 12 }}>
              <EmotyAvatar state={improvement > 0 ? "celebrating" : "calm"} size="md" />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
              <CalmPointToken size={20} />
              <Text style={{ fontFamily: Theme.fontFamily.bold, color: Colors.primary, fontSize: 14 }}>+35 Calm Points Awarded</Text>
            </View>
            <Text style={styles.subtitle}>Every moment of relaxation strengthens your mind.</Text>

            <View style={styles.summaryResultCard}>
              <Text style={styles.resultPercentage}>{improvement > 0 ? `${improvement}%` : '0%'}</Text>
              <Text style={styles.resultLabel}>Tension Reduction</Text>

              <View style={styles.resultDetailRow}>
                <Text style={styles.resultVal}>{preIntensity} initial</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.textSecondary} />
                <Text style={styles.resultVal}>{postIntensity} post-relaxation</Text>
              </View>
            </View>

            <Text style={styles.compareHeading}>Would you like to compare how your body feels now?</Text>

            <View style={styles.compareBtnContainer}>
              <Button
                title="Compare Body Map"
                onPress={() => router.replace({ pathname: "/(auth)/tools/emotion-map" }) as any}
                style={styles.actionBtn}
              />
              <Button
                title="Back to Dashboard"
                onPress={() => router.replace("/(auth)/(tabs)") as any}
                variant="outline"
                style={styles.actionBtnOutline}
                textStyle={{ color: Colors.primary }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.xs,
    width: '100%',
    zIndex: 10,
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xl + 40,
    alignItems: 'center',
  },
  videoContainer: {
    width: width - Theme.spacing.lg * 2,
    height: 190,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#7C3AED',
    marginBottom: Theme.spacing.lg,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  videoBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: '#FFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: Theme.spacing.md,
  },
  subtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
    paddingHorizontal: Theme.spacing.md,
  },
  ratingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: Theme.spacing.lg,
    width: width - Theme.spacing.lg * 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: Theme.spacing.xxl,
  },
  ratingHeading: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.sm,
    letterSpacing: 0.2,
  },
  actionBtn: {
    width: width - Theme.spacing.lg * 2,
    borderRadius: Theme.borderRadius.lg,
    height: 56,
  },
  actionBtnOutline: {
    width: width - Theme.spacing.lg * 2,
    borderRadius: Theme.borderRadius.lg,
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
  },
  playerWrapper: {
    position: 'relative',
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: Theme.spacing.md,
  },
  circleContentOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 40,
    lineHeight: 46,
  },
  circleLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: -2,
  },
  timerText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: Theme.spacing.xxl,
  },
  controlRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    width: width - Theme.spacing.lg * 2,
  },
  controlBtn: {
    flex: 1,
    height: 60,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Theme.shadows.tertiary,
  },
  controlBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.white,
  },
  summaryResultCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: Theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: width - Theme.spacing.lg * 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: Theme.spacing.xl,
  },
  resultPercentage: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 54,
    color: Colors.primary,
  },
  resultLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultVal: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
  },
  compareHeading: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
    paddingHorizontal: Theme.spacing.md,
  },
  compareBtnContainer: {
    gap: 12,
  },
  stepContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  selectorContainer: {
    alignItems: 'center',
    marginVertical: Theme.spacing.md,
    width: '100%',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F3F0FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBE9FE',
    ...Theme.shadows.tertiary,
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  valueDisplay: {
    alignItems: 'center',
    minWidth: 100,
  },
  intensityNum: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 64,
    lineHeight: 70,
  },
  intensityLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    marginTop: -4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeContainer: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 2,
    ...Theme.shadows.tertiary,
  },
  badgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descCard: {
    backgroundColor: 'rgba(244, 243, 255, 0.6)',
    borderRadius: 16,
    padding: Theme.spacing.md,
    width: '100%',
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(235, 233, 254, 0.5)',
  },
  intensityDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm - 1,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  intensityGrid: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  gridCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCircleUnselected: {
    backgroundColor: '#FAF9FF',
    borderColor: '#E8E5FF',
  },
  gridCircleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
  },
  subtitleCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: Theme.spacing.lg,
    width: width - Theme.spacing.lg * 2,
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  subtitleText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 20,
  },
});
