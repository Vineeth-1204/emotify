/**
 * Standalone Sensory Grounding Screen
 * Priority 9 Step 5B — Standalone 5-4-3-2-1 Tool Route
 *
 * Accessible directly from the Tools Hub, Emotion Map, and Crisis Blocker.
 * Launches the canonical SensoryGroundingPlayer in interactive mode.
 */

import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { SensoryGroundingPlayer } from "@/components/grounding/SensoryGroundingPlayer";
import { SENSORY_54321_PROTOCOL } from "@/constants/GroundingProtocols";

export default function GroundingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    sourceType?: string;
    attemptId?: string;
    triageId?: string;
  }>();

  // Enforce provenance safety: default to self_initiated if not explicitly provided
  const sourceType = params.sourceType ?? "self_initiated";
  // Self-initiated sessions must NEVER fabricate attemptId/triageId
  const attemptId = sourceType === "self_initiated" ? undefined : (params.attemptId as any);
  const triageId = sourceType === "self_initiated" ? undefined : (params.triageId as any);

  const handleReturn = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/(tabs)/tools");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#F0FDF4", "#DCFCE7", "#F8FAFC"]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SensoryGroundingPlayer
          protocol={SENSORY_54321_PROTOCOL}
          mode="interactive"
          sourceType={sourceType}
          attemptId={attemptId}
          triageId={triageId}
          onClose={handleReturn}
          onComplete={(_logId) => {
            // Player shows completion screen with a Return button
          }}
          themeColor="#16A34A"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0FDF4",
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
    justifyContent: "center",
  },
});
