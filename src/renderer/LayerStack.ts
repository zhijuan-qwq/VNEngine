import type { DestroyOptions } from 'pixi.js';
import { Container } from 'pixi.js';

/** 图层 zIndex 约定；Renderer 预建 bg/chara/effect/ui，其余按需 addLayer */
export const LAYER_Z_INDEX = {
  bg: 0,
  cg: 100,
  middle: 200,
  chara: 300,
  fore: 400,
  effect: 500,
  ui: 600,
} as const;

export class LayerStack extends Container {
  public readonly layers: Map<string, Container>;

  constructor() {
    super({ sortableChildren: true });
    this.layers = new Map();
  }

  /** 同 id 重复调用只更新 zIndex 并返回已有图层 */
  public addLayer(id: string, zIndex: number): Container {
    const existing = this.layers.get(id);
    if (existing) {
      existing.zIndex = zIndex;
      this.sortChildren();
      return existing;
    }
    const layer = new Container();
    layer.label = id;
    layer.zIndex = zIndex;
    this.layers.set(id, layer);
    this.addChild(layer);
    this.sortChildren();
    return layer;
  }

  public getLayer(id: string): Container | null {
    return this.layers.get(id) ?? null;
  }

  public removeLayer(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    this.layers.delete(id);
    this.removeChild(layer);
    layer.destroy({ children: true });
  }

  public reorderLayer(id: string, newZIndex: number): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.zIndex = newZIndex;
    this.sortChildren();
  }

  public destroy(options?: DestroyOptions): void {
    this.layers.clear();
    super.destroy(options);
  }
}

export default LayerStack;
