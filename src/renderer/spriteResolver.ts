import { Rectangle, Texture } from 'pixi.js';
import type { AssetManifest } from '@/types/engine';

export interface TextureProvider {
  manifest: AssetManifest;
  loadImage(id: string): Promise<Texture>;
  loadSpritesheet(id: string): Promise<Texture>;
}

export const DEFAULT_SPRITE_NAME = 'default';

/**
 * 立绘纹理解析链：
 * ① spritesheets[角色id].frames[立绘名] 从图集裁子纹理
 * ② images[角色id_立绘名]
 * ③ images[立绘名]
 */
export async function resolveCharacterTexture(
  provider: TextureProvider,
  characterId: string,
  spriteName: string = DEFAULT_SPRITE_NAME,
): Promise<Texture> {
  const sheet = provider.manifest.spritesheets[characterId];
  const frame = sheet?.frames[spriteName];
  if (sheet && frame) {
    const sheetTexture = await provider.loadSpritesheet(characterId);
    return new Texture({
      source: sheetTexture.source,
      frame: new Rectangle(frame[0], frame[1], frame[2], frame[3]),
    });
  }
  const prefixed = `${characterId}_${spriteName}`;
  if (provider.manifest.images[prefixed]) {
    return provider.loadImage(prefixed);
  }
  if (provider.manifest.images[spriteName]) {
    return provider.loadImage(spriteName);
  }
  throw new Error(
    `Sprite "${spriteName}" of character "${characterId}" not found in manifest.`,
  );
}

export async function resolveBackgroundTexture(
  provider: TextureProvider,
  backgroundId: string,
): Promise<Texture> {
  if (!provider.manifest.images[backgroundId]) {
    throw new Error(`Background "${backgroundId}" not found in manifest.`);
  }
  return provider.loadImage(backgroundId);
}
