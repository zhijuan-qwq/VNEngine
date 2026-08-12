import type { Texture } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { AssetManifest } from '@/types/engine';
import type { EngineEvents } from '@/types/events';
import type { Script } from '@/types/script';
import AssetLoader from '../AssetLoader';
import ResourceManager from '../ResourceManager';

const { assetsMock } = vi.hoisted(() => ({
  assetsMock: { load: vi.fn(), unload: vi.fn() },
}));

vi.mock('pixi.js', () => ({ Assets: assetsMock }));

const fakeTexture = {} as Texture;
const fakeAudioBuffer = {} as AudioBuffer;
const fakeScript: Script = {
  name: '',
  commands: [],
  labels: new Map(),
  metadata: {},
};

class FakeAudioContext {
  decodeAudioData = vi.fn(async () => fakeAudioBuffer);
  constructor() {
    audioContextInstances.push(this);
  }
}

const audioContextInstances: FakeAudioContext[] = [];

function makeManifest(): AssetManifest {
  return {
    images: { bg1: 'assets/bg1.png' },
    audio: { bgm: 'assets/bgm.mp3' },
    scripts: { ch1: 'scripts/ch1.vns' },
    spritesheets: {
      hero: { url: 'assets/hero.png', frames: { idle: [0, 0, 32, 64] } },
    },
    scenes: {
      start: { images: ['bg1'], audio: ['bgm'], scripts: ['ch1'] },
    },
    groups: {
      common: { images: ['bg1'] },
    },
  };
}

function makeRM(): {
  rm: ResourceManager;
  bus: EventBus<EngineEvents>;
} {
  const bus = new EventBus<EngineEvents>();
  const rm = new ResourceManager(bus, makeManifest());
  return { rm, bus };
}

describe('ResourceManager', () => {
  let rm: ResourceManager;
  let bus: EventBus<EngineEvents>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      webkitAudioContext: undefined,
    });
    audioContextInstances.length = 0;
    assetsMock.load.mockReset();
    assetsMock.unload.mockReset();
    const created = makeRM();
    rm = created.rm;
    bus = created.bus;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const unloadResource = (id: string): void =>
    (rm as unknown as { unloadResource(id: string): void }).unloadResource(id);

  describe('constructor', () => {
    it('exposes a loader, caches and the manifest', () => {
      expect(rm.loader).toBeInstanceOf(AssetLoader);
      expect(rm.cache.audioBuffer).toBeDefined();
      expect(rm.cache.script).toBeDefined();
      expect(rm.manifest).toBeDefined();
    });
  });

  describe('loadManifest', () => {
    it('replaces the current manifest', () => {
      const next = makeManifest();
      next.images = { bg2: 'assets/bg2.png' };

      rm.loadManifest(next);

      expect(rm.manifest).toBe(next);
    });
  });

  describe('loadImage', () => {
    it('loads the texture for an existing image id', async () => {
      assetsMock.load.mockResolvedValue(fakeTexture);

      const texture = await rm.loadImage('bg1');

      expect(assetsMock.load).toHaveBeenCalledWith('assets/bg1.png');
      expect(texture).toBe(fakeTexture);
    });

    it('rejects when the image id is not in the manifest', async () => {
      await expect(rm.loadImage('missing')).rejects.toThrow(
        'Image with id "missing" not found in manifest.',
      );
    });
  });

  describe('loadAudio', () => {
    it('fetches, decodes and caches the audio buffer', async () => {
      const arrayBuffer = new ArrayBuffer(8);
      fetchMock.mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
      });

      const buffer = await rm.loadAudio('bgm');

      expect(fetchMock).toHaveBeenCalledWith('assets/bgm.mp3');
      expect(audioContextInstances).toHaveLength(1);
      expect(audioContextInstances[0].decodeAudioData).toHaveBeenCalledWith(
        arrayBuffer,
      );
      expect(buffer).toBe(fakeAudioBuffer);
      expect(rm.cache.audioBuffer.has('bgm')).toBe(true);
    });

    it('rejects when the audio id is not in the manifest', async () => {
      await expect(rm.loadAudio('missing')).rejects.toThrow(
        'Audio with id "missing" not found in manifest.',
      );
    });
  });

  describe('loadScript', () => {
    it('fetches, parses and caches the script', async () => {
      fetchMock.mockResolvedValue({
        text: vi.fn().mockResolvedValue('@set $a 1\n'),
      });

      const script = await rm.loadScript('ch1');

      expect(fetchMock).toHaveBeenCalledWith('scripts/ch1.vns');
      expect(script.commands).toHaveLength(1);
      expect(rm.cache.script.has('ch1')).toBe(true);
      expect(rm.cache.script.get('ch1')).toBe(script);
    });

    it('rejects when the script id is not in the manifest', async () => {
      await expect(rm.loadScript('missing')).rejects.toThrow(
        'Script with id "missing" not found in manifest.',
      );
    });
  });

  describe('preloadScene', () => {
    it('emits progress then ready and forwards progress to the callback', async () => {
      assetsMock.load.mockResolvedValue(fakeTexture);
      fetchMock.mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        text: vi.fn().mockResolvedValue('@set $a 1\n'),
      });
      const progressSpy = vi.fn();
      const readySpy = vi.fn();
      const onProgress = vi.fn();
      bus.on('resource:progress', progressSpy);
      bus.on('resource:ready', readySpy);

      await rm.preloadScene('start', onProgress);

      expect(progressSpy).toHaveBeenCalledTimes(3);
      expect(progressSpy).toHaveBeenNthCalledWith(1, {
        loaded: 1,
        total: 3,
        percent: 33,
      });
      expect(progressSpy).toHaveBeenNthCalledWith(3, {
        loaded: 3,
        total: 3,
        percent: 100,
      });
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(readySpy).toHaveBeenCalledOnce();
      expect(readySpy).toHaveBeenCalledWith({});
    });

    it('rejects when the scene label is not in the manifest', async () => {
      await expect(rm.preloadScene('missing')).rejects.toThrow(
        'Scene with label "missing" not found in manifest.',
      );
    });
  });

  describe('loadGroup', () => {
    it('emits progress and ready for the group', async () => {
      assetsMock.load.mockResolvedValue(fakeTexture);
      const progressSpy = vi.fn();
      const readySpy = vi.fn();
      bus.on('resource:progress', progressSpy);
      bus.on('resource:ready', readySpy);

      await rm.loadGroup('common');

      expect(progressSpy).toHaveBeenCalledWith({
        loaded: 1,
        total: 1,
        percent: 100,
      });
      expect(readySpy).toHaveBeenCalledOnce();
    });

    it('rejects when the group id is not in the manifest', async () => {
      await expect(rm.loadGroup('missing')).rejects.toThrow(
        'Group with id "missing" not found in manifest.',
      );
    });
  });

  describe('clear', () => {
    it('empties both caches', async () => {
      fetchMock.mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        text: vi.fn().mockResolvedValue('@set $a 1\n'),
      });
      await rm.loadAudio('bgm');
      await rm.loadScript('ch1');
      expect(rm.cache.audioBuffer.has('bgm')).toBe(true);
      expect(rm.cache.script.has('ch1')).toBe(true);

      rm.clear();

      expect(rm.cache.audioBuffer.has('bgm')).toBe(false);
      expect(rm.cache.script.has('ch1')).toBe(false);
    });
  });

  describe('unloadResource', () => {
    it('deletes cache entries and unloads the image url', () => {
      rm.cache.audioBuffer.set('bg1', fakeAudioBuffer);
      rm.cache.script.set('bg1', fakeScript);
      assetsMock.unload.mockResolvedValue(undefined);

      unloadResource('bg1');

      expect(rm.cache.audioBuffer.has('bg1')).toBe(false);
      expect(rm.cache.script.has('bg1')).toBe(false);
      expect(assetsMock.unload).toHaveBeenCalledWith('assets/bg1.png');
    });

    it('unloads the spritesheet url for a spritesheet id', () => {
      assetsMock.unload.mockResolvedValue(undefined);

      unloadResource('hero');

      expect(assetsMock.unload).toHaveBeenCalledWith('assets/hero.png');
    });

    it('does not call Assets.unload for an audio or script id', () => {
      unloadResource('bgm');
      unloadResource('ch1');

      expect(assetsMock.unload).not.toHaveBeenCalled();
    });

    it('swallows a rejection from Assets.unload', () => {
      assetsMock.unload.mockRejectedValue(new Error('boom'));

      expect(() => unloadResource('bg1')).not.toThrow();
    });
  });
});
