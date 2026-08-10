import type { Texture } from 'pixi.js';
import type { AssetManifest } from './engine';
import type { Script } from './script';

export interface ResourceManager {
  loader: AssetLoader;
  manifest: AssetManifest;
  loadImage(id: string): Promise<Texture>;
  loadAudio(id: string): Promise<AudioBuffer>;
  loadScript(id: string): Promise<Script>;
  loadGroup(group: string): Promise<void>;
  preloadScene(label: string): Promise<void>;
  getProgress(): { loaded: number; total: number; percent: number };
  clear(): void;
}

export interface AssetLoader {
  loadImage(url: string): Promise<Texture>; // 委托 pixi Assets.load，返回并缓存 Texture
  loadAudio(url: string): Promise<ArrayBuffer>; // fetch → arrayBuffer
  loadScript(url: string): Promise<string>; // fetch → text
}

export interface ResourceCache<T> {
  get(id: string): T | null;
  set(id: string, value: T, size: number): void;
  has(id: string): boolean;
  delete(id: string): void;
  clear(): void;
}
