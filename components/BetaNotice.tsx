import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useLanguage } from "@/context/LanguageContext";
import { Theme } from "@/constants/Theme";
import { CRISIS_RESOURCES, EMERGENCY_DIAL_URL, HELPLINE_DIAL_URL } from "@/common/crisisResources";
import { BETA_NOTICE_KEY, isBetaBuild } from "@/common/beta";

/**
 * Shown once per install on a beta build, before anything else: what a test version means,
 * who can see what testers enter, and the real crisis numbers.
 */
export function BetaNotice() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isBetaBuild()) return;
    SecureStore.getItemAsync(BETA_NOTICE_KEY)
      .then((seen) => setVisible(!seen))
      .catch(() => setVisible(true));
  }, []);

  const acknowledge = () => {
    setVisible(false);
    SecureStore.setItemAsync(BETA_NOTICE_KEY, String(Date.now())).catch(() => {});
  };

  if (!visible) return null;
  const points = ["testVersion", "whoSees", "notTherapy", "feedback"] as const;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BETA</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {t("beta.notice.title")}
            </Text>
            {points.map((p) => (
              <View key={p} style={styles.point}>
                <Ionicons name="checkmark-circle" size={18} color="#6366F1" style={{ marginTop: 1 }} />
                <Text style={styles.pointText}>{t(`beta.notice.${p}`)}</Text>
              </View>
            ))}

            <View style={styles.crisis}>
              <Text style={styles.crisisTitle}>{t("beta.notice.crisisTitle")}</Text>
              <Pressable onPress={() => Linking.openURL(HELPLINE_DIAL_URL).catch(() => {})} accessibilityRole="button" style={styles.crisisRow}>
                <Ionicons name="call" size={16} color="#B91C1C" />
                <Text style={styles.crisisText}>
                  {CRISIS_RESOURCES.helplineName} {CRISIS_RESOURCES.helplineNumber} ({CRISIS_RESOURCES.helplineTollFree}) – {t("beta.notice.helplineNote")}
                </Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(EMERGENCY_DIAL_URL).catch(() => {})} accessibilityRole="button" style={styles.crisisRow}>
                <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.crisisText}>
                  {CRISIS_RESOURCES.emergencyNumber} – {t("beta.notice.emergencyNote")}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable onPress={acknowledge} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>{t("beta.notice.accept")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Small "BETA" pill for headers. Renders nothing on a release build. */
export function BetaBadge() {
  if (!isBetaBuild()) return null;
  return (
    <View style={styles.badge} accessibilityLabel="Beta test version">
      <Text style={styles.badgeText}>BETA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,15,26,0.6)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 22, maxHeight: "90%", gap: 16 },
  badge: { alignSelf: "flex-start", backgroundColor: "#F59E0B", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: "#FFFFFF", fontFamily: Theme.fontFamily.bold, fontSize: 11, letterSpacing: 1 },
  title: { fontFamily: Theme.fontFamily.bold, fontSize: 20, color: "#1F2937" },
  point: { flexDirection: "row", gap: 10 },
  pointText: { flex: 1, fontFamily: Theme.fontFamily.medium, fontSize: 14, lineHeight: 21, color: "#374151" },
  crisis: { backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, gap: 8 },
  crisisTitle: { fontFamily: Theme.fontFamily.bold, fontSize: 14, color: "#991B1B" },
  crisisRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  crisisText: { flex: 1, fontFamily: Theme.fontFamily.medium, fontSize: 14, lineHeight: 20, color: "#7F1D1D" },
  button: { backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontFamily: Theme.fontFamily.bold, fontSize: 16 },
});
