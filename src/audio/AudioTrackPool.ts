import AudioTrack from './AudioTrack';

class AudioTrackPool {
  private maxTracks: number;
  public readonly pool: AudioTrack[];
  private active: Map<string, AudioTrack>;
  private context: AudioContext;

  constructor(maxTracks: number, context: AudioContext) {
    this.maxTracks = maxTracks;
    this.pool = [];
    this.active = new Map();
    this.context = context;
    for (let i = 0; i < this.maxTracks; i++) {
      this.pool.push(new AudioTrack('se', this.context));
    }
  }

  public acquire(id: string): AudioTrack | null {
    if (this.active.has(id)) {
      return this.active.get(id) || null;
    }
    if (this.pool.length > 0) {
      const track = this.pool.pop();
      if (track) {
        this.active.set(id, track);
        return track;
      }
    }
    return null;
  }
  public release(id: string): void {
    const track = this.active.get(id);
    if (track) {
      track.stop();
      this.active.delete(id);
      this.pool.push(track);
    }
  }
  public update(dt: number): void {
    for (const track of this.active.values()) {
      track.update(dt);
    }
  }
  public stopAll(): void {
    for (const [id, track] of this.active.entries()) {
      track.stop();
      this.active.delete(id);
      this.pool.push(track);
    }
  }
}

export default AudioTrackPool;
