import type EventBus from '@/core/EventBus';
import AudioTrack from './AudioTrack';
import AudioTrackPool from './AudioTrackPool';
import type { EngineEvents } from '@/types/events';
import type ResourceManager from '@/resource/ResourceManager';

class AudioManager {
  private context: AudioContext;
  private masterGain: GainNode;
  private bgmBus: GainNode;
  private seBus: GainNode;
  private voiceBus: GainNode;
  private bgmTrack: AudioTrack;
  private sePool: AudioTrackPool;
  private voiceTrack: AudioTrack;
  private resourceManager: ResourceManager;
  private eventBus: EventBus<EngineEvents>;

  constructor(
    eventBus: EventBus<EngineEvents>,
    maxSeTracks: number,
    resourceManager: ResourceManager,
  ) {
    this.eventBus = eventBus;
    this.resourceManager = resourceManager;
    this.context = this._createAudioContext();
    this.masterGain = new GainNode(this.context);
    this.bgmBus = new GainNode(this.context);
    this.seBus = new GainNode(this.context);
    this.voiceBus = new GainNode(this.context);
    this.sePool = new AudioTrackPool(maxSeTracks, this.context);
    this.bgmTrack = new AudioTrack('bgm', this.context);
    this.voiceTrack = new AudioTrack('voice', this.context);
    this.bgmTrack.gain.connect(this.bgmBus);
    this.voiceTrack.gain.connect(this.voiceBus);
    for (const t of this.sePool.pool) {
      t.gain.connect(this.seBus);
    }
    this.bgmBus.connect(this.masterGain);
    this.voiceBus.connect(this.masterGain);
    this.seBus.connect(this.masterGain);

    this.eventBus.on('audio:play', async (payload) => {
      let buffer: AudioBuffer;
      if (this.resourceManager.cache.audioBuffer.has(payload.id)) {
        buffer = this.resourceManager.cache.audioBuffer.get(
          payload.id,
        ) as AudioBuffer;
      } else {
        buffer = await this.resourceManager.loadAudio(payload.id);
      }
      if (!buffer) {
        console.warn(
          `Failed to load ${payload.type}: ${payload.id}.Resource not found`,
        );
      }
      switch (payload.type) {
        case 'bgm':
          this.playBgm(payload.id, buffer, {
            loop: payload.loop,
            fadeIn: payload.fadeIn,
          });
          break;
        case 'se':
          this.playSe(payload.id, buffer);
          break;
        case 'voice':
          this.playVoice(payload.id, buffer);
          break;
        case 'ambient':
          // 后续实现
          break;
        default:
          break;
      }
    });
  }

  private _createAudioContext(): AudioContext {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return new AudioContextClass();
  }

  private _resolveVolumeValue(v: number) {
    if (v > 1) {
      return 1;
    } else if (v < 0) {
      return 0;
    } else {
      return v;
    }
  }

  public playBgm(
    id: string,
    buffer: AudioBuffer,
    options?: { loop?: boolean; fadeIn?: number },
  ): void {
    this.bgmTrack.play(buffer, options);
  }

  public stopBgm(options?: { fadeOut?: number }): void {
    this.bgmTrack.stop(options);
  }

  public playSe(id: string, buffer: AudioBuffer): void {
    const track = this.sePool.acquire(id);
    track?.play(buffer);
  }

  public playVoice(id: string, buffer: AudioBuffer): void {
    this.voiceTrack.play(buffer);
  }

  public setMasterVolume(v: number): void {
    this.masterGain.gain.value = this._resolveVolumeValue(v);
  }

  public setSeVolume(v: number): void {
    this.seBus.gain.value = this._resolveVolumeValue(v);
  }

  public setBgmVolume(v: number): void {
    this.bgmBus.gain.value = this._resolveVolumeValue(v);
  }

  public setVoiceVolume(v: number): void {
    this.voiceBus.gain.value = this._resolveVolumeValue(v);
  }

  public update(dt: number): void {
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
}

export default AudioManager;
