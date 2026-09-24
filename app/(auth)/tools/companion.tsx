import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  Animated,
  Dimensions,
  Modal,
  Clipboard,
  Share,
  ScrollView,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAppAuth } from "@/utils/auth";
import { Theme } from "@/constants/Theme";
import { useThemeColors, useActiveEmotion } from "@/context/MoodThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useAvatar } from "@/context/AvatarContext";
import { MitraAvatar, AvatarState } from "@/components/avatar/MitraAvatar";
import { ShieldSafetyIcon } from "@/components/svg/system";

const { width } = Dimensions.get("window");

// Starter prompts with vector icons
const STARTER_PROMPTS = [
  { id: "stressed", text: "I'm feeling stressed.", icon: "leaf-outline" },
  { id: "day", text: "How was my day?", icon: "calendar-outline" },
  { id: "motivate", text: "Motivate me.", icon: "sparkles-outline" },
  { id: "talk", text: "Let's talk.", icon: "chatbubble-ellipses-outline" },
];

// Vector reaction types replacing Unicode emoji reactions
const REACTION_TYPES = [
  { id: "heart", icon: "heart", color: "#EF4444" },
  { id: "like", icon: "thumbs-up", color: "#3B82F6" },
  { id: "spark", icon: "sparkles", color: "#F59E0B" },
  { id: "care", icon: "happy", color: "#10B981" },
  { id: "saved", icon: "bookmark", color: "#8B5CF6" },
];

// Crisis patterns for Priority 1 Safety invariant
const CRISIS_PATTERNS = [
  "suicide",
  "kill myself",
  "want to die",
  "end my life",
  "ending it all",
  "cut myself",
  "self harm",
  "hurt myself",
  "better off dead",
];

// Helper to format timestamps
function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? "0" + minutes : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
}

const getContextualSuggestions = (messages: any[]) => {
  const defaultChips = ["Tell me more", "Breathe", "Reflect", "Gratitude"];
  if (!messages || messages.length === 0) return defaultChips;
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
  if (lastMsg.includes("stress") || lastMsg.includes("anxious") || lastMsg.includes("panic")) {
    return ["Breathe", "Tell me more", "Reflect"];
  }
  if (lastMsg.includes("sad") || lastMsg.includes("lonely") || lastMsg.includes("cry")) {
    return ["Tell me more", "Calm Music", "Gratitude"];
  }
  if (lastMsg.includes("happy") || lastMsg.includes("good") || lastMsg.includes("great")) {
    return ["Gratitude", "Motivate me", "Reflect"];
  }
  return defaultChips;
};

// Bouncing typing indicator dots
function TypingIndicator() {
  const { avatarName } = useAvatar();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const colors = useThemeColors();

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(300),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 150);
    const anim3 = animateDot(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingBubble}>
        <Text style={[styles.typingText, { color: colors.textSecondary }]}>
          {avatarName} is thinking...
        </Text>
        <View style={styles.dotRow}>
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, transform: [{ translateY: dot1 }] },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, transform: [{ translateY: dot2 }] },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, transform: [{ translateY: dot3 }] },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

// Helper to get active emotion details without emojis
function getMoodLabel(moodId: string | null | undefined) {
  if (!moodId) return "Calm";
  const map: Record<string, string> = {
    calm: "Calm",
    happy: "Happy",
    sad: "Sad",
    stressed: "Stressed",
    anger: "Anger",
    excitement: "Excited",
    creative: "Creative",
    love: "Loved",
    fearful: "Anxious",
    peaceful: "Peaceful",
    disgusted: "Disgusted",
  };
  return map[moodId] || "Calm";
}

export default function AICompanionScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const activeEmotion = useActiveEmotion();
  const { user } = useAppAuth();

  const {
    avatarState,
    setAvatarState,
    triggerSafetyState,
    isSafetyActive,
    ageGroup,
    avatarName,
  } = useAvatar();

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const recognitionRef = useRef<any>(null);

  const [inputVal, setInputVal] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSafetyBanner, setShowSafetyBanner] = useState(false);

  // Custom states for redesign features
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [dailyMoodSubmitted, setDailyMoodSubmitted] = useState(false);

  // Convex integration
  const messages = useQuery(api.companion.getConversationHistory);
  const clearHistory = useMutation(api.companion.clearConversation);
  const generateAIResponse = useAction(api.companion.generateAIResponse);
  const createEmotionLog = useMutation(api.emotionLogs.create);

  // Dynamic Mitra Avatar state computation
  const currentMitraState: AvatarState = useMemo(() => {
    if (isSafetyActive || showSafetyBanner) return "supportive";
    if (isListening) return "listening";
    if (isSpeaking) return "encouraging";
    if (isAiLoading) return "thinking";
    return avatarState || "calm";
  }, [isSafetyActive, showSafetyBanner, isListening, isSpeaking, isAiLoading, avatarState]);

  // Auto scroll to end when messages list updates or keyboard shows
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages?.length]);

  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    return () => {
      keyboardShowListener.remove();
    };
  }, []);

  // Voice recognition toggle (STT)
  const toggleVoiceInput = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        if (isListening) {
          recognitionRef.current?.stop();
          setIsListening(false);
        } else {
          try {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            recognition.onstart = () => {
              setIsListening(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            };

            recognition.onresult = (event: any) => {
              const transcript = Array.from(event.results)
                .map((res: any) => res[0].transcript)
                .join("");
              setInputVal(transcript);
            };

            recognition.onerror = (event: any) => {
              console.log("Speech recognition error", event.error);
              setIsListening(false);
            };

            recognition.onend = () => {
              setIsListening(false);
            };

            recognitionRef.current = recognition;
            recognition.start();
          } catch (e) {
            console.error(e);
            setIsListening(false);
          }
        }
        return;
      }
    }

    // Native fallback or unsupported browser: guidance to use keyboard mic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert(
      "Voice Input",
      "You can dictate by tapping the microphone key on your device keyboard, or type your message directly.",
      [{ text: "Got it", onPress: () => inputRef.current?.focus() }]
    );
  };

  // Text-to-Speech (TTS)
  const handleReadAloud = (textToRead?: string) => {
    const content = textToRead || selectedMessage?.content;
    if (!content) return;
    setShowActionsSheet(false);

    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    Speech.speak(content, {
      rate: 0.9,
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleSend = async (textToSend: string) => {
    const cleanedText = textToSend.trim();
    if (!cleanedText || isAiLoading) return;

    // Check for crisis patterns
    const isCrisis = CRISIS_PATTERNS.some((p) => cleanedText.toLowerCase().includes(p));
    if (isCrisis) {
      triggerSafetyState();
      setShowSafetyBanner(true);
    }

    setInputVal("");
    setIsAiLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Generate unique local message IDs for user and expected AI response
    const userMessageId = Math.random().toString(36).slice(2, 11);
    const aiMessageId = Math.random().toString(36).slice(2, 11);

    try {
      await generateAIResponse({
        userMessageId,
        aiMessageId,
        content: cleanedText,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.error(err);
      let errorMsg = `Could not reach ${avatarName} right now. Please try again.`;
      if (err?.message) {
        errorMsg = err.message
          .replace("ConvexError: ", "")
          .replace("Uncaught Error: ", "")
          .trim();
      }
      Alert.alert(`${avatarName} Connection Error`, errorMsg);
    } finally {
      setIsAiLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      "Clear Chat History",
      `Are you sure you want to clear your conversation with ${avatarName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearHistory();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to clear conversation history.");
            }
          },
        },
      ]
    );
  };

  const handleStarterPromptPress = (text: string) => {
    handleSend(text);
  };

  const renderMessageItem = ({ item, index }: { item: any; index: number }) => {
    const isUser = item.role === "user";
    const nextMsg = messages?.[index + 1];

    const isGroupEnd =
      !nextMsg ||
      nextMsg.role !== item.role ||
      nextMsg.createdAt - item.createdAt > 5 * 60 * 1000;

    const showAiAvatar = !isUser;
    const activeReaction = reactions[item.messageId];
    const reactionDef = REACTION_TYPES.find((r) => r.id === activeReaction);

    return (
      <View
        style={[
          styles.bubbleWrapper,
          isUser ? styles.userBubbleWrapper : styles.aiBubbleWrapper,
          isGroupEnd ? { marginBottom: 12 } : { marginBottom: 4 },
        ]}
      >
        {!isUser && (
          <View style={styles.bubbleAvatarContainer}>
            {showAiAvatar ? (
              <MitraAvatar
                state={isAiLoading && index === (messages?.length ?? 0) - 1 ? "thinking" : "calm"}
                size="xs"
              />
            ) : (
              <View style={styles.miniAvatarSpacer} />
            )}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.95}
          onLongPress={() => handleLongPressMessage(item)}
          style={[
            styles.bubbleContainer,
            isUser ? styles.userBubbleContainer : styles.aiBubbleContainer,
          ]}
        >
          {isUser ? (
            <LinearGradient
              colors={[colors.primary, colors.primaryDark || "#5E3BFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.userBubble]}
            >
              <Text style={[styles.bubbleText, styles.userText]}>{item.content}</Text>
              {reactionDef && (
                <View style={styles.reactionBadge}>
                  <Ionicons name={reactionDef.icon as any} size={11} color={reactionDef.color} />
                </View>
              )}
              <Text style={[styles.timestamp, styles.userTimestamp]}>
                {formatTime(item.createdAt)}
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.white }]}>
              <Text style={[styles.bubbleText, styles.aiText]}>{item.content}</Text>
              {reactionDef && (
                <View style={styles.reactionBadge}>
                  <Ionicons name={reactionDef.icon as any} size={11} color={reactionDef.color} />
                </View>
              )}
              <View style={styles.bubbleFooter}>
                <TouchableOpacity
                  onPress={() => handleReadAloud(item.content)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={{ marginRight: 6 }}
                >
                  <Ionicons name="volume-medium-outline" size={13} color={colors.textMuted} />
                </TouchableOpacity>
                <Text style={[styles.timestamp, { color: colors.textMuted }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const handleSuggestionPress = (sug: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (sug.includes("Breathe") || sug.includes("Breathing")) {
      router.push("/(auth)/tools/jpmr");
    } else {
      const text = sug.replace(/[^\w\s\']/g, "").trim();
      handleSend(text);
    }
  };

  const handleLongPressMessage = (msg: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedMessage(msg);
    setShowActionsSheet(true);
  };

  const handleReactToMessage = (reactionId: string) => {
    if (!selectedMessage) return;
    setReactions((prev) => ({
      ...prev,
      [selectedMessage.messageId]: reactionId,
    }));
    setShowActionsSheet(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleCopyMessage = () => {
    if (!selectedMessage) return;
    Clipboard.setString(selectedMessage.content);
    setShowActionsSheet(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert("Copied", "Message copied to clipboard.");
  };

  const handleShareMessage = async () => {
    if (!selectedMessage) return;
    setShowActionsSheet(false);
    try {
      await Share.share({
        message: selectedMessage.content,
      });
    } catch (error) {
      console.error("Failed to share:", error);
    }
  };

  const hasChattedToday = React.useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const todayStr = new Date().toDateString();
    return messages.some((msg: any) => new Date(msg.createdAt).toDateString() === todayStr);
  }, [messages]);

  const handleDailyMoodSelect = async (mood: string) => {
    if (!user?.id) return;
    try {
      await createEmotionLog({
        userId: user.id,
        emotion: mood,
        bodyRegions: [],
        preIntensity: 5,
        postIntensity: 5,
      });
      setDailyMoodSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Mood Logged", `You logged that you are feeling ${mood}. ${avatarName} will tailor support to you.`);
    } catch (e) {
      console.error("Failed to log emotion:", e);
    }
  };

  const memoryHint = React.useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const text = messages.map((m: any) => m.content.toLowerCase()).join(" ");
    if (text.includes("exam") || text.includes("test") || text.includes("study")) {
      return "I remember you mentioned your exams recently. How are they going?";
    }
    if (text.includes("sleep") || text.includes("insomnia") || text.includes("tired")) {
      return "I remember you mentioned having trouble sleeping. Have you slept better?";
    }
    if (text.includes("stressed") || text.includes("stress") || text.includes("work")) {
      return "I remember you mentioned feeling stressed at work or studies. Remember to take a break.";
    }
    return null;
  }, [messages]);

  // Age cohort nuances
  const isYounger = ageGroup === "13-18";
  const emptyTitle = isYounger ? `Hey, I'm ${avatarName}!` : avatarName;
  const emptySubtitle = isYounger
    ? "I'm always here to listen, cheer you on, or help you figure things out."
    : "A calm space to reflect, decompress, or talk through whatever is on your mind.";

  const renderChatHeader = () => {
    return (
      <View style={{ paddingBottom: 8 }}>
        {/* Safety Alert Banner (Priority 1 Invariant) */}
        {(isSafetyActive || showSafetyBanner) && (
          <View style={[styles.safetyBanner, { borderColor: colors.error }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <ShieldSafetyIcon size={20} color={colors.error} />
              <Text style={[styles.safetyBannerTitle, { color: colors.error }]}>
                Immediate Support Available
              </Text>
            </View>
            <Text style={styles.safetyBannerText}>
              {avatarName} is an AI companion and cannot replace emergency help. If you feel overwhelmed, free confidential help is open 24/7.
            </Text>
            <View style={styles.safetyBtnRow}>
              <TouchableOpacity
                style={[styles.safetyCallBtn, { backgroundColor: colors.error }]}
                onPress={() => Linking.openURL("tel:14416")}
              >
                <Ionicons name="call" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.safetyCallText}>Call Tele-MANAS (14416)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.safetySupportBtn}
                onPress={() => router.push("/(auth)/onboarding/emergency")}
              >
                <Text style={[styles.safetySupportText, { color: colors.error }]}>Crisis Hub</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!hasChattedToday && !dailyMoodSubmitted && (
          <View style={[styles.checkInCard, { borderColor: colors.primary + "15" }]}>
            <Text style={[styles.checkInTitle, { color: colors.text }]}>How are you feeling today?</Text>
            <Text style={[styles.checkInSub, { color: colors.textSecondary }]}>
              Tap to log your mood and update {avatarName}'s reflections.
            </Text>
            <View style={styles.checkInRow}>
              {[
                { id: "calm", label: "Great" },
                { id: "happy", label: "Okay" },
                { id: "sad", label: "Low" },
                { id: "stressed", label: "Stressed" },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.checkInBtn,
                    { backgroundColor: colors.primary + "08", borderColor: colors.primary + "15" },
                  ]}
                  onPress={() => handleDailyMoodSelect(item.id)}
                >
                  <Text style={[styles.checkInBtnText, { color: colors.primary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {memoryHint && (
          <View
            style={[
              styles.memoryCard,
              { backgroundColor: colors.white, borderColor: colors.primary + "15" },
            ]}
          >
            <Ionicons name="bookmark" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.memoryText, { color: colors.textSecondary }]}>{memoryHint}</Text>
          </View>
        )}
      </View>
    );
  };

  const suggestions = React.useMemo(() => getContextualSuggestions(messages || []), [messages]);

  if (messages === undefined) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#FFF8F2", "#FFF3E6", "#FDF7F3"] as any}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Frosted Glass Sticky Header */}
        <BlurView
          intensity={90}
          tint="light"
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 16),
              borderBottomColor: "rgba(0,0,0,0.05)",
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.avatarBox}>
              <MitraAvatar state={currentMitraState} size="xs" />
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            </View>

            <View style={styles.headerText}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{avatarName}</Text>
                <View style={[styles.headerMoodBadge, { backgroundColor: colors.primary + "10" }]}>
                  <Text style={[styles.headerMoodText, { color: colors.primary }]}>
                    {getMoodLabel(activeEmotion)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                {isListening
                  ? "Listening..."
                  : isSpeaking
                  ? "Speaking..."
                  : isAiLoading
                  ? "Thinking..."
                  : "Online"}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {isSpeaking && (
              <TouchableOpacity
                onPress={() => {
                  Speech.stop();
                  setIsSpeaking(false);
                }}
                style={styles.headerIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="volume-mute-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push("/(auth)/onboarding/emergency")}
              style={styles.headerIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Emergency Safety Resources"
            >
              <ShieldSafetyIcon size={20} color={colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClearChat}
              style={styles.headerIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear chat"
            >
              <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </BlurView>

        {messages.length === 0 ? (
          /* Empty Welcoming Screen */
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyCard}>
              <View style={{ marginBottom: 16 }}>
                <MitraAvatar state={currentMitraState} size="lg" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{emptyTitle}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {emptySubtitle}
              </Text>
              <Text style={[styles.starterTitle, { color: colors.primary }]}>
                Tap a suggestion to start chatting:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promptsScroll}
              >
                {STARTER_PROMPTS.map((prompt) => (
                  <TouchableOpacity
                    key={prompt.id}
                    onPress={() => handleStarterPromptPress(prompt.text)}
                    style={[
                      styles.promptBtn,
                      {
                        borderColor: colors.primary + "30",
                        backgroundColor: colors.white,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={prompt.icon as any}
                      size={16}
                      color={colors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.promptText, { color: colors.text }]}>{prompt.text}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : (
          /* Conversation Message List */
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.messageId}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={renderChatHeader}
            ListFooterComponent={isAiLoading ? <TypingIndicator /> : null}
            onContentSizeChange={() => {
              if (messages && messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
          />
        )}

        {/* Dynamic Contextual Helper Chips */}
        <View style={styles.suggestionsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsScroll}
          >
            {suggestions.map((sug, i) => (
              <TouchableOpacity
                key={`sug-${i}`}
                style={[
                  styles.suggestionChip,
                  {
                    borderColor: colors.primary + "20",
                    backgroundColor: colors.white,
                  },
                ]}
                onPress={() => handleSuggestionPress(sug)}
              >
                <Text style={[styles.suggestionChipText, { color: colors.primary }]}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Bottom Composer Input */}
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.white,
              borderTopColor: colors.border || "rgba(0,0,0,0.05)",
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.inputRow}>
            {/* Voice Dictation Mic Button */}
            <TouchableOpacity
              onPress={toggleVoiceInput}
              activeOpacity={0.8}
              style={[
                styles.voiceBtn,
                {
                  backgroundColor: isListening ? colors.error : colors.background,
                  borderColor: isListening ? colors.error : colors.border || "rgba(0,0,0,0.08)",
                },
              ]}
              accessibilityLabel={isListening ? "Stop listening" : "Start voice dictation"}
            >
              <Ionicons
                name={isListening ? "mic" : "mic-outline"}
                size={18}
                color={isListening ? "#FFFFFF" : colors.primary}
              />
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                },
              ]}
              value={inputVal}
              onChangeText={setInputVal}
              placeholder={isListening ? "Listening to your voice..." : `Message ${avatarName}...`}
              placeholderTextColor={isListening ? colors.primary : colors.textMuted}
              multiline
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }, 200);
              }}
              onSubmitEditing={() => {
                if (Platform.OS !== "web") {
                  handleSend(inputVal);
                }
              }}
            />

            <TouchableOpacity
              onPress={() => handleSend(inputVal)}
              disabled={!inputVal.trim() || isAiLoading}
              activeOpacity={0.8}
              style={{ marginBottom: 2 }}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark || "#5E3BFF"]}
                style={[
                  styles.sendBtn,
                  {
                    opacity: !inputVal.trim() || isAiLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isAiLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.white} style={{ marginLeft: 2 }} />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Message Actions Sheet Modal */}
      <Modal
        visible={showActionsSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionsSheet(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowActionsSheet(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Message Actions</Text>

            <View style={styles.sheetOptionRow}>
              {REACTION_TYPES.map((reaction) => (
                <TouchableOpacity
                  key={reaction.id}
                  style={styles.reactionBtn}
                  onPress={() => handleReactToMessage(reaction.id)}
                >
                  <View style={[styles.reactionCircle, { backgroundColor: reaction.color + "15" }]}>
                    <Ionicons name={reaction.icon as any} size={20} color={reaction.color} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.sheetActionItem} onPress={handleCopyMessage}>
              <Ionicons
                name="copy-outline"
                size={20}
                color={colors.text}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.sheetActionText, { color: colors.text }]}>Copy Text</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetActionItem} onPress={() => handleReadAloud()}>
              <Ionicons
                name="volume-medium-outline"
                size={20}
                color={colors.text}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.sheetActionText, { color: colors.text }]}>Read Aloud</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetActionItem} onPress={handleShareMessage}>
              <Ionicons
                name="share-outline"
                size={20}
                color={colors.text}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.sheetActionText, { color: colors.text }]}>Share Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetActionItem, { borderBottomWidth: 0 }]}
              onPress={() => setShowActionsSheet(false)}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={colors.error || "#EF4444"}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.sheetActionText, { color: colors.error || "#EF4444" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Theme.spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    zIndex: 10,
    ...Theme.shadows.tertiary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  backBtn: {
    padding: 4,
    marginRight: 6,
  },
  avatarBox: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  headerText: {
    justifyContent: "center",
    flex: 1,
  },
  headerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  headerSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    lineHeight: 14,
    marginTop: 1,
  },
  headerMoodBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  headerMoodText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 10,
  },
  keyboardView: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: 24,
    flexGrow: 1,
  },
  bubbleWrapper: {
    flexDirection: "row",
    width: "100%",
    alignItems: "flex-end",
  },
  userBubbleWrapper: {
    justifyContent: "flex-end",
  },
  aiBubbleWrapper: {
    justifyContent: "flex-start",
  },
  bubbleAvatarContainer: {
    width: 28,
    marginRight: 6,
    alignSelf: "flex-end",
    justifyContent: "center",
    alignItems: "center",
  },
  miniAvatarSpacer: {
    width: 28,
    height: 28,
  },
  bubbleContainer: {
    maxWidth: "75%",
  },
  userBubbleContainer: {
    alignSelf: "flex-end",
  },
  aiBubbleContainer: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Theme.shadows.tertiary,
    position: "relative",
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: "#FFFFFF",
  },
  aiText: {
    color: "#1E293B",
  },
  bubbleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  reactionBadge: {
    position: "absolute",
    bottom: -8,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    zIndex: 10,
    ...Theme.shadows.tertiary,
  },
  timestamp: {
    fontFamily: Theme.fontFamily.regular,
    fontSize: 9,
    alignSelf: "flex-end",
  },
  userTimestamp: {
    color: "rgba(255,255,255,0.7)",
  },
  safetyBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: Theme.spacing.md,
    marginBottom: 12,
    borderWidth: 1.5,
    ...Theme.shadows.tertiary,
  },
  safetyBannerTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
  },
  safetyBannerText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: "#7F1D1D",
    lineHeight: 17,
    marginBottom: 10,
  },
  safetyBtnRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  safetyCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  safetyCallText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  safetySupportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  safetySupportText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Theme.spacing.lg,
  },
  emptyCard: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 24,
    padding: Theme.spacing.xl,
    width: "100%",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.7)",
    ...Theme.shadows.secondary,
  },
  emptyTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 22,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Theme.spacing.xl,
  },
  starterTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 13,
    marginBottom: Theme.spacing.sm,
  },
  promptsScroll: {
    paddingVertical: 4,
    gap: 8,
    paddingRight: 16,
  },
  promptBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    ...Theme.shadows.tertiary,
  },
  promptText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 12,
  },
  suggestionsContainer: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 6,
  },
  suggestionsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
    ...Theme.shadows.tertiary,
  },
  suggestionChipText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
  },
  checkInCard: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    padding: Theme.spacing.md,
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    ...Theme.shadows.tertiary,
  },
  checkInTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
    marginBottom: 2,
  },
  checkInSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 11,
    marginBottom: 8,
  },
  checkInRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
  },
  checkInBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkInBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 11,
  },
  memoryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    ...Theme.shadows.tertiary,
  },
  memoryText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    flex: 1,
  },
  composer: {
    paddingTop: 10,
    paddingHorizontal: Theme.spacing.md,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  voiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    borderWidth: 0,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  typingContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 12,
    paddingLeft: 4,
  },
  typingBubble: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typingText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 8,
    marginTop: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: 32,
    paddingTop: 12,
  },
  sheetHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
  },
  sheetTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    marginBottom: 16,
  },
  sheetOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  reactionBtn: {
    padding: 6,
  },
  reactionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  sheetActionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 14,
  },
});
