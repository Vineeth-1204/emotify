import * as FileSystem from 'expo-file-system/legacy';
import { audioPlayer } from './audioPlayer';
import { TTSResponse, TTSProvider } from './types';

// Fast string hash for local cache filenames
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

const CACHE_DIR = `${FileSystem.cacheDirectory || ''}emotify_tts/`;

class TTSService {
  private activeProvider: TTSProvider | null = null;
  private isCacheDirReady = false;

  private async ensureCacheDirectory(): Promise<void> {
    if (this.isCacheDirReady) return;
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
      this.isCacheDirReady = true;
    } catch (e) {
      console.warn('Failed to initialize TTS cache directory:', e);
    }
  }

  public setProvider(provider: TTSProvider) {
    this.activeProvider = provider;
  }

  /**
   * Get cached audio file URI if available on disk.
   */
  public async getCachedAudioUri(cacheKey: string): Promise<string | null> {
    try {
      await this.ensureCacheDirectory();
      const fileUri = `${CACHE_DIR}${cacheKey}.mp3`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && info.size && info.size > 0) {
        return fileUri;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save base64 audio to local disk cache.
   */
  public async saveAudioToCache(cacheKey: string, base64Audio: string): Promise<string> {
    await this.ensureCacheDirectory();
    const fileUri = `${CACHE_DIR}${cacheKey}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  }

  /**
   * Play TTS audio for a given text and voiceId.
   * Free-tier optimization: Checks local cache first before calling backend.
   */
  public async playTextToSpeech(
    text: string,
    voiceId: string,
    fetchFromBackend: (text: string, voiceId: string) => Promise<TTSResponse>,
    onFinish?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText) return;

    const cacheKey = `tts_${voiceId}_${hashString(cleanText)}`;

    // 1. Check local device cache first (0 network calls if previously cached)
    const cachedUri = await this.getCachedAudioUri(cacheKey);
    if (cachedUri) {
      await audioPlayer.playAudioUri(cachedUri, onFinish, onError);
      return;
    }

    // 2. Fetch synthesized audio from backend (ElevenLabs via Convex action)
    const response = await fetchFromBackend(cleanText, voiceId);

    if (!response.success || !response.audioBase64) {
      const errorMsg = response.message || response.error || 'Failed to synthesize speech';
      console.warn('TTS fetch failed:', errorMsg);
      onError?.(new Error(errorMsg));
      return;
    }

    // 3. Write audio to local cache and play
    try {
      const savedUri = await this.saveAudioToCache(cacheKey, response.audioBase64);
      await audioPlayer.playAudioUri(savedUri, onFinish, onError);
    } catch (saveErr) {
      // Fallback: If file write fails, attempt direct data URI playback
      const dataUri = `data:audio/mp3;base64,${response.audioBase64}`;
      await audioPlayer.playAudioUri(dataUri, onFinish, onError);
    }
  }

  /**
   * Play voice preview sample.
   * Caches preview audio permanently per voiceId on the client.
   */
  public async playVoicePreview(
    voiceId: string,
    sampleText: string,
    fetchFromBackend: (voiceId: string, sampleText: string) => Promise<TTSResponse>,
    onFinish?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    const cacheKey = `preview_${voiceId}`;

    // 1. Check cache first
    const cachedUri = await this.getCachedAudioUri(cacheKey);
    if (cachedUri) {
      await audioPlayer.playAudioUri(cachedUri, onFinish, onError);
      return;
    }

    // 2. Fetch preview audio from backend
    const response = await fetchFromBackend(voiceId, sampleText);
    if (!response.success || !response.audioBase64) {
      const errorMsg = response.message || response.error || 'Preview failed';
      console.warn('TTS preview failed:', errorMsg);
      onError?.(new Error(errorMsg));
      return;
    }

    // 3. Save to cache and play
    const savedUri = await this.saveAudioToCache(cacheKey, response.audioBase64);
    await audioPlayer.playAudioUri(savedUri, onFinish, onError);
  }

  public async stop(): Promise<void> {
    await audioPlayer.stopAudio();
  }
}

export const ttsService = new TTSService();
