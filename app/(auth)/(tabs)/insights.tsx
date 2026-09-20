import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, ViewStyle, TextStyle } from "react-native";
import { useAppAuth } from "@/utils/auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThemeColors, useStyles } from "@/context/MoodThemeContext";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-chart-kit";

const { width } = Dimensions.get('window');

export default function InsightsScreen() {
  const { user } = useAppAuth();
  const colors = useThemeColors();
  const styles = useStyles(stylesFactory);

  const stats = useQuery(api.insights.getDailyStats, {
    userId: user?.id ?? "",
  });

  if (stats === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Data prep for charts
  const rawEmotions = [...stats.emotionLogs].sort((a, b) => a.createdAt - b.createdAt).slice(-7);
  const emotionLabels = rawEmotions.length > 0 ? rawEmotions.map((log: any) => new Date(log.createdAt).toLocaleDateString(undefined, { weekday: 'short' })) : ["-"];
  const emotionData = rawEmotions.length > 0 ? rawEmotions.map((log: any) => log.preIntensity || 0) : [0];

  const chartConfig = {
    backgroundGradientFrom: colors.white,
    backgroundGradientTo: colors.white,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${parseInt(colors.primary.slice(1, 3), 16)}, ${parseInt(colors.primary.slice(3, 5), 16)}, ${parseInt(colors.primary.slice(5, 7), 16)}, ${opacity})`,
    labelColor: (opacity = 1) => colors.textSecondary,
    strokeWidth: 3,
    propsForDots: {
      r: "5",
      strokeWidth: "2.5",
      stroke: colors.white
    },
    propsForBackgroundLines: {
      strokeDasharray: "4, 4",
      stroke: "rgba(0,0,0,0.03)"
    },
    fillShadowGradient: colors.primary,
    fillShadowGradientOpacity: 0.15,
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient as any}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Your Journey</Text>
          <Text style={styles.subtitle}>Tracking your path to emotional balance.</Text>
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
                <Text style={styles.summaryValue}>{stats.totalCalmPoints}</Text>
                <Text style={styles.summaryLabel}>CALM POINTS</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <View style={styles.summaryIconCircle}>
                  <Ionicons name="trophy" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.summaryValue}>{stats.completedGoalsCount}</Text>
                <Text style={styles.summaryLabel}>GOALS MET</Text>
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
            You’ve logged mood checks consistently. Keep taking small steps.
          </Text>
        </View>



        {/* Mood Trend Chart */}
        <Text style={styles.sectionTitle}>Mood Trend</Text>
        <Text style={styles.sectionSubtitle}>Intensity tracking over recent check-ins</Text>
        <View style={styles.chartCard}>
          <LineChart
            data={{
              labels: emotionLabels,
              datasets: [{
                data: emotionData,
                color: (opacity = 1) => colors.primary,
                strokeWidth: 4
              }]
            }}
            width={width - Theme.spacing.lg * 2 - 32}
            height={190}
            chartConfig={chartConfig}
            bezier
            withHorizontalLines={true}
            withVerticalLines={false}
            withDots={true}
            withInnerLines={false}
            withOuterLines={false}
            style={styles.chart}
          />
        </View>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Activity Stats</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="chatbubble-outline" color={colors.primary} value={stats.totalCheckins} label="CHECK-INS" styles={styles} />
          <StatCard icon="leaf-outline" color={colors.accent || "#FFB6C1"} value={stats.reframesCount} label="REFRAMES" styles={styles} />
          <StatCard icon="time-outline" color={colors.secondary} value={`${stats.jpmrMinutes}m`} label="RELAXATION" styles={styles} />
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
  // Chart styles
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: 14,
    paddingRight: 20,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
    ...Theme.shadows.tertiary,
  } as ViewStyle,
  chart: {
    borderRadius: Theme.borderRadius.lg,
    marginLeft: -10,
  } as ViewStyle,
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
  };
}

