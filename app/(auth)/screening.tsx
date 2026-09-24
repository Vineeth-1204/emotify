import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Questionnaire } from "@/components/screening/Questionnaire";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { useLanguage } from "@/context/LanguageContext";
import {
  PHQ9_QUESTIONS,
  PHQ9_OPTIONS,
  PHQ9_INSTRUCTION,
  GAD7_QUESTIONS,
  GAD7_OPTIONS,
  GAD7_INSTRUCTION,
} from "@/constants/Screening";
import {
  scorePHQ9,
  scoreGAD7,
} from "@/utils/scoring";
import { runTriage, TriageInput } from "@/utils/triage";

const INSTRUMENTS = [
  {
    id: "phq9",
    title: "Mood & Energy Check",
    desc: "Reflect on feelings of low mood, sleep patterns, and daily vitality.",
    questions: PHQ9_QUESTIONS,
    options: PHQ9_OPTIONS,
    instruction: PHQ9_INSTRUCTION,
    scoring: scorePHQ9,
  },
  {
    id: "gad7",
    title: "Calm & Focus Check",
    desc: "Reflect on feelings of worry, tension, and daily peace of mind.",
    questions: GAD7_QUESTIONS,
    options: GAD7_OPTIONS,
    instruction: GAD7_INSTRUCTION,
    scoring: scoreGAD7,
  },
];

type ScreeningState = Record<string, (number | null)[]>;

const SCREENING_STORE_KEY = "screening_progress";

export default function ScreeningScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const [selectedInstrument, setSelectedInstrument] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ScreeningState>({
    phq9: new Array(PHQ9_QUESTIONS.length).fill(null),
    gad7: new Array(GAD7_QUESTIONS.length).fill(null),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const latestTriage = useQuery(api.triage.getLatest, user?.id ? {
    userId: user.id,
  } : "skip");

  const isForceRetest = latestTriage?.level === "force_retest";

  // Load persisted progress on mount/user change
  useEffect(() => {
    async function loadProgress() {
      if (!user?.id) return;
      try {
        const key = `${SCREENING_STORE_KEY}_${user.id}`;
        const saved = await SecureStore.getItemAsync(key);
        if (saved) {
          const parsed = JSON.parse(saved) as ScreeningState;
          setAnswers(parsed);
        } else {
          // Reset answers to default if no draft saved for this user
          setAnswers({
            phq9: new Array(PHQ9_QUESTIONS.length).fill(null),
            gad7: new Array(GAD7_QUESTIONS.length).fill(null),
          });
        }
      } catch (e) {
        console.warn("[Screening] Failed to load persisted progress:", e);
      }
    }
    loadProgress();
  }, [user?.id]);

  async function persistAnswers(nextAnswers: ScreeningState) {
    if (!user?.id) return;
    try {
      const key = `${SCREENING_STORE_KEY}_${user.id}`;
      await SecureStore.setItemAsync(key, JSON.stringify(nextAnswers));
    } catch (e) {
      console.warn("[Screening] Failed to persist answers:", e);
    }
  }

  const submitScreening = useMutation(api.screening.submitScreening);
  const processTriage = useMutation(api.triage.processTriage);
  const markScreeningComplete = useMutation(api.users.markScreeningComplete);
  const scheduleFollowUp = useMutation(api.followUps.scheduleFollowUp);

  async function finishScreening() {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const phq9 = scorePHQ9(answers.phq9 as number[]);
      const gad7 = scoreGAD7(answers.gad7 as number[]);

      const triageInput: TriageInput = {
        phq9_total: phq9.total,
        gad7_total: gad7.total,
        pq16_total: 0,
        phq9_item9_score: phq9.item9Score,
      };

      const triageResult = runTriage(triageInput);

      // 1. Save screening
      await submitScreening({
        userId: user.id,
        phq9_total: phq9.total,
        gad7_total: gad7.total,
        pq16_total: 0,
        phq9_item9_flag: phq9.item9Flag,
        phq9_item9_score: phq9.item9Score,
      });

      // 2. Process Triage and Handle Alerts (Backend handled)
      const triage = await processTriage({
        userId: user.id,
        phq9_total: phq9.total,
        gad7_total: gad7.total,
        pq16_total: 0,
        phq9_item9_score: phq9.item9Score,
      });

      // 3. Schedule Follow-up based on level
      await scheduleFollowUp({
        userId: user.id,
        level: triage.level,
      });

      // Mark complete on user
      await markScreeningComplete({ clerkId: user.id });

      // Delete cached progress
      try {
        const key = `${SCREENING_STORE_KEY}_${user.id}`;
        await SecureStore.deleteItemAsync(key);
      } catch (e) {}

      // Go to app
      router.replace("/(auth)/(tabs)");
    } catch (error) {
      console.error("Failed to submit screening", error);
      setIsSubmitting(false);
    }
  }

  const getProgress = (instId: string, questionsLength: number) => {
    const instAnswers = answers[instId] || [];
    const answered = instAnswers.filter((a) => a !== null).length;
    const percent = Math.round((answered / questionsLength) * 100);
    return { answered, percent };
  };

  const allCompleted = INSTRUMENTS.every((inst) => {
    const instAnswers = answers[inst.id] || [];
    return instAnswers.every((a) => a !== null);
  });

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Analyzing your responses...</Text>
      </View>
    );
  }

  if (selectedInstrument) {
    const instrument = INSTRUMENTS.find((inst) => inst.id === selectedInstrument);
    if (!instrument) return null;

    return (
      <View style={styles.container}>
        <Questionnaire
          title={instrument.title}
          instruction={instrument.instruction}
          questions={instrument.questions}
          options={instrument.options}
          initialAnswers={answers[selectedInstrument]}
          onAnswerChange={(newAnswers) => {
            const nextAnswers = { ...answers, [selectedInstrument]: newAnswers };
            setAnswers(nextAnswers);
            persistAnswers(nextAnswers);
          }}
          onComplete={(completedAnswers) => {
            const nextAnswers = { ...answers, [selectedInstrument]: completedAnswers };
            setAnswers(nextAnswers);
            persistAnswers(nextAnswers);
            setSelectedInstrument(null);
          }}
          onBack={() => setSelectedInstrument(null)}
        />
      </View>
    );
  }



  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        {isForceRetest ? (
          <View style={styles.forcedBanner}>
            <Ionicons name="alert-circle" size={24} color="#DC2626" />
            <Text style={styles.forcedBannerText}>
              Your counselor or doctor has requested a required re-screening test. Please complete the assessments below.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>{t("screening.title")}</Text>
            <Text style={styles.headerSubtitle}>
              {t("screening.subtitle")}
            </Text>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardsContainer}>
          {INSTRUMENTS.map((inst) => {
            const { answered, percent } = getProgress(inst.id, inst.questions.length);
            const isFinished = percent === 100;
            const isStarted = percent > 0;
            const instTitle = inst.id === "phq9" ? t("screening.phq9Title") : t("screening.gad7Title");
            const instDesc = inst.id === "phq9" ? t("screening.phq9Desc") : t("screening.gad7Desc");

            return (
              <TouchableOpacity
                key={inst.id}
                style={[
                  styles.card,
                  isFinished && styles.cardFinished,
                  isStarted && !isFinished && styles.cardInProgress,
                ]}
                onPress={() => setSelectedInstrument(inst.id)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{instTitle}</Text>
                    <Text style={styles.cardDesc}>{instDesc}</Text>
                  </View>
                  <View style={styles.statusIcon}>
                    {isFinished ? (
                      <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
                    ) : isStarted ? (
                      <Ionicons name="time-outline" size={26} color={Colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={26} color="#CBD5E1" />
                    )}
                  </View>
                </View>

                <View style={styles.progressContainer}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressLabel}>
                      {isFinished ? t("common.done") : isStarted ? "In Progress" : "Not Started"}
                    </Text>
                    <Text style={styles.progressPercent}>{percent}% ({answered}/{inst.questions.length})</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, !allCompleted && styles.submitButtonDisabled]}
          onPress={() => finishScreening()}
          disabled={!allCompleted}
        >
          <Text style={styles.submitButtonText}>{t("common.submit")}</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    marginTop: Theme.spacing.md,
  },
  header: {
    paddingHorizontal: Theme.spacing.xl,
    paddingTop: 60,
    paddingBottom: Theme.spacing.md,
  },
  headerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 26,
    color: '#0F172A',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.xl,
    paddingBottom: 140,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardFinished: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
  },
  cardInProgress: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardInfo: {
    flex: 1,
    marginRight: Theme.spacing.md,
  },
  cardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: '#0F172A',
    marginBottom: 4,
  },
  cardDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  statusIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    width: '100%',
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressPercent: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: Colors.primary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Theme.spacing.xl,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  submitButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: Colors.white,
  },
  forcedBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 16,
    padding: Theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Theme.spacing.sm,
  },
  forcedBannerText: {
    flex: 1,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
});
