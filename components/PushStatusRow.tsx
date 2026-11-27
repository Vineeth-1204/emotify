import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { useThemeColors } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Theme } from "@/constants/Theme";
import { getPushPermissionDetails } from "@/utils/notifications";
import { requestPushSetup } from "@/hooks/usePushNotifications";
import { phoneNotificationState, testResultKey, type PermissionDetails } from "@/common/pushRegistration";

/**
 * Profile -> Phone notifications: shows whether this phone can receive Emotify notifications,
 * offers the right fix (turn on, open settings, try again) and a test notification whose
 * delivery result is shown here. Only the student's own status; no tokens are shown.
 */
export function PushStatusRow() {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const status = useQuery(api.pushTokens.getMyPushStatus, {});
  const sendTest = useMutation(api.pushNotifications.sendMyTestNotification);
  const [permission, setPermission] = useState<PermissionDetails | null>(null);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(() => {
    getPushPermissionDetails().then(setPermission).catch(() => setPermission(null));
  }, []);
  useFocusEffect(refresh);

  const state = phoneNotificationState(permission, status?.deviceCount);
  const lastProblem = status?.lastEvent && status.lastEvent.status !== "ok" ? status.lastEvent : null;

  const fix = async () => {
    if (state === "blocked") {
      Linking.openSettings().catch(() => {});
      return;
    }
    setWorking(true);
    try {
      await requestPushSetup();
    } finally {
      setWorking(false);
      refresh();
    }
  };

  const test = async () => {
    setWorking(true);
    try {
      await sendTest({});
      Alert.alert(t("notifications.phone.testSentTitle"), t("notifications.phone.testSentBody"));
    } catch (error: any) {
      Alert.alert(t("notifications.phone.testFailedTitle"), String(error?.message || "").split("\n")[0] || t("notifications.phone.testFailedTitle"));
    } finally {
      setWorking(false);
    }
  };

  const tone = state === "on" ? "#16A34A" : state === "unknown" ? colors.textSecondary : "#D97706";
  const action =
    state === "blocked" ? t("notifications.phone.openSettings") : state === "off" ? t("notifications.phone.turnOn") : state === "not_registered" ? t("notifications.phone.retry") : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
          <Text style={[styles.label, { color: colors.text }]}>{t("notifications.phone.label")}</Text>
        </View>
        <Text style={[styles.value, { color: tone }]}>{t(`notifications.phone.state.${state}`)}</Text>
      </View>
      {state !== "on" && state !== "unknown" && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t(`notifications.phone.help.${state}`)}
          {lastProblem ? ` (${lastProblem.stage}: ${lastProblem.errorCode || lastProblem.status})` : ""}
        </Text>
      )}
      {status?.lastTest && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t("notifications.phone.lastTest")}: {t(`notifications.phone.result.${testResultKey(status.lastTest.pushStatus)}`)}
          {status.lastTest.pushError ? ` (${status.lastTest.pushError})` : ""}
        </Text>
      )}
      <View style={styles.actions}>
        {action && (
          <Pressable onPress={fix} disabled={working} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={styles.buttonText}>{action}</Text>
          </Pressable>
        )}
        {state === "on" && (
          <Pressable onPress={test} disabled={working} accessibilityRole="button" style={[styles.button, styles.outline, { borderColor: colors.primary }]}>
            <Text style={[styles.buttonText, { color: colors.primary }]}>{t("notifications.phone.sendTest")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 13, paddingHorizontal: 14, gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  left: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  label: { fontFamily: Theme.fontFamily.bold, fontSize: 14 },
  value: { fontFamily: Theme.fontFamily.bold, fontSize: 14, textAlign: "right" },
  note: { fontFamily: Theme.fontFamily.medium, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  outline: { borderWidth: 1, backgroundColor: "transparent" },
  buttonText: { color: "#FFFFFF", fontFamily: Theme.fontFamily.bold, fontSize: 13 },
});
