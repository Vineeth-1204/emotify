import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useDictationField, type Dictation } from "@/hooks/useDictation";

interface DictationButtonProps {
  dictation: Dictation;
  /** Unique per input on the screen. */
  field: string;
  value: string;
  onChangeText: (text: string) => void;
  /** "icon": round button for chat bars; "pill": small "Speak" control under a text area. */
  variant?: "icon" | "pill";
  style?: StyleProp<ViewStyle>;
}

/** Microphone control for a free-text input. The input itself is unchanged and stays editable. */
export function DictationButton({ dictation, field, value, onChangeText, variant = "pill", style }: DictationButtonProps) {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const { isListening, toggle } = useDictationField(dictation, field, value, onChangeText);
  const label = isListening ? t("dictation.stop") : t("dictation.start");

  if (variant === "icon") {
    return (
      <Pressable
        onPress={toggle}
        hitSlop={6}
        style={[
          styles.icon,
          {
            backgroundColor: isListening ? colors.error : colors.background,
            borderColor: isListening ? colors.error : colors.border || "rgba(0,0,0,0.08)",
          },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isListening }}
      >
        <Ionicons name={isListening ? "mic" : "mic-outline"} size={18} color={isListening ? "#FFFFFF" : colors.primary} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.pillRow, style]}>
      <Pressable
        onPress={toggle}
        hitSlop={6}
        style={[styles.pill, { backgroundColor: isListening ? colors.error : colors.primary + "12" }]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isListening }}
      >
        <Ionicons name={isListening ? "stop-circle" : "mic-outline"} size={15} color={isListening ? "#FFFFFF" : colors.primary} />
        <Text style={[styles.pillText, { color: isListening ? "#FFFFFF" : colors.primary }]}>
          {isListening ? t("dictation.listening") : t("dictation.speak")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillText: { fontSize: 13, fontWeight: "600" },
});
