import type { Texture } from 'pixi.js';
import type { AssetManifest, ResourceGroupConfig } from '@/types/engine';
import type { Script } from '@/types/script';
import Preloader from '../Preloader';

const fakeTexture = {} as Texture;
const fakeAudioBuffer = {} as AudioBuffer;
const fakeScript: Script = {
  name: '',
  commands: [],
  labels: new Map(),
  metadata: {},
};

function makeManifest(
  scenes?: Record<string, ResourceGroupConfig>,
  groups?: Record<string, ResourceGroupConfig>,
): AssetManifest {
  const manifest: AssetManifest = {
    images: {},
    audio: {},
    scripts: {},
    spritesheets: {},
  };
  if (scenes) manifest.scenes = scenes;
  if (groups) manifest.groups = groups;
  return manifest;
}

function makeDeps() {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      loadImage: vi.fn(async (id: string) => {
        calls.push(`img:${id}`);
        return fakeTexture;
      }),
      loadAudio: vi.fn(async (id: string) => {
        calls.push(`aud:${id}`);
        return fakeAudioBuffer;
      }),
      loadScript: vi.fn(async (id: string) => {
        calls.push(`scr:${id}`);
        return fakeScript;
      }),
      unloadResource: vi.fn((id: string) => {
        calls.push(`unload:${id}`);
      }),
    },
  };
}

describe('Preloader', () => {
  describe('loadScene', () => {
    it('rejects when the scene label is not in the manifest', async () => {
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);

      await expect(
        preloader.loadScene(makeManifest(), 'missing'),
      ).rejects.toThrow('Scene with label "missing" not found in manifest.');
    });

    it('loads images, then audio, then scripts in order', async () => {
      const manifest = makeManifest({
        s1: { images: ['bg1', 'bg2'], audio: ['bgm'], scripts: ['ch1'] },
      });
      const { deps, calls } = makeDeps();
      const preloader = new Preloader(deps);

      await preloader.loadScene(manifest, 's1');

      expect(deps.loadImage).toHaveBeenCalledTimes(2);
      expect(deps.loadAudio).toHaveBeenCalledOnce();
      expect(deps.loadScript).toHaveBeenCalledOnce();
      expect(calls).toEqual(['img:bg1', 'img:bg2', 'aud:bgm', 'scr:ch1']);
    });

    it('reports progress with loaded incremented toward the total', async () => {
      const manifest = makeManifest({
        s1: { images: ['a', 'b'], audio: ['c'], scripts: ['d'] },
      });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      const onProgress = vi.fn();

      await preloader.loadScene(manifest, 's1', onProgress);

      expect(onProgress).toHaveBeenCalledTimes(4);
      expect(onProgress).toHaveBeenNthCalledWith(1, {
        loaded: 1,
        total: 4,
      });
      expect(onProgress).toHaveBeenNthCalledWith(4, {
        loaded: 4,
        total: 4,
      });
    });

    it('resolves without progress when the config has no resources', async () => {
      const manifest = makeManifest({ empty: {} });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      const onProgress = vi.fn();

      await expect(
        preloader.loadScene(manifest, 'empty', onProgress),
      ).resolves.toBeUndefined();
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('loads a config containing only images', async () => {
      const manifest = makeManifest({ onlyImg: { images: ['a'] } });
      const { deps, calls } = makeDeps();
      const preloader = new Preloader(deps);

      await preloader.loadScene(manifest, 'onlyImg');

      expect(calls).toEqual(['img:a']);
      expect(deps.loadAudio).not.toHaveBeenCalled();
      expect(deps.loadScript).not.toHaveBeenCalled();
    });

    it('loads a config containing only audio', async () => {
      const manifest = makeManifest({ onlyAud: { audio: ['a'] } });
      const { deps, calls } = makeDeps();
      const preloader = new Preloader(deps);

      await preloader.loadScene(manifest, 'onlyAud');

      expect(calls).toEqual(['aud:a']);
      expect(deps.loadImage).not.toHaveBeenCalled();
      expect(deps.loadScript).not.toHaveBeenCalled();
    });

    it('loads a config containing only scripts', async () => {
      const manifest = makeManifest({ onlyScr: { scripts: ['a'] } });
      const { deps, calls } = makeDeps();
      const preloader = new Preloader(deps);

      await preloader.loadScene(manifest, 'onlyScr');

      expect(calls).toEqual(['scr:a']);
      expect(deps.loadImage).not.toHaveBeenCalled();
      expect(deps.loadAudio).not.toHaveBeenCalled();
    });

    it('propagates a rejection from a load dependency', async () => {
      const manifest = makeManifest({ s1: { images: ['a'] } });
      const { deps } = makeDeps();
      deps.loadImage.mockRejectedValue(new Error('network failure'));
      const preloader = new Preloader(deps);

      await expect(preloader.loadScene(manifest, 's1')).rejects.toThrow(
        'network failure',
      );
    });
  });

  describe('loadGroup', () => {
    it('rejects when the group label is not in the manifest', async () => {
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);

      await expect(
        preloader.loadGroup(makeManifest(), 'missing'),
      ).rejects.toThrow('Group with id "missing" not found in manifest.');
    });

    it('loads resources in order and reports progress', async () => {
      const manifest = makeManifest(undefined, {
        g1: { images: ['x'], audio: ['y'] },
      });
      const { deps, calls } = makeDeps();
      const preloader = new Preloader(deps);
      const onProgress = vi.fn();

      await preloader.loadGroup(manifest, 'g1', onProgress);

      expect(calls).toEqual(['img:x', 'aud:y']);
      expect(onProgress).toHaveBeenNthCalledWith(1, {
        loaded: 1,
        total: 2,
      });
      expect(onProgress).toHaveBeenNthCalledWith(2, {
        loaded: 2,
        total: 2,
      });
    });
  });

  describe('unloadScene', () => {
    it('unloads resources exclusive to the scene', async () => {
      const manifest = makeManifest({
        s1: { images: ['bg1'], audio: ['bgm1'], scripts: ['ch1'] },
        s2: { images: ['bg2'] },
      });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      await preloader.loadScene(manifest, 's1');

      preloader.unloadScene('s1');

      expect(deps.unloadResource).toHaveBeenCalledTimes(3);
      expect(deps.unloadResource).toHaveBeenCalledWith('bg1');
      expect(deps.unloadResource).toHaveBeenCalledWith('bgm1');
      expect(deps.unloadResource).toHaveBeenCalledWith('ch1');
    });

    it('does not unload resources shared with another scene', async () => {
      const manifest = makeManifest({
        s1: { images: ['shared', 'own'] },
        s2: { images: ['shared'] },
      });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      await preloader.loadScene(manifest, 's1');

      preloader.unloadScene('s1');

      expect(deps.unloadResource).toHaveBeenCalledWith('own');
      expect(deps.unloadResource).not.toHaveBeenCalledWith('shared');
    });

    it('does not unload resources shared with a group', async () => {
      const manifest = makeManifest(
        { s1: { images: ['shared', 'own'] } },
        { g1: { images: ['shared'] } },
      );
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      await preloader.loadScene(manifest, 's1');

      preloader.unloadScene('s1');

      expect(deps.unloadResource).toHaveBeenCalledWith('own');
      expect(deps.unloadResource).not.toHaveBeenCalledWith('shared');
    });

    it('does nothing when the scene is not in the loaded manifest', async () => {
      const manifest = makeManifest({ s1: { images: ['a'] } });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      await preloader.loadScene(manifest, 's1');

      expect(() => preloader.unloadScene('missing')).not.toThrow();
      expect(deps.unloadResource).not.toHaveBeenCalled();
    });

    it('does nothing when no manifest has been loaded', () => {
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);

      expect(() => preloader.unloadScene('s1')).not.toThrow();
      expect(deps.unloadResource).not.toHaveBeenCalled();
    });

    it('does nothing when the scene config is empty', async () => {
      const manifest = makeManifest({ empty: {} });
      const { deps } = makeDeps();
      const preloader = new Preloader(deps);
      await preloader.loadScene(manifest, 'empty');

      preloader.unloadScene('empty');

      expect(deps.unloadResource).not.toHaveBeenCalled();
    });
  });
});
