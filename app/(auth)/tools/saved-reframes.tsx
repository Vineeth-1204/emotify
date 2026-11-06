import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get('window');

const THINKING_TRAPS_MAP: Record<string, string> = {
  all_or_nothing: "All-or-nothing",
  over_worry: "Over-worry",
  guessing_others_thoughts: "Guessing others' thoughts",
  worst_case: "Worst-case thinking",
  blame_self: "Blame self too much",
  only_sees_bad: "Only-sees-bad",
  must_should: "Must/should pressure",
  name_calling: "Name-calling",
  predicting_doom: "Predicting doom",
  constant_comparing: "Constant comparing"
};

export default function SavedReframesScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const insets = useSafeAreaInsets();

  const rawLogs = useQuery(api.reframes.getRecentLogs, {
    userId: user?.id ?? "",
  });
  const positiveMemories = useQuery(api.positiveGrowth.getPositiveMemories, {});

  const updateLog = useMutation(api.reframes.updateLog);
  const removeLog = useMutation(api.reframes.removeLog);
  const toggleFavoriteLog = useMutation(api.reframes.toggleFavoriteLog);
  const deletePositiveMemory = useMutation(api.positiveGrowth.deletePositiveMemory);

  const [activeTab, setActiveTab] = useState<"all" | "favorites" | "memories">("all");
  
  // Modal states
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isViewModalVisible, setIsViewModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editText, setEditText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (rawLogs === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Filter logs that are explicitly marked saved
  const savedLogs = rawLogs.filter(log => log.saved_reframe_flag);

  // Filter by active tab (All vs Favorites)
  const displayedLogs = savedLogs.filter(log => {
    if (activeTab === "favorites") {
      return log.favorite;
    }
    return true;
  });

  const handleToggleFavorite = async (id: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await toggleFavoriteLog({ id });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not toggle favorite. Please try again.");
    }
  };

  const handleDelete = (id: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      "Delete Reframe?",
      "Are you sure you want to delete this saved reframe forever?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await removeLog({ id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Could not delete log. Please try again.");
            }
          }
        }
      ]
    );
  };

  const openViewModal = (log: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedLog(log);
    setIsViewModalVisible(true);
  };

  const openEditModal = (log: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedLog(log);
    setEditText(log.reframe_text);
    setIsEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!selectedLog) return;
    setIsSubmitting(true);
    try {
      await updateLog({
        id: selectedLog._id,
        reframe_text: editText,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditModalVisible(false);
      setSelectedLog(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not update reframe. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F4F3FF', '#E0DBFF']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: Math.max(30, insets.top) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Reframes</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setActiveTab("all");
          }}
          style={[styles.tabButton, activeTab === "all" && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.tabTextActive]}>All Reframes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setActiveTab("favorites");
          }}
          style={[styles.tabButton, activeTab === "favorites" && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === "favorites" && styles.tabTextActive]}>Favorites</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setActiveTab("memories");
          }}
          style={[styles.tabButton, activeTab === "memories" && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === "memories" && styles.tabTextActive]}>Memory Vault</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView 
        contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(20, insets.bottom + 20) }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "memories" ? (
          (!positiveMemories || positiveMemories.length === 0) ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={64} color="#16A34A" style={{ opacity: 0.5, marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>Your Memory Vault is Empty</Text>
              <Text style={styles.emptySubtitle}>
                Complete a Positive Growth reflection to save what went well, personal strengths, and moments of gratitude here.
              </Text>
            </View>
          ) : (
            positiveMemories.map((mem) => (
              <View key={mem._id} style={[styles.glassCard, { borderColor: "#BBF7D0", backgroundColor: "rgba(255,255,255,0.85)" }]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{formatDate(mem.createdAt)}</Text>
                  <View style={[styles.percentBadge, { backgroundColor: "#16A34A" }]}>
                    <Text style={styles.badgeText}>{mem.emotion}</Text>
                  </View>
                </View>

                <View style={{ gap: 8, marginVertical: 8 }}>
                  <View>
                    <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: "#166534" }}>🌟 What Went Well</Text>
                    <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 13, color: Colors.text, marginTop: 2 }}>{mem.bestPartOfDay}</Text>
                  </View>
                  <View>
                    <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: "#166534" }}>💪 Strength Used</Text>
                    <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 13, color: Colors.text, marginTop: 2 }}>{mem.strengthIdentified}</Text>
                  </View>
                  <View>
                    <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: "#166534" }}>🙏 Grateful For</Text>
                    <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 13, color: Colors.text, marginTop: 2 }}>{mem.gratitudeResponse}</Text>
                  </View>
                  {mem.tomorrowGoal ? (
                    <View>
                      <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: "#166534" }}>🎯 Tomorrow's Step</Text>
                      <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 13, color: Colors.text, marginTop: 2 }}>{mem.tomorrowGoal}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.cardActions, { justifyContent: "flex-end" }]}>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        "Delete Memory?",
                        "Are you sure you want to remove this reflection from your Memory Vault?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deletePositiveMemory({ id: mem._id }),
                          },
                        ]
                      );
                    }}
                    style={styles.iconActionBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.actionBtnLabel, { color: "#EF4444" }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        ) : displayedLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="leaf-outline" size={64} color={Colors.textMuted} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>
              {activeTab === "favorites" ? "No favorites yet" : "No saved reframes yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "favorites" 
                ? "Tap the heart icon on any reframe card to add it to favorites." 
                : "Reframing unhelpful thoughts helps you develop balanced thinking."}
            </Text>
          </View>
        ) : (
          displayedLogs.map((log) => (
            <View key={log._id} style={styles.glassCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{formatDate(log.createdAt)}</Text>
                
                <View style={styles.badgeRow}>
                  <View style={[styles.percentBadge, { backgroundColor: log.improvement_percentage > 0 ? '#10B981' : Colors.textMuted }]}>
                    <Text style={styles.badgeText}>{log.improvement_percentage}% Less Tension</Text>
                  </View>
                </View>
              </View>

              <View style={styles.thoughtPair}>
                <View style={styles.thoughtRow}>
                  <Ionicons name="alert-circle-outline" size={18} color="#EA580C" style={styles.thoughtIcon} />
                  <View style={styles.thoughtTextBox}>
                    <Text style={styles.thoughtLabel}>Old Thought</Text>
                    <Text style={styles.thoughtText} numberOfLines={2}>{log.thought_original}</Text>
                  </View>
                </View>

                <View style={styles.thoughtRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" style={styles.thoughtIcon} />
                  <View style={styles.thoughtTextBox}>
                    <Text style={styles.thoughtLabel}>Reframed Thought</Text>
                    <Text style={[styles.thoughtText, styles.reframedText]} numberOfLines={3}>{log.reframe_text}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => openViewModal(log)} style={styles.iconActionBtn}>
                  <Ionicons name="eye-outline" size={20} color={Colors.textSecondary} />
                  <Text style={styles.actionBtnLabel}>View</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => openEditModal(log)} style={styles.iconActionBtn}>
                  <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
                  <Text style={styles.actionBtnLabel}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleToggleFavorite(log._id)} style={styles.iconActionBtn}>
                  <Ionicons 
                    name={log.favorite ? "heart" : "heart-outline"} 
                    size={20} 
                    color={log.favorite ? "#EF4444" : Colors.textSecondary} 
                  />
                  <Text style={[styles.actionBtnLabel, log.favorite && { color: "#EF4444" }]}>Favorite</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleDelete(log._id)} style={styles.iconActionBtn}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  <Text style={[styles.actionBtnLabel, { color: "#EF4444" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* VIEW DETAILS MODAL */}
      <Modal visible={isViewModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reframe Details</Text>
              <TouchableOpacity onPress={() => setIsViewModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Situation</Text>
                  <Text style={styles.detailValText}>{selectedLog.situation_text}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Thinking Trap</Text>
                  <View style={styles.trapBadge}>
                    <Text style={styles.trapBadgeText}>{THINKING_TRAPS_MAP[selectedLog.thinking_trap_choice] || selectedLog.thinking_trap_choice}</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Old Thought ({selectedLog.pre_reframe_intensity}/10 tension)</Text>
                  <View style={[styles.quoteBox, { borderLeftColor: "#EA580C" }]}>
                    <Text style={styles.quoteText}>"{selectedLog.thought_original}"</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Reframed Thought ({selectedLog.post_reframe_intensity}/10 tension)</Text>
                  <View style={[styles.quoteBox, { borderLeftColor: "#10B981" }]}>
                    <Text style={[styles.quoteText, { color: Colors.text }]}>"{selectedLog.reframe_text}"</Text>
                  </View>
                </View>

                {/* Show Answers */}
                {selectedLog.guided_answers && selectedLog.guided_answers.some((a: string) => a.trim()) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Guided Challenge Reflections</Text>
                    {selectedLog.guided_answers.map((answer: string, idx: number) => {
                      if (!answer.trim()) return null;
                      return (
                        <View key={idx} style={styles.answerRow}>
                          <Text style={styles.answerQuestion}>Q{idx + 1}: {answer}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}
            
            <Button 
              title="Close Details" 
              onPress={() => setIsViewModalVisible(false)} 
              style={styles.actionBtn} 
            />
          </View>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Reframe</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Original Thought</Text>
                <Text style={styles.editOriginalThought}>"{selectedLog?.thought_original}"</Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>New Reframed Thought</Text>
                <TextInput
                  style={styles.editTextArea}
                  multiline
                  numberOfLines={4}
                  value={editText}
                  onChangeText={setEditText}
                  placeholder="Write a more realistic thought..."
                  placeholderTextColor={Colors.textMuted}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.navRow}>
              <Button 
                title="Cancel" 
                variant="outline" 
                onPress={() => setIsEditModalVisible(false)} 
                style={styles.halfBtn} 
                textStyle={{ color: Colors.primary }}
              />
              <Button 
                title="Save Changes" 
                onPress={handleUpdate} 
                loading={isSubmitting} 
                disabled={!editText.trim()} 
                style={styles.halfBtn} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F3FF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
  },
  backBtn: {
    marginRight: Theme.spacing.md,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.lg,
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.md,
  },
  tabButton: {
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.white,
  },
  listContainer: {
    paddingHorizontal: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: Theme.spacing.xl,
  },
  emptyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: Theme.spacing.lg,
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9FE',
    paddingBottom: 8,
  },
  cardDate: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  percentBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: Colors.white,
  },
  thoughtPair: {
    gap: 12,
    marginBottom: Theme.spacing.md,
  },
  thoughtRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thoughtIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  thoughtTextBox: {
    flex: 1,
  },
  thoughtLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  thoughtText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  reframedText: {
    color: Colors.text,
    fontFamily: Theme.fontFamily.bold,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EBE9FE',
    paddingTop: Theme.spacing.md,
    marginTop: Theme.spacing.xs,
  },
  iconActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionBtnLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Theme.spacing.xl,
    maxHeight: '85%',
    ...Theme.shadows.primary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9FE',
    paddingBottom: Theme.spacing.sm,
  },
  modalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    color: Colors.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    marginBottom: Theme.spacing.lg,
  },
  detailSection: {
    marginBottom: Theme.spacing.lg,
    width: '100%',
  },
  detailLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailValText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  trapBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F0FF',
    borderWidth: 1,
    borderColor: '#EBE9FE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trapBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.primary,
  },
  quoteBox: {
    borderLeftWidth: 4,
    backgroundColor: '#FAF9FF',
    padding: Theme.spacing.md,
    borderRadius: 12,
  },
  quoteText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  answerRow: {
    backgroundColor: '#FAF9FF',
    borderRadius: 12,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.xs,
    borderWidth: 1,
    borderColor: '#E8E5FF',
  },
  answerQuestion: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    lineHeight: 18,
  },
  actionBtn: {
    width: '100%',
    borderRadius: Theme.borderRadius.lg,
    height: 56,
  },
  editOriginalThought: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  editTextArea: {
    backgroundColor: '#FAF9FF',
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#E8E5FF',
    padding: Theme.spacing.md,
    color: Colors.text,
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    minHeight: 120,
    width: '100%',
    textAlignVertical: 'top',
  },
  navRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    width: '100%',
  },
  halfBtn: {
    flex: 1,
    borderRadius: Theme.borderRadius.lg,
    height: 52,
  },
});
