import type { AssetManifest } from './engine';

export interface ResourceManager {
  loader: AssetLoader;
  manifest: AssetManifest;
  loadImage(id: string): Promise<import('./engine').Texture>;
  loadScript(id: string): Promise<import('./script').Script>;
  loadGroup(group: string): Promise<void>;
  getProgress(): { loaded: number; total: number; percent: number };
  clear(): void;
}

export interface AssetLoader {
  loadImage(url: string): Promise<HTMLImageElement>;
  loadImageBitmap(url: string): Promise<ImageBitmap>;
  loadAudio(url: string): Promise<ArrayBuffer>;
  loadScript(url: string): Promise<string>;
}

export interface ResourceCache<T> {
  get(id: string): T | null;
  set(id: string, value: T, size: number): void;
  has(id: string): boolean;
  delete(id: string): void;
  clear(): void;
}
