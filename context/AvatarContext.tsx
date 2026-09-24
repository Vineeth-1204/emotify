import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAppAuth } from '@/utils/auth';
import { AvatarState } from '@/components/avatar/MitraAvatar';

export type HomeEmotionCard = 'good' | 'calm' | 'low' | 'heavy';

export interface EmotionResolution {
  primaryEmotion: string; // 'happy' | 'calm' | 'sad' | 'worried'
  backendCode: string;   // 'E01' | 'E02' | 'E03' | 'E04'
  avatarState: AvatarState;
  secondaryOptions?: { id: string; label: string; avatarState: AvatarState }[];
}

interface AvatarContextType {
  avatarName: string;
  setAvatarName: (name: string) => Promise<void>;
  avatarState: AvatarState;
  setAvatarState: (newState: AvatarState, priority?: number) => void;
  triggerSafetyState: () => void;
  clearSafetyState: () => void;
  isSafetyActive: boolean;
  ageGroup: '13-18' | '19-24';
  ageCohort: '13-18' | '19-24';
  resolveHomeCard: (card: HomeEmotionCard) => EmotionResolution;
  memoryMessage: string | null;
  awardCalmPointAnimation: () => void;
  isCelebrating: boolean;
  copy: {
    greeting: string;
    howAreYou: string;
    intensityQuestion: string;
    resetPrompt: string;
    skipReassurance: string;
  };
  getDialogue: (key: string) => string;
}

const AvatarContext = createContext<AvatarContextType | undefined>(undefined);

// State priority levels per Section A.1
const PRIORITY_LEVELS: Record<AvatarState, number> = {
  supportive: 1, // Highest - cannot be interrupted except by exiting safety flow
  breathing: 2,
  thinking: 2,
  worried: 3,
  sad: 3,
  angry: 3,
  happy: 3,
  tired: 3,
  celebrating: 4,
  encouraging: 4,
  listening: 5,
  calm: 5,
  idle: 5,      // Lowest
};

export const AvatarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAppAuth();
  const dbUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : 'skip');
  const latestTriage = useQuery(api.triage.getLatest, user?.id ? { userId: user.id } : 'skip');
  const userGoals = useQuery(api.microGoals.getUserGoals, user?.id ? { userId: user.id } : 'skip');

  const [avatarState, setInternalAvatarState] = useState<AvatarState>('idle');
  const [avatarName, setAvatarNameState] = useState<string>('Mitra');
  const [isSafetyActive, setIsSafetyActive] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);

  useEffect(() => {
    const loadAvatarName = async () => {
      try {
        const stored = await AsyncStorage.getItem('@emotify_avatar_name');
        if (stored && stored.trim().length > 0) {
          setAvatarNameState(stored.trim());
        }
      } catch (e) {
        console.error('Failed to load avatar name:', e);
      }
    };
    loadAvatarName();
  }, []);

  const setAvatarName = useCallback(async (name: string) => {
    const cleanName = name.trim() || 'Mitra';
    setAvatarNameState(cleanName);
    try {
      await AsyncStorage.setItem('@emotify_avatar_name', cleanName);
    } catch (e) {
      console.error('Failed to save avatar name:', e);
    }
  }, []);

  // Age Group detection: default to 13-18 if <=18 or undefined; 19-24 if >=19
  const ageGroup: '13-18' | '19-24' = useMemo(() => {
    if (dbUser?.age && dbUser.age >= 19) {
      return '19-24';
    }
    return '13-18';
  }, [dbUser?.age]);

  // Section A.1: Safety State Guard
  const isSevereTriage = latestTriage && ['suicide_flag', 'psychosis_flag', 'severe'].includes(latestTriage.level);

  useEffect(() => {
    if (isSevereTriage && !isSafetyActive) {
      setIsSafetyActive(true);
      setInternalAvatarState('supportive');
    }
  }, [isSevereTriage]);

  // State setter with strict priority enforcement
  const setAvatarState = useCallback((newState: AvatarState, customPriority?: number) => {
    // Priority 1 invariant: Safety state cannot be overridden
    if (isSafetyActive && newState !== 'supportive') {
      return;
    }

    const currentPriority = PRIORITY_LEVELS[avatarState] ?? 5;
    const requestedPriority = customPriority ?? PRIORITY_LEVELS[newState] ?? 5;

    // Only allow change if requested priority is higher (numerically lower) or equal
    if (requestedPriority <= currentPriority || currentPriority === 5) {
      setInternalAvatarState(newState);

      // Auto-decay celebration after 2.5 seconds
      if (newState === 'celebrating') {
        setIsCelebrating(true);
        setTimeout(() => {
          setIsCelebrating(false);
          setInternalAvatarState((prev) => (prev === 'celebrating' ? 'idle' : prev));
        }, 2500);
      }
    }
  }, [avatarState, isSafetyActive]);

  const triggerSafetyState = useCallback(() => {
    setIsSafetyActive(true);
    setInternalAvatarState('supportive');
  }, []);

  const clearSafetyState = useCallback(() => {
    setIsSafetyActive(false);
    setInternalAvatarState('idle');
  }, []);

  const awardCalmPointAnimation = useCallback(() => {
    setAvatarState('celebrating');
  }, [setAvatarState]);

  // 8-Emotion -> 4-Card Resolution per Section 0.2
  const resolveHomeCard = useCallback((card: HomeEmotionCard): EmotionResolution => {
    switch (card) {
      case 'good':
        return {
          primaryEmotion: 'happy',
          backendCode: 'E01',
          avatarState: 'happy',
        };
      case 'calm':
        return {
          primaryEmotion: 'calm',
          backendCode: 'E02',
          avatarState: 'calm',
        };
      case 'low':
        return {
          primaryEmotion: 'sad',
          backendCode: 'E03',
          avatarState: 'sad',
          secondaryOptions: [
            { id: 'sad', label: 'Low Mood', avatarState: 'sad' },
            { id: 'tired', label: 'Exhausted', avatarState: 'tired' },
            { id: 'guilty', label: 'Hard on Myself', avatarState: 'sad' },
          ],
        };
      case 'heavy':
        return {
          primaryEmotion: 'worried',
          backendCode: 'E04',
          avatarState: 'worried',
          secondaryOptions: [
            { id: 'worried', label: 'Worry / Anxious', avatarState: 'worried' },
            { id: 'angry', label: 'Frustrated', avatarState: 'angry' },
            { id: 'embarrassed', label: 'Self-Conscious', avatarState: 'worried' },
          ],
        };
    }
  }, []);

  // Section 15: Avatar Memory / Personalization from past effective interventions
  const memoryMessage = useMemo(() => {
    if (!userGoals || userGoals.length === 0) return null;

    // Find goals that student marked feelingAfter === 'better'
    const helpfulGoals = userGoals.filter((g: any) => g.completed && g.feelingAfter === 'better');
    if (helpfulGoals.length === 0) return null;

    const recentHelpful = helpfulGoals[0];
    const category = recentHelpful.category?.toLowerCase() || '';

    if (category.includes('breath')) {
      return ageGroup === '13-18'
        ? 'Breathing helped last time. Want to try it again?'
        : 'Breathing worked well for you recently. Ready for a reset?';
    }
    if (category.includes('walk') || category.includes('exercise')) {
      return ageGroup === '13-18'
        ? 'A quick walk helped last time. Want to move a bit?'
        : 'Movement helped recently. Try a brief stretch or walk?';
    }
    if (category.includes('hydrat') || recentHelpful.goalId === 'water') {
      return 'Drinking water helped last time. Have a glass nearby?';
    }

    return ageGroup === '13-18'
      ? `${recentHelpful.goalTitle} helped before. Want to do that?`
      : `${recentHelpful.goalTitle} was effective last time.`;
  }, [userGoals, ageGroup]);

  // Age-cohort copywriting tokens
  const copy = useMemo(() => {
    if (ageGroup === '19-24') {
      return {
        greeting: 'Hello',
        howAreYou: "How's today feeling?",
        intensityQuestion: 'How strong is it right now?',
        resetPrompt: 'Need a 2-min reset?',
        skipReassurance: 'No worries. We can try later.',
      };
    }
    // 13-18
    return {
      greeting: 'Hey there',
      howAreYou: "How's today going?",
      intensityQuestion: 'Feeling a lot, or just a bit?',
      resetPrompt: 'Want a quick 2-min reset?',
      skipReassurance: 'All good! We can always try later.',
    };
  }, [ageGroup]);

  const getDialogue = useCallback(
    (key: string) => {
      switch (key) {
        case 'greeting':
          return copy.greeting;
        case 'checkinPrompt':
        case 'howAreYou':
          return copy.howAreYou;
        case 'intensityQuestion':
          return copy.intensityQuestion;
        case 'resetPrompt':
          return copy.resetPrompt;
        case 'skipReassurance':
          return copy.skipReassurance;
        default:
          return memoryMessage || copy.greeting;
      }
    },
    [copy, memoryMessage]
  );

  return (
    <AvatarContext.Provider
      value={{
        avatarName,
        setAvatarName,
        avatarState,
        setAvatarState,
        triggerSafetyState,
        clearSafetyState,
        isSafetyActive,
        ageGroup,
        ageCohort: ageGroup,
        resolveHomeCard,
        memoryMessage,
        awardCalmPointAnimation,
        isCelebrating,
        copy,
        getDialogue,
      }}
    >
      {children}
    </AvatarContext.Provider>
  );
};

export const useAvatar = () => {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error('useAvatar must be used within an AvatarProvider');
  }
  return context;
};
