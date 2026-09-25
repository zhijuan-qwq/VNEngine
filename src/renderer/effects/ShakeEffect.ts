import type { Container } from 'pixi.js';

/** intensity=1 时的抖动幅度（像素） */
export const SHAKE_AMPLITUDE = 20;

export interface ShakeEffectOptions {
  /** 毫秒 */
  duration: number;
  intensity?: number;
}

export class ShakeEffect {
  private readonly target: Container;
  private readonly baseX: number;
  private readonly baseY: number;
  /** 秒：elapsed 与 update(dt) 同单位，构造时从毫秒的 options.duration 换算 */
  private readonly durationSeconds: number;
  private readonly amplitude: number;
  private elapsed = 0;
  private finished = false;

  constructor(target: Container, options: ShakeEffectOptions) {
    this.target = target;
    this.baseX = target.x;
    this.baseY = target.y;
    this.durationSeconds = Math.max(options.duration, 0) / 1000;
    this.amplitude = SHAKE_AMPLITUDE * (options.intensity ?? 1);
  }

  public get done(): boolean {
    return this.finished;
  }

  public update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    if (this.elapsed >= this.durationSeconds) {
      this.stop();
      return;
    }
    this.target.x = this.baseX + (Math.random() * 2 - 1) * this.amplitude;
    this.target.y = this.baseY + (Math.random() * 2 - 1) * this.amplitude;
  }

  public stop(): void {
    this.finished = true;
    this.target.x = this.baseX;
    this.target.y = this.baseY;
  }
}

export default ShakeEffect;
