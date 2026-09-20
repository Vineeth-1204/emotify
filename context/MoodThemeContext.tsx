import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAppAuth } from '@/utils/auth';
import { getColorsForEmotion, ThemeColorsType, Colors } from '@/constants/Colors';

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

  const activeEmotion = useMemo(() => {
    if (recentEmotions && recentEmotions.length > 0) {
      return recentEmotions[0].emotion;
    }
    return null;
  }, [recentEmotions]);

  const colors = useMemo(() => {
    return getColorsForEmotion(activeEmotion);
  }, [activeEmotion]);

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

