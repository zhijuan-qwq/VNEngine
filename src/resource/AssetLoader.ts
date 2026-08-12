import type { IAssetLoader } from '@/types/resource';
import type { Texture } from 'pixi.js';
import { Assets } from 'pixi.js';

class AssetLoader implements IAssetLoader {
  public async loadImage(url: string): Promise<Texture> {
    return Assets.load(url);
  }
  public async loadAudio(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    return response.arrayBuffer();
  }
  public async loadScript(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
  }
}

export default AssetLoader;
