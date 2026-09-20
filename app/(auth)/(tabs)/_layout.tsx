import React, { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { useThemeColors } from "@/context/MoodThemeContext";
import { Theme } from "@/constants/Theme";
import { Ionicons } from "@expo/vector-icons";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { View, Text, StyleSheet, Linking, Alert, Platform, TouchableOpacity } from "react-native";
import { Button } from "@/components/ui/Button";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ShieldSafetyIcon } from "@/components/svg/system";

export default function TabLayout() {
  const { user, logout } = useAppAuth();
  const router = useRouter();
  const [dismissedEmergency, setDismissedEmergency] = useState(false);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const appUser = useQuery(api.users.getByClerkId, user?.id ? {
    clerkId: user.id,
  } : "skip");

  const latestTriage = useQuery(api.triage.getLatest, user?.id ? {
    userId: user.id,
  } : "skip");

  const createAlert = useMutation(api.alerts.createAlert);

  React.useEffect(() => {
    if (latestTriage?.level === "force_retest") {
      router.replace("/(auth)/screening");
    }
  }, [latestTriage?.level]);

  const isEmergency = latestTriage?.level === "suicide_flag" && !dismissedEmergency;

  const handleTalkToCounselor = async () => {
    if (!user) return;
    await createAlert({ userId: user.id, type: "counselor_request" });
    Alert.alert("Request Sent", "A counselor has been notified and will reach out to you shortly.");
  };

  if (isEmergency) {
    return (
      <View style={[styles.container, { padding: Theme.spacing.xl, paddingTop: 80, backgroundColor: colors.white }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setDismissedEmergency(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <ShieldSafetyIcon size={64} color={colors.error} />
        </View>
        <Text style={[styles.emergencyTitle, { color: colors.error, textAlign: 'center' }]}>Safety Priority</Text>
        <Text style={[styles.emergencyText, { color: colors.text, textAlign: 'center', marginVertical: Theme.spacing.xl, fontSize: 18 }]}>
          We're concerned for your safety. If you're in danger now, please call emergency services immediately.
        </Text>
        
        <View style={{ gap: Theme.spacing.md }}>
          <Button 
            title="Call Emergency Services" 
            onPress={() => Linking.openURL('tel:911')} 
            variant="danger" 
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
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 10 }}>Or try a grounding exercise:</Text>
          <Button 
            title="Listen to Relaxation Audio" 
            onPress={() => router.push("/(auth)/tools/jpmr")} 
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
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          href: isScreeningComplete ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "apps" : "apps-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          href: isScreeningComplete ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
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
