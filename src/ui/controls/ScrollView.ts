import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { isPositiveFinite } from '../uiLayout';

export interface ScrollViewOptions {
  width: number;
  height: number;
  /** 单次滚轮滚动的像素步长 */
  step?: number;
}

/** 拖拽超过该距离才进入滚动，避免轻点被当成拖动 */
const DRAG_THRESHOLD = 6;

/** 遮罩裁剪 + 垂直滚动偏移；内容高度由使用方通过 setContentHeight 告知 */
export class ScrollView extends UIComponent {
  public readonly content: Container;
  private readonly viewport: Container;
  private readonly maskShape: Graphics;
  private viewWidth: number;
  private viewHeight: number;
  private readonly step: number;
  private contentHeight = 0;
  private offset = 0;
  private dragPointer: number | null = null;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private dragging = false;

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

    // 触摸/鼠标拖拽滚动：只在空白或文字区域起手（event.target 为本组件），
    // 起手于 Slider/Toggle 等控件时交给控件自己处理，避免抢占拖动。
    this.on('pointerdown', this.onDragStart);
    this.on('pointermove', this.onDragMove);
    this.on('pointerup', this.onDragEnd);
    this.on('pointerupoutside', this.onDragEnd);
  }

  /** 视口变化时重画裁剪框并重新钳制偏移 */
  public resize(width: number, height: number): void {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
      return;
    }
    this.viewWidth = width;
    this.viewHeight = height;
    this.maskShape.clear();
    this.maskShape.rect(0, 0, width, height);
    this.maskShape.fill(0xffffff, 1);
    this.hitArea = new Rectangle(0, 0, width, height);
    this.applyOffset(this.offset);
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

  private readonly onDragStart = (event: FederatedPointerEvent): void => {
    if (event.target !== this || this.maxScroll <= 0) {
      return;
    }
    this.dragPointer = event.pointerId;
    this.dragStartY = event.global.y;
    this.dragStartOffset = this.offset;
    this.dragging = false;
  };

  private readonly onDragMove = (event: FederatedPointerEvent): void => {
    if (this.dragPointer !== event.pointerId) {
      return;
    }
    const delta = event.global.y - this.dragStartY;
    if (!this.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) {
        return;
      }
      this.dragging = true;
    }
    event.stopPropagation();
    this.applyOffset(this.dragStartOffset - delta);
  };

  private readonly onDragEnd = (event: FederatedPointerEvent): void => {
    if (this.dragPointer !== event.pointerId) {
      return;
    }
    this.dragPointer = null;
    this.dragging = false;
  };

  private applyOffset(y: number): void {
    const clamped = Math.min(Math.max(y, 0), this.maxScroll);
    this.offset = clamped;
    this.content.y = -clamped;
  }
}

export default ScrollView;
