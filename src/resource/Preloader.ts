import type { AssetManifest, ResourceGroupConfig } from '@/types/engine';
import type { IPreloader, ProgressCallback } from '@/types/resource';
import type { Script } from '@/types/script';
import type { Texture } from 'pixi.js';

interface PreloaderDeps {
  loadImage: (id: string) => Promise<Texture>;
  loadAudio: (id: string) => Promise<AudioBuffer>;
  loadScript: (id: string) => Promise<Script>;
  unloadResource: (id: string) => void;
}

class Preloader implements IPreloader {
  private deps: PreloaderDeps;
  private manifest: AssetManifest | null = null;

  constructor(deps: PreloaderDeps) {
    this.deps = deps;
  }

  public async loadScene(
    manifest: AssetManifest,
    sceneLabel: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.manifest = manifest;
    const config = manifest.scenes?.[sceneLabel];
    if (!config) {
      throw new Error(
        `Scene with label "${sceneLabel}" not found in manifest.`,
      );
    }
    await this.loadConfig(config, onProgress);
  }

  public async loadGroup(
    manifest: AssetManifest,
    groupLabel: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.manifest = manifest;
    const config = manifest.groups?.[groupLabel];
    if (!config) {
      throw new Error(`Group with id "${groupLabel}" not found in manifest.`);
    }
    await this.loadConfig(config, onProgress);
  }

  public unloadScene(sceneLabel: string): void {
    const config = this.manifest?.scenes?.[sceneLabel];
    if (!config) {
      return;
    }
    const ids = [
      ...(config.images ?? []),
      ...(config.audio ?? []),
      ...(config.scripts ?? []),
    ];
    for (const id of ids) {
      if (!this.isShared(sceneLabel, id)) {
        this.deps.unloadResource(id);
      }
    }
  }

  private async loadConfig(
    config: ResourceGroupConfig,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const total =
      (config.images?.length ?? 0) +
      (config.audio?.length ?? 0) +
      (config.scripts?.length ?? 0);
    let loaded = 0;
    const tick = (): void => {
      loaded++;
      onProgress?.({ loaded, total });
    };
    await this.loadBatch(config.images, this.deps.loadImage, tick);
    await this.loadBatch(config.audio, this.deps.loadAudio, tick);
    await this.loadBatch(config.scripts, this.deps.loadScript, tick);
  }

  private async loadBatch<T>(
    ids: string[] | undefined,
    load: (id: string) => Promise<T>,
    tick: () => void,
  ): Promise<void> {
    if (!ids || ids.length === 0) {
      return;
    }
    await Promise.all(ids.map((id) => load(id).then(tick)));
  }

  private isShared(currentLabel: string, id: string): boolean {
    const manifest = this.manifest;
    if (!manifest) {
      return false;
    }
    for (const [label, config] of Object.entries(manifest.scenes ?? {})) {
      if (label === currentLabel) {
        continue;
      }
      if (this.hasId(config, id)) {
        return true;
      }
    }
    for (const config of Object.values(manifest.groups ?? {})) {
      if (this.hasId(config, id)) {
        return true;
      }
    }
    return false;
  }

  private hasId(config: ResourceGroupConfig, id: string): boolean {
    return Boolean(
      config.images?.includes(id) ||
      config.audio?.includes(id) ||
      config.scripts?.includes(id),
    );
  }
}

export default Preloader;
