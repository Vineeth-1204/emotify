import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAppAuth } from '@/utils/auth';
import { getColorsForEmotion, ThemeColorsType, Colors } from '@/constants/Colors';
import { resolveMoodThemeKey } from '@/common/moodTheme';
import { getLocalDateString } from '@/utils/date';

interface MoodThemeContextType {
  colors: ThemeColorsType;
  activeEmotion: string | null;
}

const MoodThemeContext = createContext<MoodThemeContextType>({
  colors: Colors,
  activeEmotion: null,
});

export function MoodThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAppAuth();
  
  const recentEmotions = useQuery(
    api.emotionLogs.getRecent,
    user?.id ? { userId: user.id } : 'skip'
  );
  // Today's daily check-in is the student's main explicit mood input.
  const todayCheckin = useQuery(
    api.microGoals.getTodayCheckin,
    user?.id ? { dateStr: getLocalDateString() } : 'skip'
  );

  const activeEmotion = useMemo(() => {
    if (recentEmotions && recentEmotions.length > 0) {
      return recentEmotions[0].emotion;
    }
    return null;
  }, [recentEmotions]);

  // Theme follows the most recent explicit mood (check-in or Emotion Map), mapped to a gentle palette.
  const themeKey = useMemo(
    () => resolveMoodThemeKey({ todayCheckin, latestEmotionLog: recentEmotions?.[0] }),
    [todayCheckin, recentEmotions]
  );

  const colors = useMemo(() => {
    return getColorsForEmotion(themeKey);
  }, [themeKey]);

  return (
    <MoodThemeContext.Provider value={{ colors, activeEmotion }}>
      {children}
    </MoodThemeContext.Provider>
  );
}

export function useThemeColors(): ThemeColorsType {
  const context = useContext(MoodThemeContext);
  return context.colors;
}

export function useActiveEmotion(): string | null {
  const context = useContext(MoodThemeContext);
  return context.activeEmotion;
}

export function useStyles<T extends StyleSheet.NamedStyles<T>>(
  styleFactory: (colors: ThemeColorsType) => T
): T {
  const colors = useThemeColors();
  return useMemo(() => {
    if (typeof styleFactory === 'function') {
      try {
        return StyleSheet.create(styleFactory(colors));
      } catch (e) {
        console.warn('useStyles error:', e);
      }
    }
    return {} as T;
  }, [colors, styleFactory]);
}

