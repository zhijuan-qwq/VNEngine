class AudioTrack {
  public readonly type: 'bgm' | 'se' | 'voice';
  public gain: GainNode;
  public state: 'stopped' | 'playing' | 'paused' | 'fading';
  private source: AudioBufferSourceNode | null;
  private buffer: AudioBuffer | null;
  private context: AudioContext;
  private progress: number;
  private volume: number;
  private fadeElapsed: number;
  private fadeDuration: number;
  private fadeFrom: number;
  private fadeTo: number;
  private fadeTarget: 'playing' | 'stopped';

  constructor(type: 'bgm' | 'se' | 'voice', audioContext: AudioContext) {
    this.type = type;
    this.context = audioContext;
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.source = null;
    this.buffer = null;
    this.state = 'stopped';
    this.progress = 0;
    this.volume = 1;
    this.fadeElapsed = 0;
    this.fadeDuration = 0;
    this.fadeFrom = 0;
    this.fadeTo = 0;
    this.fadeTarget = 'playing';
  }

  play(
    buffer: AudioBuffer,
    options?: { loop?: boolean; fadeIn?: number },
  ): void {
    this.stopSource();
    this.buffer = buffer;
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = options?.loop ?? false;
    this.source.connect(this.gain);
    this.source.start(0);

    const fadeIn = options?.fadeIn ?? 0;
    if (fadeIn > 0) {
      this.state = 'fading';
      this.fadeFrom = 0;
      this.fadeTo = this.volume;
      this.fadeDuration = fadeIn / 1000;
      this.fadeElapsed = 0;
      this.fadeTarget = 'playing';
      this.gain.gain.value = 0;
    } else {
      this.gain.gain.value = this.volume;
      this.state = 'playing';
    }
  }

  stop(options?: { fadeOut?: number }): void {
    if (this.state === 'stopped') return;
    const fadeOut = options?.fadeOut ?? 0;
    if (fadeOut > 0) {
      this.state = 'fading';
      this.fadeFrom = this.gain.gain.value;
      this.fadeTo = 0;
      this.fadeDuration = fadeOut / 1000;
      this.fadeElapsed = 0;
      this.fadeTarget = 'stopped';
    } else {
      this.stopSource();
      this.state = 'stopped';
    }
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'fading') return;
    this.stopSource();
    this.progress = this.context.currentTime;
    this.state = 'paused';
  }

  resume(): void {
    if (this.buffer && this.state === 'paused') {
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.connect(this.gain);
      this.source.start(0, this.progress);
      this.state = 'playing';
    } else {
      console.warn('Cannot resume audio track: no buffer or not paused.');
    }
  }

  update(dt: number): void {
    if (this.state !== 'fading') return;
    this.fadeElapsed += dt;
    const t = Math.min(this.fadeElapsed / this.fadeDuration, 1);
    this.gain.gain.value = this.fadeFrom + (this.fadeTo - this.fadeFrom) * t;
    if (t >= 1) {
      this.gain.gain.value = this.fadeTo;
      this.finishFade();
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.state === 'fading') {
      if (this.fadeTarget === 'playing') this.fadeTo = v;
    } else {
      this.gain.gain.value = v;
    }
  }

  private finishFade(): void {
    if (this.fadeTarget === 'stopped') {
      this.stopSource();
      this.state = 'stopped';
    } else {
      this.state = 'playing';
    }
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // source 已停止时忽略 InvalidStateError
      }
      this.source.disconnect();
      this.source = null;
    }
  }
}

export default AudioTrack;
