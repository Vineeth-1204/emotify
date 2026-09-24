import { Audio, AVPlaybackStatus } from 'expo-av';
import { AudioPlayerStatus } from './types';

class EmotifyAudioPlayer {
  private currentSound: Audio.Sound | null = null;
  private status: AudioPlayerStatus = 'idle';
  private onStatusChangeListeners: Set<(status: AudioPlayerStatus) => void> = new Set();
  private isAudioModeConfigured = false;

  private async ensureAudioMode() {
    if (this.isAudioModeConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.isAudioModeConfigured = true;
    } catch (e) {
      console.warn('Failed to configure Audio mode:', e);
    }
  }

  public subscribeStatus(listener: (status: AudioPlayerStatus) => void): () => void {
    this.onStatusChangeListeners.add(listener);
    listener(this.status);
    return () => {
      this.onStatusChangeListeners.delete(listener);
    };
  }

  private setStatus(newStatus: AudioPlayerStatus) {
    this.status = newStatus;
    this.onStatusChangeListeners.forEach((listener) => {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('Error in audio status listener:', err);
      }
    });
  }

  public getStatus(): AudioPlayerStatus {
    return this.status;
  }

  public async stopAudio(): Promise<void> {
    if (this.currentSound) {
      try {
        const sound = this.currentSound;
        this.currentSound = null;
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (err) {
        // Ignore unload errors if already unloaded
      }
    }
    this.setStatus('idle');
  }

  public async pauseAudio(): Promise<void> {
    if (this.currentSound && this.status === 'playing') {
      try {
        await this.currentSound.pauseAsync();
        this.setStatus('paused');
      } catch (err) {
        console.warn('Failed to pause audio:', err);
      }
    }
  }

  public async resumeAudio(): Promise<void> {
    if (this.currentSound && this.status === 'paused') {
      try {
        await this.currentSound.playAsync();
        this.setStatus('playing');
      } catch (err) {
        console.warn('Failed to resume audio:', err);
      }
    }
  }

  public async playAudioUri(
    uri: string,
    onFinish?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    await this.ensureAudioMode();
    await this.stopAudio();

    this.setStatus('loading');

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 200 },
        (playbackStatus: AVPlaybackStatus) => {
          if (!playbackStatus.isLoaded) {
            if (playbackStatus.error) {
              console.warn('Playback status error:', playbackStatus.error);
              this.setStatus('error');
              onError?.(playbackStatus.error);
            }
            return;
          }

          if (playbackStatus.isPlaying) {
            if (this.status !== 'playing') {
              this.setStatus('playing');
            }
          } else if (playbackStatus.didJustFinish) {
            this.setStatus('idle');
            this.currentSound = null;
            sound.unloadAsync().catch(() => {});
            onFinish?.();
          }
        }
      );

      this.currentSound = sound;
      this.setStatus('playing');
    } catch (err) {
      console.warn('Failed to load or play audio:', err);
      this.setStatus('error');
      this.currentSound = null;
      onError?.(err);
      throw err;
    }
  }
}

export const audioPlayer = new EmotifyAudioPlayer();
