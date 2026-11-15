import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { useThemeColors } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { DictationButton } from "@/components/ui/DictationButton";
import { useDictation } from "@/hooks/useDictation";
import { CRISIS_RESOURCES, HELPLINE_DIAL_URL } from "@/common/crisisResources";

const CATEGORIES = [
  { id: "bug", icon: "bug-outline" },
  { id: "confusing", icon: "help-circle-outline" },
  { id: "idea", icon: "bulb-outline" },
  { id: "praise", icon: "heart-outline" },
  { id: "other", icon: "chatbubble-ellipses-outline" },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];

const MAX_LENGTH = 2000;

/** Beta feedback: stored in Convex for the test admin (dashboard -> Beta report). */
export default function FeedbackScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useLanguage();
  const submit = useMutation(api.betaFeedback.submit);
  const dictation = useDictation();
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [screen, setScreen] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = !!category && message.trim().length >= 3 && !sending;

  const send = async () => {
    if (!canSend || !category) return;
    setSending(true);
    try {
      const res = await submit({
        category,
        message: message.trim(),
        screen: screen.trim() || undefined,
        appVersion: Constants.expoConfig?.version,
        platform: Platform.OS,
      });
      const done = () => router.back();
      if (res.showCrisisResources) {
        Alert.alert(t("feedback.crisis.title"), t("feedback.crisis.body", { name: CRISIS_RESOURCES.helplineName, number: CRISIS_RESOURCES.helplineNumber, emergency: CRISIS_RESOURCES.emergencyNumber }), [
          { text: t("feedback.crisis.call", { name: CRISIS_RESOURCES.helplineName }), onPress: () => { Linking.openURL(HELPLINE_DIAL_URL).catch(() => {}); done(); } },
          { text: t("feedback.ok"), onPress: done },
        ]);
      } else {
        Alert.alert(t("feedback.thanks.title"), t("feedback.thanks.body"), [{ text: t("feedback.ok"), onPress: done }]);
      }
    } catch (err: any) {
      Alert.alert(t("feedback.error.title"), String(err?.message || "").replace(/^.*Uncaught Error: /, "").split("\n")[0] || t("feedback.error.body"));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {t("feedback.title")}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("feedback.intro")}</Text>

          <Text style={[styles.label, { color: colors.text }]}>{t("feedback.categoryLabel")}</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const selected = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.chip, { borderColor: selected ? colors.primary : "#E2E8F0", backgroundColor: selected ? colors.primary + "14" : colors.surface }]}
                >
                  <Ionicons name={c.icon as any} size={16} color={selected ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.chipText, { color: selected ? colors.primary : colors.text }]}>{t(`feedback.category.${c.id}`)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>{t("feedback.messageLabel")}</Text>
          <TextInput
            style={[styles.textArea, { color: colors.text, backgroundColor: colors.surface }]}
            value={message}
            onChangeText={setMessage}
            placeholder={t("feedback.messagePlaceholder")}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
          />
          <DictationButton dictation={dictation} field="message" value={message} onChangeText={(text) => setMessage(text.slice(0, MAX_LENGTH))} />

          <Text style={[styles.label, { color: colors.text }]}>{t("feedback.screenLabel")}</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]}
            value={screen}
            onChangeText={setScreen}
            placeholder={t("feedback.screenPlaceholder")}
            placeholderTextColor={colors.textSecondary}
            maxLength={80}
          />

          <Button title={sending ? t("feedback.sending") : t("feedback.send")} onPress={send} disabled={!canSend} loading={sending} style={{ marginTop: 8 }} />
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {t("feedback.supportNote", { name: CRISIS_RESOURCES.helplineName, number: CRISIS_RESOURCES.helplineNumber })}
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md },
  back: { padding: 4, marginRight: 8 },
  title: { flex: 1, fontFamily: Theme.fontFamily.bold, fontSize: 22 },
  content: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 48, gap: 10 },
  intro: { fontFamily: Theme.fontFamily.medium, fontSize: 14, lineHeight: 21, marginBottom: 6 },
  label: { fontFamily: Theme.fontFamily.bold, fontSize: 14, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: Theme.fontFamily.medium, fontSize: 13 },
  textArea: { minHeight: 140, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, fontFamily: Theme.fontFamily.medium, fontSize: 15 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, fontFamily: Theme.fontFamily.medium, fontSize: 15 },
  note: { fontFamily: Theme.fontFamily.medium, fontSize: 12, lineHeight: 18, marginTop: 6 },
});
