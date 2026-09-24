import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Dimensions, ViewStyle, TextStyle, Switch, Linking, TextInput, Modal } from "react-native";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { useAvatar } from "@/context/AvatarContext";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { useLanguage } from "@/context/LanguageContext";
import { useVoice } from "@/context/VoiceContext";
import { VoiceSettingsModal } from "@/components/voice/VoiceSettingsModal";

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { logout, user, biometricsEnabled, setBiometricsEnabled } = useAppAuth();
  const router = useRouter();
  const userId = user?.id;
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory);

  const dbUser = useQuery(api.users.getByClerkId, userId ? { clerkId: userId } : "skip");
  const exportData = useQuery(api.insights.getDailyStats, userId ? { userId: userId } : "skip");

  const { t, language, setLanguage, supportedLanguages, activeLanguageOption } = useLanguage();
  const { avatarName, setAvatarName } = useAvatar();
  const { voiceEnabled, setVoiceEnabled, selectedVoice } = useVoice();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [newCompanionName, setNewCompanionName] = useState(avatarName);
  const [isExporting, setIsExporting] = useState(false);

  const handleSaveCompanionName = async () => {
    if (newCompanionName.trim().length === 0) {
      Alert.alert(t("common.error"), t("profile.renameErrorEmpty"));
      return;
    }
    await setAvatarName(newCompanionName.trim());
    setShowRenameModal(false);
    Alert.alert(t("common.success"), t("profile.renameSuccess"));
  };

  const wellnessProfile = useQuery(api.wellness.getProfile, { userId: userId ?? "" });
  const updateWellness = useMutation(api.wellness.updateProfile);
  const updateBiometric = useMutation(api.users.toggleBiometric);

  const handleToggleBiometrics = async (value: boolean) => {
    try {
      if (value) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          Alert.alert("Not Supported", "Biometric authentication is not configured or supported on this device.");
          return;
        }

        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm biometric credentials to enable biometric login",
          disableDeviceFallback: false,
        });

        if (!authResult.success) {
          Alert.alert("Authentication Failed", "Could not verify biometric credentials.");
          return;
        }
      }

      await SecureStore.setItemAsync("biometric_enabled", value ? "true" : "false");
      setBiometricsEnabled(value);

      if (userId) {
        await updateBiometric({ clerkId: userId, enabled: value });
      }

      Alert.alert("Success", `Biometric login has been ${value ? "enabled" : "disabled"}.`);
    } catch (err) {
      console.error("Error toggling biometrics:", err);
      Alert.alert("Error", "Failed to update biometric settings.");
    }
  };

  const handleCrisisCall = () => {
    Alert.alert(
      "Emergency Support",
      "If you are experiencing a mental health crisis or emergency, please call a support helpline immediately.",
      [
        {
          text: "Call 988 (National Helpline)",
          onPress: () => Linking.openURL("tel:988").catch((err) => console.log("Linking error:", err)),
        },
        {
          text: "Call Campus Security",
          onPress: () => {
            const num = dbUser?.emergencyContactPhone || "911";
            Linking.openURL(`tel:${num}`).catch((err) => console.log("Linking error:", err));
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  React.useEffect(() => {
    if (userId) {
      updateWellness({ userId });
    }
  }, [userId]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const handleExportData = async () => {
    if (!exportData || !userId) return;
    setIsExporting(true);

    try {
      const csvRows = [];
      csvRows.push("Screening Data");
      csvRows.push("UserID,PHQ9,GAD7,PQ16,WSAS,ReQoL10,Item9,Date");
      exportData.screenings.forEach((s: any) => {
        csvRows.push(`${userId},${s.phq9_total},${s.gad7_total},${s.pq16_total},${s.wsas_total},${s.reqol10_total},${s.phq9_item9_score},${new Date(s.createdAt).toISOString()}`);
      });
      csvRows.push("");

      const csvString = csvRows.join("\n");
      const fileUri = FileSystem.documentDirectory + "emotify_data_export.csv";

      await FileSystem.writeAsStringAsync(fileUri, csvString, {
        encoding: "utf8",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Success", "Data exported locally to: " + fileUri);
      }
    } catch (err) {
      console.error("Export error:", err);
      Alert.alert("Error", "Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!user) {
    return null;
  }

  if (!dbUser) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const email = dbUser.email || "No email";
  const initial = dbUser.alias ? dbUser.alias.charAt(0).toUpperCase() : "U";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Signature Header */}
        <View style={styles.header}>
          <View style={styles.avatarWrapper}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </LinearGradient>
            <View style={[styles.avatarGlow, { backgroundColor: colors.primary }]} />
          </View>
          <Text style={styles.nameText}>{dbUser.alias || "User"}</Text>
          <Text style={styles.emailText}>{email}</Text>
          <Text style={[styles.headerMessage, { color: colors.primary }]}>{t("profile.headerStatus")}</Text>
        </View>

        {/* Wellness Identity Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("profile.wellnessIdentityTitle")}</Text>
            <Text style={styles.sectionSubtitle}>{t("profile.wellnessIdentitySubtitle")}</Text>
          </View>

          <View style={styles.identityGrid}>
            <IdentityCard
              icon="leaf"
              label={t("profile.personalStyle")}
              color={colors.primary}
              traits={wellnessProfile?.personality_traits}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="chatbubble"
              label={t("profile.moodPattern")}
              color={colors.secondary}
              value={wellnessProfile?.mood_pattern}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="flash"
              label={t("profile.energyPattern")}
              color={colors.accent || "#FFB6C1"}
              value={wellnessProfile?.energy_pattern}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="checkmark-circle"
              label={t("profile.wellnessGoals")}
              color={colors.warning || "#F59E0B"}
              traits={wellnessProfile?.wellness_goals}
              loading={!wellnessProfile}
              styles={styles}
            />
          </View>
        </View>

        {/* Companion Customization Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.companionTitle")}</Text>
          <View style={[styles.premiumCard, { padding: Theme.spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  <MitraAvatar state="happy" size="sm" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 16, color: colors.text }} numberOfLines={1}>
                    {avatarName}
                  </Text>
                  <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {t("profile.companionSubtitle")}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setNewCompanionName(avatarName);
                  setShowRenameModal(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: colors.primary + '14',
                  borderRadius: 12,
                  flexShrink: 0,
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={13} color={colors.primary} />
                <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 13, color: colors.primary }}>
                  {t("profile.renameCompanion")}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* AI Voice Toggle Row */}
            <View style={[styles.row, { paddingVertical: 4 }]}>
              <View style={[styles.rowLeft, { flex: 1 }]}>
                <Ionicons name="volume-high-outline" size={18} color={colors.textSecondary} style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t("voice.enableVoice")}</Text>
                  <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                    {t("voice.enableVoiceDesc")}
                  </Text>
                </View>
              </View>
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ false: "#767577", true: colors.primary }}
                thumbColor={voiceEnabled ? colors.white : "#f4f3f4"}
              />
            </View>

            {/* Voice Selection Row */}
            {voiceEnabled && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={[styles.row, { paddingVertical: 4 }]}
                  onPress={() => setShowVoiceModal(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons name="mic-outline" size={18} color={colors.primary} style={styles.icon} />
                    <Text style={styles.label}>{t("voice.selectVoice")}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: colors.primary + '14', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: colors.primary }}>
                        {t(`voice.${selectedVoice.id}`, { defaultValue: selectedVoice.displayName })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Account Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.accountDetailsTitle")}</Text>
          <View style={styles.premiumCard}>
            <DetailRow icon="person-outline" label={t("profile.age")} value={dbUser.age?.toString() || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="school-outline" label={t("profile.campus")} value={dbUser.campus || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="business-outline" label={t("profile.department")} value={dbUser.department || "-"} colors={colors} styles={styles} />
          </View>
        </View>

        {/* Sessions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.sessionsTitle")}</Text>
          <View style={styles.premiumCard}>
            <DetailRow
              icon="time-outline"
              label={t("profile.lastLogin")}
              value={dbUser.lastLoginAt ? new Date(dbUser.lastLoginAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : t("profile.justNow")}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>

        {/* Settings & Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.settingsTitle")}</Text>
          <View style={styles.premiumCard}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="finger-print-outline" size={18} color={colors.textSecondary} style={styles.icon} />
                <Text style={styles.label}>{t("profile.biometricLogin")}</Text>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={handleToggleBiometrics}
                trackColor={{ false: "#767577", true: colors.primary }}
                thumbColor={biometricsEnabled ? colors.white : "#f4f3f4"}
              />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              onPress={() => setShowLanguageModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="globe-outline" size={18} color={colors.textSecondary} style={styles.icon} />
                <Text style={styles.label}>{t("profile.language")}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.value}>{activeLanguageOption.nativeName}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Help & Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.crisisTitle")}</Text>
          <TouchableOpacity
            style={styles.crisisCard}
            onPress={handleCrisisCall}
            activeOpacity={0.8}
          >
            <View style={styles.crisisHeader}>
              <View style={styles.crisisIconCircle}>
                <Ionicons name="call" size={18} color={colors.error || "#EF4444"} />
              </View>
              <Text style={styles.crisisTitle}>{t("profile.crisisTitle")}</Text>
            </View>
            <Text style={styles.crisisDesc}>
              {t("profile.crisisDesc")}
            </Text>
            <View style={styles.crisisButton}>
              <Text style={styles.crisisButtonText}>{t("profile.getHelpNow")}</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Data Management Export Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.dataManagementTitle")}</Text>
          <View style={[styles.premiumCard, { padding: Theme.spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={[styles.iconCircleMini, { backgroundColor: colors.primary + '12' }]}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.managementTitle}>{t("profile.exportPersonalData")}</Text>
            </View>
            <Text style={styles.managementDesc}>
              {t("profile.exportDesc")}
            </Text>
            <Button
              title={isExporting ? t("profile.exportingBtn") : t("profile.exportBtn")}
              onPress={handleExportData}
              variant="outline"
              size="sm"
              disabled={isExporting}
              icon={<Ionicons name="download-outline" size={16} color={colors.primary} />}
              style={styles.exportBtn}
              textStyle={{ color: colors.primary, fontSize: 13, fontFamily: Theme.fontFamily.bold }}
            />
          </View>
        </View>

        <View style={{ height: 20 }} />
        <Button
          title={t("profile.signOutBtn")}
          onPress={handleSignOut}
          variant="outline"
          style={styles.signOutBtn}
          textStyle={{ color: colors.error }}
          icon={<Ionicons name="log-out-outline" size={20} color={colors.error} />}
        />

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* RENAME COMPANION MODAL */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalCard}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <MitraAvatar state="thinking" size="md" />
            </View>
            <Text style={styles.renameModalTitle}>{t("profile.renameModalTitle")}</Text>
            <Text style={styles.renameModalSubtitle}>
              {t("profile.renameModalSubtitle")}
            </Text>

            <TextInput
              style={[styles.renameInput, { borderColor: colors.primary + '40', color: colors.text }]}
              value={newCompanionName}
              onChangeText={setNewCompanionName}
              placeholder={t("profile.renameInputPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              maxLength={20}
              autoFocus
            />

            <View style={styles.renameBtnRow}>
              <TouchableOpacity
                style={[styles.renameCancelBtn, { borderColor: '#E2E8F0' }]}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={[styles.renameCancelBtnText, { color: colors.textSecondary }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.renameSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveCompanionName}
              >
                <Text style={styles.renameSaveBtnText}>{t("profile.renameSave")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* LANGUAGE SELECTOR MODAL */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalCard}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="globe" size={24} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.renameModalTitle}>{t("profile.selectLanguage")}</Text>
            <Text style={styles.renameModalSubtitle}>
              {t("profile.selectLanguageSubtitle")}
            </Text>

            <View style={{ gap: 8, marginBottom: 20 }}>
              {supportedLanguages.map((lang) => {
                const isSelected = lang.code === language;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={async () => {
                      await setLanguage(lang.code);
                      setShowLanguageModal(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 14,
                      backgroundColor: isSelected ? colors.primary + '12' : '#F8FAFC',
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.primary : 'transparent',
                    }}
                    activeOpacity={0.8}
                  >
                    <View>
                      <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 15, color: colors.text }}>
                        {lang.nativeName}
                      </Text>
                      <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 12, color: colors.textSecondary }}>
                        {lang.name}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setShowLanguageModal(false)}
              style={[styles.renameCancelBtn, { borderColor: colors.primary + '30' }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.renameCancelBtnText, { color: colors.textSecondary }]}>
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* VOICE SETTINGS MODAL */}
      <VoiceSettingsModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
      />
    </View>
  );
}

function IdentityCard({ icon, label, color, traits, value, loading, styles }: any) {
  return (
    <View style={[styles.idCard, { borderColor: color + '20', borderWidth: 1.5 }]}>
      <View style={[styles.idIconBox, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.idLabel}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={color} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
      ) : (
        <View style={styles.idContent}>
          {traits ? (
            traits.map((t: string, i: number) => (
              <View key={i} style={styles.idTraitRow}>
                <Ionicons name="checkmark" size={11} color={color} />
                <Text style={styles.idValueText}>{t}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.idValueTextMain}>{value}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function DetailRow({ icon, label, value, colors, styles }: { icon: any; label: string; value: string; colors: any; styles: any }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} style={styles.icon} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function stylesFactory(colors: any) {
  return {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  } as ViewStyle,
  content: {
    padding: Theme.spacing.lg,
    paddingTop: 60,
  } as ViewStyle,
  header: {
    alignItems: "center",
    marginBottom: Theme.spacing.xl,
  } as ViewStyle,
  avatarWrapper: {
    position: 'relative',
    marginBottom: Theme.spacing.lg,
  } as ViewStyle,
  avatarGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  } as ViewStyle,
  avatarGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    opacity: 0.15,
    ...Theme.shadows.premium,
    zIndex: 1,
  } as ViewStyle,
  avatarText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 34,
    color: colors.white,
  } as TextStyle,
  nameText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 26,
    color: colors.text,
    marginBottom: 2,
  } as TextStyle,
  emailText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 10,
  } as TextStyle,
  headerMessage: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.5,
  } as TextStyle,
  section: {
    marginBottom: Theme.spacing.xl,
  } as ViewStyle,
  sectionHeader: {
    marginBottom: Theme.spacing.md,
    marginLeft: 4,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  } as TextStyle,
  sectionSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
  } as TextStyle,
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  } as ViewStyle,
  idCard: {
    width: (width - Theme.spacing.lg * 2 - 12) / 2,
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.lg,
    padding: 14,
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  idIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  } as ViewStyle,
  idLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
  } as TextStyle,
  idContent: {
    marginTop: 6,
    gap: 4,
  } as ViewStyle,
  idTraitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  idValueText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: colors.text,
  } as TextStyle,
  idValueTextMain: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: colors.text,
  } as TextStyle,
  premiumCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    ...Theme.shadows.tertiary,
    overflow: 'hidden',
  } as ViewStyle,
  iconCircleMini: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  managementTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  } as TextStyle,
  managementDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  } as TextStyle,
  exportBtn: {
    marginTop: Theme.spacing.md,
    width: '100%',
    borderRadius: Theme.borderRadius.md,
    borderColor: colors.primary + '30',
    minHeight: 48,
    paddingVertical: 12,
  } as ViewStyle,
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  } as ViewStyle,
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  } as ViewStyle,
  icon: {
    marginRight: 12,
  } as TextStyle,
  label: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  } as TextStyle,
  value: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.textSecondary,
  } as TextStyle,
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.03)',
    marginHorizontal: 14,
  } as ViewStyle,
  signOutBtn: {
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: Theme.borderRadius.lg,
    marginTop: 10,
  } as ViewStyle,
  crisisCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1.5,
    borderColor: (colors.error || '#EF4444') + '30',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  crisisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  } as ViewStyle,
  crisisIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: (colors.error || '#EF4444') + '12',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  crisisTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.error || '#EF4444',
  } as TextStyle,
  crisisDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 12,
  } as TextStyle,
  crisisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error || '#EF4444',
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.md,
    gap: 6,
  } as ViewStyle,
  crisisButtonText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: '#FFFFFF',
  } as TextStyle,
  // Rename Modal Styles
  renameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.xl,
  } as ViewStyle,
  renameModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    ...Theme.shadows.primary,
  } as ViewStyle,
  renameModalTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  } as TextStyle,
  renameModalSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  } as TextStyle,
  renameInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Theme.fontFamily.medium,
    backgroundColor: '#F8FAFC',
    marginBottom: 20,
  } as TextStyle,
  renameBtnRow: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  renameCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  renameCancelBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
  } as TextStyle,
  renameSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  renameSaveBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
  } as TextStyle,
  };
}

