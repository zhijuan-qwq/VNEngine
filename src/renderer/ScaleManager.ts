import type { Container, PointData } from 'pixi.js';
import type { ScaleMode } from '@/types/engine';

export interface Size {
  width: number;
  height: number;
}

/** 逻辑分辨率 → 画布映射；渲染与输入共用同一坐标基准 */
export class ScaleManager {
  public readonly mode: ScaleMode;
  public readonly logical: Size;
  private readonly target: Container;

  constructor(target: Container, mode: ScaleMode, logical: Size) {
    if (!(logical.width > 0) || !(logical.height > 0)) {
      throw new RangeError('ScaleManager requires a positive logical size');
    }
    this.target = target;
    this.mode = mode;
    this.logical = { width: logical.width, height: logical.height };
    this.update(this.logical);
  }

  public update(containerSize: Size): void {
    const viewWidth = Math.max(containerSize.width, 0);
    const viewHeight = Math.max(containerSize.height, 0);
    const { width, height } = this.logical;

    if (this.mode === 'stretch') {
      this.target.scale.set(viewWidth / width, viewHeight / height);
      this.target.position.set(0, 0);
      return;
    }

    const scale =
      this.mode === 'fixed'
        ? 1
        : Math.min(viewWidth / width, viewHeight / height);
    this.target.scale.set(scale);
    this.target.position.set(
      (viewWidth - width * scale) / 2,
      (viewHeight - height * scale) / 2,
    );
  }

  public toLogical(global: PointData): { x: number; y: number } {
    const point = this.target.toLocal(global);
    return { x: point.x, y: point.y };
  }
}

export default ScaleManager;
