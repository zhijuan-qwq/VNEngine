import type EventBus from '@/core/EventBus';
import type { AssetManifest } from '@/types/engine';
import type {
  IResourceManager,
  ProgressCallback,
  ProgressInfo,
} from '@/types/resource';
import type { Script } from '@/types/script';
import type { EngineEvents } from '@/types/events';
import { Assets, type Texture } from 'pixi.js';
import AssetLoader from './AssetLoader';
import Preloader from './Preloader';
import ResourceCache from './ResourceCache';
import Parser from '@/script/Parser';

type ResCache = {
  audioBuffer: ResourceCache<AudioBuffer>;
  script: ResourceCache<Script>;
};

class ResourceManager implements IResourceManager {
  private eventBus: EventBus<EngineEvents>;
  loader: AssetLoader;
  cache: ResCache;
  public manifest: AssetManifest;
  private preloader: Preloader;

  constructor(eventBus: EventBus<EngineEvents>, manifest: AssetManifest) {
    this.eventBus = eventBus;
    this.manifest = manifest;
    this.loader = new AssetLoader();
    this.preloader = new Preloader({
      loadImage: (id) => this.loadImage(id),
      loadAudio: (id) => this.loadAudio(id),
      loadScript: (id) => this.loadScript(id),
      unloadResource: (id) => this.unloadResource(id),
    });
    this.cache = {
      audioBuffer: new ResourceCache<AudioBuffer>(),
      script: new ResourceCache<Script>(),
    };
  }
  public loadManifest(manifest: AssetManifest): void {
    this.manifest = manifest;
  }
  private _createAudioContext(): AudioContext {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return new AudioContextClass();
  }

  public async loadImage(id: string): Promise<Texture> {
    const url = this.manifest.images[id];
    if (!url) {
      throw new Error(`Image with id "${id}" not found in manifest.`);
    }
    return this.loader.loadImage(url);
  }
  public async loadAudio(id: string): Promise<AudioBuffer> {
    const url = this.manifest.audio[id];
    if (!url) {
      throw new Error(`Audio with id "${id}" not found in manifest.`);
    }
    const arrayBuffer = await this.loader.loadAudio(url);
    const audioContext = this._createAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    this.cache.audioBuffer.set(id, audioBuffer);
    return audioBuffer;
  }
  public async loadScript(id: string): Promise<Script> {
    const url = this.manifest.scripts[id];
    if (!url) {
      throw new Error(`Script with id "${id}" not found in manifest.`);
    }
    const source = await this.loader.loadScript(url);
    const script: Script = new Parser().parseScript(source);
    this.cache.script.set(id, script);
    return script;
  }
  public async loadGroup(
    group: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    await this.preloader.loadGroup(this.manifest, group, (progress) => {
      this.emitProgress(progress);
      onProgress?.(progress);
    });
    this.eventBus.emit('resource:ready', {});
  }

  public async preloadScene(
    label: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    await this.preloader.loadScene(this.manifest, label, (progress) => {
      this.emitProgress(progress);
      onProgress?.(progress);
    });
    this.eventBus.emit('resource:ready', {});
  }
  private emitProgress(progress: ProgressInfo): void {
    this.eventBus.emit('resource:progress', {
      loaded: progress.loaded,
      total: progress.total,
      percent:
        progress.total > 0
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0,
    });
  }
  private unloadResource(id: string): void {
    this.cache.audioBuffer.delete(id);
    this.cache.script.delete(id);
    const url = this.manifest.images[id] ?? this.manifest.spritesheets[id]?.url;
    if (url) {
      Assets.unload(url).catch(() => {});
    }
  }
  public clear(): void {
    this.cache.audioBuffer.clear();
    this.cache.script.clear();
  }
}

export default ResourceManager;
