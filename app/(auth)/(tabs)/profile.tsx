import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Dimensions, ViewStyle, TextStyle, Switch, Linking } from "react-native";
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

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { logout, user, biometricsEnabled, setBiometricsEnabled } = useAppAuth();
  const router = useRouter();
  const userId = user?.id;
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory);

  const dbUser = useQuery(api.users.getByClerkId, userId ? { clerkId: userId } : "skip");
  const exportData = useQuery(api.insights.getDailyStats, userId ? { userId: userId } : "skip");

  const [isExporting, setIsExporting] = useState(false);

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
          <Text style={[styles.headerMessage, { color: colors.primary }]}>You’re doing great — keep going</Text>
        </View>

        {/* Wellness Identity Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>YOUR WELLNESS IDENTITY</Text>
            <Text style={styles.sectionSubtitle}>Updated today based on your logs</Text>
          </View>

          <View style={styles.identityGrid}>
            <IdentityCard
              icon="leaf"
              label="PERSONAL STYLE"
              color={colors.primary}
              traits={wellnessProfile?.personality_traits}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="chatbubble"
              label="MOOD PATTERN"
              color={colors.secondary}
              value={wellnessProfile?.mood_pattern}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="flash"
              label="ENERGY PATTERN"
              color={colors.accent || "#FFB6C1"}
              value={wellnessProfile?.energy_pattern}
              loading={!wellnessProfile}
              styles={styles}
            />
            <IdentityCard
              icon="checkmark-circle"
              label="WELLNESS GOALS"
              color={colors.warning || "#F59E0B"}
              traits={wellnessProfile?.wellness_goals}
              loading={!wellnessProfile}
              styles={styles}
            />
          </View>
        </View>

        {/* Account Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT DETAILS</Text>
          <View style={styles.premiumCard}>
            <DetailRow icon="person-outline" label="Age" value={dbUser.age?.toString() || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="school-outline" label="Campus" value={dbUser.campus || "-"} colors={colors} styles={styles} />
            <View style={styles.divider} />
            <DetailRow icon="business-outline" label="Department" value={dbUser.department || "-"} colors={colors} styles={styles} />
          </View>
        </View>

        {/* Sessions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SESSIONS</Text>
          <View style={styles.premiumCard}>
            <DetailRow
              icon="time-outline"
              label="Last Login"
              value={dbUser.lastLoginAt ? new Date(dbUser.lastLoginAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "Just now"}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>

        {/* Settings & Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SETTINGS & SECURITY</Text>
          <View style={styles.premiumCard}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="finger-print-outline" size={18} color={colors.textSecondary} style={styles.icon} />
                <Text style={styles.label}>Biometric Login</Text>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={handleToggleBiometrics}
                trackColor={{ false: "#767577", true: colors.primary }}
                thumbColor={biometricsEnabled ? colors.white : "#f4f3f4"}
              />
            </View>
          </View>
        </View>

        {/* Help & Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HELP & SUPPORT</Text>
          <TouchableOpacity
            style={styles.crisisCard}
            onPress={handleCrisisCall}
            activeOpacity={0.8}
          >
            <View style={styles.crisisHeader}>
              <View style={styles.crisisIconCircle}>
                <Ionicons name="call" size={18} color={colors.error || "#EF4444"} />
              </View>
              <Text style={styles.crisisTitle}>Crisis Support Helpline</Text>
            </View>
            <Text style={styles.crisisDesc}>
              Get immediate, confidential assistance during high distress. Tap to view campus support and emergency contact numbers.
            </Text>
            <View style={styles.crisisButton}>
              <Text style={styles.crisisButtonText}>Get Help Now</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Data Management Export Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA MANAGEMENT</Text>
          <View style={[styles.premiumCard, { padding: Theme.spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={[styles.iconCircleMini, { backgroundColor: colors.primary + '12' }]}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.managementTitle}>Export Personal Data</Text>
            </View>
            <Text style={styles.managementDesc}>
              Download all your clinical check-ins and wellbeing questionnaire scores as a secure CSV spreadsheet.
            </Text>
            <Button
              title={isExporting ? "Generating CSV..." : "Export Logs (CSV)"}
              onPress={handleExportData}
              variant="outline"
              disabled={isExporting}
              icon={<Ionicons name="download-outline" size={16} color={colors.primary} />}
              style={styles.exportBtn}
              textStyle={{ color: colors.primary, fontSize: 13, fontFamily: Theme.fontFamily.bold }}
            />
          </View>
        </View>

        <View style={{ height: 20 }} />
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="outline"
          style={styles.signOutBtn}
          textStyle={{ color: colors.error }}
          icon={<Ionicons name="log-out-outline" size={20} color={colors.error} />}
        />

        <View style={{ height: 120 }} />
      </ScrollView>
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
    borderRadius: Theme.borderRadius.md,
    borderColor: colors.primary + '30',
    height: 40,
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
  };
}

