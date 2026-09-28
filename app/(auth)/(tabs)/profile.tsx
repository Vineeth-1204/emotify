import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Dimensions, ViewStyle, TextStyle, Switch, Linking, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
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
import { useAvatar, AvatarGender } from "@/context/AvatarContext";
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
  const { avatarName, avatarGender, setMitraPreferences } = useAvatar();
  const { voiceEnabled, setVoiceEnabled, selectedVoice } = useVoice();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState<AvatarGender>(avatarGender || "female");
  const [newCompanionName, setNewCompanionName] = useState(avatarName);
  const [isExporting, setIsExporting] = useState(false);

  // Profile Editing State
  const updateProfileMutation = useMutation(api.users.updateStudentProfile);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editAlias, setEditAlias] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editCampus, setEditCampus] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFormError, setProfileFormError] = useState<string | null>(null);

  const handleOpenEditProfile = () => {
    if (dbUser) {
      setEditAlias(dbUser.alias || dbUser.full_name || "");
      setEditAge(dbUser.age !== undefined && dbUser.age !== null ? String(dbUser.age) : "");
      setEditCampus(dbUser.campus || "");
      setEditDepartment(dbUser.department || "");
      setEditYear(dbUser.year || "");
      setEditGender(dbUser.gender || "");
      setEditEmergencyName(dbUser.emergencyContactName || "");
      setEditEmergencyPhone(dbUser.emergencyContactPhone || "");
      setProfileFormError(null);
    }
    setShowEditProfileModal(true);
  };

  const handleSaveProfile = async () => {
    setProfileFormError(null);
    const trimmedAlias = editAlias.trim();
    if (!trimmedAlias) {
      setProfileFormError(t("profile.invalidNameError"));
      return;
    }

    let parsedAge: number | undefined = undefined;
    if (editAge.trim()) {
      const num = parseInt(editAge.trim(), 10);
      if (isNaN(num) || num < 10 || num > 120) {
        setProfileFormError(t("profile.invalidAgeError"));
        return;
      }
      parsedAge = num;
    }

    setIsSavingProfile(true);
    try {
      await updateProfileMutation({
        userId: userId,
        alias: trimmedAlias,
        age: parsedAge,
        campus: editCampus.trim() || undefined,
        department: editDepartment.trim() || undefined,
        year: editYear.trim() || undefined,
        gender: editGender.trim() || undefined,
        emergencyContactName: editEmergencyName.trim() || undefined,
        emergencyContactPhone: editEmergencyPhone.trim() || undefined,
      });
      setShowEditProfileModal(false);
      Alert.alert(t("common.success"), t("profile.profileUpdatedSuccess"));
    } catch (err: any) {
      console.error("Profile save error:", err);
      setProfileFormError(err.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  React.useEffect(() => {
    if (avatarGender) setSelectedGender(avatarGender);
  }, [avatarGender]);

  React.useEffect(() => {
    if (avatarName) setNewCompanionName(avatarName);
  }, [avatarName]);

  const handleSaveCompanionName = async () => {
    const trimmed = newCompanionName.trim();
    if (trimmed.length === 0) {
      Alert.alert(t("common.error"), t("profile.renameErrorEmpty"));
      return;
    }
    const finalGender: AvatarGender = selectedGender === "male" ? "male" : "female";
    try {
      await setMitraPreferences({
        name: trimmed,
        avatarGender: finalGender,
      });
      setShowRenameModal(false);
      Alert.alert(t("common.success"), t("profile.renameSuccess"));
    } catch (err) {
      console.error("Failed to update companion:", err);
      Alert.alert(t("common.error"), "Failed to save changes.");
    }
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
      updateWellness({ userId, timezoneOffsetMinutes: new Date().getTimezoneOffset() });
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
                  <MitraAvatar gender={avatarGender} state="happy" size="sm" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 16, color: colors.text }} numberOfLines={1}>
                    {avatarName}
                  </Text>
                  <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {avatarGender === "male" ? t("profile.avatarBoy") : t("profile.avatarGirl")} • {t("profile.companionSubtitle")}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedGender(avatarGender || "female");
                  setNewCompanionName(avatarName || "Mitra");
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
                accessibilityRole="button"
                accessibilityLabel={t("profile.customizeCompanion")}
              >
                <Ionicons name="sparkles" size={13} color={colors.primary} />
                <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 13, color: colors.primary }}>
                  {t("profile.customizeCompanion")}
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Theme.spacing.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.accountDetailsTitle")}</Text>
            <TouchableOpacity
              onPress={handleOpenEditProfile}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: colors.primary + '14',
                borderRadius: 10,
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("profile.editProfile")}
            >
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={{ fontFamily: Theme.fontFamily.bold, fontSize: 12, color: colors.primary }}>
                {t("profile.editProfile")}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.premiumCard}>
            <DetailRow icon="person-outline" label={t("profile.nameLabel")} value={dbUser.alias || dbUser.full_name || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="calendar-outline" label={t("profile.age")} value={dbUser.age?.toString() || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="school-outline" label={t("profile.campus")} value={dbUser.campus || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="business-outline" label={t("profile.department")} value={dbUser.department || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="ribbon-outline" label={t("profile.yearLabel")} value={dbUser.year || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow
              icon="male-female-outline"
              label={t("profile.genderLabel")}
              value={dbUser.gender ? (t(`profile.gender_${dbUser.gender}`, { defaultValue: dbUser.gender })) : "-"}
              colors={colors}
              styles={styles}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="call-outline"
              label={t("profile.emergencyContactLabel")}
              value={dbUser.emergencyContactName ? `${dbUser.emergencyContactName}${dbUser.emergencyContactPhone ? ` (${dbUser.emergencyContactPhone})` : ''}` : "-"}
              colors={colors}
              styles={styles}
            />
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

      {/* CUSTOMIZE COMPANION MODAL */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalCard}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <MitraAvatar gender={selectedGender} state="happy" size="md" />
            </View>
            <Text style={styles.renameModalTitle}>{t("profile.customizeModalTitle")}</Text>
            <Text style={styles.renameModalSubtitle}>
              {t("profile.customizeModalSubtitle")}
            </Text>

            {/* Avatar Gender Selection */}
            <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              {t("profile.chooseAvatar")}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selectedGender === 'female' ? colors.primary : '#E2E8F0',
                  backgroundColor: selectedGender === 'female' ? colors.primary + '14' : colors.surface,
                }}
                onPress={() => setSelectedGender('female')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${t("profile.avatarGirl")}, ${selectedGender === 'female' ? 'selected' : 'not selected'}`}
              >
                <MitraAvatar gender="female" size="xs" state="happy" />
                <Text style={{
                  fontFamily: selectedGender === 'female' ? Theme.fontFamily.bold : Theme.fontFamily.medium,
                  fontSize: 14,
                  color: selectedGender === 'female' ? colors.primary : colors.textSecondary,
                }}>
                  {t("profile.avatarGirl")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selectedGender === 'male' ? colors.primary : '#E2E8F0',
                  backgroundColor: selectedGender === 'male' ? colors.primary + '14' : colors.surface,
                }}
                onPress={() => setSelectedGender('male')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${t("profile.avatarBoy")}, ${selectedGender === 'male' ? 'selected' : 'not selected'}`}
              >
                <MitraAvatar gender="male" size="xs" state="happy" />
                <Text style={{
                  fontFamily: selectedGender === 'male' ? Theme.fontFamily.bold : Theme.fontFamily.medium,
                  fontSize: 14,
                  color: selectedGender === 'male' ? colors.primary : colors.textSecondary,
                }}>
                  {t("profile.avatarBoy")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Companion Name */}
            <Text style={{ fontFamily: Theme.fontFamily.medium, fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              {t("profile.companionNameLabel")}
            </Text>
            <TextInput
              style={[styles.renameInput, { borderColor: colors.primary + '40', color: colors.text }]}
              value={newCompanionName}
              onChangeText={setNewCompanionName}
              placeholder={t("profile.renameInputPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              maxLength={30}
              accessibilityLabel={t("profile.companionNameLabel")}
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

      {/* EDIT PROFILE MODAL */}
      <Modal
        visible={showEditProfileModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingProfile) setShowEditProfileModal(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editProfileModalOverlay}
        >
          <View style={styles.editProfileModalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.editProfileTitle}>{t("profile.editProfileTitle")}</Text>
                <Text style={styles.editProfileSubtitle}>{t("profile.editProfileSubtitle")}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowEditProfileModal(false)}
                disabled={isSavingProfile}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {profileFormError && (
              <View style={styles.editErrorBanner}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.editErrorBannerText}>{profileFormError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Alias / Full Name */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.nameLabel")} *</Text>
                <TextInput
                  style={styles.editInput}
                  value={editAlias}
                  onChangeText={setEditAlias}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={50}
                  accessibilityLabel={t("profile.nameLabel")}
                />
              </View>

              {/* Age */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.age")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editAge}
                  onChangeText={setEditAge}
                  placeholder="e.g. 19"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  maxLength={3}
                  accessibilityLabel={t("profile.age")}
                />
              </View>

              {/* Campus */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.campus")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editCampus}
                  onChangeText={setEditCampus}
                  placeholder="e.g. Main Campus"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                  accessibilityLabel={t("profile.campus")}
                />
              </View>

              {/* Department */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.department")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editDepartment}
                  onChangeText={setEditDepartment}
                  placeholder="e.g. Computer Science"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                  accessibilityLabel={t("profile.department")}
                />
              </View>

              {/* Academic Year */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.yearLabel")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editYear}
                  onChangeText={setEditYear}
                  placeholder="e.g. 2nd Year / Sophomore"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={30}
                  accessibilityLabel={t("profile.yearLabel")}
                />
              </View>

              {/* Demographic Gender Selection */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.genderLabel")}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {[
                    { key: "female", label: t("profile.gender_female") },
                    { key: "male", label: t("profile.gender_male") },
                    { key: "non-binary", label: t("profile.gender_non-binary") },
                    { key: "other", label: t("profile.gender_other") },
                    { key: "prefer-not-to-say", label: t("profile.gender_prefer-not-to-say") },
                  ].map((g) => {
                    const isSelected = editGender === g.key;
                    return (
                      <TouchableOpacity
                        key={g.key}
                        onPress={() => setEditGender(isSelected ? "" : g.key)}
                        style={[
                          styles.genderChip,
                          isSelected && { backgroundColor: colors.primary + '18', borderColor: colors.primary }
                        ]}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={g.label}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.genderChipText, isSelected && { color: colors.primary, fontFamily: Theme.fontFamily.bold }]}>
                          {g.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Emergency Contact Name */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.emergencyContactLabel")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editEmergencyName}
                  onChangeText={setEditEmergencyName}
                  placeholder="e.g. Parent / Guardian"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                  accessibilityLabel={t("profile.emergencyContactLabel")}
                />
              </View>

              {/* Emergency Contact Phone */}
              <View style={styles.editFieldGroup}>
                <Text style={styles.editFieldLabel}>{t("profile.emergencyPhoneLabel")}</Text>
                <TextInput
                  style={styles.editInput}
                  value={editEmergencyPhone}
                  onChangeText={setEditEmergencyPhone}
                  placeholder="e.g. +91 9876543210"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                  maxLength={25}
                  accessibilityLabel={t("profile.emergencyPhoneLabel")}
                />
              </View>
            </ScrollView>

            <View style={styles.editBtnRow}>
              <TouchableOpacity
                style={[styles.renameCancelBtn, { borderColor: '#E2E8F0' }]}
                onPress={() => setShowEditProfileModal(false)}
                disabled={isSavingProfile}
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
              >
                <Text style={[styles.renameCancelBtnText, { color: colors.textSecondary }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.renameSaveBtn, { backgroundColor: colors.primary, opacity: isSavingProfile ? 0.7 : 1 }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
                accessibilityRole="button"
                accessibilityLabel={t("profile.saveProfile")}
              >
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.renameSaveBtnText}>{t("profile.saveProfile")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  // Edit Profile Modal Styles
  editProfileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.md,
  } as ViewStyle,
  editProfileModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    ...Theme.shadows.primary,
  } as ViewStyle,
  editProfileTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  } as TextStyle,
  editProfileSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  editErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  } as ViewStyle,
  editErrorBannerText: {
    flex: 1,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: '#B91C1C',
  } as TextStyle,
  editFieldGroup: {
    marginBottom: 14,
  } as ViewStyle,
  editFieldLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  } as TextStyle,
  editInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: Theme.fontFamily.medium,
    backgroundColor: '#F8FAFC',
    color: colors.text,
  } as TextStyle,
  genderChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  } as ViewStyle,
  genderChipText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  } as TextStyle,
  editBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  } as ViewStyle,
  };
}

