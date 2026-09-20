import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";

import { ShieldSafetyIcon } from "@/components/svg/system";

export default function EmergencyContactScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const insets = useSafeAreaInsets();

  const handlePhoneChange = (text: string) => {
    // Only allow numbers and limit to 10 digits
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 10);
    setPhone(cleaned);
  };

  const isValid = name.trim().length > 0 && phone.length === 10;

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
      <Text style={styles.step}>Step 2 of 3</Text>
      <Text style={styles.title}>Emergency Contact</Text>
      <Text style={styles.subtitle}>
        Someone we can reach if we're ever concerned about your safety. This field is mandatory.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Contact Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. A trusted friend or family member"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Phone Number (10 digits) *</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={handlePhoneChange}
          placeholder="e.g. 9876543210"
          placeholderTextColor={Colors.textMuted}
          keyboardType="number-pad"
          maxLength={10}
        />
      </View>

      <View style={styles.info}>
        <View style={{ flexDirection: "row", gap: Theme.spacing.sm, alignItems: "flex-start" }}>
          <ShieldSafetyIcon size={20} color={Colors.primary} />
          <Text style={[styles.infoText, { flex: 1 }]}>
            Emergency contact details are strictly required to ensure your safety in high-distress situations.
          </Text>
        </View>
      </View>

      <Button
        title="Continue"
        onPress={() =>
          router.push({
            pathname: "/(auth)/onboarding/demographics",
            params: {
              emergencyName: name.trim(),
              emergencyPhone: phone.trim(),
            },
          })
        }
        disabled={!isValid}
        size="lg"
        style={{ marginTop: Theme.spacing.lg }}
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
  form: { gap: Theme.spacing.sm },
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
  info: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    marginTop: Theme.spacing.lg,
  },
  infoText: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
