import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet, AppState, Pressable } from "react-native";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";

// Module-level tracking for cold starts (resets on app process kill)
let hasPlayedThisSession = false;

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user } = useAppAuth();

  const dbUser = useQuery(
    api.users.getByClerkId,
    isAuthenticated && user?.id ? { clerkId: user.id } : "skip"
  );

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isCheckComplete, setIsCheckComplete] = useState(false);

  // Initialize expo-video player with landing-page.mp4 splash video
  const player = useVideoPlayer(require("@/assets/landing-page.mp4"), (playerInstance) => {
    playerInstance.loop = false;
  });

  const dismissVideo = useCallback(async () => {
    setIsVideoPlaying(false);
    if (player) {
      player.pause();
    }
    hasPlayedThisSession = true;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await SecureStore.setItemAsync("last_played_video_date", todayStr);
    } catch (e) {
      console.error("Failed to store video played date:", e);
    }
  }, [player]);

  // Setup video finish event
  useEffect(() => {
    if (!player) return;
    const subscription = player.addListener("playToEnd", () => {
      dismissVideo();
    });
    return () => {
      subscription.remove();
    };
  }, [player, dismissVideo]);

  // Check play frequency conditions on mount
  useEffect(() => {
    async function checkVideoPlayback() {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const lastPlayedDate = await SecureStore.getItemAsync("last_played_video_date");

        if (!hasPlayedThisSession || lastPlayedDate !== todayStr) {
          setIsVideoPlaying(true);
          if (player) {
            player.play();
          }
        }
      } catch (e) {
        console.error("Failed to check video playback conditions:", e);
      } finally {
        setIsCheckComplete(true);
      }
    }
    checkVideoPlayback();
  }, [player]);

  // Listen to AppState changes (play again if resuming from background on a new day)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === "active") {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const lastPlayedDate = await SecureStore.getItemAsync("last_played_video_date");
          if (lastPlayedDate !== todayStr) {
            setIsVideoPlaying(true);
            if (player) {
              player.currentTime = 0;
              player.play();
            }
          }
        } catch (e) {
          console.error("Failed to check date on foreground app resume:", e);
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [player]);

  // Handle redirection after video finishes/skips and dbUser finishes loading
  useEffect(() => {
    // Wait until video has finished playing and frequency check is complete
    if (isVideoPlaying || !isCheckComplete) return;

    // If authenticated, wait until dbUser loads
    if (isAuthenticated) {
      if (dbUser === undefined) return; // wait for query

      const hasDemographics = dbUser?.alias && dbUser?.age && dbUser?.campus && dbUser?.department;
      const onboardingComplete = dbUser?.onboardingComplete || !!hasDemographics;

      if (dbUser?.is_first_login) {
        router.replace("/(auth)/onboarding/change-password");
      } else if (onboardingComplete) {
        if (!dbUser?.screeningComplete) {
          router.replace("/(auth)/screening");
        } else {
          router.replace("/(auth)/(tabs)");
        }
      } else {
        router.replace("/(auth)/onboarding/welcome");
      }
    } else {
      // If not authenticated, redirect to login
      router.replace("/(public)/login");
    }
  }, [isVideoPlaying, isCheckComplete, isAuthenticated, dbUser]);

  // Render video player overlay if active
  if (isVideoPlaying) {
    return (
      <LinearGradient
        colors={["#E8E8E8", "#DCDCDC", "#D0D0D0"]}
        style={styles.videoContainer}
      >
        <StatusBar style="dark" />
        <Pressable style={styles.videoPressable} onPress={dismissVideo}>
          <VideoView
            player={player}
            style={styles.videoPlayer}
            fullscreenOptions={{ enable: false }}
            nativeControls={false}
            contentFit="contain"
          />
        </Pressable>
      </LinearGradient>
    );
  }

  // Loading indicator while checking status or fetching user data
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.primary || "#6366F1"} />
    </View>
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E8E8E8",
  },
  videoPressable: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background || "#FFFFFF",
  },
});
