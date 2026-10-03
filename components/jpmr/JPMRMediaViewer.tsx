import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { JPMRStep, PlayState } from "./types";
import { JPMRStepIllustration } from "./JPMRStepIllustration";

interface JPMRMediaViewerProps {
  stepIndex: number;
  stepData: JPMRStep;
  playState: PlayState;
  videoUri?: string | null;
  isPlaying: boolean;
}

/**
 * Isolated inner video player component that is ONLY mounted when a valid videoUri is provided.
 * Handles playback errors, loading states, and source sync.
 */
const JPMRVideoPlayerInner: React.FC<{
  uri: string;
  isPlaying: boolean;
  onError: () => void;
  onLoaded: () => void;
}> = ({ uri, isPlaying, onError, onLoaded }) => {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    let isMounted = true;
    try {
      player
        .replaceAsync({ uri })
        .then(() => {
          if (isMounted) {
            onLoaded();
            if (isPlaying) {
              player.play();
            }
          }
        })
        .catch((err) => {
          console.warn("JPMR video load warning:", err);
          if (isMounted) onError();
        });
    } catch (e) {
      console.warn("JPMR video player exception:", e);
      if (isMounted) onError();
    }

    return () => {
      isMounted = false;
    };
  }, [uri]);

  useEffect(() => {
    try {
      if (isPlaying) {
        player.play();
      } else {
        player.pause();
      }
    } catch (e) {
      // Ignore pause/play errors on unmounted player
    }
  }, [isPlaying]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      fullscreenOptions={{ enable: false }}
      nativeControls={false}
    />
  );
};

export const JPMRMediaViewer: React.FC<JPMRMediaViewerProps> = ({
  stepIndex,
  stepData,
  playState,
  videoUri,
  isPlaying,
}) => {
  const [videoStatus, setVideoStatus] = useState<"idle" | "loading" | "ready" | "error">(
    videoUri ? "loading" : "idle"
  );

  const isTensing =
    playState === "SPEAK_TENSE" ||
    playState === "TENSE_WAITING" ||
    playState === "TENSE_COUNTDOWN";

  // Reset video state when step changes
  useEffect(() => {
    if (videoUri) {
      setVideoStatus("loading");
    } else {
      setVideoStatus("idle");
    }
  }, [stepIndex, videoUri]);

  // If no videoUri or if video encountered an error/offline, display the local vector illustration
  const showVideo = !!videoUri && videoStatus !== "error";

  return (
    <View style={styles.wrapper}>
      {/* 1. Base Layer: Local Vector Illustration (Always present & ready instantly) */}
      <JPMRStepIllustration
        step={stepData}
        isTensing={isTensing}
        style={styles.illustration}
      />

      {/* 2. Optional Video Layer: Mounted only when a valid custom videoUri is present */}
      {showVideo && (
        <View style={StyleSheet.absoluteFill}>
          <JPMRVideoPlayerInner
            uri={videoUri!}
            isPlaying={isPlaying}
            onLoaded={() => setVideoStatus("ready")}
            onError={() => setVideoStatus("error")}
          />

          {/* Loading spinner over illustration while buffering */}
          {videoStatus === "loading" && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#A78BFA" />
              <Text style={styles.loadingText}>Buffering demonstration...</Text>
            </View>
          )}

          {/* Video Badge */}
          {videoStatus === "ready" && (
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>Demonstration Video</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  illustration: {
    width: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  loadingText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  videoBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.4)",
  },
  videoBadgeText: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
