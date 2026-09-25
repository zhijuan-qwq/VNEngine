import type { Container } from 'pixi.js';
import { Color, Graphics } from 'pixi.js';
import type { Size } from '../ScaleManager';
import type { TweenEngine, TweenHandle } from '../tween';

export const DEFAULT_FLASH_COLOR = 0xffffff;

/** 把脚本里的颜色规整为 pixi 可用值；空值或非法值回退白色 */
export function resolveColor(color?: string): string | number {
  if (!color) return DEFAULT_FLASH_COLOR;
  try {
    return new Color(color).toHex();
  } catch {
    return DEFAULT_FLASH_COLOR;
  }
}

export interface FlashEffectOptions {
  parent: Container;
  tweens: TweenEngine;
  size: Size;
  /** 毫秒 */
  duration: number;
  color?: string;
  onDone: () => void;
}

/** 全屏闪光：铺满特效层的一张纯色矩形，从全不透明淡出到透明 */
export class FlashEffect {
  public readonly view: Graphics;
  private readonly handle: TweenHandle;

  constructor(options: FlashEffectOptions) {
    this.view = new Graphics()
      .rect(0, 0, options.size.width, options.size.height)
      .fill(resolveColor(options.color));
    options.parent.addChild(this.view);
    this.handle = options.tweens.add(this.view, 'alpha', 0, {
      duration: options.duration,
      onComplete: () => {
        this.view.destroy();
        options.onDone();
      },
    });
  }

  public stop(): void {
    this.handle.cancel();
    this.view.destroy();
  }
}

export default FlashEffect;
