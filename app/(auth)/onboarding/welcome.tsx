import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { useAppAuth } from "@/utils/auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLanguage } from "@/context/LanguageContext";
import { useAvatar, AvatarGender } from "@/context/AvatarContext";

import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { MindfulnessActivityIcon, DeepBreathingActivityIcon } from "@/components/svg/activities";
import { CounsellorBadgeIcon, PlantProgress, ReminderIcon } from "@/components/svg/system";

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const { avatarName, avatarGender, setMitraPreferences } = useAvatar();
  const dbUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : "skip");

  const [selectedGender, setSelectedGender] = useState<AvatarGender>(avatarGender || "female");
  const [customName, setCustomName] = useState<string>(avatarName || "Mitra");

  useEffect(() => {
    if (avatarGender) setSelectedGender(avatarGender);
  }, [avatarGender]);

  useEffect(() => {
    if (avatarName) setCustomName(avatarName);
  }, [avatarName]);

  useEffect(() => {
    if (dbUser === undefined) return;
    const hasDemographics = dbUser?.alias && dbUser?.age && dbUser?.campus && dbUser?.department;
    if (dbUser?.onboardingComplete || hasDemographics) {
      router.replace("/(auth)/(tabs)");
    }
  }, [dbUser]);

  const handleContinue = async () => {
    const finalName = customName.trim() || "Mitra";
    const finalGender: AvatarGender = selectedGender === "male" ? "male" : "female";
    try {
      await setMitraPreferences({
        name: finalName,
        avatarGender: finalGender,
      });
    } catch (e) {
      console.warn("Failed to save Mitra preferences during welcome:", e);
    }
    router.push("/(auth)/onboarding/consent");
  };

  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(20, insets.top),
          paddingBottom: Math.max(20, insets.bottom + 20),
        }
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={{ marginBottom: Theme.spacing.md }}>
          <MitraAvatar gender={selectedGender} state="happy" size="lg" />
        </View>
        <Text style={styles.title}>{t("onboarding.welcomeTitle")}</Text>
        <Text style={styles.subtitle}>
          {t("onboarding.welcomeSubtitle", { name: customName.trim() || "Mitra" })}
        </Text>
      </View>

      {/* Optional Companion Customization */}
      <View style={styles.companionCard}>
        <Text style={styles.companionSectionTitle}>
          {t("onboarding.meetCompanionTitle")}
        </Text>
        <Text style={styles.companionSectionSubtitle}>
          {t("onboarding.meetCompanionSubtitle")}
        </Text>

        <Text style={styles.fieldLabel}>{t("profile.chooseAvatar")}</Text>
        <View style={styles.avatarSelectionRow}>
          <TouchableOpacity
            style={[
              styles.avatarOption,
              selectedGender === "female" && styles.avatarOptionSelected,
            ]}
            onPress={() => setSelectedGender("female")}
            accessibilityRole="button"
            accessibilityLabel={`${t("profile.avatarGirl")}, ${selectedGender === "female" ? "selected" : "not selected"}`}
            activeOpacity={0.8}
          >
            <MitraAvatar gender="female" size="sm" state="happy" />
            <Text
              style={[
                styles.avatarOptionText,
                selectedGender === "female" && styles.avatarOptionTextSelected,
              ]}
            >
              {t("profile.avatarGirl")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.avatarOption,
              selectedGender === "male" && styles.avatarOptionSelected,
            ]}
            onPress={() => setSelectedGender("male")}
            accessibilityRole="button"
            accessibilityLabel={`${t("profile.avatarBoy")}, ${selectedGender === "male" ? "selected" : "not selected"}`}
            activeOpacity={0.8}
          >
            <MitraAvatar gender="male" size="sm" state="happy" />
            <Text
              style={[
                styles.avatarOptionText,
                selectedGender === "male" && styles.avatarOptionTextSelected,
              ]}
            >
              {t("profile.avatarBoy")}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: Theme.spacing.md }]}>
          {t("profile.companionNameLabel")}
        </Text>
        <TextInput
          style={styles.nameInput}
          value={customName}
          onChangeText={setCustomName}
          placeholder="Mitra"
          placeholderTextColor={Colors.textMuted}
          maxLength={30}
          autoCorrect={false}
          accessibilityLabel={t("profile.companionNameLabel")}
        />
        <Text style={styles.helperText}>
          {t("onboarding.canChangeLater")}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Theme.spacing.sm }}>
          <ReminderIcon size={20} color={Colors.warning} />
          <Text style={styles.cardTitle}>{t("onboarding.beforeWeBegin")}</Text>
        </View>
        <Text style={styles.disclaimer}>
          {t("onboarding.disclaimerMedical")}
        </Text>
        <Text style={styles.disclaimer}>
          {t("onboarding.disclaimerConfidential")}
        </Text>
        <Text style={styles.disclaimer}>
          {t("onboarding.disclaimerCrisis")}
        </Text>
      </View>

      <View style={styles.features}>
        <FeatureItem 
          icon={<MindfulnessActivityIcon size={24} color={Colors.primary} />} 
          text={t("onboarding.featEmotions")} 
        />
        <FeatureItem 
          icon={<PlantProgress stage="sprout" size={24} />} 
          text={t("onboarding.featTrack")} 
        />
        <FeatureItem 
          icon={<DeepBreathingActivityIcon size={24} color={Colors.primary} />} 
          text={t("onboarding.featTools")} 
        />
        <FeatureItem 
          icon={<CounsellorBadgeIcon size={24} color={Colors.primary} />} 
          text={t("onboarding.featConnect")} 
        />
      </View>

      <Button
        title={t("onboarding.getStarted")}
        onPress={handleContinue}
        size="lg"
        style={{ marginTop: Theme.spacing.lg }}
      />
    </ScrollView>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.iconContainer}>{icon}</View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Theme.spacing.xl,
    paddingTop: 60,
  },
  hero: {
    alignItems: "center",
    marginBottom: Theme.spacing.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: Theme.spacing.md,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xxl,
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: Theme.spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  cardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    color: Colors.text,
    marginBottom: Theme.spacing.md,
  },
  disclaimer: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Theme.spacing.md,
  },
  bold: {
    fontFamily: Theme.fontFamily.bold,
    color: Colors.warning,
  },
  features: {
    gap: Theme.spacing.md,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Theme.spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  companionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  companionSectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
    color: Colors.text,
    marginBottom: 4,
  },
  companionSectionSubtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Theme.spacing.md,
  },
  fieldLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Theme.spacing.xs,
  },
  avatarSelectionRow: {
    flexDirection: "row",
    gap: Theme.spacing.md,
  },
  avatarOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Theme.spacing.sm,
    backgroundColor: Colors.background,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(124, 77, 255, 0.06)",
  },
  avatarOptionText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
  },
  avatarOptionTextSelected: {
    color: Colors.primary,
    fontFamily: Theme.fontFamily.bold,
  },
  nameInput: {
    backgroundColor: Colors.background,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 12,
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  helperText: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 6,
  },
});
