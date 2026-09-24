import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { AVAILABLE_VOICES, DEFAULT_VOICE_KEY, VoiceConfig, getVoiceByKey } from '@/constants/Voices';
import { ttsService } from '@/services/tts/ttsService';
import { audioPlayer } from '@/services/tts/audioPlayer';
import { AudioPlayerStatus } from '@/services/tts/types';

interface VoiceContextType {
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => Promise<void>;
  selectedVoiceKey: string;
  setSelectedVoiceKey: (key: string) => Promise<void>;
  selectedVoice: VoiceConfig;
  availableVoices: VoiceConfig[];
  isPlaying: boolean;
  isLoadingVoice: boolean;
  activePreviewKey: string | null;
  activeSpeakingMessageId: string | null;
  playPreview: (voiceKey: string) => Promise<void>;
  stopPreview: () => Promise<void>;
  speakText: (text: string, messageId?: string) => Promise<void>;
  stopAudio: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

const STORAGE_VOICE_ENABLED = '@emotify_voice_enabled';
const STORAGE_VOICE_KEY = '@emotify_voice_key';

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [voiceEnabled, setVoiceEnabledState] = useState<boolean>(true);
  const [selectedVoiceKey, setSelectedVoiceKeyState] = useState<string>(DEFAULT_VOICE_KEY);
  const [playerStatus, setPlayerStatus] = useState<AudioPlayerStatus>('idle');
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [activeSpeakingMessageId, setActiveSpeakingMessageId] = useState<string | null>(null);
  const [isLoadingVoice, setIsLoadingVoice] = useState<boolean>(false);

  const generateSpeechAction = useAction(api.tts.generateSpeech);
  const getVoicePreviewAction = useAction(api.tts.getVoicePreview);

  // Subscribe to audio player status updates
  useEffect(() => {
    const unsubscribe = audioPlayer.subscribeStatus((status) => {
      setPlayerStatus(status);
      if (status === 'idle' || status === 'error') {
        setActivePreviewKey(null);
        setActiveSpeakingMessageId(null);
        setIsLoadingVoice(false);
      } else if (status === 'playing') {
        setIsLoadingVoice(false);
      }
    });
    return () => {
      unsubscribe();
      audioPlayer.stopAudio().catch(() => {});
    };
  }, []);

  // Load persisted voice preferences on app start
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storedEnabled = await AsyncStorage.getItem(STORAGE_VOICE_ENABLED);
        if (storedEnabled !== null) {
          setVoiceEnabledState(storedEnabled === 'true');
        }

        const storedKey = await AsyncStorage.getItem(STORAGE_VOICE_KEY);
        if (storedKey && AVAILABLE_VOICES[storedKey]) {
          setSelectedVoiceKeyState(storedKey);
        }
      } catch (err) {
        console.warn('Failed to load voice preferences from AsyncStorage:', err);
      }
    };
    loadPreferences();
  }, []);

  // Persist voice enabled setting
  const setVoiceEnabled = useCallback(async (enabled: boolean) => {
    setVoiceEnabledState(enabled);
    if (!enabled) {
      await audioPlayer.stopAudio().catch(() => {});
    }
    try {
      await AsyncStorage.setItem(STORAGE_VOICE_ENABLED, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save voiceEnabled to AsyncStorage:', e);
    }
  }, []);

  // Persist selected voice key
  const setSelectedVoiceKey = useCallback(async (key: string) => {
    if (AVAILABLE_VOICES[key]) {
      setSelectedVoiceKeyState(key);
      try {
        await AsyncStorage.setItem(STORAGE_VOICE_KEY, key);
      } catch (e) {
        console.warn('Failed to save voiceKey to AsyncStorage:', e);
      }
    }
  }, []);

  const selectedVoice = useMemo(() => {
    return getVoiceByKey(selectedVoiceKey);
  }, [selectedVoiceKey]);

  const availableVoices = useMemo(() => {
    return Object.values(AVAILABLE_VOICES);
  }, []);

  const stopAudio = useCallback(async () => {
    setIsLoadingVoice(false);
    setActivePreviewKey(null);
    setActiveSpeakingMessageId(null);
    await audioPlayer.stopAudio().catch(() => {});
  }, []);

  const stopPreview = useCallback(async () => {
    if (activePreviewKey) {
      await stopAudio();
    }
  }, [activePreviewKey, stopAudio]);

  /**
   * Preview a voice by key.
   * Plays predefined sentence, shows loading state, caches audio.
   */
  const playPreview = useCallback(
    async (voiceKey: string) => {
      const voice = AVAILABLE_VOICES[voiceKey];
      if (!voice) return;

      // If already playing this preview, toggle off
      if (activePreviewKey === voiceKey && playerStatus === 'playing') {
        await stopAudio();
        return;
      }

      await stopAudio();
      setActivePreviewKey(voiceKey);
      setIsLoadingVoice(true);

      try {
        await ttsService.playVoicePreview(
          voice.voiceId,
          voice.previewSampleText,
          async (vId, sample) => {
            return await getVoicePreviewAction({ voiceId: vId, sampleText: sample });
          },
          () => {
            setActivePreviewKey(null);
            setIsLoadingVoice(false);
          },
          (err) => {
            console.warn('Voice preview playback error:', err?.message || err);
            setActivePreviewKey(null);
            setIsLoadingVoice(false);
          }
        );
      } catch (e) {
        console.warn('Failed to start voice preview:', e);
        setActivePreviewKey(null);
        setIsLoadingVoice(false);
      }
    },
    [activePreviewKey, playerStatus, getVoicePreviewAction, stopAudio]
  );

  /**
   * Synthesize and play response text using selected voice.
   * Gracefully falls back if TTS fails; text output is never blocked.
   */
  const speakText = useCallback(
    async (text: string, messageId?: string) => {
      if (!voiceEnabled || !text || text.trim().length === 0) {
        return;
      }

      await stopAudio();

      if (messageId) {
        setActiveSpeakingMessageId(messageId);
      }
      setIsLoadingVoice(true);

      try {
        await ttsService.playTextToSpeech(
          text,
          selectedVoice.voiceId,
          async (cleanText, vId) => {
            return await generateSpeechAction({ text: cleanText, voiceId: vId });
          },
          () => {
            setActiveSpeakingMessageId(null);
            setIsLoadingVoice(false);
          },
          (err) => {
            console.warn('Text-to-speech error (fallback active):', err?.message || err);
            setActiveSpeakingMessageId(null);
            setIsLoadingVoice(false);
          }
        );
      } catch (err) {
        console.warn('Speech playback failed:', err);
        setActiveSpeakingMessageId(null);
        setIsLoadingVoice(false);
      }
    },
    [voiceEnabled, selectedVoice.voiceId, generateSpeechAction, stopAudio]
  );

  const isPlaying = playerStatus === 'playing';

  return (
    <VoiceContext.Provider
      value={{
        voiceEnabled,
        setVoiceEnabled,
        selectedVoiceKey,
        setSelectedVoiceKey,
        selectedVoice,
        availableVoices,
        isPlaying,
        isLoadingVoice,
        activePreviewKey,
        activeSpeakingMessageId,
        playPreview,
        stopPreview,
        speakText,
        stopAudio,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
};
