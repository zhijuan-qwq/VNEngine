import type EventBus from '@/core/EventBus';
import AudioTrack from './AudioTrack';
import AudioTrackPool from './AudioTrackPool';
import type { EngineEvents } from '@/types/events';
import type ResourceManager from '@/resource/ResourceManager';
import type { IAudioManager } from '@/types/engine';

class AudioManager implements IAudioManager {
  private context: AudioContext;
  private masterGain: GainNode;
  private bgmBus: GainNode;
  private seBus: GainNode;
  private voiceBus: GainNode;
  private bgmTrack: AudioTrack;
  private ambientTrack: AudioTrack;
  private sePool: AudioTrackPool;
  private voiceTrack: AudioTrack;
  private resourceManager: ResourceManager;
  private eventBus: EventBus<EngineEvents>;
  private currentBgmId: string;

  constructor(
    eventBus: EventBus<EngineEvents>,
    maxSeTracks: number,
    resourceManager: ResourceManager,
  ) {
    this.eventBus = eventBus;
    this.resourceManager = resourceManager;
    this.context = this.createAudioContext();
    this.masterGain = this.context.createGain();
    this.bgmBus = this.context.createGain();
    this.seBus = this.context.createGain();
    this.voiceBus = this.context.createGain();
    this.sePool = new AudioTrackPool(maxSeTracks, this.context);
    this.bgmTrack = new AudioTrack('bgm', this.context, () => {
      if (this.bgmTrack.state === 'stopped') this.currentBgmId = '';
    });
    this.ambientTrack = new AudioTrack('ambient', this.context);
    this.voiceTrack = new AudioTrack('voice', this.context);
    this.currentBgmId = '';
    this.bgmTrack.gain.connect(this.bgmBus);
    this.ambientTrack.gain.connect(this.bgmBus);
    this.voiceTrack.gain.connect(this.voiceBus);
    this.sePool.connect(this.seBus);
    this.bgmBus.connect(this.masterGain);
    this.voiceBus.connect(this.masterGain);
    this.seBus.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);

    this.eventBus.on('audio:play', async (payload) => {
      let buffer: AudioBuffer;
      if (this.resourceManager.cache.audioBuffer.has(payload.id)) {
        buffer = this.resourceManager.cache.audioBuffer.get(
          payload.id,
        ) as AudioBuffer;
      } else {
        buffer = await this.resourceManager.loadAudio(payload.id);
      }
      switch (payload.type) {
        case 'bgm':
          this.playBgm(payload.id, buffer, {
            loop: payload.loop,
            fadeIn: payload.fadeIn,
          });
          if (payload.volume !== undefined) {
            this.bgmTrack.setVolume(payload.volume);
          }
          break;
        case 'se': {
          const track = this.playSe(payload.id, buffer);
          if (track && payload.volume !== undefined) {
            track.setVolume(payload.volume);
          }
          break;
        }
        case 'voice':
          this.playVoice(buffer);
          if (payload.volume !== undefined) {
            this.voiceTrack.setVolume(payload.volume);
          }
          break;
        case 'ambient':
          this.playAmbient(buffer, {
            loop: payload.loop,
            fadeIn: payload.fadeIn,
          });
          if (payload.volume !== undefined) {
            this.ambientTrack.setVolume(payload.volume);
          }
          break;
        default:
          break;
      }
    });

    this.eventBus.on('audio:stop', (payload) => {
      switch (payload.type) {
        case 'bgm':
          this.stopBgm({ fadeOut: payload.fadeOut });
          break;
        case 'se':
          if (payload.id !== undefined) this.sePool.release(payload.id);
          break;
        case 'voice':
          this.voiceTrack.stop({ fadeOut: payload.fadeOut });
          break;
        case 'ambient':
          this.stopAmbient({ fadeOut: payload.fadeOut });
          break;
        default:
          break;
      }
    });
  }

  private createAudioContext(): AudioContext {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return new AudioContextClass();
  }

  public playBgm(
    id: string,
    buffer: AudioBuffer,
    options?: { loop?: boolean; fadeIn?: number },
  ): void {
    this.currentBgmId = id;
    this.bgmTrack.play(buffer, options);
  }

  public stopBgm(options?: { fadeOut?: number }): void {
    this.bgmTrack.stop(options);
    // 无 fade 的立即停止不会触发 onFadeComplete，需在此同步清理
    if (!options?.fadeOut) this.currentBgmId = '';
  }

  public playAmbient(
    buffer: AudioBuffer,
    options?: { loop?: boolean; fadeIn?: number },
  ): void {
    this.ambientTrack.play(buffer, options);
  }

  public stopAmbient(options?: { fadeOut?: number }): void {
    this.ambientTrack.stop(options);
  }

  public playSe(id: string, buffer: AudioBuffer): AudioTrack | null {
    const track = this.sePool.acquire(id);
    track?.play(buffer);
    return track;
  }

  public playVoice(buffer: AudioBuffer): void {
    this.voiceTrack.play(buffer);
  }

  public setMasterVolume(v: number): void {
    this.masterGain.gain.value = v;
  }

  public setSeVolume(v: number): void {
    this.seBus.gain.value = v;
  }

  public setBgmVolume(v: number): void {
    this.bgmBus.gain.value = v;
  }

  public setVoiceVolume(v: number): void {
    this.voiceBus.gain.value = v;
  }

  public update(dt: number): void {
    this.ambientTrack.update(dt);
    this.voiceTrack.update(dt);
    this.sePool.update(dt);
    this.bgmTrack.update(dt);
  }

  public pause(): void {
    this.context.suspend();
  }

  public resume(): void {
    this.context.resume();
  }

  public getState(): { id: string; progress: number } {
    return {
      id: this.currentBgmId,
      progress: this.bgmTrack.currentProgress,
    };
  }

  public setState(state: { id: string; progress: number }): void {
    if (state) {
      this.currentBgmId = state.id;
      this.bgmTrack.currentProgress = state.progress;
    } else {
      this.currentBgmId = '';
      this.bgmTrack.currentProgress = 0;
    }
  }

  public destroy(): void {
    this.bgmTrack.stop();
    this.ambientTrack.stop();
    this.voiceTrack.stop();
    this.sePool.stopAll();
    this.context.close();
  }
}

export default AudioManager;
