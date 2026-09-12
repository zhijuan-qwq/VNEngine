import AudioTrack from '../AudioTrack';
import AudioTrackPool from '../AudioTrackPool';
import {
  FakeAudioContext,
  asFakeGain,
  makeAudioBuffer,
  makeAudioContext,
} from '@/__testUtils__/fakeWebAudio';

describe('AudioTrackPool', () => {
  let context: AudioContext;
  let fake: FakeAudioContext;
  let pool: AudioTrackPool;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    ({ context, fake } = makeAudioContext());
    pool = new AudioTrackPool(2, context);
  });

  const internals = (target: AudioTrackPool) =>
    target as unknown as {
      pool: AudioTrack[];
      active: Map<string, AudioTrack>;
    };

  it('should hand out a track for a new id', () => {
    const track = pool.acquire('se1');

    expect(track).toBeInstanceOf(AudioTrack);
    expect(internals(pool).active.get('se1')).toBe(track);
  });

  it('should reuse the same track when the same id is acquired again', () => {
    const first = pool.acquire('se1');

    const second = pool.acquire('se1');

    expect(second).toBe(first);
  });

  it('should return null when the pool is exhausted', () => {
    expect(pool.acquire('a')).not.toBeNull();
    expect(pool.acquire('b')).not.toBeNull();

    expect(pool.acquire('c')).toBeNull();
  });

  it('should return a released track to the pool for reuse', () => {
    const first = pool.acquire('a');

    pool.release('a');
    expect(internals(pool).active.has('a')).toBe(false);
    expect(pool.acquire('c')).toBe(first);
  });

  it('should ignore release of an unknown id', () => {
    expect(() => pool.release('missing')).not.toThrow();
    expect(internals(pool).active.size).toBe(0);
  });

  it('should drive fade updates for active tracks', () => {
    const track = pool.acquire('a');
    track?.play(makeAudioBuffer(), { fadeIn: 1000 });

    pool.update(1);

    expect(track?.state).toBe('playing');
  });

  it('should stop and reclaim every active track', () => {
    const a = pool.acquire('a');
    pool.acquire('b');

    pool.stopAll();

    expect(internals(pool).active.size).toBe(0);
    expect(internals(pool).pool).toHaveLength(2);
    expect(a?.state).toBe('stopped');
  });

  it('should not throw when updating with no active tracks', () => {
    expect(() => pool.update(0.016)).not.toThrow();
  });

  it('should connect every pooled track to the given bus', () => {
    const bus = fake.createGain();

    pool.connect(bus);

    for (const track of internals(pool).pool) {
      expect(asFakeGain(track.gain).connections).toContain(bus);
    }
  });
});
