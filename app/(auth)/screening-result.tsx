import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Linking, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useConvexConnectionState } from "convex/react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { EmotyPresence } from "@/components/avatar/EmotyPresence";
import { getEmotyPresence } from "@/common/emotyPresence";
import { useLanguage } from "@/context/LanguageContext";
import { CRISIS_RESOURCES, EMERGENCY_DIAL_URL, HELPLINE_DIAL_URL } from "@/common/crisisResources";
import {
  ACTION_LABEL_KEYS,
  counsellorLabelKey,
  resultScreenState,
  type ScreeningAction,
  type ScreeningOutcomeView,
} from "@/common/screeningOutcome";

const CRISIS_PARAMS = {
  helplineName: CRISIS_RESOURCES.helplineName,
  helplineNumber: CRISIS_RESOURCES.helplineNumber,
  emergencyNumber: CRISIS_RESOURCES.emergencyNumber,
};

/**
 * Shown once, right after a screening is submitted. The submission (scoring, triage, safety
 * alerts, staff notifications and follow-up) has already completed on the server before this
 * screen opens; nothing here writes anything or affects those signals. It only reads the
 * student's own presentation outcome and offers next steps.
 *
 * Calm base palette on purpose: the decorative mood theme and alarming colours never apply here.
 */
export default function ScreeningResultScreen() {
  return (
    <ResultErrorBoundary>
      <ScreeningResult />
    </ResultErrorBoundary>
  );
}

function ScreeningResult() {
  const router = useRouter();
  const { t } = useLanguage();
  const summary = useQuery(api.screening.getMyResultSummary, {});
  const connection = useConvexConnectionState();
  const state = resultScreenState(summary, connection);

  const goHome = () => router.replace({ pathname: "/(auth)/(tabs)", params: { from: "screening" } } as any);
  const run = (action: ScreeningAction) => {
    switch (action) {
      case "home":
      case "more_support": // the existing safety screen opens on the tabs when it applies
        return goHome();
      case "tools":
        return router.replace("/(auth)/(tabs)/tools" as any);
      case "counsellor":
        return router.push("/(auth)/tools/appointments" as any);
      case "call_emergency":
        return Linking.openURL(EMERGENCY_DIAL_URL);
      case "call_helpline":
        return Linking.openURL(HELPLINE_DIAL_URL);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={Colors.backgroundGradient as any} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow} accessibilityRole="header">{t("screening.result.title")}</Text>
        <EmotyPresence
          presence={getEmotyPresence({ scene: "screening_result", outcome: state.kind === "ready" ? state.view.outcome : null })}
          layout="stacked"
          size="md"
          style={{ marginBottom: Theme.spacing.lg }}
        />

        {state.kind === "loading" && (
          <View style={styles.card} accessibilityLabel={t("screening.result.loading")}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.statusText}>{t("screening.result.loading")}</Text>
            <SafetyFooter onPress={() => Linking.openURL(HELPLINE_DIAL_URL)} />
          </View>
        )}

        {(state.kind === "offline" || state.kind === "missing") && (
          <View style={styles.card}>
            <Ionicons name={state.kind === "offline" ? "cloud-offline-outline" : "information-circle-outline"} size={24} color={Colors.textSecondary} />
            <Text style={styles.statusText}>{t(state.kind === "offline" ? "screening.result.offline" : "screening.result.missing")}</Text>
            <Button title={t(ACTION_LABEL_KEYS.home)} onPress={goHome} variant="outline" size="lg" style={styles.fullButton} />
            <SafetyFooter onPress={() => Linking.openURL(HELPLINE_DIAL_URL)} />
          </View>
        )}

        {state.kind === "ready" && <OutcomeCard view={state.view} onAction={run} />}
      </ScrollView>
    </View>
  );
}

function SafetyFooter({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="link" style={styles.footer}>
      <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
      <Text style={styles.footerText}>{t("screening.result.safetyFooter", CRISIS_PARAMS)}</Text>
    </TouchableOpacity>
  );
}

function OutcomeCard({ view, onAction }: { view: ScreeningOutcomeView; onAction: (a: ScreeningAction) => void }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [safetyStep, setSafetyStep] = React.useState<"initial" | "calm_bridge" | "declined" | "helpline_options">("initial");

  const label = (action: ScreeningAction) => {
    if (action === "counsellor") return t(counsellorLabelKey(view.outcome));
    if (action === "call_emergency") return t(ACTION_LABEL_KEYS.call_emergency, { number: CRISIS_RESOURCES.emergencyNumber });
    if (action === "call_helpline") return t(ACTION_LABEL_KEYS.call_helpline, { helplineName: CRISIS_RESOURCES.helplineName, number: CRISIS_RESOURCES.helplineNumber });
    return t(ACTION_LABEL_KEYS[action]);
  };

  if (view.outcome === "immediate_safety") {
    return (
      <View style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          {t("screening.result.trustedAdult.heading")}
        </Text>

        {safetyStep === "initial" && (
          <>
            <Text style={styles.body}>
              {t("screening.result.trustedAdult.question")}
            </Text>
            <View style={styles.actions}>
              <Button
                title={t("screening.result.trustedAdult.yesButton")}
                onPress={() => setSafetyStep("calm_bridge")}
                variant="primary"
                size="lg"
                style={styles.fullButton}
              />
              <Button
                title={t("screening.result.trustedAdult.needHelpButton")}
                onPress={() => setSafetyStep("helpline_options")}
                variant="outline"
                size="lg"
                style={styles.fullButton}
              />
            </View>
          </>
        )}

        {safetyStep === "calm_bridge" && (
          <>
            <Text style={styles.body}>
              {t("screening.result.trustedAdult.acknowledgedYes")}
            </Text>
            <Text style={[styles.body, { marginTop: Theme.spacing.xs }]}>
              {t("screening.result.trustedAdult.calmBridge")}
            </Text>
            <View style={styles.actions}>
              <Button
                title={t("screening.result.trustedAdult.calmBridgeYes")}
                onPress={() => router.replace("/(auth)/tools/emotion-map" as any)}
                variant="primary"
                size="lg"
                style={styles.fullButton}
              />
              <Button
                title={t("screening.result.trustedAdult.calmBridgeNo")}
                onPress={() => setSafetyStep("declined")}
                variant="outline"
                size="lg"
                style={styles.fullButton}
              />
            </View>
          </>
        )}

        {safetyStep === "helpline_options" && (
          <>
            <Text style={styles.body}>
              {t("screening.result.trustedAdult.acknowledgedNeedHelp")}
            </Text>
            <View style={styles.actions}>
              <Button
                title={label("call_helpline")}
                onPress={() => onAction("call_helpline")}
                variant="primary"
                size="lg"
                style={styles.fullButton}
              />
              <Button
                title={label("counsellor")}
                onPress={() => onAction("counsellor")}
                variant="outline"
                size="lg"
                style={styles.fullButton}
              />
              <Button
                title={t("screening.result.trustedAdult.calmBridgeYes")}
                onPress={() => router.replace("/(auth)/tools/emotion-map" as any)}
                variant="outline"
                size="lg"
                style={styles.fullButton}
              />
            </View>
          </>
        )}

        {safetyStep === "declined" && (
          <>
            <Text style={styles.body}>
              {t("screening.result.trustedAdult.declined")}
            </Text>
            <View style={styles.actions}>
              <Button
                title={t(ACTION_LABEL_KEYS.home)}
                onPress={() => onAction("home")}
                variant="primary"
                size="lg"
                style={styles.fullButton}
              />
              <Button
                title={t(ACTION_LABEL_KEYS.tools)}
                onPress={() => onAction("tools")}
                variant="outline"
                size="lg"
                style={styles.fullButton}
              />
            </View>
          </>
        )}

        <SafetyFooter onPress={() => onAction("call_helpline")} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading} accessibilityRole="header">{t(view.headingKey)}</Text>
      {view.bodyKeys.map((key) => (
        <Text key={key} style={styles.body}>{t(key, CRISIS_PARAMS)}</Text>
      ))}

      <View style={styles.actions}>
        <Button title={label(view.primary)} onPress={() => onAction(view.primary)} variant="primary" size="lg" style={styles.fullButton} />
        {view.secondary.map((action) => (
          <Button key={action} title={label(action)} onPress={() => onAction(action)} variant="outline" size="lg" style={styles.fullButton} />
        ))}
      </View>

      {view.showSafetyFooter && (
        <SafetyFooter onPress={() => onAction("call_helpline")} />
      )}
    </View>
  );
}

/** A rendering failure shows a calm message and a way home; it never shows an outcome. */
class ResultErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ResultFallback /> : this.props.children;
  }
}

function ResultFallback() {
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <View style={[styles.container, styles.content, { justifyContent: "center" }]}>
      <View style={styles.card}>
        <Text style={styles.statusText}>{t("screening.result.error")}</Text>
        <Button
          title={t(ACTION_LABEL_KEYS.home)}
          onPress={() => router.replace({ pathname: "/(auth)/(tabs)", params: { from: "screening" } } as any)}
          variant="outline"
          size="lg"
          style={styles.fullButton}
        />
        <SafetyFooter onPress={() => Linking.openURL(HELPLINE_DIAL_URL)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.spacing.xl, paddingTop: 72, paddingBottom: 48 },
  eyebrow: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Theme.spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "stretch",
    gap: Theme.spacing.md,
    ...Theme.shadows.tertiary,
  },
  heading: { fontFamily: Theme.fontFamily.bold, fontSize: 22, lineHeight: 30, color: Colors.text },
  body: { fontFamily: Theme.fontFamily.medium, fontSize: 16, lineHeight: 24, color: Colors.text },
  statusText: { fontFamily: Theme.fontFamily.medium, fontSize: 15, lineHeight: 22, color: Colors.textSecondary, textAlign: "center" },
  actions: { gap: Theme.spacing.sm, marginTop: Theme.spacing.sm },
  fullButton: { alignSelf: "stretch" },
  footer: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: Theme.spacing.sm },
  footerText: { flex: 1, fontFamily: Theme.fontFamily.medium, fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
});
