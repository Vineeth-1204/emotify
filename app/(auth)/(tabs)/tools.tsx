import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated, ViewStyle, TextStyle } from "react-native";
import { useRouter } from "expo-router";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";
import { MindfulnessActivityIcon, MuscleRelaxActivityIcon, JournalActivityIcon, HabitMicrogoalIcon } from "@/components/svg/activities";
import { CounsellorBadgeIcon } from "@/components/svg/system";

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'mindfulness', label: 'Mindfulness', icon: 'leaf-outline' },
  { id: 'relaxation', label: 'Relaxation', icon: 'water-outline' },
  { id: 'cognitive', label: 'Cognitive', icon: 'bulb-outline' },
  { id: 'habits', label: 'Habits', icon: 'ribbon-outline' },
  { id: 'sessions', label: 'Sessions', icon: 'people-outline' },
];

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <View style={[styles.tagMini, { backgroundColor: tool.color + '10' }]}>
              <Text style={[styles.tagMiniText, { color: tool.color }]}>{tool.categoryText}</Text>
            </View>
          </View>
          <Text style={styles.toolDesc}>{tool.description}</Text>
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
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const tools = [
    {
      id: "emotion-map",
      title: "Emotion Map",
      description: "Map your feelings to body regions.",
      renderIcon: (color: string) => <MindfulnessActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/emotion-map" as const,
      color: colors.primary,
      category: "mindfulness",
      categoryText: "Body Scan",
    },
    {
      id: "companion",
      title: "AI Companion",
      description: "Chat with your supportive AI companion.",
      renderIcon: () => <MitraAvatar state="neutral" size="sm" />,
      route: "/(auth)/tools/companion" as const,
      color: colors.primary,
      category: "mindfulness",
      categoryText: "Support",
    },
    {
      id: "jpmr",
      title: "Relax Now",
      description: "Guided deep physical relaxation.",
      renderIcon: (color: string) => <MuscleRelaxActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/jpmr" as const,
      color: colors.secondary,
      category: "relaxation",
      categoryText: "Breathing",
    },
    {
      id: "reframe",
      title: "Reframe",
      description: "Balance negative thinking patterns.",
      renderIcon: (color: string) => <JournalActivityIcon size={26} color={color} />,
      route: "/(auth)/tools/reframe" as const,
      color: colors.accent || "#FFB6C1",
      category: "cognitive",
      categoryText: "CBT",
    },
    {
      id: "microgoals",
      title: "MicroGoals",
      description: "Daily habits for small wins.",
      renderIcon: (color: string) => <HabitMicrogoalIcon size={26} color={color} />,
      route: "/(auth)/tools/microgoals" as const,
      color: colors.warning || "#F59E0B",
      category: "habits",
      categoryText: "Habits",
    },
    {
      id: "appointments",
      title: "Appointments",
      description: "Manage clinical sessions and requests.",
      renderIcon: (color: string) => <CounsellorBadgeIcon size={26} color={color} />,
      route: "/(auth)/tools/appointments" as const,
      color: colors.success || "#10b981",
      category: "sessions",
      categoryText: "Consult",
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Therapy Hub</Text>
          <Text style={styles.subtitle}>Curated tools for your mental resilience.</Text>
        </View>

        {/* Categories Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
          style={styles.categoryScrollContainer}
        >
          {CATEGORIES.map((cat) => {
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
              onPress={() => router.push(tool.route)}
            />
          ))}
          {filteredTools.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 16 }} />
              <Text style={styles.emptyText}>No tools in this category yet</Text>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
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
  toolTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: colors.text,
  } as TextStyle,
  tagMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  } as ViewStyle,
  tagMiniText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 9,
  } as TextStyle,
  toolDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
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

