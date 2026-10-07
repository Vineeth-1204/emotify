import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BreathingPlayer } from "@/components/breathing/BreathingPlayer";
import { BREATHING_PROTOCOLS } from "@/constants/BreathingProtocols";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";

export default function BreathingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#F4F3FF", "#E0DBFF"]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.playerCard}>
          <BreathingPlayer
            protocol={BREATHING_PROTOCOLS.box_4444}
            sourceType="companion_quick_action"
            title="A short breathing break"
            subtitle="Follow the gentle rhythm at your own pace."
            themeColor={Colors.primary}
            onClose={() => router.back()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: Theme.spacing.md },
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingVertical: 10, paddingRight: 12 },
  backText: { color: Colors.text, fontFamily: Theme.fontFamily.bold, fontSize: Theme.fontSize.sm },
  playerCard: {
    flex: 1,
    minHeight: 420,
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.md,
    ...Theme.shadows.secondary,
  },
});
