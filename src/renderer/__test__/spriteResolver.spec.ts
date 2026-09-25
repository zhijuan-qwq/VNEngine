import { Texture } from 'pixi.js';
import type { AssetManifest } from '@/types/engine';
import {
  DEFAULT_SPRITE_NAME,
  resolveBackgroundTexture,
  resolveCharacterTexture,
  type TextureProvider,
} from '../spriteResolver';

function makeProvider(manifest: Partial<AssetManifest> = {}): {
  provider: TextureProvider;
  loadImage: ReturnType<typeof vi.fn>;
  loadSpritesheet: ReturnType<typeof vi.fn>;
  sheet: Texture;
} {
  const sheet = Texture.WHITE;
  const loadImage = vi.fn(async () => Texture.WHITE);
  const loadSpritesheet = vi.fn(async () => sheet);
  const provider: TextureProvider = {
    manifest: {
      images: {},
      audio: {},
      scripts: {},
      spritesheets: {},
      ...manifest,
    },
    loadImage,
    loadSpritesheet,
  };
  return { provider, loadImage, loadSpritesheet, sheet };
}

describe('resolveCharacterTexture', () => {
  it('should cut a sub-texture out of the character spritesheet frame', async () => {
    const { provider, loadSpritesheet, sheet } = makeProvider({
      spritesheets: {
        hero: { url: 'hero.png', frames: { smile: [2, 4, 32, 64] } },
      },
    });

    const texture = await resolveCharacterTexture(provider, 'hero', 'smile');

    expect(loadSpritesheet).toHaveBeenCalledWith('hero');
    expect(texture).not.toBe(sheet);
    expect(texture.source).toBe(sheet.source);
    expect(texture.frame.x).toBe(2);
    expect(texture.frame.y).toBe(4);
    expect(texture.frame.width).toBe(32);
    expect(texture.frame.height).toBe(64);
  });

  it('should prefer the sheet frame over a same-named image', async () => {
    const { provider, loadImage, loadSpritesheet } = makeProvider({
      images: { hero_smile: 'hero_smile.png', smile: 'smile.png' },
      spritesheets: {
        hero: { url: 'hero.png', frames: { smile: [0, 0, 8, 8] } },
      },
    });

    await resolveCharacterTexture(provider, 'hero', 'smile');

    expect(loadSpritesheet).toHaveBeenCalledTimes(1);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('should fall back to the character-prefixed image id', async () => {
    const { provider, loadImage } = makeProvider({
      images: { hero_smile: 'hero_smile.png', smile: 'smile.png' },
    });

    await resolveCharacterTexture(provider, 'hero', 'smile');

    expect(loadImage).toHaveBeenCalledWith('hero_smile');
  });

  it('should fall back to the bare sprite name image id', async () => {
    const { provider, loadImage } = makeProvider({
      images: { smile: 'smile.png' },
    });

    await resolveCharacterTexture(provider, 'hero', 'smile');

    expect(loadImage).toHaveBeenCalledWith('smile');
  });

  it("should use the 'default' sprite when no name is given", async () => {
    const { provider, loadImage } = makeProvider({
      images: { hero_default: 'hero_default.png' },
    });

    await resolveCharacterTexture(provider, 'hero');

    expect(DEFAULT_SPRITE_NAME).toBe('default');
    expect(loadImage).toHaveBeenCalledWith('hero_default');
  });

  it('should reject when no frame or image matches', async () => {
    const { provider } = makeProvider({ images: { other: 'other.png' } });

    await expect(
      resolveCharacterTexture(provider, 'hero', 'smile'),
    ).rejects.toThrow(
      'Sprite "smile" of character "hero" not found in manifest.',
    );
  });
});

describe('resolveBackgroundTexture', () => {
  it('should load the image registered under the background id', async () => {
    const { provider, loadImage } = makeProvider({
      images: { bg_room: 'bg_room.png' },
    });

    const texture = await resolveBackgroundTexture(provider, 'bg_room');

    expect(loadImage).toHaveBeenCalledWith('bg_room');
    expect(texture).toBe(Texture.WHITE);
  });

  it('should reject for an unknown background id', async () => {
    const { provider } = makeProvider();

    await expect(resolveBackgroundTexture(provider, 'bg_none')).rejects.toThrow(
      'Background "bg_none" not found in manifest.',
    );
  });
});
