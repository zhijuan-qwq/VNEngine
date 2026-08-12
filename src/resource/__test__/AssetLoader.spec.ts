import type { Texture } from 'pixi.js';
import AssetLoader from '../AssetLoader';

const { assetsMock } = vi.hoisted(() => ({
  assetsMock: { load: vi.fn(), unload: vi.fn() },
}));

vi.mock('pixi.js', () => ({ Assets: assetsMock }));

const fakeTexture = {} as Texture;

describe('AssetLoader', () => {
  let loader: AssetLoader;

  beforeEach(() => {
    loader = new AssetLoader();
    assetsMock.load.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadImage', () => {
    it('delegates to pixi Assets.load with the given url', async () => {
      assetsMock.load.mockResolvedValue(fakeTexture);

      const texture = await loader.loadImage('assets/bg.png');

      expect(assetsMock.load).toHaveBeenCalledWith('assets/bg.png');
      expect(texture).toBe(fakeTexture);
    });
  });

  describe('loadAudio', () => {
    it('fetches the url and returns the ArrayBuffer', async () => {
      const arrayBuffer = new ArrayBuffer(8);
      const fetchMock = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await loader.loadAudio('assets/audio/bgm.mp3');

      expect(fetchMock).toHaveBeenCalledWith('assets/audio/bgm.mp3');
      expect(result).toBe(arrayBuffer);
    });
  });

  describe('loadScript', () => {
    it('fetches the url and returns the script text', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('@set $a 1\n'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await loader.loadScript('scripts/ch1.vns');

      expect(fetchMock).toHaveBeenCalledWith('scripts/ch1.vns');
      expect(result).toBe('@set $a 1\n');
    });
  });
});
