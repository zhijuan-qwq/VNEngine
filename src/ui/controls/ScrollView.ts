import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedWheelEvent } from 'pixi.js';
import { UIComponent } from '../UIComponent';

export interface ScrollViewOptions {
  width: number;
  height: number;
  /** 单次滚轮滚动的像素步长 */
  step?: number;
}

/** 遮罩裁剪 + 垂直滚动偏移；内容高度由使用方通过 setContentHeight 告知 */
export class ScrollView extends UIComponent {
  public readonly content: Container;
  private readonly viewport: Container;
  private readonly maskShape: Graphics;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  private readonly step: number;
  private contentHeight = 0;
  private offset = 0;

  constructor(options: ScrollViewOptions) {
    super({ id: 'scroll-view' });
    this.viewWidth = options.width;
    this.viewHeight = options.height;
    this.step = options.step ?? 40;

    this.viewport = new Container();
    this.addChild(this.viewport);

    this.content = new Container();
    this.viewport.addChild(this.content);

    this.maskShape = new Graphics();
    this.maskShape.rect(0, 0, this.viewWidth, this.viewHeight);
    this.maskShape.fill(0xffffff, 1);
    this.addChild(this.maskShape);
    this.viewport.mask = this.maskShape;

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, this.viewWidth, this.viewHeight);
    this.on('wheel', (event: FederatedWheelEvent) => {
      const delta = event.deltaY;
      if (delta === 0) return;
      event.stopPropagation();
      this.scrollBy(delta > 0 ? this.step : -this.step);
    });
  }

  public get scrollTop(): number {
    return this.offset;
  }

  public get maxScroll(): number {
    return Math.max(0, this.contentHeight - this.viewHeight);
  }

  /** 内容总高度；非法值按 0 处理，缩短时重新钳制偏移 */
  public setContentHeight(height: number): void {
    const next = Number.isFinite(height) && height > 0 ? height : 0;
    if (next === this.contentHeight) {
      return;
    }
    this.contentHeight = next;
    this.applyOffset(this.offset);
  }

  public scrollBy(delta: number): void {
    if (!Number.isFinite(delta)) {
      return;
    }
    this.applyOffset(this.offset + delta);
  }

  public setScroll(y: number): void {
    this.applyOffset(Number.isFinite(y) ? y : 0);
  }

  private applyOffset(y: number): void {
    const clamped = Math.min(Math.max(y, 0), this.maxScroll);
    this.offset = clamped;
    this.content.y = -clamped;
  }
}

export default ScrollView;
