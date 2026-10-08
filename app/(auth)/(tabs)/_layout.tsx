import React, { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { useThemeColors } from "@/context/MoodThemeContext";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { View, Text, StyleSheet, Linking, Alert, Platform, TouchableOpacity } from "react-native";
import { Button } from "@/components/ui/Button";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmotyPresence } from "@/components/avatar/EmotyPresence";
import { getEmotyPresence } from "@/common/emotyPresence";

import { useLanguage } from "@/context/LanguageContext";
import { CRISIS_RESOURCES, HELPLINE_DIAL_URL, EMERGENCY_DIAL_URL } from "@/common/crisisResources";

export default function TabLayout() {
  const { user, isAuthenticated, logout } = useAppAuth();
  const { isAuthenticated: isConvexAuthed } = useConvexAuth();
  const isReady = Boolean(isAuthenticated && isConvexAuthed && user?.id);

  const router = useRouter();
  const [dismissedEmergency, setDismissedEmergency] = useState(false);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useLanguage();

  const appUser = useQuery(api.users.getByClerkId, isReady ? {
    clerkId: user!.id,
  } : "skip");

  const latestTriage = useQuery(api.triage.getLatest, isReady ? {
    userId: user!.id,
  } : "skip");

  const createCounsellorRequest = useMutation(api.counsellorRequests.create);
  const recordEmergencyDismissal = useMutation(api.alerts.recordEmergencyScreenDismissal);

  React.useEffect(() => {
    if (latestTriage?.level === "force_retest") {
      router.replace("/(auth)/screening");
    }
  }, [latestTriage?.level]);

  const isEmergency = latestTriage?.level === "suicide_flag" && !dismissedEmergency;

  const handleTalkToCounselor = async () => {
    if (!user) return;
    try {
      // Canonical counselor request record (server notifies staff)
      await createCounsellorRequest({
        sourceType: "emergency_modal",
        triageId: latestTriage?._id ? (latestTriage._id as any) : undefined,
        situation_text: "Student requested immediate counselor contact from emergency modal",
      });

      Alert.alert("Request Sent", "A counselor has been notified and will reach out to you shortly.");
    } catch (err: any) {
      Alert.alert("Request Error", err.message || "Failed to submit request.");
    }
  };

  if (isEmergency) {
    // Safety screen keeps the base palette; the decorative mood theme never applies here.
    const safetyColors = Colors;
    return (
      <View style={[styles.container, { padding: Theme.spacing.xl, paddingTop: 80, backgroundColor: safetyColors.white }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            setDismissedEmergency(true);
            // Counsellors can see that the student closed the safety screen.
            recordEmergencyDismissal({}).catch((err) => console.warn("Failed to record dismissal:", err));
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={28} color={safetyColors.textSecondary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <EmotyPresence presence={getEmotyPresence({ scene: "safety" })} layout="stacked" size="md" />
        </View>
        <Text style={[styles.emergencyTitle, { color: safetyColors.error, textAlign: 'center' }]}>Safety Priority</Text>
        <Text style={[styles.emergencyText, { color: safetyColors.text, textAlign: 'center', marginVertical: Theme.spacing.xl, fontSize: 18 }]}>
          We're concerned for your safety. If you're in danger now, please call emergency services immediately.
        </Text>
        
        <View style={{ gap: Theme.spacing.md }}>
          <Button 
            title={`Call Emergency Services (${CRISIS_RESOURCES.emergencyNumber})`} 
            onPress={() => Linking.openURL(EMERGENCY_DIAL_URL)} 
            variant="danger" 
            size="lg" 
          />
          <Button 
            title={`Call ${CRISIS_RESOURCES.helplineName} (${CRISIS_RESOURCES.helplineNumber})`} 
            onPress={() => Linking.openURL(HELPLINE_DIAL_URL)} 
            variant="outline" 
            size="lg" 
          />
          {appUser?.emergencyContactPhone && (
            <Button 
              title={`Call ${appUser.emergencyContactName || 'Emergency Contact'}`} 
              onPress={() => Linking.openURL(`tel:${appUser.emergencyContactPhone}`)} 
              variant="outline" 
              size="lg" 
            />
          )}
          <Button 
            title="Talk to Counsellor Now" 
            onPress={handleTalkToCounselor} 
            variant="outline" 
            size="lg" 
          />
          <View style={{ height: 40 }} />
          <Text style={{ color: safetyColors.textSecondary, textAlign: 'center', marginBottom: 10 }}>Or try a grounding exercise:</Text>
          <Button 
            title="5-4-3-2-1 Sensory Grounding" 
            onPress={() => router.push({
              pathname: "/(auth)/tools/grounding",
              params: {
                sourceType: "crisis_blocker",
                triageId: latestTriage?._id ? (latestTriage._id as string) : undefined,
              }
            } as any)} 
            size="lg" 
          />
        </View>
      </View>
    );
  }

  const isScreeningComplete = (!!appUser?.screeningComplete) && latestTriage?.level !== "force_retest";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: insets.bottom > 0 ? insets.bottom + 8 : 20,
          }
        ],
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.95)' }]} />
          )
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: t("nav.tools"),
          href: isScreeningComplete ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "apps" : "apps-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t("nav.insights"),
          href: isScreeningComplete ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("nav.profile"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    ...Theme.shadows.tertiary,
    elevation: 8,
    overflow: 'hidden',
  },
  tabBarLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
    marginTop: 4,
  },
  emergencyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xxl,
  },
  emergencyText: {
    fontFamily: Theme.fontFamily.medium,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 8,
    zIndex: 10,
  }
});
