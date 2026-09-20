import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";

export default function ConsentScreen() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

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
      <Text style={styles.step}>Step 1 of 3</Text>
      <Text style={styles.title}>Informed Consent</Text>
      <Text style={styles.subtitle}>
        Please read and agree to the following before continuing.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Data Collection</Text>
        <Text style={styles.body}>
          We collect responses to standardized wellbeing questionnaires to
          personalize your experience and, where appropriate, connect you with
          support services.
        </Text>

        <Text style={styles.sectionTitle}>Confidentiality</Text>
        <Text style={styles.body}>
          Your data is stored securely and will not be shared with third parties
          without your explicit consent, except where there is a risk of harm.
        </Text>

        <Text style={styles.sectionTitle}>Voluntary Participation</Text>
        <Text style={styles.body}>
          Your use of this app is entirely voluntary. You may withdraw at any
          time by deleting your account.
        </Text>

        <Text style={styles.sectionTitle}>Limitations</Text>
        <Text style={styles.body}>
          This app does not provide medical diagnoses or replace professional
          mental health services.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setAgreed(!agreed)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Ionicons name="checkmark" size={16} color={Colors.white} />}
        </View>
        <Text style={styles.checkboxLabel}>
          I have read and agree to the above terms
        </Text>
      </TouchableOpacity>

      <Button
        title="Continue"
        onPress={() =>
          router.push("/(auth)/onboarding/emergency")
        }
        disabled={!agreed}
        size="lg"
        style={{ marginTop: Theme.spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.spacing.xl, paddingTop: 60 },
  step: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: Theme.spacing.sm,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xxl,
    color: Colors.text,
    marginBottom: Theme.spacing.xs,
  },
  subtitle: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.textSecondary,
    marginBottom: Theme.spacing.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
  },
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.xs,
  },
  body: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Theme.spacing.md,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    flex: 1,
  },
});
