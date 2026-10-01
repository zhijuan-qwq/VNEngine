import { Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { UIComponent } from '../UIComponent';

export interface SliderOptions {
  width: number;
  height?: number;
  min?: number;
  max?: number;
  value?: number;
  /** 吸附步长；<=0 表示连续取值 */
  step?: number;
  trackColor?: number;
  fillColor?: number;
  handleColor?: number;
  onChange?: (value: number) => void;
}

interface ResolvedOptions {
  width: number;
  height: number;
  min: number;
  max: number;
  step: number;
  trackColor: number;
  fillColor: number;
  handleColor: number;
  onChange?: (value: number) => void;
}

export class Slider extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly track: Graphics;
  private readonly fill: Graphics;
  private readonly handle: Graphics;
  private currentValue: number;
  private dragging = false;

  constructor(options: SliderOptions) {
    super({ id: 'slider' });
    this.opts = {
      width: options.width,
      height: options.height ?? 8,
      min: options.min ?? 0,
      max: options.max ?? 1,
      step: options.step ?? 0,
      trackColor: options.trackColor ?? 0x555555,
      fillColor: options.fillColor ?? 0xffe082,
      handleColor: options.handleColor ?? 0xffffff,
      onChange: options.onChange,
    };
    this.currentValue = this.normalize(
      options.value ?? this.opts.min,
      this.opts.min,
    );

    this.track = new Graphics();
    this.track.roundRect(
      0,
      0,
      this.opts.width,
      this.opts.height,
      this.opts.height / 2,
    );
    this.track.fill(this.opts.trackColor, 1);
    this.addChild(this.track);

    this.fill = new Graphics();
    this.addChild(this.fill);

    this.handle = new Graphics();
    this.addChild(this.handle);

    this.eventMode = 'static';
    this.hitArea = new Rectangle(
      0,
      -this.opts.height,
      this.opts.width,
      this.opts.height * 3,
    );
    this.on('pointerdown', (event: FederatedPointerEvent) => {
      this.handlePointerDown(this.localX(event));
    });
    this.on('pointermove', (event: FederatedPointerEvent) => {
      this.handlePointerMove(this.localX(event));
    });
    this.on('pointerup', () => this.handlePointerUp());
    this.on('pointerupoutside', () => this.handlePointerUp());

    this.redraw();
  }

  public get value(): number {
    return this.currentValue;
  }

  /** 越界值 clamp 到 [min,max]，NaN 忽略（保持当前值）；吸附 step */
  public setValue(value: number): void {
    const next = this.normalize(value, this.currentValue);
    if (next === this.currentValue) {
      return;
    }
    this.currentValue = next;
    this.redraw();
    this.opts.onChange?.(next);
  }

  public handlePointerDown(localX: number): void {
    this.dragging = true;
    this.setValue(this.valueAt(localX));
  }

  public handlePointerMove(localX: number): void {
    if (!this.dragging) {
      return;
    }
    this.setValue(this.valueAt(localX));
  }

  public handlePointerUp(): void {
    this.dragging = false;
  }

  private localX(event: FederatedPointerEvent): number {
    return event.getLocalPosition(this).x;
  }

  /** 指针横坐标 → 数值；范围无效（max<=min）时取 min */
  private valueAt(localX: number): number {
    if (!(this.opts.max > this.opts.min)) {
      return this.opts.min;
    }
    if (!Number.isFinite(localX)) {
      return this.currentValue;
    }
    const ratio = Math.min(Math.max(localX / this.opts.width, 0), 1);
    return this.opts.min + ratio * (this.opts.max - this.opts.min);
  }

  private normalize(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const { min, max, step } = this.opts;
    const clamped = Math.min(Math.max(value, min), max);
    if (!(step > 0)) {
      return clamped;
    }
    const snapped = min + Math.round((clamped - min) / step) * step;
    return Math.min(Math.max(snapped, min), max);
  }

  private get ratio(): number {
    if (!(this.opts.max > this.opts.min)) {
      return 0;
    }
    return (
      (this.currentValue - this.opts.min) / (this.opts.max - this.opts.min)
    );
  }

  private redraw(): void {
    const filled = this.opts.width * this.ratio;
    this.fill.clear();
    if (filled > 0) {
      this.fill.roundRect(0, 0, filled, this.opts.height, this.opts.height / 2);
      this.fill.fill(this.opts.fillColor, 1);
    }

    const radius = this.opts.height * 1.1;
    this.handle.clear();
    this.handle.circle(filled, this.opts.height / 2, radius);
    this.handle.fill(this.opts.handleColor, 1);
  }
}

export default Slider;
