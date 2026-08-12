import type { Texture } from 'pixi.js';
import type { AssetManifest } from './engine';
import type { Script } from './script';

export interface ProgressInfo {
  loaded: number;
  total: number;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

export interface IResourceManager {
  loader: IAssetLoader;
  manifest: AssetManifest;
  loadManifest(manifest: AssetManifest): void;
  loadImage(id: string): Promise<Texture>;
  loadAudio(id: string): Promise<AudioBuffer>;
  loadScript(id: string): Promise<Script>;
  loadGroup(group: string, onProgress?: ProgressCallback): Promise<void>;
  preloadScene(label: string, onProgress?: ProgressCallback): Promise<void>;
  clear(): void;
}

export interface IPreloader {
  loadScene(
    manifest: AssetManifest,
    sceneLabel: string,
    onProgress?: ProgressCallback,
  ): Promise<void>;
  loadGroup(
    manifest: AssetManifest,
    groupLabel: string,
    onProgress?: ProgressCallback,
  ): Promise<void>;
  unloadScene(sceneLabel: string): void;
}

export interface IAssetLoader {
  loadImage(url: string): Promise<Texture>; // 委托 pixi Assets.load，返回并缓存 Texture
  loadAudio(url: string): Promise<ArrayBuffer>; // fetch → arrayBuffer
  loadScript(url: string): Promise<string>; // fetch → text
}

export interface IResourceCache<T> {
  get(id: string): T | null;
  set(id: string, value: T): void;
  has(id: string): boolean;
  delete(id: string): void;
  clear(): void;
}
