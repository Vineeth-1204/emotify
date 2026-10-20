import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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
import { EVENING_GRATITUDE_COPY } from "@/common/routinesCatalogue";

export default function EveningGratitudeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const todayStr = getLocalDateString();

  const status = useQuery(api.routines.getEveningGratitudeStatus, {
    dateStr: todayStr,
  });
  const submitGratitude = useMutation(api.routines.submitEveningGratitude);

  const [entries, setEntries] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedToday, setSubmittedToday] = useState<boolean>(false);

  const isModerateSevere = status?.branch === "moderate_severe";
  const requiredCount = isModerateSevere ? 1 : 3;
  const copyBranch = isModerateSevere
    ? EVENING_GRATITUDE_COPY.moderateSevere
    : EVENING_GRATITUDE_COPY.minimalMild;

  useEffect(() => {
    if (status?.completed) {
      setSubmittedToday(true);
    } else if (status?.branch) {
      if (status.branch === "moderate_severe") {
        setEntries((prev) => (prev.length === 1 ? prev : [""]));
      } else {
        setEntries((prev) => (prev.length === 3 ? prev : ["", "", ""]));
      }
    }
  }, [status]);

  const handleEntryChange = (text: string, index: number) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  };

  const handleSelectExample = (exampleText: string) => {
    Haptics.selectionAsync();
    setEntries([exampleText]);
  };

  const canSubmit =
    entries.length >= requiredCount &&
    entries.slice(0, requiredCount).every((e) => e && e.trim().length > 0);

  const handleSubmit = async () => {
    if (isSubmitting || !canSubmit) return;

    try {
      setIsSubmitting(true);
      const cleanedEntries = entries.slice(0, requiredCount).map((e) => e.trim());
      await submitGratitude({
        dateStr: todayStr,
        gratitudeEntries: cleanedEntries,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setSubmittedToday(true);
    } catch (err) {
      console.error("Failed to submit evening gratitude:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === undefined) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color="#312E81" />
      </View>
    );
  }

  // Already completed today or just submitted
  if (submittedToday || status.completed) {
    const savedList = (status.savedEntries && status.savedEntries.length > 0) ? status.savedEntries : entries;

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#F3F4F6" />
          </TouchableOpacity>
          <Text style={styles.headerTitleLight}>Evening Gratitude</Text>
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
              colors={["#1E1B4B", "#2E1065", "#0F172A"]}
              style={styles.cardGradient}
            >
              <View style={styles.emotyCenter}>
                <EmotyAvatar state="calm" size={72} />
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.completedBadge}>
                  <Ionicons name="moon" size={16} color="#FBBF24" />
                  <Text style={styles.completedBadgeText}>
                    Day Closed with Gratitude
                  </Text>
                </View>
              </View>

              <Text style={styles.completedSubheader}>
                What you noticed today:
              </Text>

              <View style={styles.savedEntriesContainer}>
                {savedList.map((entry: string, idx: number) => (
                  <View key={idx} style={styles.savedEntryBubble}>
                    <Ionicons name="heart" size={15} color="#F43F5E" />
                    <Text style={styles.savedEntryText}>{entry}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.closingBox}>
                <Text style={styles.closingText}>
                  {EVENING_GRATITUDE_COPY.closing}
                </Text>
              </View>
            </LinearGradient>
          </View>

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => router.push("/(auth)/(tabs)")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryActionText}>Rest & Go to Home</Text>
            <Ionicons name="home" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#F3F4F6" />
        </TouchableOpacity>
        <Text style={styles.headerTitleLight}>Evening Reflection</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card */}
        <View style={styles.welcomeCard}>
          <EmotyAvatar state="tired" size={56} />
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.welcomeGreeting}>{copyBranch.welcome}</Text>
            <Text style={styles.welcomeSubtext}>{copyBranch.prompt}</Text>
          </View>
        </View>

        {/* Gentle Examples for Moderate/Severe Branch */}
        {isModerateSevere && EVENING_GRATITUDE_COPY.moderateSevere.examples && (
          <View style={styles.examplesSection}>
            <Text style={styles.examplesTitle}>
              Tap an example if thinking is hard right now:
            </Text>
            <View style={styles.examplesRow}>
              {EVENING_GRATITUDE_COPY.moderateSevere.examples.map((ex, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.exampleChip}
                  onPress={() => handleSelectExample(ex)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="sparkles" size={12} color="#818CF8" />
                  <Text style={styles.exampleChipText}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Entry Inputs */}
        <View style={styles.entriesList}>
          {copyBranch.fieldPrompts.map((fieldLabel, idx) => (
            <View key={idx} style={styles.inputCard}>
              <Text style={styles.fieldLabel}>{fieldLabel}</Text>
              <TextInput
                style={styles.textInput}
                placeholder={
                  isModerateSevere
                    ? "e.g., I drank a glass of water..."
                    : `Thing #${idx + 1} that went okay...`
                }
                placeholderTextColor="#64748B"
                value={entries[idx] || ""}
                onChangeText={(txt) => handleEntryChange(txt, idx)}
                multiline
                numberOfLines={2}
                maxLength={200}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                Save evening reflection
              </Text>
              <Ionicons name="moon" size={18} color="#FFFFFF" />
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
    backgroundColor: "#0B0F19", // Deep serene night-mode background
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
    borderBottomColor: "#1E293B",
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#1E293B",
  },
  headerTitleLight: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  scrollContent: {
    padding: 16,
  },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 14,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F1F5F9",
    marginBottom: 4,
    lineHeight: 22,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 18,
  },
  examplesSection: {
    marginBottom: 20,
  },
  examplesTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  examplesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  exampleChipText: {
    fontSize: 13,
    color: "#CBD5E1",
    fontWeight: "500",
  },
  entriesList: {
    gap: 14,
  },
  inputCard: {
    backgroundColor: "#161E2E",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2E3A52",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A5B4FC",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 15,
    color: "#F8FAFC",
    minHeight: 60,
    textAlignVertical: "top",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0B0F19",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  submitButton: {
    backgroundColor: "#6366F1",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: "#334155",
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
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#334155",
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
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  completedBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FDE68A",
  },
  completedSubheader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 12,
  },
  savedEntriesContainer: {
    width: "100%",
    gap: 10,
    marginBottom: 16,
  },
  savedEntryBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  savedEntryText: {
    flex: 1,
    fontSize: 15,
    color: "#F8FAFC",
    fontWeight: "500",
  },
  closingBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    borderRadius: 16,
    marginTop: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  closingText: {
    fontSize: 14,
    color: "#E2E8F0",
    textAlign: "center",
    lineHeight: 22,
  },
  primaryActionButton: {
    width: "100%",
    backgroundColor: "#6366F1",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
