import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedWheelEvent } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { THEME } from '../theme';

export interface ScrollViewOptions {
  width: number;
  height: number;
  /** 单次滚轮滚动的像素步长 */
  step?: number;
}

const BAR_WIDTH = 5;
const THUMB_MIN_HEIGHT = 24;

/** 遮罩裁剪 + 垂直滚动偏移；内容高度由使用方通过 setContentHeight 告知 */
export class ScrollView extends UIComponent {
  public readonly content: Container;
  private readonly viewport: Container;
  private readonly maskShape: Graphics;
  private readonly barTrack: Graphics;
  private readonly barThumb: Graphics;
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

    // 滚动条在遮罩之外，贴可视区右缘
    this.barTrack = new Graphics();
    this.barTrack.x = this.viewWidth - BAR_WIDTH - 2;
    this.addChild(this.barTrack);
    this.barThumb = new Graphics();
    this.barThumb.x = this.viewWidth - BAR_WIDTH - 2;
    this.addChild(this.barThumb);

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, this.viewWidth, this.viewHeight);
    this.on('wheel', (event: FederatedWheelEvent) => {
      const delta = event.deltaY;
      if (delta === 0) return;
      event.stopPropagation();
      this.scrollBy(delta > 0 ? this.step : -this.step);
    });

    this.updateBar();
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
    this.updateBar();
  }

  /** 内容超出视口时显示细滚动条；滑块位置同步当前偏移 */
  private updateBar(): void {
    const scrollable = this.maxScroll > 0;
    this.barTrack.visible = scrollable;
    this.barThumb.visible = scrollable;
    if (!scrollable) {
      return;
    }

    this.barTrack.clear();
    this.barTrack.roundRect(0, 0, BAR_WIDTH, this.viewHeight, BAR_WIDTH / 2);
    this.barTrack.fill(THEME.border, 0.35);

    const thumbHeight = Math.max(
      THUMB_MIN_HEIGHT,
      Math.round((this.viewHeight / this.contentHeight) * this.viewHeight),
    );
    const travel = this.viewHeight - thumbHeight;
    this.barThumb.clear();
    this.barThumb.roundRect(0, 0, BAR_WIDTH, thumbHeight, BAR_WIDTH / 2);
    this.barThumb.fill(THEME.accent, 0.55);
    this.barThumb.y = Math.round((this.offset / this.maxScroll) * travel);
  }
}

export default ScrollView;
