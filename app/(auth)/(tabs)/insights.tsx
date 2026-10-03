import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { useAppAuth } from "@/utils/auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getLocalDateString, parseLocalDateNoon } from "@/utils/date";

function getMoodVisual(mood: string | null | undefined) {
  switch (mood?.toLowerCase()) {
    case "good":
    case "happy":
      return { emoji: "☀️", label: "Good", color: "#10B981", bg: "rgba(16, 185, 129, 0.12)" };
    case "calm":
    case "relaxed":
      return { emoji: "🌿", label: "Calm", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.12)" };
    case "low":
    case "sad":
      return { emoji: "🌧️", label: "Low", color: "#6366F1", bg: "rgba(99, 102, 241, 0.12)" };
    case "heavy":
    case "worried":
      return { emoji: "⛈️", label: "Heavy", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.12)" };
    default:
      return { emoji: "—", label: "—", color: "#9CA3AF", bg: "rgba(156, 163, 175, 0.08)" };
  }
}

export default function InsightsScreen() {
  const { user } = useAppAuth();
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory);
  const { t } = useLanguage();

  const todayStr = getLocalDateString();
  const stats = useQuery(
    api.insights.getDailyStats,
    user?.id
      ? {
          userId: user.id,
          referenceDate: todayStr,
        }
      : "skip"
  );

  if (stats === undefined || stats === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Strict 7-calendar-day daily mood history
  const dailyMoodEntries = Array.isArray(stats.recentDailyMood) ? stats.recentDailyMood : [];
  const hasCheckins = dailyMoodEntries.some((entry: any) => Boolean(entry?.hasCheckin));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("insights.title")}</Text>
          <Text style={styles.subtitle}>{t("insights.subtitle")}</Text>
        </View>

        {/* Highlight Summary Card */}
        <View style={styles.summaryContainer}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <View style={styles.summaryIconCircle}>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.summaryValue}>{stats.totalCalmPoints ?? 0}</Text>
                <Text style={styles.summaryLabel}>{t("insights.calmPoints")}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <View style={styles.summaryIconCircle}>
                  <Ionicons name="trophy" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.summaryValue}>{stats.completedGoalsCount ?? 0}</Text>
                <Text style={styles.summaryLabel}>{t("insights.goalsMet")}</Text>
              </View>
            </View>
          </LinearGradient>
          <View style={[styles.heroGlow, { backgroundColor: colors.primary }]} />
        </View>

        {/* Weekly Progress Banner */}
        <View style={styles.improvementCard}>
          <View style={[styles.improvementIcon, { backgroundColor: colors.success + '12' }]}>
            <Ionicons name="trending-up-outline" size={18} color={colors.success} />
          </View>
          <Text style={styles.improvementText}>
            {hasCheckins ? t("insights.weeklyProgressNote") : t("insights.subtitle")}
          </Text>
        </View>

        {/* Discrete 7-Day Mood Calendar */}
        <Text style={styles.sectionTitle}>{t("insights.moodTrendTitle")}</Text>
        <Text style={styles.sectionSubtitle}>{t("insights.moodTrendSubtitle")}</Text>
        <View style={styles.chartCard}>
          {hasCheckins ? (
            <View style={styles.calendarContainer}>
              <View style={styles.calendarGrid}>
                {dailyMoodEntries.map((entry: any, index: number) => {
                  const visual = getMoodVisual(entry?.hasCheckin ? entry.mood : null);
                  const dateStr = typeof entry?.dateStr === "string" ? entry.dateStr : "";
                  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
                  const parsedDate = isValidDate ? parseLocalDateNoon(dateStr) : null;
                  const dayNum = parsedDate && !isNaN(parsedDate.getDate()) ? parsedDate.getDate() : "—";
                  return (
                    <View
                      key={entry?.dateStr || entry?._id || index}
                      style={[
                        styles.calendarDayCard,
                        entry?.hasCheckin && styles.calendarDayCardActive,
                      ]}
                    >
                      <Text style={styles.calendarDayWeekday}>{entry?.label || "—"}</Text>
                      <Text style={styles.calendarDayNum}>{dayNum}</Text>
                      <View style={[styles.calendarMoodBadge, { backgroundColor: visual.bg }]}>
                        <Text style={styles.calendarMoodEmoji}>{visual.emoji}</Text>
                        <Text style={[styles.calendarMoodLabel, { color: visual.color }]}>
                          {visual.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyChartContainer}>
              <Ionicons name="calendar-outline" size={28} color={colors.textSecondary} />
              <Text style={styles.emptyChartText}>{t("insights.moodTrendTitle")}</Text>
              <Text style={styles.emptyChartSubtext}>{t("insights.moodTrendSubtitle")}</Text>
            </View>
          )}
        </View>

        {/* Activity Summary Stats */}
        <Text style={styles.sectionTitle}>{t("insights.activityStatsTitle")}</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="chatbubble-outline" color={colors.primary} value={stats.totalCheckins ?? 0} label={t("insights.checkins")} styles={styles} />
          <StatCard icon="leaf-outline" color={colors.accent || "#FFB6C1"} value={stats.reframesCount ?? 0} label={t("insights.reframes")} styles={styles} />
          <StatCard icon="time-outline" color={colors.secondary} value={`${stats.mindfulRelaxation?.totalMinutes ?? stats.jpmrMinutes ?? 0}m`} label={t("insights.relaxation")} styles={styles} />
        </View>

        {/* Mindful Relaxation Telemetry */}
        <Text style={[styles.sectionTitle, { marginTop: Theme.spacing.xl }]}>Mindful Relaxation</Text>
        <Text style={styles.sectionSubtitle}>Guided somatic practice & calming routines</Text>
        <View style={styles.relaxationCard}>
          <View style={styles.relaxationHeaderRow}>
            <View style={[styles.statIconBox, { backgroundColor: colors.secondary + '18' }]}>
              <Ionicons name="flower-outline" size={20} color={colors.secondary} />
            </View>
            <View style={styles.relaxationHeaderTexts}>
              <Text style={styles.relaxationTotalMinutes}>
                {stats.mindfulRelaxation?.totalMinutes ?? stats.jpmrMinutes ?? 0} mins
              </Text>
              <Text style={styles.relaxationTotalSessions}>
                {stats.mindfulRelaxation?.totalSessions ?? stats.jpmrSessions ?? 0} sessions completed
              </Text>
            </View>
          </View>

          <View style={styles.breakdownDivider} />

          <View style={styles.breakdownGrid}>
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Ionicons name="fitness-outline" size={14} color={colors.primary} />
                <Text style={styles.breakdownLabel}>Breathing</Text>
              </View>
              <Text style={styles.breakdownValue}>
                {stats.mindfulRelaxation?.breakdown?.breathing?.sessionsCompleted ?? 0}
              </Text>
              <Text style={styles.breakdownSubValue}>
                {stats.mindfulRelaxation?.breakdown?.breathing?.minutes ?? 0}m total
              </Text>
            </View>

            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Ionicons name="hand-left-outline" size={14} color="#8B5CF6" />
                <Text style={styles.breakdownLabel}>Grounding</Text>
              </View>
              <Text style={styles.breakdownValue}>
                {stats.mindfulRelaxation?.breakdown?.grounding?.sessionsCompleted ?? 0}
              </Text>
              <Text style={styles.breakdownSubValue}>
                {stats.mindfulRelaxation?.breakdown?.grounding?.minutes ?? 0}m total
              </Text>
            </View>

            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Ionicons name="body-outline" size={14} color={colors.secondary} />
                <Text style={styles.breakdownLabel}>JPMR</Text>
              </View>
              <Text style={styles.breakdownValue}>
                {stats.mindfulRelaxation?.breakdown?.jpmr?.sessionsCompleted ?? stats.jpmrSessions ?? 0}
              </Text>
              <Text style={styles.breakdownSubValue}>
                {stats.mindfulRelaxation?.breakdown?.jpmr?.minutes ?? stats.jpmrMinutes ?? 0}m total
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, color, value, label, styles }: any) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function stylesFactory(colors: any) {
  return {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  } as ViewStyle,
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
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
  summaryContainer: {
    marginBottom: Theme.spacing.md,
    position: 'relative',
  } as ViewStyle,
  summaryCard: {
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.primary,
    zIndex: 1,
  } as ViewStyle,
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  } as ViewStyle,
  summaryItem: {
    alignItems: 'center',
  } as ViewStyle,
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  summaryValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 30,
    color: colors.white,
    marginBottom: 2,
  } as TextStyle,
  summaryLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.5,
  } as TextStyle,
  summaryDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
  } as ViewStyle,
  heroGlow: {
    position: 'absolute',
    bottom: -8,
    left: '15%',
    width: '70%',
    height: 20,
    opacity: 0.12,
    borderRadius: 20,
  } as ViewStyle,
  improvementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
    ...Theme.shadows.tertiary,
    gap: 10,
  } as ViewStyle,
  improvementIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  improvementText: {
    flex: 1,
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  } as TextStyle,
  sectionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: colors.text,
    marginTop: 8,
  } as TextStyle,
  sectionSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: Theme.spacing.md,
  } as TextStyle,
  // 7-Day Discrete Mood Card
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: 12,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  calendarContainer: {
    paddingVertical: 2,
  } as ViewStyle,
  calendarGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  } as ViewStyle,
  calendarDayCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  } as ViewStyle,
  calendarDayCardActive: {
    backgroundColor: colors.white,
    borderColor: "rgba(0,0,0,0.06)",
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  calendarDayWeekday: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 9,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 2,
  } as TextStyle,
  calendarDayNum: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  } as TextStyle,
  calendarMoodBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRadius: 6,
    width: "100%",
    minHeight: 36,
  } as ViewStyle,
  calendarMoodEmoji: {
    fontSize: 13,
    marginBottom: 1,
  } as TextStyle,
  calendarMoodLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 8,
    textTransform: "capitalize",
  } as TextStyle,
  emptyChartContainer: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
  } as ViewStyle,
  emptyChartText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  } as TextStyle,
  emptyChartSubtext: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  } as TextStyle,
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  } as ViewStyle,
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.lg,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  statNumber: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  } as TextStyle,
  statLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  } as TextStyle,
  // Relaxation Card Styles
  relaxationCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.02)",
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  relaxationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as ViewStyle,
  relaxationHeaderTexts: {
    flex: 1,
  } as ViewStyle,
  relaxationTotalMinutes: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 20,
    color: colors.text,
  } as TextStyle,
  relaxationTotalSessions: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  breakdownDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.05)",
    marginVertical: Theme.spacing.md,
  } as ViewStyle,
  breakdownGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  } as ViewStyle,
  breakdownItem: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: Theme.borderRadius.md,
    padding: 10,
    alignItems: "center",
  } as ViewStyle,
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  } as ViewStyle,
  breakdownLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  } as TextStyle,
  breakdownValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: colors.text,
  } as TextStyle,
  breakdownSubValue: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  } as TextStyle,
  };
}

