import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions, Modal, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/utils/auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Colors, getColorsForEmotion } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Svg, { Path, Circle } from "react-native-svg";
import {
  HappyEmotionIcon,
  CalmEmotionIcon,
  SadEmotionIcon,
  WorriedEmotionIcon,
  AngryEmotionIcon,
  EmbarrassedEmotionIcon,
  TiredEmotionIcon,
} from "@/components/svg/emotions";
import { DeepBreathingActivityIcon, MuscleRelaxActivityIcon, HabitMicrogoalIcon } from "@/components/svg/activities";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";

const { width } = Dimensions.get('window');

const FEATURE_EMOTIONS = [
  { id: "anxiety", label: "Anxiety", Icon: WorriedEmotionIcon },
  { id: "sadness", label: "Sadness", Icon: SadEmotionIcon },
  { id: "anger", label: "Anger", Icon: AngryEmotionIcon },
  { id: "calm", label: "Calm", Icon: CalmEmotionIcon },
  { id: "tired", label: "Tired", Icon: TiredEmotionIcon },
  { id: "confused", label: "Confused", Icon: EmbarrassedEmotionIcon },
  { id: "happy", label: "Happy", Icon: HappyEmotionIcon },
  { id: "numb", label: "Numb", Icon: SadEmotionIcon },
];

const getIntensityLabel = (value: number) => {
  if (value <= 2) return { text: "Minimal", desc: "Barely noticeable, very mild physical or emotional presence.", color: '#10B981' };
  if (value <= 4) return { text: "Mild", desc: "Noticeable but easily managed and does not disrupt activities.", color: '#3B82F6' };
  if (value <= 6) return { text: "Moderate", desc: "Quite noticeable, distracting, but you can still function.", color: '#F59E0B' };
  if (value <= 8) return { text: "Severe", desc: "Strong distress, hard to ignore, significantly impacts focus.", color: '#EA580C' };
  return { text: "Extreme", desc: "Overwhelming distress, demands complete attention and intervention.", color: '#EF4444' };
};

interface IntensitySelectorProps {
  value: number;
  onChange: (val: number) => void;
  activeColor?: string;
}

function IntensitySelector({ value, onChange, activeColor }: IntensitySelectorProps) {
  const level = getIntensityLabel(value);
  
  const handleDecrement = () => {
    if (value > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < 10) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(value + 1);
    }
  };

  const handleSelect = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onChange(n);
  };

  const renderCircle = (n: number) => {
    const isSelected = value === n;
    const numLevel = getIntensityLabel(n);
    return (
      <TouchableOpacity
        key={n}
        onPress={() => handleSelect(n)}
        style={[
          styles.gridCircle,
          isSelected 
            ? { backgroundColor: numLevel.color, borderColor: numLevel.color }
            : styles.gridCircleUnselected
        ]}
      >
        <Text 
          style={[
            styles.gridCircleText,
            { color: isSelected ? Colors.white : Colors.textSecondary }
          ]}
        >
          {n}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.selectorContainer}>
      <View style={styles.stepperRow}>
        <TouchableOpacity 
          onPress={handleDecrement} 
          style={[styles.stepperBtn, value === 1 && styles.stepperBtnDisabled]}
          disabled={value === 1}
        >
          <Ionicons name="remove" size={24} color={value === 1 ? Colors.textMuted : (activeColor || Colors.primary)} />
        </TouchableOpacity>
        
        <View style={styles.valueDisplay}>
          <Text style={[styles.intensityNum, { color: level.color }]}>{value}</Text>
          <Text style={[styles.intensityLabel, { color: level.color }]}>{level.text}</Text>
        </View>

        <TouchableOpacity 
          onPress={handleIncrement} 
          style={[styles.stepperBtn, value === 10 && styles.stepperBtnDisabled]}
          disabled={value === 10}
        >
          <Ionicons name="add" size={24} color={value === 10 ? Colors.textMuted : (activeColor || Colors.primary)} />
        </TouchableOpacity>
      </View>

      <Text style={styles.intensityDesc}>{level.desc}</Text>

      <View style={styles.intensityGrid}>
        <View style={styles.gridRow}>
          {[1, 2, 3, 4, 5].map((n) => renderCircle(n))}
        </View>
        <View style={styles.gridRow}>
          {[6, 7, 8, 9, 10].map((n) => renderCircle(n))}
        </View>
      </View>
    </View>
  );
}

export default function EmotionMapScreen() {
  const router = useRouter();
  const { user } = useAppAuth();
  
  // Tab navigation
  const [activeTab, setActiveTab] = useState<'log' | 'history'>('log');
  
  // Assessments and screening
  const latestScreening = useQuery(api.screening.getLatest, {
    userId: user?.id ?? "",
  });

  // New log flow states
  const [step, setStep] = useState(1);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [bodyRatings, setBodyRatings] = useState<Record<string, number>>({});
  const [currentRegionIndex, setCurrentRegionIndex] = useState(0);

  // Breathing Modal State
  const [showBreathingModal, setShowBreathingModal] = useState(false);
  const [breathingTimeLeft, setBreathingTimeLeft] = useState(180); // 3 minutes
  const [breathState, setBreathState] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const breatheAnim = useRef(new Animated.Value(1)).current;

  // History Tab States
  const [filterDays, setFilterDays] = useState<7 | 30>(7);

  // Convex mutations & queries
  const createEmotionMap = useMutation(api.emotionMaps.create);
  const recentLogs = useQuery(api.emotionMaps.getRecentLogs, {
    userId: user?.id ?? "",
  });

  const activeColors = getColorsForEmotion(selectedEmotion);

  // Breathing timer countdown
  useEffect(() => {
    let timer: any;
    if (showBreathingModal && breathingTimeLeft > 0) {
      timer = setInterval(() => {
        setBreathingTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (breathingTimeLeft === 0 && showBreathingModal) {
      handleCompleteBreathing();
    }
    return () => clearInterval(timer);
  }, [showBreathingModal, breathingTimeLeft]);

  // Breathing inhale/hold/exhale animation cycle
  useEffect(() => {
    let cycleTimer: any;
    if (showBreathingModal) {
      const runBreathingCycle = () => {
        setBreathState('Inhale');
        Animated.timing(breatheAnim, {
          toValue: 1.8,
          duration: 4000,
          useNativeDriver: true,
        }).start(() => {
          setBreathState('Hold');
          cycleTimer = setTimeout(() => {
            setBreathState('Exhale');
            Animated.timing(breatheAnim, {
              toValue: 1.0,
              duration: 4000,
              useNativeDriver: true,
            }).start(() => {
              runBreathingCycle();
            });
          }, 4000);
        });
      };
      runBreathingCycle();
    } else {
      breatheAnim.setValue(1);
    }
    return () => clearTimeout(cycleTimer);
  }, [showBreathingModal]);

  async function handleCompleteBreathing() {
    setShowBreathingModal(false);
    await saveLogAndNavigate("Breathe");
  }

  function toggleRegion(region: string) {
    if (selectedRegions.includes(region)) {
      setSelectedRegions(selectedRegions.filter((r) => r !== region));
      const updatedRatings = { ...bodyRatings };
      delete updatedRatings[region];
      setBodyRatings(updatedRatings);
    } else {
      setSelectedRegions([...selectedRegions, region]);
      setBodyRatings({ ...bodyRatings, [region]: 5 });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  const getSupportiveFeedback = (emotion: string) => {
    switch (emotion.toLowerCase()) {
      case 'anxiety':
        return "Anxiety often shows up as tightness in the chest or stomach. A short breathing exercise may help.";
      case 'sadness':
        return "Sadness can feel heavy in the body. A small act of self-care may help today.";
      case 'anger':
        return "Anger often creates tension in the body. Consider a short grounding exercise.";
      case 'calm':
        return "You seem relatively settled right now. Take a moment to appreciate this feeling.";
      case 'tired':
        return "Your body may be asking for rest. Consider a short break or relaxation exercise.";
      case 'confused':
        return "Feeling uncertain is part of being human. Try slowing down and focusing on one step at a time.";
      case 'happy':
        return "It's great to notice positive feelings. Consider what contributed to this moment.";
      case 'numb':
        return "Feeling disconnected can happen during stressful periods. Try a gentle grounding exercise.";
      default:
        return "Observe these sensations in your body with acceptance and curiosity.";
    }
  };

  const ratingsList = selectedRegions.map((region) => ({
    region,
    intensity: bodyRatings[region] ?? 5,
  }));
  const totalIntensity = ratingsList.reduce((sum, r) => sum + r.intensity, 0);
  const averageIntensity = selectedRegions.length > 0 ? Number((totalIntensity / selectedRegions.length).toFixed(1)) : 0;

  const saveLogAndNavigate = async (action: string) => {
    if (!user || !selectedEmotion) return;
    try {
      await createEmotionMap({
        userId: user.id,
        emotionLabel: selectedEmotion,
        selectedRegions,
        bodyRatings: ratingsList,
        averageIntensity,
        suggestedAction: action,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      let msg = "Your emotion map and body scan have been recorded.";
      if ((latestScreening?.wsas_total ?? 0) > 10) {
        msg = "Your daily life seems affected right now. Consider setting a small MicroGoal today.";
      }
      
      Alert.alert(
        "Journal Saved!",
        msg,
        [
          {
            text: "OK",
            onPress: () => {
              if (action === "JPMR") {
                router.replace("/(auth)/tools/jpmr" as any);
              } else if (action === "MicroGoals") {
                router.replace("/(auth)/tools/microgoals" as any);
              } else {
                router.replace("/(auth)/(tabs)" as any);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not save your log. Please try again.");
    }
  };

  // Filter logs for History View
  const logs = recentLogs ?? [];
  const filterLimit = filterDays * 24 * 60 * 60 * 1000;
  const filteredLogs = logs.filter((log: any) => (Date.now() - log.createdAt) <= filterLimit);

  // Compute frequencies for history
  const emotionCounts: Record<string, number> = {};
  filteredLogs.forEach((log: any) => {
    emotionCounts[log.emotionLabel] = (emotionCounts[log.emotionLabel] || 0) + 1;
  });
  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const mostFrequentEmotion = sortedEmotions.length > 0 ? sortedEmotions[0][0] : null;

  const regionCounts: Record<string, number> = {};
  filteredLogs.forEach((log: any) => {
    log.selectedRegions.forEach((r: string) => {
      regionCounts[r] = (regionCounts[r] || 0) + 1;
    });
  });
  const sortedRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const mostFrequentRegion = sortedRegions.length > 0 ? sortedRegions[0][0] : null;

  const overallAvgIntensity = filteredLogs.length > 0
    ? Number((filteredLogs.reduce((sum: number, log: any) => sum + log.averageIntensity, 0) / filteredLogs.length).toFixed(1))
    : 0;

  const Progress = () => (
    <View style={styles.progressContainer}>
      <View style={[styles.progressBar, { width: `${(step / 5) * 100}%` }]} />
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F4F3FF', '#E0DBFF']}
        style={StyleSheet.absoluteFill}
      />
      
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Screen Header */}
        <View style={styles.header}>
          <View style={styles.headerNavRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Emotion Mapping</Text>
          </View>

          {/* Tab Selection */}
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'log' && styles.tabButtonActive]}
              onPress={() => setActiveTab('log')}
            >
              <Text style={[styles.tabText, activeTab === 'log' && styles.tabTextActive]}>Log Sensation</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
              onPress={() => setActiveTab('history')}
            >
              <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History & Trends</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'log' && <Progress />}
        </View>

        {/* LOG SENSATION TAB */}
        {activeTab === 'log' && (
          <View style={{ width: '100%' }}>
            
            {/* Step 1: Emotion Selection */}
            {step === 1 && (
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>How are you feeling right now?</Text>
                <Text style={styles.stepSub}>Take 60 seconds to notice your feelings.</Text>
                
                <View style={styles.grid}>
                  {FEATURE_EMOTIONS.map((emotion) => {
                    const isSelected = selectedEmotion === emotion.label;
                    return (
                      <TouchableOpacity
                        key={emotion.id}
                        style={[
                          styles.emotionChip,
                          isSelected && styles.emotionChipSelected,
                        ]}
                        onPress={() => setSelectedEmotion(emotion.label)}
                      >
                        <emotion.Icon size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                        <Text
                          style={[
                            styles.emotionText,
                            isSelected && styles.emotionTextSelected,
                          ]}
                        >
                          {emotion.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                
                <Button
                  title="Continue"
                  onPress={() => setStep(2)}
                  disabled={!selectedEmotion}
                  style={styles.nextBtn}
                />
              </View>
            )}

            {/* Step 2: Interactive Body Map */}
            {step === 2 && (
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>Where is it held?</Text>
                <Text style={styles.stepSub}>Select the body regions where you feel this sensation.</Text>
                
                <View style={styles.bodyMapContainer}>
                  {/* Silhouette SVG */}
                  <View style={styles.svgWrapper}>
                    <Svg width={140} height={260} viewBox="0 0 200 320">
                      <Circle 
                        cx={100} 
                        cy={35} 
                        r={20} 
                        fill={selectedRegions.includes("Head") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Head")} 
                      />
                      <Path 
                        d="M 65 65 L 135 65 L 130 85 L 70 85 Z" 
                        fill={selectedRegions.includes("Shoulders") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Shoulders")} 
                      />
                      <Path 
                        d="M 72 88 L 128 88 L 125 125 L 75 125 Z" 
                        fill={selectedRegions.includes("Chest") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Chest")} 
                      />
                      <Path 
                        d="M 75 128 L 125 128 L 120 170 L 80 170 Z" 
                        fill={selectedRegions.includes("Stomach") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Stomach")} 
                      />
                      <Path 
                        d="M 62 68 L 48 80 L 38 150 L 48 150 L 58 90 Z" 
                        fill={selectedRegions.includes("Hands") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Hands")} 
                      />
                      <Path 
                        d="M 138 68 L 152 80 L 162 150 L 152 150 L 142 90 Z" 
                        fill={selectedRegions.includes("Hands") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Hands")} 
                      />
                      <Path 
                        d="M 80 173 L 97 173 L 92 295 L 75 295 Z" 
                        fill={selectedRegions.includes("Legs") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Legs")} 
                      />
                      <Path 
                        d="M 103 173 L 120 173 L 125 295 L 108 295 Z" 
                        fill={selectedRegions.includes("Legs") ? Colors.primary : "#E2E8F0"} 
                        onPress={() => toggleRegion("Legs")} 
                      />
                    </Svg>
                  </View>

                  {/* Checklist options */}
                  <View style={styles.bodyListColumn}>
                    {(["Head", "Shoulders", "Chest", "Stomach", "Hands", "Legs"] as const).map((region) => {
                      const isSelected = selectedRegions.includes(region);
                      return (
                        <TouchableOpacity
                          key={region}
                          style={[
                            styles.bodyRegionChip,
                            isSelected && styles.bodyRegionChipSelected
                          ]}
                          onPress={() => toggleRegion(region)}
                        >
                          <Ionicons 
                            name={isSelected ? "checkbox" : "square-outline"} 
                            size={18} 
                            color={isSelected ? Colors.white : Colors.textSecondary} 
                            style={{ marginRight: 6 }}
                          />
                          <Text 
                            style={[
                              styles.bodyRegionText,
                              isSelected && styles.bodyRegionTextSelected
                            ]}
                          >
                            {region}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                
                <View style={styles.navRow}>
                  <Button title="Back" onPress={() => setStep(1)} variant="outline" style={styles.halfBtn} />
                  <Button
                    title="Next"
                    onPress={() => {
                      setCurrentRegionIndex(0);
                      setStep(3);
                    }}
                    disabled={selectedRegions.length === 0}
                    style={styles.halfBtn}
                  />
                </View>
              </View>
            )}

            {/* Step 3: Multi-Region Intensity Selection */}
            {step === 3 && selectedRegions.length > 0 && (
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>Region Intensity</Text>
                <Text style={styles.stepSub}>
                  How strongly do you feel it in your {selectedRegions[currentRegionIndex]}? ({currentRegionIndex + 1} of {selectedRegions.length})
                </Text>
                
                <IntensitySelector 
                  value={bodyRatings[selectedRegions[currentRegionIndex]] ?? 5} 
                  onChange={(val) => {
                    setBodyRatings({
                      ...bodyRatings,
                      [selectedRegions[currentRegionIndex]]: val,
                    });
                  }}
                  activeColor={activeColors.primary} 
                />

                <View style={styles.navRow}>
                  <Button 
                    title="Back" 
                    onPress={() => {
                      if (currentRegionIndex > 0) {
                        setCurrentRegionIndex(currentRegionIndex - 1);
                      } else {
                        setStep(2);
                      }
                    }} 
                    variant="outline" 
                    style={styles.halfBtn} 
                  />
                  <Button 
                    title="Next" 
                    onPress={() => {
                      if (currentRegionIndex < selectedRegions.length - 1) {
                        setCurrentRegionIndex(currentRegionIndex + 1);
                      } else {
                        setStep(4);
                      }
                    }} 
                    style={styles.halfBtn} 
                  />
                </View>
              </View>
            )}

            {/* Step 4: Reflection Summary Screen */}
            {step === 4 && (
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>Reflection Summary</Text>
                <Text style={styles.stepSub}>Observe this summary of your physical and emotional state.</Text>
                
                <View style={styles.summaryBox}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Emotion Selected</Text>
                    <Text style={styles.summaryValue}>{selectedEmotion}</Text>
                  </View>
                  
                  <View style={styles.summaryDivider} />
                  
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Average Intensity</Text>
                    <Text style={[styles.summaryValue, { color: getIntensityLabel(Math.round(averageIntensity)).color }]}>
                      {averageIntensity} / 10
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionHeading}>Sensation Areas</Text>
                <View style={styles.breakdownList}>
                  {selectedRegions.map((region) => {
                    const rating = bodyRatings[region] ?? 5;
                    const info = getIntensityLabel(rating);
                    return (
                      <View key={region} style={styles.breakdownRow}>
                        <Text style={styles.breakdownRegion}>{region}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.breakdownRating, { color: info.color }]}>{rating}</Text>
                          <Text style={styles.breakdownLabel}>({info.text})</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.feedbackCard}>
                  <Text style={styles.feedbackTitle}>Therapeutic Insight</Text>
                  <Text style={styles.feedbackText}>{getSupportiveFeedback(selectedEmotion?.split(' ').slice(1).join(' ') || "")}</Text>
                </View>

                {/* Personalization Alerts */}

                <View style={styles.navRow}>
                  <Button 
                    title="Back" 
                    onPress={() => {
                      setCurrentRegionIndex(selectedRegions.length - 1);
                      setStep(3);
                    }} 
                    variant="outline" 
                    style={styles.halfBtn} 
                  />
                  <Button title="Continue" onPress={() => setStep(5)} style={styles.halfBtn} />
                </View>
              </View>
            )}

            {/* Step 5: Recommended Actions */}
            {step === 5 && (
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>Recommended Action</Text>
                <Text style={styles.stepSub}>Choose a calming step to support yourself right now.</Text>
                
                <View style={styles.actionsContainer}>
                  <TouchableOpacity 
                    style={styles.actionCard} 
                    onPress={() => setShowBreathingModal(true)}
                  >
                    <View style={styles.actionIconWrapper}>
                      <DeepBreathingActivityIcon size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={styles.actionTitle}>Breathe Now</Text>
                      <Text style={styles.actionDesc}>Take a 3-minute guided breathing break</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.actionCard} 
                    onPress={() => saveLogAndNavigate("JPMR")}
                  >
                    <View style={styles.actionIconWrapper}>
                      <MuscleRelaxActivityIcon size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={styles.actionTitle}>Relax Now</Text>
                      <Text style={styles.actionDesc}>Open JPMR relaxation module</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.actionCard} 
                    onPress={() => saveLogAndNavigate("MicroGoals")}
                  >
                    <View style={styles.actionIconWrapper}>
                      <HabitMicrogoalIcon size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={styles.actionTitle}>Set a MicroGoal</Text>
                      <Text style={styles.actionDesc}>Create a small achievable daily goal</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionCard, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]} 
                    onPress={() => saveLogAndNavigate("None")}
                  >
                    <View style={styles.actionIconWrapper}>
                      <Ionicons name="time-outline" size={24} color={Colors.textSecondary} />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: Colors.textSecondary }]}>Maybe Later</Text>
                      <Text style={styles.actionDesc}>Save this scan and return to dashboard</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Button 
                  title="Back" 
                  onPress={() => setStep(4)} 
                  variant="outline" 
                  style={styles.backBtnOnly} 
                />
              </View>
            )}

          </View>
        )}

        {/* HISTORY & TRENDS TAB */}
        {activeTab === 'history' && (
          <View style={styles.historyContainer}>
            {/* Filter Toggle */}
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterBtn, filterDays === 7 && styles.filterBtnActive]}
                onPress={() => setFilterDays(7)}
              >
                <Text style={[styles.filterBtnText, filterDays === 7 && styles.filterBtnTextActive]}>
                  Last 7 Days
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, filterDays === 30 && styles.filterBtnActive]}
                onPress={() => setFilterDays(30)}
              >
                <Text style={[styles.filterBtnText, filterDays === 30 && styles.filterBtnTextActive]}>
                  Last 30 Days
                </Text>
              </TouchableOpacity>
            </View>

            {filteredLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="journal-outline" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No entries recorded in this period.</Text>
                <Text style={styles.emptySub}>Start logging your physical sensations to see wellness patterns.</Text>
              </View>
            ) : (
              <View style={{ gap: Theme.spacing.xl, width: '100%' }}>
                {/* Insights Card */}
                <View style={styles.insightsCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <Ionicons name="bulb-outline" size={16} color={Colors.primary} />
                    <Text style={styles.insightsHeader}>WELLNESS INSIGHTS</Text>
                  </View>
                  
                  {mostFrequentEmotion && (
                    <View style={styles.insightItemRow}>
                      <Ionicons name="pulse" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
                      <Text style={styles.insightItemText}>
                        <Text style={{ fontFamily: Theme.fontFamily.bold }}>{mostFrequentEmotion}</Text> appeared most often this {filterDays === 7 ? 'week' : 'month'}.
                      </Text>
                    </View>
                  )}
                  
                  {mostFrequentRegion && (
                    <View style={styles.insightItemRow}>
                      <Ionicons name="body" size={18} color={Colors.secondary} style={{ marginTop: 2 }} />
                      <Text style={styles.insightItemText}>
                        <Text style={{ fontFamily: Theme.fontFamily.bold }}>{mostFrequentRegion} tension</Text> was your most common body sensation.
                      </Text>
                    </View>
                  )}

                  <View style={styles.insightItemRow}>
                    <Ionicons name="thermometer" size={18} color={Colors.success} style={{ marginTop: 2 }} />
                    <Text style={styles.insightItemText}>
                      Your overall average distress intensity was <Text style={{ fontFamily: Theme.fontFamily.bold }}>{overallAvgIntensity} / 10</Text>.
                    </Text>
                  </View>
                </View>

                {/* Emotion Charts */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Emotion Frequency</Text>
                  {sortedEmotions.map(([emotion, count]) => {
                    const pct = Math.round((count / filteredLogs.length) * 100);
                    return (
                      <View key={emotion} style={styles.freqRow}>
                        <Text style={styles.freqLabel}>{emotion}</Text>
                        <View style={styles.freqBarBg}>
                          <View style={[styles.freqBarFill, { width: `${pct}%`, backgroundColor: Colors.primary }]} />
                        </View>
                        <Text style={styles.freqValue}>{count} ({pct}%)</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Sensation Charts */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Sensation Areas</Text>
                  {sortedRegions.map(([region, count]) => {
                    const pct = Math.round((count / filteredLogs.length) * 100);
                    return (
                      <View key={region} style={styles.freqRow}>
                        <Text style={styles.freqLabel}>{region}</Text>
                        <View style={styles.freqBarBg}>
                          <View style={[styles.freqBarFill, { width: `${pct}%`, backgroundColor: Colors.secondary }]} />
                        </View>
                        <Text style={styles.freqValue}>{count} ({pct}%)</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Recent Entries */}
                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>Recent Entries</Text>
                  <View style={{ gap: 12 }}>
                    {filteredLogs.slice(0, 10).map((log: any) => (
                      <View key={log._id} style={styles.logRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.logEmotion}>{log.emotionLabel}</Text>
                          <Text style={styles.logRegions}>{log.selectedRegions.join(', ')}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.logIntensity, { color: getIntensityLabel(Math.round(log.averageIntensity)).color }]}>
                            {log.averageIntensity} avg
                          </Text>
                          <Text style={styles.logDate}>
                            {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Guided Breathing Modal */}
      <Modal
        visible={showBreathingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBreathingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          
          <View style={styles.breathingContainer}>
            <Text style={styles.breathingTitle}>Guided Breathing</Text>
            <Text style={styles.breathingSubtitle}>Follow the circle animation. Inhale, hold, exhale.</Text>

            <View style={styles.breathingAnimationWrapper}>
              <Animated.View 
                style={[
                  styles.breathingCircle,
                  {
                    transform: [{ scale: breatheAnim }],
                    backgroundColor: Colors.primary + '30',
                    borderColor: Colors.primary,
                  }
                ]}
              >
                <Text style={styles.breathStateText}>{breathState}</Text>
              </Animated.View>
            </View>

            <Text style={styles.breathingTimer}>
              {Math.floor(breathingTimeLeft / 60)}:{(breathingTimeLeft % 60).toString().padStart(2, '0')}
            </Text>

            <Button 
              title="Stop & Complete" 
              onPress={handleCompleteBreathing} 
              style={styles.breathingExitBtn} 
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Theme.spacing.lg, paddingTop: 50, paddingBottom: 100 },
  header: { marginBottom: Theme.spacing.lg },
  headerNavRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Theme.spacing.md },
  backBtn: { marginRight: Theme.spacing.md },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: Theme.borderRadius.md,
    padding: 3,
    marginBottom: Theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Theme.borderRadius.md - 2,
  },
  tabButtonActive: {
    backgroundColor: Colors.white,
    ...Theme.shadows.tertiary,
  },
  tabText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  stepCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.secondary,
    width: '100%',
  },
  stepTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
    marginBottom: 8,
  },
  stepSub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Theme.spacing.xl,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: Theme.spacing.xl,
  },
  emotionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emotionChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  emotionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  emotionTextSelected: {
    color: Colors.primary,
  },
  bodyMapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Theme.spacing.lg,
    gap: 12,
  },
  svgWrapper: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bodyListColumn: {
    flex: 1,
    gap: 8,
  },
  bodyRegionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bodyRegionChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  bodyRegionText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  bodyRegionTextSelected: {
    color: Colors.white,
  },
  nextBtn: { marginTop: Theme.spacing.lg, borderRadius: Theme.borderRadius.lg },
  navRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    marginTop: Theme.spacing.lg,
  },
  halfBtn: { flex: 1, borderRadius: Theme.borderRadius.lg },
  backBtnOnly: { marginTop: Theme.spacing.lg, borderRadius: Theme.borderRadius.lg },
  selectorContainer: {
    alignItems: 'center',
    marginVertical: Theme.spacing.md,
    width: '100%',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  stepperBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    ...Theme.shadows.tertiary,
  },
  stepperBtnDisabled: {
    opacity: 0.5,
  },
  valueDisplay: {
    alignItems: 'center',
    minWidth: 100,
  },
  intensityNum: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 64,
    lineHeight: 70,
  },
  intensityLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    marginTop: -4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  intensityDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
    minHeight: 40,
  },
  intensityGrid: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  gridCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCircleUnselected: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  gridCircleText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.lg,
  },
  summaryBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E2E8F0',
  },
  sectionHeading: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: 12,
  },
  breakdownList: {
    gap: 8,
    marginBottom: Theme.spacing.xl,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  breakdownRegion: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
  },
  breakdownRating: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
  },
  breakdownLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
  },
  feedbackCard: {
    backgroundColor: Colors.primary + '08',
    borderColor: Colors.primary + '20',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
  },
  feedbackTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.primary,
    marginBottom: 4,
  },
  feedbackText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  clinicalAlertCard: {
    flexDirection: 'row',
    borderColor: '#EA580C',
    borderWidth: 1.5,
    backgroundColor: '#FFF7ED',
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    gap: 10,
  },
  clinicalAlertTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: '#9A3412',
    marginBottom: 2,
  },
  clinicalAlertText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: '#C2410C',
    lineHeight: 16,
  },
  actionsContainer: {
    gap: 12,
    marginVertical: Theme.spacing.md,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    backgroundColor: '#FDFDFF',
    borderWidth: 1.5,
    borderColor: Colors.primary + '20',
    gap: 14,
  },
  actionIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionEmoji: {
    fontSize: 28,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.primary,
    marginBottom: 2,
  },
  actionDesc: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  breathingContainer: {
    width: width - 40,
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    alignItems: 'center',
    ...Theme.shadows.primary,
  },
  breathingTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xl,
    color: Colors.text,
    marginBottom: 8,
  },
  breathingSubtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xxl,
  },
  breathingAnimationWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.xxl,
  },
  breathingCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathStateText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.primary,
  },
  breathingTimer: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 32,
    color: Colors.text,
    marginBottom: Theme.spacing.xl,
  },
  breathingExitBtn: {
    width: '100%',
    borderRadius: Theme.borderRadius.lg,
  },
  historyContainer: {
    width: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Theme.spacing.xl,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  filterBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  filterBtnText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.textSecondary,
  },
  filterBtnTextActive: {
    color: Colors.primary,
  },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.secondary,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginTop: Theme.spacing.md,
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  insightsCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.secondary,
    borderWidth: 1.5,
    borderColor: Colors.primary + '20',
  },
  insightsHeader: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.primary,
    marginBottom: Theme.spacing.md,
    letterSpacing: 1,
  },
  insightItemRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  insightItemText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadows.secondary,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsCardTitle: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.md,
    color: Colors.text,
    marginBottom: Theme.spacing.md,
  },
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  freqLabel: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
    width: 70,
  },
  freqBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  freqBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  freqValue: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.xs,
    color: Colors.text,
    width: 60,
    textAlign: 'right',
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  logEmotion: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
    color: Colors.text,
    marginBottom: 2,
  },
  logRegions: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textSecondary,
  },
  logIntensity: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: Theme.fontSize.sm,
  },
  logDate: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: Theme.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
