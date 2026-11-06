import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated, ViewStyle, TextStyle } from "react-native";
import { useRouter } from "expo-router";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAvatar } from "@/context/AvatarContext";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { EmotyAvatar } from "@/components/avatar/EmotyAvatar";
import { MindfulnessActivityIcon, MuscleRelaxActivityIcon, JournalActivityIcon, HabitMicrogoalIcon, GroundingIcon } from "@/components/svg/activities";
import { CounsellorBadgeIcon } from "@/components/svg/system";

const { width } = Dimensions.get('window');

function ToolHubCard({
  tool,
  colors,
  styles,
  onPress
}: {
  tool: any;
  colors: any;
  styles: any;
  onPress: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 100,
      friction: 6
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 6
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%', marginBottom: 12 }}>
      <TouchableOpacity
        style={[styles.glassCard, { borderColor: tool.color + '20', borderWidth: 1.5 }]}
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        <View style={[styles.iconBox, { backgroundColor: tool.color + '12' }]}>
          {tool.renderIcon ? tool.renderIcon(tool.color) : <Ionicons name="apps-outline" size={24} color={tool.color} />}
        </View>
        <View style={styles.textContainer}>
          <View style={styles.toolTitleRow}>
            <Text style={styles.toolTitle} numberOfLines={1}>
              {tool.title}
            </Text>
            <View style={[styles.tagMini, { backgroundColor: tool.color + '18', borderColor: tool.color + '30' }]}>
              <Text style={[styles.tagMiniText, { color: tool.color }]}>{tool.categoryText}</Text>
            </View>
          </View>
          <Text style={styles.toolDesc} numberOfLines={2}>
            {tool.description}
          </Text>
        </View>
        <View style={[styles.arrowBox, { backgroundColor: tool.color + '10' }]}>
          <Ionicons name="chevron-forward" size={14} color={tool.color} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToolsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory);
  const { t } = useLanguage();
  const { avatarName } = useAvatar();
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const categories = [
    { id: 'all', label: t('tools.catAll'), icon: 'apps-outline' },
    { id: 'mindfulness', label: t('tools.catMindfulness'), icon: 'leaf-outline' },
    { id: 'relaxation', label: t('tools.catRelaxation'), icon: 'water-outline' },
    { id: 'cognitive', label: t('tools.catCognitive'), icon: 'bulb-outline' },
    { id: 'habits', label: t('tools.catHabits'), icon: 'ribbon-outline' },
    { id: 'sessions', label: t('tools.catSessions'), icon: 'people-outline' },
  ];

  const tools = [
    {
      id: "emotion-map",
      title: t("tools.howImFeelingTitle"),
      description: t("tools.howImFeelingDesc"),
      renderIcon: (color: string) => <MindfulnessActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/emotion-map" as const,
      color: colors.primary,
      category: "mindfulness",
      categoryText: t("tools.howImFeelingTag"),
    },
    {
      id: "companion",
      title: t("tools.companionNameTitle", { companionName: avatarName }),
      description: t("tools.companionNameDesc", { companionName: avatarName }),
      renderIcon: () => <EmotyAvatar state="neutral" size="sm" />,
      route: "/(auth)/tools/companion" as const,
      color: colors.primary,
      category: "mindfulness",
      categoryText: t("tools.companionTag"),
    },
    {
      id: "morning-affirmation",
      title: t("tools.morningAffirmationTitle"),
      description: t("tools.morningAffirmationDesc"),
      renderIcon: (color: string) => <Ionicons name="sunny-outline" size={26} color={color} />,
      route: "/(auth)/tools/morning-affirmation" as const,
      color: "#F59E0B",
      category: "mindfulness",
      categoryText: t("tools.morningAffirmationTag"),
    },
    {
      id: "evening-gratitude",
      title: t("tools.eveningGratitudeTitle"),
      description: t("tools.eveningGratitudeDesc"),
      renderIcon: (color: string) => <Ionicons name="moon-outline" size={26} color={color} />,
      route: "/(auth)/tools/evening-gratitude" as const,
      color: "#6366F1",
      category: "mindfulness",
      categoryText: t("tools.eveningGratitudeTag"),
    },
    {
      id: "jpmr",
      title: t("tools.jpmrTitle"),
      description: t("tools.jpmrDesc"),
      renderIcon: (color: string) => <MuscleRelaxActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/jpmr" as const,
      color: colors.secondary,
      category: "relaxation",
      categoryText: t("tools.jpmrTag"),
    },
    {
      id: "grounding",
      title: t("tools.groundingTitle"),
      description: t("tools.groundingDesc"),
      renderIcon: (color: string) => <GroundingIcon size={26} color={color} />,
      route: "/(auth)/tools/grounding" as const,
      color: "#16A34A",
      category: "mindfulness",
      categoryText: t("tools.groundingTag"),
    },
    {
      id: "reframe",
      title: t("tools.reframeTitle"),
      description: t("tools.reframeDesc"),
      renderIcon: (color: string) => <JournalActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/reframe" as const,
      color: colors.accent || "#FFB6C1",
      category: "cognitive",
      categoryText: t("tools.reframeTag"),
    },
    {
      id: "microgoals",
      title: t("tools.microgoalsTitle"),
      description: t("tools.microgoalsDesc"),
      renderIcon: (color: string) => <HabitMicrogoalIcon size={26} color={color} />,
      route: "/(auth)/tools/microgoals" as const,
      color: colors.warning || "#F59E0B",
      category: "habits",
      categoryText: t("tools.microgoalsTag"),
    },
    {
      id: "appointments",
      title: t("tools.appointmentsTitle"),
      description: t("tools.appointmentsDesc"),
      renderIcon: (color: string) => <CounsellorBadgeIcon size={26} color={color} />,
      route: "/(auth)/tools/appointments" as const,
      color: colors.success || "#10b981",
      category: "sessions",
      categoryText: t("tools.appointmentsTag"),
    },
  ];

  const filteredTools = tools.filter(
    tool => selectedCategory === 'all' || tool.category === selectedCategory
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 160 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("tools.title")}</Text>
          <Text style={styles.subtitle}>{t("tools.subtitle")}</Text>
        </View>

        {/* Categories Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
          style={styles.categoryScrollContainer}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                style={[
                  styles.categoryTab,
                  isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isSelected ? '#FFFFFF' : colors.textSecondary}
                />
                <Text style={[
                  styles.categoryText,
                  isSelected && { color: '#FFFFFF', fontFamily: Theme.fontFamily.bold }
                ]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Tools List */}
        <View style={styles.list}>
          {filteredTools.map((tool) => (
            <ToolHubCard
              key={tool.id}
              tool={tool}
              colors={colors}
              styles={styles}
              onPress={() => router.push(tool.route as any)}
            />
          ))}
          {filteredTools.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 16 }} />
              <Text style={styles.emptyText}>{t("tools.emptyCategory")}</Text>
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function stylesFactory(colors: any) {
  return {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  } as ViewStyle,
  content: {
    padding: Theme.spacing.lg,
    paddingTop: 60,
  } as ViewStyle,
  header: {
    marginBottom: Theme.spacing.lg,
  } as ViewStyle,
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 28,
    color: colors.text,
    marginBottom: 4,
  } as TextStyle,
  subtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    color: colors.textSecondary,
  } as TextStyle,
  categoryScrollContainer: {
    marginBottom: Theme.spacing.lg,
    maxHeight: 45,
  } as ViewStyle,
  categoryScroll: {
    paddingVertical: 2,
    gap: 8,
    paddingRight: 16,
  } as ViewStyle,
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  categoryText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  } as TextStyle,
  list: {
    marginTop: 4,
  } as ViewStyle,
  glassCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  } as ViewStyle,
  emoji: {
    fontSize: 22,
  } as TextStyle,
  textContainer: {
    flex: 1,
  } as ViewStyle,
  toolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  } as ViewStyle,
  toolTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15.5,
    color: colors.text,
    flexShrink: 1,
  } as TextStyle,
  tagMini: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  } as ViewStyle,
  tagMiniText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9.5,
    letterSpacing: 0.1,
  } as TextStyle,
  toolDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16.5,
  } as TextStyle,
  arrowBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  } as ViewStyle,
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  emptyText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  } as TextStyle,
  };
}
