import type { EasingFn } from '@/types/engine';

export interface TweenOptions {
  /** 时长（毫秒），与事件载荷/DSL 的时长单位一致 */
  duration: number;
  easing?: EasingFn;
  onComplete?: () => void;
}

export interface TweenHandle {
  cancel(): void;
}

interface TweenEntry {
  target: Record<string, unknown>;
  prop: string;
  from: number;
  to: number;
  durationMs: number;
  easing: EasingFn;
  onComplete?: () => void;
  elapsed: number;
}

/** 由 `Renderer.update(dt)` 逐帧推进；dt 单位为秒（与 AudioManager 一致） */
export class TweenEngine {
  /**
   * 在飞的补间。用 Set 而非「快照数组 + 逐帧重建」：重建会让 onComplete 里发出的
   * cancelTarget 落空（已脱离 this.tweens 的待处理补间会被原样放回）
   */
  private readonly live = new Set<TweenEntry>();

  public get activeCount(): number {
    return this.live.size;
  }

  public add<T extends object>(
    target: T,
    prop: keyof T & string,
    to: number,
    options: TweenOptions,
  ): TweenHandle {
    const values = target as Record<string, unknown>;
    const from = values[prop];
    if (typeof from !== 'number' || !Number.isFinite(from)) {
      throw new TypeError(`Tween target.${prop} must be a finite number`);
    }
    const onComplete = options.onComplete;
    if (!(options.duration > 0)) {
      values[prop] = to;
      onComplete?.();
      return { cancel: () => {} };
    }

    const entry: TweenEntry = {
      target: values,
      prop,
      from,
      to,
      durationMs: options.duration,
      easing: options.easing ?? ((t) => t),
      onComplete,
      elapsed: 0,
    };
    this.live.add(entry);
    return { cancel: () => this.drop(entry) };
  }

  public update(dt: number): void {
    if (!(dt > 0) || this.live.size === 0) return;
    // 迭代快照：回调里新加的补间下一帧才推进
    for (const tween of [...this.live]) {
      if (!this.live.has(tween)) continue; // 回调里被取消
      tween.elapsed += dt;
      const duration = tween.durationMs / 1000;
      const t = Math.min(tween.elapsed / duration, 1);
      tween.target[tween.prop] =
        t >= 1
          ? tween.to
          : tween.from + (tween.to - tween.from) * tween.easing(t);
      if (t >= 1) {
        this.drop(tween);
        tween.onComplete?.();
      }
    }
  }

  /** 取消目标上的补间；给定 prop 时只取消该属性（新移动只顶掉 x/y，不动同对象的淡入） */
  public cancelTarget(target: object, prop?: string): void {
    for (const tween of [...this.live]) {
      if (
        tween.target === target &&
        (prop === undefined || tween.prop === prop)
      ) {
        this.drop(tween);
      }
    }
  }

  public cancelAll(): void {
    this.live.clear();
  }

  private drop(entry: TweenEntry): void {
    this.live.delete(entry);
  }
}

export default TweenEngine;
