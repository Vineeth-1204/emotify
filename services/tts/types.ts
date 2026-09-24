export interface TTSResponse {
  success: boolean;
  audioBase64?: string;
  format?: string;
  error?: string;
  message?: string;
}

export type AudioPlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface TTSProvider {
  name: string;
  generateSpeech: (text: string, voiceId: string) => Promise<TTSResponse>;
}
