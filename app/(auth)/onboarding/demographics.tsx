import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";

export default function DemographicsScreen() {
  const router = useRouter();
  const { user, updateUser } = useAppAuth();
  const params = useLocalSearchParams<{
    emergencyName: string;
    emergencyPhone: string;
  }>();

  const appUser = useQuery(api.users.getByClerkId, user?.id ? {
    clerkId: user.id,
  } : "skip");

  const completeOnboarding = useMutation(api.users.completeOnboarding);

  const assignedName = appUser?.full_name || user?.full_name || "Student";

  const [alias, setAlias] = useState("");
  const [age, setAge] = useState("");
  const [campus, setCampus] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = age.trim() && campus.trim() && department.trim();

  async function handleSubmit() {
    if (!user || !isValid) return;
    setLoading(true);
    setError("");

    try {
      await completeOnboarding({
        userId: user.id,
        alias: alias.trim() || assignedName,
        age: parseInt(age, 10) || 0,
        campus: campus.trim(),
        department: department.trim(),
        year: year.trim() || undefined,
        consentVersion: "1.0",
        consentTimestamp: Date.now(),
        emergencyContactName: params.emergencyName || undefined,
        emergencyContactPhone: params.emergencyPhone || undefined,
      });

      await updateUser({
        ...user,
        onboardingComplete: true,
      });

      // Progress directly to baseline screening
      router.replace("/(auth)/screening");
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError("Failed to save your information. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
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
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.step}>Step 3 of 3</Text>
      <Text style={styles.title}>Tell us about you</Text>
      <Text style={styles.subtitle}>
        Your profile details help us tailor support and resources for your campus journey.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Preferred Name / Alias (Optional)</Text>
        <TextInput
          style={styles.input}
          value={alias}
          onChangeText={setAlias}
          placeholder={assignedName}
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Age *</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          placeholder="e.g. 20"
          placeholderTextColor={Colors.textMuted}
          keyboardType="number-pad"
          maxLength={3}
        />

        <Text style={styles.label}>Campus / College *</Text>
        <TextInput
          style={styles.input}
          value={campus}
          onChangeText={setCampus}
          placeholder="e.g. Main Campus"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Department / Major *</Text>
        <TextInput
          style={styles.input}
          value={department}
          onChangeText={setDepartment}
          placeholder="e.g. Computer Science"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Year of Study (Optional)</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={setYear}
          placeholder="e.g. 2nd Year or 2024"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title="Complete & Continue to Screening"
        onPress={handleSubmit}
        loading={loading}
        disabled={!isValid}
        size="lg"
        style={{ marginTop: Theme.spacing.xl }}
      />
      </ScrollView>
    </KeyboardAvoidingView>
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
    lineHeight: 22,
    marginBottom: Theme.spacing.xl,
  },
  form: { gap: Theme.spacing.xs },
  label: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 14,
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  readOnlyContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 14,
  },
  readOnlyText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
  },
  error: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.error,
    marginTop: Theme.spacing.md,
    textAlign: "center",
  },
});
