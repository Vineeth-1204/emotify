import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmotyAvatar } from "@/components/avatar/EmotyAvatar";
import { getLocalDateString } from "@/utils/date";
import {
  MORNING_AFFIRMATIONS,
  MORNING_ROUTINE_COPY,
  MorningAffirmationItem,
} from "@/common/routinesCatalogue";

const { width } = Dimensions.get("window");

export default function MorningAffirmationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const todayStr = getLocalDateString();

  const status = useQuery(api.routines.getMorningAffirmationStatus, {
    dateStr: todayStr,
  });
  const submitAffirmation = useMutation(api.routines.submitMorningAffirmation);

  const [selectedId, setSelectedId] = useState<string>("");
  const [customText, setCustomText] = useState<string>("");
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedToday, setSubmittedToday] = useState<boolean>(false);

  useEffect(() => {
    if (status?.completed) {
      setSubmittedToday(true);
    } else if (status?.recommendedAffirmation && !selectedId && !isCustomMode) {
      setSelectedId(status.recommendedAffirmation.id);
    }
  }, [status]);

  const handleSelectAffirmation = (item: MorningAffirmationItem) => {
    Haptics.selectionAsync();
    setIsCustomMode(false);
    setSelectedId(item.id);
  };

  const handleSelectCustom = () => {
    Haptics.selectionAsync();
    setIsCustomMode(true);
    setSelectedId("");
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    let affirmationId: string | undefined = undefined;
    let affirmationText = "";
    let isCustom = false;

    if (isCustomMode) {
      const trimmed = customText.trim();
      if (!trimmed) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        return;
      }
      affirmationText = trimmed;
      isCustom = true;
    } else {
      const chosen = MORNING_AFFIRMATIONS.find((a) => a.id === selectedId);
      if (!chosen) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        return;
      }
      affirmationId = chosen.id;
      affirmationText = chosen.text;
      isCustom = false;
    }

    try {
      setIsSubmitting(true);
      await submitAffirmation({
        dateStr: todayStr,
        affirmationId,
        affirmationText,
        isCustom,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setSubmittedToday(true);
    } catch (err) {
      console.error("Failed to submit morning affirmation:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === undefined) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Already completed today or just submitted
  if (submittedToday || status.completed) {
    const savedText =
      status.savedRecord?.affirmationText ||
      (isCustomMode
        ? customText
        : MORNING_AFFIRMATIONS.find((a) => a.id === selectedId)?.text) ||
      "";

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Morning Affirmation</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.completedScrollContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.completedCard}>
            <LinearGradient
              colors={["#FEF3C7", "#FFFBEB", "#FFFFFF"]}
              style={styles.cardGradient}
            >
              <View style={styles.emotyCenter}>
                <EmotyAvatar state="happy" size={72} />
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={styles.completedBadgeText}>Intention Set for Today</Text>
                </View>
              </View>

              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.affirmationDisplay}>{savedText}</Text>
              <Text style={styles.quoteMarkEnd}>”</Text>

              <View style={styles.closingBox}>
                <Text style={styles.closingText}>
                  {MORNING_ROUTINE_COPY.closing}
                </Text>
              </View>

              <View style={styles.calmPointNotice}>
                <Ionicons name="sparkles" size={16} color="#D97706" />
                <Text style={styles.calmPointText}>
                  Emotion check-in synced for {todayStr}
                </Text>
              </View>
            </LinearGradient>
          </View>

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => router.push("/(auth)/(tabs)/tools")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryActionText}>Explore Today's Tools</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => router.replace("/(auth)/(tabs)")}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryActionText}>Return to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Active Intention Selection
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Morning Routine</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card with Emoty */}
        <View style={styles.welcomeCard}>
          <EmotyAvatar state="calm" size={56} />
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.welcomeGreeting}>
              {MORNING_ROUTINE_COPY.welcome}
            </Text>
            <Text style={styles.welcomeSubtext}>
              {MORNING_ROUTINE_COPY.prompt}
            </Text>
          </View>
        </View>

        {/* 7 Authoritative Affirmations */}
        <View style={styles.optionsList}>
          {MORNING_AFFIRMATIONS.map((item, index) => {
            const isSelected = selectedId === item.id && !isCustomMode;
            const isRecommended =
              status?.recommendedAffirmation?.id === item.id;

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                ]}
                onPress={() => handleSelectAffirmation(item)}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <View style={styles.optionLeft}>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInnerCircle} />}
                    </View>
                    <Text
                      style={[
                        styles.optionIndex,
                        isSelected && styles.optionIndexSelected,
                      ]}
                    >
                      Option {index + 1}
                    </Text>
                  </View>
                  {isRecommended && (
                    <View style={styles.recommendedBadge}>
                      <Ionicons name="star" size={11} color="#D97706" />
                      <Text style={styles.recommendedBadgeText}>
                        Today's Focus
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  "{item.text}"
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Custom Intention Option */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              isCustomMode && styles.optionCardSelected,
            ]}
            onPress={handleSelectCustom}
            activeOpacity={0.8}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionLeft}>
                <View
                  style={[
                    styles.radioCircle,
                    isCustomMode && styles.radioCircleSelected,
                  ]}
                >
                  {isCustomMode && <View style={styles.radioInnerCircle} />}
                </View>
                <Text
                  style={[
                    styles.optionIndex,
                    isCustomMode && styles.optionIndexSelected,
                  ]}
                >
                  Write Your Own
                </Text>
              </View>
            </View>

            <Text style={styles.customPrompt}>
              {MORNING_ROUTINE_COPY.customOptionPrompt}
            </Text>

            {isCustomMode && (
              <TextInput
                style={styles.customInput}
                placeholder={MORNING_ROUTINE_COPY.customPlaceholder}
                placeholderTextColor="#9CA3AF"
                value={customText}
                onChangeText={setCustomText}
                multiline
                numberOfLines={3}
                maxLength={200}
                autoFocus
              />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Bottom Action */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!selectedId && (!isCustomMode || !customText.trim())) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={
            (!selectedId && (!isCustomMode || !customText.trim())) ||
            isSubmitting
          }
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                Carry this with me today
              </Text>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF9F6",
  },
  loadingCenter: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  scrollContent: {
    padding: 16,
  },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
    lineHeight: 22,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  optionsList: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  optionCardSelected: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: "#4F46E5",
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4F46E5",
  },
  optionIndex: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionIndexSelected: {
    color: "#4F46E5",
  },
  recommendedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  recommendedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  optionText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    fontWeight: "500",
  },
  optionTextSelected: {
    color: "#1E1B4B",
    fontWeight: "600",
  },
  customPrompt: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  customInput: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    fontSize: 14,
    color: "#1E293B",
    minHeight: 70,
    textAlignVertical: "top",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FAF9F6",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  submitButton: {
    backgroundColor: "#4F46E5",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  completedScrollContent: {
    padding: 20,
    alignItems: "center",
  },
  completedCard: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  cardGradient: {
    padding: 24,
    alignItems: "center",
  },
  emotyCenter: {
    marginBottom: 16,
  },
  badgeRow: {
    marginBottom: 16,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  completedBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#065F46",
  },
  quoteMark: {
    fontSize: 32,
    fontWeight: "900",
    color: "#F59E0B",
    lineHeight: 32,
  },
  affirmationDisplay: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    lineHeight: 30,
    paddingHorizontal: 8,
    marginVertical: 4,
  },
  quoteMarkEnd: {
    fontSize: 32,
    fontWeight: "900",
    color: "#F59E0B",
    lineHeight: 32,
  },
  closingBox: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    padding: 14,
    borderRadius: 16,
    marginTop: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  closingText: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
  },
  calmPointNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  calmPointText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
  },
  primaryActionButton: {
    width: "100%",
    backgroundColor: "#4F46E5",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryActionButton: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
  },
});
