import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type ResourceManager from '@/resource/ResourceManager';
import AudioManager from '../AudioManager';
import type AudioTrack from '../AudioTrack';
import {
  FakeAudioContext,
  asFakeGain,
  makeAudioBuffer,
} from '@/__testUtils__/fakeWebAudio';

type AudioManagerInternals = {
  masterGain: GainNode;
  bgmBus: GainNode;
  seBus: GainNode;
  voiceBus: GainNode;
  bgmTrack: AudioTrack;
  ambientTrack: AudioTrack;
  voiceTrack: AudioTrack;
  sePool: {
    active: Map<string, AudioTrack>;
    release(id: string): void;
  };
  currentBgmId: string;
};

const internals = (manager: AudioManager): AudioManagerInternals =>
  manager as unknown as AudioManagerInternals;

describe('AudioManager', () => {
  let bus: EventBus<EngineEvents>;
  let manager: AudioManager;
  let ctx: FakeAudioContext;
  let cache: Map<string, AudioBuffer>;
  let loadAudio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      webkitAudioContext: undefined,
    });
    bus = new EventBus<EngineEvents>();
    cache = new Map<string, AudioBuffer>();
    loadAudio = vi.fn(async () => makeAudioBuffer());
    const resourceManager = {
      cache: { audioBuffer: cache },
      loadAudio,
    } as unknown as ResourceManager;
    manager = new AudioManager(bus, 4, resourceManager);
    ctx = FakeAudioContext.instances.at(-1) as FakeAudioContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should route every bus into the master gain and the master gain into the destination', () => {
    const m = internals(manager);

    expect(asFakeGain(m.bgmBus).connections).toContain(m.masterGain);
    expect(asFakeGain(m.seBus).connections).toContain(m.masterGain);
    expect(asFakeGain(m.voiceBus).connections).toContain(m.masterGain);
    expect(asFakeGain(m.masterGain).connections).toContain(ctx.destination);
  });

  it('should connect each track to its bus rather than the destination', () => {
    const m = internals(manager);

    expect(asFakeGain(m.bgmTrack.gain).connections).toContain(m.bgmBus);
    expect(asFakeGain(m.ambientTrack.gain).connections).toContain(m.bgmBus);
    expect(asFakeGain(m.voiceTrack.gain).connections).toContain(m.voiceBus);
  });

  it('should connect the master gain alone to the destination', () => {
    const direct = ctx.gains.filter((gain) =>
      gain.connections.includes(ctx.destination),
    );

    expect(direct).toHaveLength(1);
  });

  it('should keep acquired SE tracks on the seBus', () => {
    const m = internals(manager);

    const track = manager.playSe('se1', makeAudioBuffer());

    expect(track).not.toBeNull();
    expect(asFakeGain(track?.gain as GainNode).connections).toContain(m.seBus);
    expect(asFakeGain(track?.gain as GainNode).connections).not.toContain(
      m.masterGain,
    );
  });

  it('should forward volume from an audio:play event to the bgm track', () => {
    cache.set('bgm', makeAudioBuffer());

    bus.emit('audio:play', { id: 'bgm', type: 'bgm', volume: 0.5 });

    expect(asFakeGain(internals(manager).bgmTrack.gain).gain.value).toBe(0.5);
  });

  it('should forward volume to the acquired SE track', () => {
    cache.set('se1', makeAudioBuffer());

    bus.emit('audio:play', { id: 'se1', type: 'se', volume: 0.8 });

    const track = internals(manager).sePool.active.get('se1');
    expect(track).toBeDefined();
    expect(asFakeGain(track?.gain as GainNode).gain.value).toBe(0.8);
  });

  it('should forward volume to the voice track', () => {
    cache.set('v1', makeAudioBuffer());

    bus.emit('audio:play', { id: 'v1', type: 'voice', volume: 0.4 });

    expect(asFakeGain(internals(manager).voiceTrack.gain).gain.value).toBe(0.4);
  });

  it('should play ambient tracks so that @playAmbient takes effect', () => {
    cache.set('rain', makeAudioBuffer());

    bus.emit('audio:play', { id: 'rain', type: 'ambient', loop: true });

    expect(internals(manager).ambientTrack.state).toBe('playing');
  });

  it('should forward volume to the ambient track', () => {
    cache.set('rain', makeAudioBuffer());

    bus.emit('audio:play', { id: 'rain', type: 'ambient', volume: 0.6 });

    expect(asFakeGain(internals(manager).ambientTrack.gain).gain.value).toBe(
      0.6,
    );
  });

  it('should load an uncached buffer through the resource manager before playing', async () => {
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });

    await vi.waitFor(() => {
      expect(loadAudio).toHaveBeenCalledWith('bgm');
    });
    expect(internals(manager).bgmTrack.state).toBe('playing');
  });

  it('should ignore an audio:play event with an unknown type', () => {
    cache.set('x', makeAudioBuffer());

    expect(() =>
      (bus.emit as (event: string, payload: unknown) => void)('audio:play', {
        id: 'x',
        type: 'bogus',
      }),
    ).not.toThrow();
  });

  it('should stop the bgm track and clear its id on audio:stop', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });

    bus.emit('audio:stop', { type: 'bgm' });

    expect(internals(manager).bgmTrack.state).toBe('stopped');
    expect(internals(manager).currentBgmId).toBe('');
  });

  it('should not release an SE track when audio:stop carries no id', () => {
    cache.set('se1', makeAudioBuffer());
    bus.emit('audio:play', { id: 'se1', type: 'se' });
    const release = vi.spyOn(internals(manager).sePool, 'release');

    bus.emit('audio:stop', { type: 'se' });

    expect(release).not.toHaveBeenCalled();
    expect(internals(manager).sePool.active.has('se1')).toBe(true);
  });

  it('should release the SE track when audio:stop carries an id', () => {
    cache.set('se1', makeAudioBuffer());
    bus.emit('audio:play', { id: 'se1', type: 'se' });

    bus.emit('audio:stop', { type: 'se', id: 'se1' });

    expect(internals(manager).sePool.active.has('se1')).toBe(false);
  });

  it('should tolerate SE pool exhaustion during audio:play', () => {
    const smallBus = new EventBus<EngineEvents>();
    const smallCache = new Map<string, AudioBuffer>();
    smallCache.set('a', makeAudioBuffer());
    smallCache.set('b', makeAudioBuffer());
    const smallResourceManager = {
      cache: { audioBuffer: smallCache },
      loadAudio: vi.fn(async () => makeAudioBuffer()),
    } as unknown as ResourceManager;
    const small = new AudioManager(smallBus, 1, smallResourceManager);

    expect(() => {
      smallBus.emit('audio:play', { id: 'a', type: 'se', volume: 0.5 });
      smallBus.emit('audio:play', { id: 'b', type: 'se', volume: 0.5 });
    }).not.toThrow();
    expect(internals(small).sePool.active.has('a')).toBe(true);
    expect(internals(small).sePool.active.has('b')).toBe(false);
  });

  it('should stop the voice track on audio:stop', () => {
    cache.set('v1', makeAudioBuffer());
    bus.emit('audio:play', { id: 'v1', type: 'voice' });

    bus.emit('audio:stop', { type: 'voice' });

    expect(internals(manager).voiceTrack.state).toBe('stopped');
  });

  it('should stop the ambient track on audio:stop', () => {
    cache.set('rain', makeAudioBuffer());
    bus.emit('audio:play', { id: 'rain', type: 'ambient' });

    bus.emit('audio:stop', { type: 'ambient' });

    expect(internals(manager).ambientTrack.state).toBe('stopped');
  });

  it('should apply each volume setter to its own gain node', () => {
    const m = internals(manager);

    manager.setMasterVolume(0.2);
    manager.setBgmVolume(0.3);
    manager.setSeVolume(0.7);
    manager.setVoiceVolume(0.9);

    expect(asFakeGain(m.masterGain).gain.value).toBe(0.2);
    expect(asFakeGain(m.bgmBus).gain.value).toBe(0.3);
    expect(asFakeGain(m.seBus).gain.value).toBe(0.7);
    expect(asFakeGain(m.voiceBus).gain.value).toBe(0.9);
  });

  it('should report the current bgm id and progress', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });
    ctx.currentTime = 2;

    expect(manager.getState()).toEqual({ id: 'bgm', progress: 2 });
  });

  it('should restore the bgm id and progress with setState', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });

    manager.setState({ id: 'other', progress: 5 });

    expect(internals(manager).currentBgmId).toBe('other');
    expect(internals(manager).bgmTrack.currentProgress).toBe(5);
  });

  it('should reset the bgm state when setState receives null', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });

    (manager.setState as (state: unknown) => void)(null);

    expect(internals(manager).currentBgmId).toBe('');
  });

  it('should clear the bgm id once a fade-out completes', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });
    bus.emit('audio:stop', { type: 'bgm', fadeOut: 1000 });
    expect(internals(manager).currentBgmId).toBe('bgm');

    manager.update(1);

    expect(internals(manager).currentBgmId).toBe('');
  });

  it('should keep the bgm id when a fade-in completes', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm', fadeIn: 1000 });

    manager.update(1);

    expect(internals(manager).currentBgmId).toBe('bgm');
    expect(internals(manager).bgmTrack.state).toBe('playing');
  });

  it('should drive fading tracks on update', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm', fadeIn: 1000 });
    expect(internals(manager).bgmTrack.state).toBe('fading');

    manager.update(1);

    expect(internals(manager).bgmTrack.state).toBe('playing');
  });

  it('should suspend and resume the audio context', () => {
    manager.pause();
    manager.resume();

    expect(ctx.suspendCount).toBe(1);
    expect(ctx.resumeCount).toBe(1);
  });

  it('should stop every track and close the context on destroy', () => {
    cache.set('bgm', makeAudioBuffer());
    bus.emit('audio:play', { id: 'bgm', type: 'bgm' });

    manager.destroy();

    const m = internals(manager);
    expect(m.bgmTrack.state).toBe('stopped');
    expect(m.ambientTrack.state).toBe('stopped');
    expect(m.voiceTrack.state).toBe('stopped');
    expect(ctx.closed).toBe(true);
  });
});
