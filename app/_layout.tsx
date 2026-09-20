import { Slot, useRouter, useSegments } from "expo-router";
import { ConvexProviderWithAuth, ConvexReactClient, useQuery } from "convex/react";
import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAppAuth } from "@/utils/auth";
import { api } from "@/convex/_generated/api";
import { MoodThemeProvider } from "@/context/MoodThemeContext";
import { AvatarProvider } from "@/context/AvatarContext";

SplashScreen.preventAutoHideAsync();

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing EXPO_PUBLIC_CONVEX_URL in .env.local");
}

const convex = new ConvexReactClient(convexUrl);

function InitialLayout() {
  const { isAuthenticated, token, logout, isLoading: authLoading, isLoggingOut } = useAppAuth();
  const segments = useSegments();
  const router = useRouter();

  // Active session monitoring
  const isSessionActive = useQuery(
    api.users.checkSessionActive,
    isAuthenticated && token ? { token } : "skip"
  );

  useEffect(() => {
    if (isAuthenticated && isSessionActive === false) {
      logout();
    }
  }, [isAuthenticated, isSessionActive, logout]);

  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (authLoading || !fontsLoaded) return;

    const inPublicGroup = (segments as string[]).includes("(public)");
    const inAuthGroup = (segments as string[]).includes("(auth)");

    // Never redirect while logging out — prevents the loop where
    // navigation commits to /(public)/login before isAuthenticated flips to false
    if (!isLoggingOut && isAuthenticated && inPublicGroup) {
      router.replace("/");
    } else if (!isAuthenticated && inAuthGroup) {
      router.replace("/(public)/login");
    }
  }, [isAuthenticated, isLoggingOut, authLoading, segments, fontsLoaded]);

  useEffect(() => {
    if (!authLoading && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => { });
    }
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => { });
    }, 2500);
    return () => clearTimeout(timer);
  }, [authLoading, fontsLoaded]);

  if (authLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F0F1A", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider convex={convex}>
      <ConvexAuthWrapper />
    </AuthProvider>
  );
}

function ConvexAuthWrapper() {
  const { isLoading, isAuthenticated, token } = useAppAuth();

  const fetchAccessToken = React.useCallback(async () => {
    return token;
  }, [token]);

  const useAuth = React.useCallback(() => {
    return {
      isLoading,
      isAuthenticated,
      fetchAccessToken,
    };
  }, [isLoading, isAuthenticated, fetchAccessToken]);

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <MoodThemeProvider>
        <AvatarProvider>
          <InitialLayout />
        </AvatarProvider>
      </MoodThemeProvider>
    </ConvexProviderWithAuth>
  );
}
