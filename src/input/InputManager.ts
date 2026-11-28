import { Container, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, PointData } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { IInputManager } from '@/types/engine';

export interface InputManagerOptions {
  width: number;
  height: number;
  /** 屏幕坐标 → 逻辑坐标（复用渲染层的同一个换算） */
  toLogical: (point: PointData) => { x: number; y: number };
  /** 打字机是否正在逐字显示；为真时点击转为跳过 */
  isTypewriterBusy?: () => boolean;
}

/**
 * 把 pixi 联邦指针事件翻译成 EventBus 上的 input:* 事件（见架构文档 §8.3）。
 *
 * 命中层挂为 UI 根节点的**第一个**子节点（最底层）：只有当指针下没有更上层的
 * 交互对象（按钮、模态遮罩等）时才会命中，因此模态面板天然屏蔽底层点击。
 */
export class InputManager implements IInputManager {
  private readonly bus: EventBus<EngineEvents>;
  private readonly opts: InputManagerOptions;
  private hitContainer: Container | null = null;
  /** 命中层尺寸（UI 虚拟坐标），与场景逻辑尺寸解耦 */
  private hitWidth: number;
  private hitHeight: number;

  constructor(bus: EventBus<EngineEvents>, options: InputManagerOptions) {
    this.bus = bus;
    this.opts = options;
    this.hitWidth = options.width;
    this.hitHeight = options.height;
  }

  /** 挂载/替换命中层；重复调用会先移除旧命中层 */
  public setUIRoot(root: Container): void {
    this.teardownHit();
    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, 0, this.hitWidth, this.hitHeight);
    hit.on('pointertap', this.onTap);
    hit.on('pointermove', this.onMove);
    root.addChildAt(hit, 0);
    this.hitContainer = hit;
  }

  /** 更新命中层尺寸（UI 虚拟坐标系）；无效尺寸忽略 */
  public setSize(width: number, height: number): void {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    this.hitWidth = width;
    this.hitHeight = height;
    if (this.hitContainer) {
      this.hitContainer.hitArea = new Rectangle(0, 0, width, height);
    }
  }

  public destroy(): void {
    this.teardownHit();
  }

  private readonly onTap = (event: FederatedPointerEvent): void => {
    const { x, y } = this.toScene(event.global);
    if (this.opts.isTypewriterBusy?.() ?? false) {
      this.bus.emit('input:skip', {});
    } else {
      this.bus.emit('input:click', { x, y });
    }
  };

  private readonly onMove = (event: FederatedPointerEvent): void => {
    const { x, y } = this.toScene(event.global);
    this.bus.emit('input:hover', { x, y });
  };

  /** 黑边点击会落在画面外，钳制后保持 input:* 坐标仍在场景范围内 */
  private toScene(point: { x: number; y: number }): { x: number; y: number } {
    const logical = this.opts.toLogical(point);
    return {
      x: Math.min(Math.max(logical.x, 0), this.opts.width),
      y: Math.min(Math.max(logical.y, 0), this.opts.height),
    };
  }

  private teardownHit(): void {
    const hit = this.hitContainer;
    if (!hit) {
      return;
    }
    hit.off('pointertap', this.onTap);
    hit.off('pointermove', this.onMove);
    hit.removeFromParent();
    hit.destroy();
    this.hitContainer = null;
  }
}

export default InputManager;
