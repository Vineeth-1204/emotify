import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalmPointToken } from "@/components/svg/system";

const { width } = Dimensions.get("window");

export default function RecoveryPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams();

  // Validate session ID
  const activeSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  // Convex endpoints
  const session = useQuery(api.cbt.getSession, activeSessionId ? { sessionId: activeSessionId as any } : "skip");
  const recommendGoal = useAction(api.cbt.recommendGoalAction);
  const acceptGoal = useMutation(api.cbt.acceptGoal);
  const streakInfo = useQuery(api.microGoals.getStreak, { userId: session?.userId ?? "" });

  // States
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Generate goals on mount
  useEffect(() => {
    async function loadGoals() {
      if (!activeSessionId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // If recommended goals are already saved in the session, use them directly
        if (session && session.recommendedGoals && session.recommendedGoals.length > 0) {
          setGoals(session.recommendedGoals);
          setLoading(false);
          return;
        }

        // Otherwise generate recommendations via AI
        const recs = await recommendGoal({ sessionId: activeSessionId as any });
        setGoals(recs);
      } catch (err: any) {
        console.error("Failed to load recovery goals:", err);
        Alert.alert("Recommendation error", "Could not tailor recovery goals. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    }

    if (session !== undefined) {
      loadGoals();
    }
  }, [session, activeSessionId]);

  // Handle choice toggle
  const handleToggleSelect = (goalId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedGoals((prev) => {
      if (prev.includes(goalId)) {
        return prev.filter((id) => id !== goalId);
      }
      if (prev.length >= 2) {
        // Shifting queue: remove oldest (idx 0), append new
        return [prev[1], goalId];
      }
      return [...prev, goalId];
    });
  };

  // Submit choices
  const handleSaveChecklist = async () => {
    if (!activeSessionId) return;
    if (selectedGoals.length !== 2) {
      Alert.alert("Select Goals", "Please select exactly 2 goals to add to your checklist.");
      return;
    }

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await acceptGoal({
        sessionId: activeSessionId as any,
        selectedGoalIds: selectedGoals,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowSuccess(true);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error saving plan", e.message || "Failed to schedule goals. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Find titles of selected goals for success screen rendering
  const selectedGoalsData = goals.filter((g) => selectedGoals.includes(g.id));

  // Loading skeleton
  if (loading || session === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={["#F5F3FF", "#EBE9FE"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Recovery coach is tailoring 4 personalized micro-goals for you...</Text>
      </View>
    );
  }

  // Render Success Screen
  if (showSuccess) {
    return (
      <View style={styles.successContainer}>
        <LinearGradient colors={["#EEF2F6", "#E3E9F1"]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[styles.successContent, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.successIconWrapper}>
            <Ionicons name="sparkles" size={60} color="#F59E0B" />
          </View>

          <Text style={styles.successTitle}>Recovery Plan Created</Text>
          <Text style={styles.successSub}>
            "Small actions repeated consistently create meaningful change."
          </Text>

          {/* Today's Selection */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardHeader}>TODAY'S GOALS</Text>
            {selectedGoalsData.map((goal, idx) => (
              <View key={goal.id} style={styles.summaryRow}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.success} style={{ marginRight: 8 }} />
                <Text style={styles.summaryText}>{goal.title}</Text>
              </View>
            ))}
          </View>

          {/* Gamified Rewards */}
          <View style={styles.rewardCard}>
            <View style={styles.rewardSubCard}>
              <View style={{ marginBottom: 4 }}>
                <CalmPointToken size={26} />
              </View>
              <Text style={styles.rewardVal}>+50 Points</Text>
              <Text style={styles.rewardLbl}>Activation Reward</Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.rewardSubCard}>
              <View style={{ marginBottom: 4 }}>
                <Ionicons name="flame" size={26} color="#EF4444" />
              </View>
              <Text style={styles.rewardVal}>{(streakInfo?.currentStreak ?? 0) + 1} Days</Text>
              <Text style={styles.rewardLbl}>Recovery Streak</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.successActionContainer}>
            <Button
              title="View My Checklist"
              onPress={() => router.replace("/(auth)/tools/microgoals")}
              style={styles.actionBtn}
            />
            <Button
              title="Return to Tools"
              variant="outline"
              onPress={() => router.replace("/(auth)/(tabs)/tools")}
              style={[styles.actionBtnOutline, { marginTop: Theme.spacing.md }]}
              textStyle={{ color: Colors.primary }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#F3F2FF", "#EBE6FE"]} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(20, insets.top + 10),
            paddingBottom: Math.max(20, insets.bottom + 20),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Recovery Plan</Text>
          <Text style={styles.subtitle}>
            Great work completing today's reflection. Let's turn today's progress into small actions.
          </Text>
        </View>

        {/* Goals List */}
        <View style={styles.goalsContainer}>
          {goals.map((item) => {
            const isSelected = selectedGoals.includes(item.id);
            const iconName = item.icon || "walk";

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleToggleSelect(item.id)}
                activeOpacity={0.9}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
              >
                <View style={styles.goalHeader}>
                  <View style={styles.iconAndCategory}>
                    <View style={[styles.goalIconCircle, isSelected && styles.goalIconCircleSelected]}>
                      <Ionicons name={iconName as any} size={20} color={isSelected ? "#FFF" : Colors.primary} />
                    </View>
                    <Text style={[styles.categoryText, isSelected && { color: Colors.primary }]}>
                      {item.category.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.selectionIndicator}>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={24} color="#94A3B8" />
                    )}
                  </View>
                </View>

                <Text style={styles.goalTitleText}>{item.title}</Text>
                <Text style={styles.goalDescText}>{item.description}</Text>

                {/* Metadata Row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color="#64748B" />
                    <Text style={styles.metaText}>{item.estimatedMinutes || 5} mins</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="analytics-outline" size={14} color="#64748B" />
                    <Text style={styles.metaText}>{item.difficulty}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="gift-outline" size={14} color="#64748B" />
                    <Text style={styles.metaText}>+{item.points || 25} XP</Text>
                  </View>
                </View>

                {/* AI Rationale box */}
                <View style={[styles.rationaleBox, isSelected && styles.rationaleBoxSelected]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="bulb-outline" size={14} color={isSelected ? "#6D28D9" : "#64748B"} />
                    <Text style={[styles.rationaleText, isSelected && { color: "#6D28D9" }]}>
                      {item.aiReason || `Targeting ${item.targetEmotion} / ${item.targetBehaviour}`}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Primary Save Button */}
        <View style={styles.saveActionBox}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 15 }} />
          ) : (
            <Button
              title={selectedGoals.length === 2 ? "Add Selected Goals to My Checklist" : `Select ${2 - selectedGoals.length} more goal(s)`}
              onPress={handleSaveChecklist}
              disabled={selectedGoals.length !== 2}
              style={[styles.actionBtn, selectedGoals.length !== 2 && { backgroundColor: "#94A3B8", opacity: 0.6 }]}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    fontFamily: Theme.fontFamily.medium,
    color: "#6D28D9",
    textAlign: "center",
    lineHeight: 22,
  },
  header: {
    marginVertical: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  goalsContainer: {
    gap: 16,
  },
  goalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  goalCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F9F8FF",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  iconAndCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  goalIconCircleSelected: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: 11,
    fontFamily: Theme.fontFamily.bold,
    color: "#64748B",
    letterSpacing: 0.5,
  },
  selectionIndicator: {
    width: 24,
    height: 24,
  },
  goalTitleText: {
    fontSize: 18,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.text,
    marginBottom: 6,
  },
  goalDescText: {
    fontSize: 14,
    fontFamily: Theme.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: Theme.fontFamily.medium,
    color: "#64748B",
  },
  rationaleBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  rationaleBoxSelected: {
    backgroundColor: "#EEF2F6",
    borderColor: "#E2E8F0",
  },
  rationaleText: {
    fontSize: 13,
    fontFamily: Theme.fontFamily.medium,
    color: "#64748B",
    lineHeight: 16,
  },
  saveActionBox: {
    marginTop: 24,
    marginBottom: 40,
  },
  actionBtn: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  actionBtnOutline: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },

  // SUCCESS SCREEN STYLING
  successContainer: {
    flex: 1,
  },
  successContent: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  successIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 30,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  successTitle: {
    fontSize: 28,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  successSub: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.medium,
    color: Colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryCardHeader: {
    fontSize: 11,
    fontFamily: Theme.fontFamily.bold,
    color: "#94A3B8",
    letterSpacing: 1.0,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
  },
  summaryText: {
    fontSize: 15,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.text,
    flex: 1,
  },
  rewardCard: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  rewardSubCard: {
    flex: 1,
    alignItems: "center",
  },
  rewardIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  rewardVal: {
    fontSize: 18,
    fontFamily: Theme.fontFamily.bold,
    color: Colors.text,
  },
  rewardLbl: {
    fontSize: 12,
    fontFamily: Theme.fontFamily.medium,
    color: "#64748B",
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
  },
  successActionContainer: {
    width: "100%",
    gap: 12,
    marginTop: 10,
  },
});
