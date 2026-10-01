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

  constructor(bus: EventBus<EngineEvents>, options: InputManagerOptions) {
    this.bus = bus;
    this.opts = options;
  }

  /** 挂载/替换命中层；重复调用会先移除旧命中层 */
  public setUIRoot(root: Container): void {
    this.teardownHit();
    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, 0, this.opts.width, this.opts.height);
    hit.on('pointertap', this.onTap);
    hit.on('pointermove', this.onMove);
    root.addChildAt(hit, 0);
    this.hitContainer = hit;
  }

  public destroy(): void {
    this.teardownHit();
  }

  private readonly onTap = (event: FederatedPointerEvent): void => {
    const { x, y } = this.opts.toLogical(event.global);
    if (this.opts.isTypewriterBusy?.() ?? false) {
      this.bus.emit('input:skip', {});
    } else {
      this.bus.emit('input:click', { x, y });
    }
  };

  private readonly onMove = (event: FederatedPointerEvent): void => {
    const { x, y } = this.opts.toLogical(event.global);
    this.bus.emit('input:hover', { x, y });
  };

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
