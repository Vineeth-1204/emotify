import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import type { ScreeningQuestion, ScreeningOption } from '@/constants/Screening';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface QuestionnaireProps {
  title: string;
  instruction: string;
  questions: ScreeningQuestion[];
  options: ScreeningOption[];
  onComplete: (answers: number[]) => void;
  onBack?: () => void;
  initialAnswers?: (number | null)[];
  onAnswerChange?: (answers: (number | null)[]) => void;
}

export function Questionnaire({
  title,
  instruction,
  questions,
  options,
  onComplete,
  onBack,
  initialAnswers,
  onAnswerChange,
}: QuestionnaireProps) {
  const initialIndex = initialAnswers ? initialAnswers.findIndex(a => a === null) : 0;
  const [currentIndex, setCurrentIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const [answers, setAnswers] = useState<(number | null)[]>(() => initialAnswers || new Array(questions.length).fill(null));

  const [showExplanation, setShowExplanation] = useState(false);

  const currentQuestion = questions[currentIndex];
  const selectedValue = answers[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const allAnswered = answers.every((a) => a !== null);

  function selectOption(value: number) {
    const newAnswers = [...answers];
    newAnswers[currentIndex] = value;
    setAnswers(newAnswers);
    if (onAnswerChange) {
      onAnswerChange(newAnswers);
    }
  }

  function goNext() {
    setShowExplanation(false);
    if (isLastQuestion && allAnswered) {
      onComplete(answers as number[]);
    } else if (!isLastQuestion) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function goPrev() {
    setShowExplanation(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (onBack) {
      onBack();
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={goPrev} style={styles.miniBackBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ProgressBar current={currentIndex + 1} total={questions.length} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.instruction}>{instruction}</Text>

          <View style={styles.questionCard}>
            <Text style={styles.questionLabel}>QUESTION {currentIndex + 1} OF {questions.length}</Text>
            <Text style={styles.questionText}>{currentQuestion.text}</Text>

            {currentQuestion.explanation && (
              <View style={styles.explanationContainer}>
                <TouchableOpacity 
                  onPress={() => setShowExplanation(!showExplanation)}
                  style={styles.explanationToggleBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.explanationToggleText}>ⓘ What does this mean?</Text>
                  <Ionicons 
                    name={showExplanation ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={Colors.primary} 
                  />
                </TouchableOpacity>

                {showExplanation && (
                  <View style={styles.explanationBox}>
                    <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.optionsList}>
          {options.map((option) => (
            <View key={option.value}>
              <TouchableOpacity
                onPress={() => selectOption(option.value)}
                style={[
                  styles.optionBtn,
                  selectedValue === option.value && styles.optionBtnSelected,
                ]}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedValue === option.value }}
                accessibilityLabel={`${option.label}, ${selectedValue === option.value ? 'selected' : 'not selected'}`}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    selectedValue === option.value && styles.optionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                <View style={[styles.radio, selectedValue === option.value && styles.radioSelected]}>
                  {selectedValue === option.value && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isLastQuestion ? (
          <Button
            title="Finish Assessment"
            onPress={goNext}
            disabled={!allAnswered}
            style={styles.submitBtn}
          />
        ) : (
          <Button
            title="Next Question"
            onPress={goNext}
            disabled={selectedValue === null}
            variant="outline"
            style={styles.nextBtn}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: Theme.spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  miniBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: '#0F172A',
  },
  scrollContent: {
    padding: Theme.spacing.lg,
    paddingBottom: 130,
  },
  instruction: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: '#64748B',
    marginBottom: Theme.spacing.lg,
    textAlign: 'center',
    lineHeight: 22,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  questionLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  questionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: '#0F172A',
    lineHeight: 28,
  },
  optionsList: {
    gap: 12,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  optionBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F5F3FF',
  },
  optionLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 16,
    color: '#1E293B',
    flex: 1,
    paddingRight: 10,
  },
  optionLabelSelected: {
    fontFamily: Theme.fontFamily.bold,
    color: Colors.primary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Theme.spacing.lg,
    paddingBottom: 40,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  nextBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
  },
  submitBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
  },
  explanationContainer: {
    marginTop: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  explanationToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  explanationToggleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: Colors.primary,
    flex: 1,
  },
  explanationBox: {
    marginTop: 8,
    padding: Theme.spacing.md,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: Theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  explanationText: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
});
