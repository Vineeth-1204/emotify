import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/context/MoodThemeContext';
import { Theme } from '@/constants/Theme';
import {
  USER_FACING_PREFERENCE_CATEGORIES,
  CATEGORY_METADATA,
  PREFERENCE_PRESETS,
  UserFacingPreferenceCategory,
  formatPreferenceCategory,
  formatPreferenceValue,
} from '@/common/emotyPreferencesConfig';

interface EmotyPreferencesSectionProps {
  isReady: boolean;
}

export const EmotyPreferencesSection: React.FC<EmotyPreferencesSectionProps> = ({ isReady }) => {
  const colors = useThemeColors();

  // Convex Queries & Mutations
  const preferences = useQuery(api.emotyMemory.listUserPreferences, isReady ? {} : 'skip');
  const recordPreferenceMutation = useMutation(api.emotyMemory.recordUserPreference);
  const deletePreferenceMutation = useMutation(api.emotyMemory.deleteUserMemory);
  const clearAllPreferencesMutation = useMutation(api.emotyMemory.clearAllUserMemories);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<UserFacingPreferenceCategory>('communication_preference');
  const [customNameInput, setCustomNameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<'emotyMemories'> | null>(null);

  // Handle Remove Individual Preference
  const handleRemovePreference = async (item: {
    _id: Id<'emotyMemories'>;
    category: string;
    key: string;
    value: string;
  }) => {
    const categoryName = formatPreferenceCategory(item.category);
    Alert.alert(
      'Remove Preference',
      `Remove "${formatPreferenceValue(item.category, item.key, item.value)}" from your ${categoryName.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item._id);
            try {
              await deletePreferenceMutation({ memoryId: item._id });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not remove preference.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // Handle Clear All Preferences with Explicit Confirmation
  const handleClearAll = () => {
    Alert.alert(
      'Clear Emoty preferences?',
      'This removes the preferences Emoty uses to personalize conversations. Your assessments, counselor information, and other app records are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear preferences',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const res = await clearAllPreferencesMutation({});
              Alert.alert('Preferences Cleared', 'Your Emoty personalization preferences have been cleared.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to clear preferences.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Handle Selecting a Preset Preference
  const handleSelectPreset = async (preset: (typeof PREFERENCE_PRESETS)[number]) => {
    setIsSubmitting(true);
    try {
      await recordPreferenceMutation({
        category: preset.category,
        key: preset.key,
        value: preset.value,
        source: 'user_stated',
      });
      setShowAddModal(false);
    } catch (err: any) {
      Alert.alert('Unable to save', err.message || 'Could not save preference.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Saving Chosen Name
  const handleSaveChosenName = async () => {
    const trimmed = customNameInput.trim();
    if (trimmed.length < 2) {
      Alert.alert('Invalid Name', 'Chosen name must be at least 2 characters.');
      return;
    }
    if (trimmed.length > 25) {
      Alert.alert('Invalid Name', 'Chosen name cannot exceed 25 characters.');
      return;
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(trimmed)) {
      Alert.alert('Invalid Name', 'Please use standard letters, numbers, hyphens, or spaces.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordPreferenceMutation({
        category: 'chosen_name',
        key: 'display_name',
        value: trimmed,
        source: 'user_stated',
      });
      setCustomNameInput('');
      setShowAddModal(false);
    } catch (err: any) {
      Alert.alert('Unable to save', err.message || 'Could not save chosen name.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPresets = PREFERENCE_PRESETS.filter((p) => p.category === selectedCategory);

  return (
    <View style={styles.sectionContainer}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Emoty Preferences</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            These preferences help Emoty personalize your conversations and suggestions. They are
            separate from your mental-health assessments and counselor information.
          </Text>
        </View>
      </View>

      {/* Main Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border || '#E2E8F0' }]}>
        {/* Reassuring Clinical Isolation Notice */}
        <View
          style={[
            styles.isolationBanner,
            { backgroundColor: colors.primary + '0C', borderColor: colors.primary + '20' },
          ]}
        >
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={[styles.isolationBannerText, { color: colors.textSecondary }]}>
            Non-sensitive personalization only. Clinical screenings, triage, and counselor records
            are never stored here.
          </Text>
        </View>

        {/* Loading Indicator */}
        {preferences === undefined ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading preferences...</Text>
          </View>
        ) : preferences.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved preferences yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              Customize how Emoty speaks, guides routines, or paces goals by adding your preferences below.
            </Text>
          </View>
        ) : (
          /* Active Preferences List */
          <View style={styles.listContainer}>
            {preferences.map((item, idx) => {
              const isDeleting = deletingId === item._id;
              const catMeta =
                CATEGORY_METADATA[item.category as UserFacingPreferenceCategory] || {
                  label: formatPreferenceCategory(item.category),
                  icon: 'bookmark-outline',
                };

              return (
                <View key={item._id}>
                  {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border || '#F1F5F9' }]} />}
                  <View style={styles.preferenceRow}>
                    <View
                      style={[
                        styles.categoryIconCircle,
                        { backgroundColor: colors.primary + '14' },
                      ]}
                    >
                      <Ionicons
                        name={catMeta.icon as any}
                        size={16}
                        color={colors.primary}
                      />
                    </View>

                    <View style={styles.preferenceContent}>
                      <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>
                        {catMeta.label}
                      </Text>
                      <Text style={[styles.valueLabel, { color: colors.text }]}>
                        {formatPreferenceValue(item.category, item.key, item.value)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleRemovePreference(item)}
                      disabled={isDeleting}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${formatPreferenceValue(item.category, item.key, item.value)}`}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={colors.error || '#EF4444'} />
                      ) : (
                        <Ionicons name="trash-outline" size={17} color={colors.error || '#EF4444'} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Card Actions */}
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={[styles.addPreferenceBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add or adjust Emoty preference"
          >
            <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.addPreferenceBtnText}>Add or Adjust Preference</Text>
          </TouchableOpacity>

          {preferences && preferences.length > 0 && (
            <TouchableOpacity
              style={[styles.clearAllBtn, { borderColor: (colors.error || '#EF4444') + '40' }]}
              onPress={handleClearAll}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Clear all Emoty preferences"
            >
              <Ionicons name="close-circle-outline" size={14} color={colors.error || '#EF4444'} />
              <Text style={[styles.clearAllBtnText, { color: colors.error || '#EF4444' }]}>
                Clear All
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ADD / EDIT PREFERENCE MODAL */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAddModal(false)}
          />

          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            {/* Sheet Handle */}
            <View style={styles.modalHandleContainer}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border || '#CBD5E1' }]} />
            </View>

            {/* Modal Title & Close */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Personalize Emoty</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Choose how you prefer Emoty to support you.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.background }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsScroll}
            >
              {USER_FACING_PREFERENCE_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                const meta = CATEGORY_METADATA[cat];
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected ? colors.primary + '18' : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border || '#E2E8F0',
                      },
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={meta.icon as any}
                      size={14}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color: isSelected ? colors.primary : colors.text,
                          fontFamily: isSelected ? Theme.fontFamily.bold : Theme.fontFamily.medium,
                        },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category Options List */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedCategory === 'chosen_name' ? (
                <View style={styles.chosenNameSection}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    PREFERRED CHOSEN NAME OR NICKNAME
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        borderColor: colors.primary + '40',
                        color: colors.text,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    value={customNameInput}
                    onChangeText={setCustomNameInput}
                    placeholder="e.g. Alex, Sam, Broksi"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={25}
                    autoCapitalize="words"
                    accessibilityLabel="Enter chosen name"
                  />
                  <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                    2 to 25 characters. Letters, numbers, hyphens, and spaces only.
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.saveNameBtn,
                      { backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 },
                    ]}
                    onPress={handleSaveChosenName}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveNameBtnText}>Save Chosen Name</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.presetList}>
                  {filteredPresets.map((preset) => {
                    // Check if already active
                    const isCurrent = preferences?.some(
                      (p) => p.category === preset.category && p.key === preset.key && p.value === preset.value
                    );

                    return (
                      <TouchableOpacity
                        key={`${preset.category}_${preset.key}_${preset.value}`}
                        style={[
                          styles.presetCard,
                          {
                            borderColor: isCurrent ? colors.primary : colors.border || '#E2E8F0',
                            backgroundColor: isCurrent ? colors.primary + '0C' : colors.surface,
                          },
                        ]}
                        onPress={() => handleSelectPreset(preset)}
                        disabled={isSubmitting}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.presetTitleRow}>
                            <Text
                              style={[
                                styles.presetLabel,
                                {
                                  color: isCurrent ? colors.primary : colors.text,
                                  fontFamily: isCurrent ? Theme.fontFamily.bold : Theme.fontFamily.medium,
                                },
                              ]}
                            >
                              {preset.label}
                            </Text>
                            {isCurrent && (
                              <View
                                style={[
                                  styles.activeBadge,
                                  { backgroundColor: colors.primary + '18' },
                                ]}
                              >
                                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                                <Text style={[styles.activeBadgeText, { color: colors.primary }]}>
                                  Active
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.presetDesc, { color: colors.textSecondary }]}>
                            {preset.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: Theme.spacing.lg,
  },
  headerRow: {
    marginBottom: Theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  card: {
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    padding: Theme.spacing.md,
    ...Theme.shadows.tertiary,
  },
  isolationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    marginBottom: Theme.spacing.md,
  },
  isolationBannerText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    marginBottom: 4,
  },
  emptyDesc: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContainer: {
    marginBottom: Theme.spacing.md,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  categoryIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preferenceContent: {
    flex: 1,
    minWidth: 0,
  },
  categoryLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
  },
  divider: {
    height: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  addPreferenceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    flex: 1,
  },
  addPreferenceBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
  },
  clearAllBtnText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  modalHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  modalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
  },
  modalSubtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipsScroll: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  presetList: {
    gap: 10,
    paddingTop: 6,
  },
  presetCard: {
    padding: 14,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
  },
  presetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  presetLabel: {
    fontSize: 14,
    flex: 1,
  },
  presetDesc: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
  },
  chosenNameSection: {
    paddingTop: 8,
  },
  inputLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Theme.fontFamily.regular,
    fontSize: 15,
  },
  inputHint: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 11,
    marginTop: 6,
    marginBottom: 16,
  },
  saveNameBtn: {
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNameBtnText: {
    color: '#FFFFFF',
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
  },
});
