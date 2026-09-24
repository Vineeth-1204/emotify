import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { useAppAuth } from "@/utils/auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLanguage } from "@/context/LanguageContext";
import { useAvatar } from "@/context/AvatarContext";

import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { MindfulnessActivityIcon, DeepBreathingActivityIcon } from "@/components/svg/activities";
import { CounsellorBadgeIcon, PlantProgress, ReminderIcon } from "@/components/svg/system";

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const { avatarName } = useAvatar();
  const dbUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : "skip");

  useEffect(() => {
    if (dbUser === undefined) return;
    const hasDemographics = dbUser?.alias && dbUser?.age && dbUser?.campus && dbUser?.department;
    if (dbUser?.onboardingComplete || hasDemographics) {
      router.replace("/(auth)/(tabs)");
    }
  }, [dbUser]);

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
          <MitraAvatar state="neutral" size="lg" />
        </View>
        <Text style={styles.title}>{t("onboarding.welcomeTitle")}</Text>
        <Text style={styles.subtitle}>
          {t("onboarding.welcomeSubtitle", { name: avatarName })}
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
        onPress={() => router.push("/(auth)/onboarding/consent")}
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
});
