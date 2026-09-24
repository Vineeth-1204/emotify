import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/context/MoodThemeContext';
import { Theme } from '@/constants/Theme';
import { useVoice } from '@/context/VoiceContext';
import { useLanguage } from '@/context/LanguageContext';
import { VoiceConfig } from '@/constants/Voices';

interface VoiceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({ visible, onClose }) => {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const {
    availableVoices,
    selectedVoiceKey,
    setSelectedVoiceKey,
    playPreview,
    stopPreview,
    activePreviewKey,
    isPlaying,
    isLoadingVoice,
  } = useVoice();

  const handleSelectVoice = async (key: string) => {
    await setSelectedVoiceKey(key);
  };

  const handleTogglePreview = (key: string) => {
    if (activePreviewKey === key && isPlaying) {
      stopPreview();
    } else {
      playPreview(key);
    }
  };

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const getVoiceTitle = (voice: VoiceConfig) => {
    return t(`voice.${voice.id}`, { defaultValue: voice.displayName });
  };

  const getVoiceDescription = (voice: VoiceConfig) => {
    return t(`voice.${voice.id}Desc`, { defaultValue: voice.description });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.sheetContainer, { backgroundColor: colors.white }]}>
          {/* Header handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border || '#E2E8F0' }]} />
          </View>

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {t('voice.chooseVoiceTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('voice.chooseVoiceSubtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: colors.background }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Voice List */}
          <ScrollView
            style={styles.voiceList}
            contentContainerStyle={styles.voiceListContent}
            showsVerticalScrollIndicator={false}
          >
            {availableVoices.map((voice) => {
              const isSelected = selectedVoiceKey === voice.id;
              const isVoicePreviewing = activePreviewKey === voice.id;
              const isPreviewLoading = isVoicePreviewing && isLoadingVoice;
              const isPreviewPlaying = isVoicePreviewing && isPlaying;

              return (
                <TouchableOpacity
                  key={voice.id}
                  style={[
                    styles.voiceCard,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + '08'
                        : colors.background,
                      borderColor: isSelected
                        ? colors.primary
                        : colors.border || 'rgba(0,0,0,0.06)',
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => handleSelectVoice(voice.id)}
                >
                  <View style={styles.voiceCardTop}>
                    <View
                      style={[
                        styles.voiceIconWrap,
                        {
                          backgroundColor: isSelected
                            ? colors.primary + '18'
                            : colors.border + '30',
                        },
                      ]}
                    >
                      <Ionicons
                        name={voice.gender === 'female' ? 'sparkles' : 'leaf'}
                        size={18}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                    </View>

                    <View style={styles.voiceInfo}>
                      <View style={styles.titleRow}>
                        <Text
                          style={[
                            styles.voiceName,
                            {
                              color: isSelected ? colors.primary : colors.text,
                            },
                          ]}
                        >
                          {getVoiceTitle(voice)}
                        </Text>
                        {isSelected && (
                          <View
                            style={[
                              styles.selectedBadge,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                            <Text style={styles.selectedBadgeText}>
                              {t('voice.selected')}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text
                        style={[styles.voiceDesc, { color: colors.textSecondary }]}
                      >
                        {getVoiceDescription(voice)}
                      </Text>
                    </View>
                  </View>

                  {/* Card Action Row */}
                  <View style={styles.voiceCardBottom}>
                    <TouchableOpacity
                      style={[
                        styles.previewBtn,
                        {
                          backgroundColor: isPreviewPlaying
                            ? colors.error + '12'
                            : colors.primary + '12',
                          borderColor: isPreviewPlaying
                            ? colors.error + '30'
                            : colors.primary + '25',
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => handleTogglePreview(voice.id)}
                      disabled={isPreviewLoading}
                    >
                      {isPreviewLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons
                            name={isPreviewPlaying ? 'stop-circle' : 'play-circle'}
                            size={16}
                            color={isPreviewPlaying ? colors.error : colors.primary}
                          />
                          <Text
                            style={[
                              styles.previewBtnText,
                              {
                                color: isPreviewPlaying
                                  ? colors.error
                                  : colors.primary,
                              },
                            ]}
                          >
                            {isPreviewPlaying
                              ? t('voice.playing')
                              : t('voice.preview')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.selectRadio,
                        {
                          borderColor: isSelected
                            ? colors.primary
                            : colors.textMuted || '#CBD5E1',
                        },
                      ]}
                      onPress={() => handleSelectVoice(voice.id)}
                    >
                      {isSelected && (
                        <View
                          style={[
                            styles.radioInner,
                            { backgroundColor: colors.primary },
                          ]}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom Done Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
              onPress={handleClose}
            >
              <Text style={styles.doneBtnText}>{t('voice.saveVoice')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '80%',
    ...Theme.shadows.primary,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  voiceList: {
    paddingHorizontal: Theme.spacing.lg,
  },
  voiceListContent: {
    paddingBottom: 16,
    gap: 12,
  },
  voiceCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Theme.spacing.md,
    ...Theme.shadows.tertiary,
  },
  voiceCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  voiceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceName: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  selectedBadgeText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  voiceDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  voiceCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  selectRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: 12,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.tertiary,
  },
  doneBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
