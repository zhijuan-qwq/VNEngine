import { Sprite, type Container, type Texture } from 'pixi.js';
import type { EngineEvents } from '@/types/events';
import type { Size } from './ScaleManager';
import {
  DEFAULT_TRANSITION_DURATION,
  parseTransition,
  playEnter,
  playLeave,
} from './transitions';
import type { TweenEngine } from './tween';

export interface BackgroundManagerDeps {
  parent: Container;
  tweens: TweenEngine;
  size: Size;
  resolveTexture(backgroundId: string): Promise<Texture>;
  /** 资源缺失等异步失败，缺省 console.warn */
  onError?(error: unknown): void;
}

interface BackgroundEntry {
  id: string;
  view: Sprite;
}

export class BackgroundManager {
  private readonly deps: BackgroundManagerDeps;
  private current: BackgroundEntry | null = null;
  private readonly leaving = new Set<Sprite>();
  /** 切换序号：加载慢的旧请求返回时若序号已变则丢弃 */
  private token = 0;

  constructor(deps: BackgroundManagerDeps) {
    this.deps = deps;
  }

  public change(payload: EngineEvents['bg:change']): void {
    // 每次都作废在途请求（同 id 的 no-op 也算一次命令）：后到的命令为准，
    // 否则「先切 A、加载途中又切回已显示的 B」会让 A 慢吞吞地盖掉 B
    const token = this.nextToken();
    if (this.current?.id === payload.id) return;
    void this.apply(payload.id, payload.transition, payload.duration, token);
  }

  public getState(): string | null {
    return this.current?.id ?? null;
  }

  /** 读档：不走转场，直接铺上背景 */
  public setState(id: string | null): void {
    const token = this.nextToken();
    if (this.current) {
      this.discard(this.current.view);
      this.current = null;
    }
    if (id === null) return;
    void this.apply(id, 'none', 0, token);
  }

  public destroy(): void {
    this.nextToken();
    if (this.current) {
      this.discard(this.current.view);
      this.current = null;
    }
    for (const view of [...this.leaving]) {
      this.discard(view);
    }
  }

  private async apply(
    id: string,
    transition: string | undefined,
    duration: number | undefined,
    token: number,
  ): Promise<void> {
    const texture = await this.loadTexture(id);
    if (!texture || token !== this.token) return;
    const ms = duration ?? DEFAULT_TRANSITION_DURATION;
    const spec = parseTransition(transition);
    const view = new Sprite(texture);
    const previous = this.current;
    this.deps.parent.addChild(view);
    playEnter(this.deps.tweens, view, spec.kind, {
      // slide：slideL 从左侧滑入，slide/slideR 从右侧滑入（背景 slide 的方向约定）
      from: {
        x:
          spec.direction === 'left'
            ? -this.deps.size.width
            : this.deps.size.width,
        y: 0,
      },
      to: { x: 0, y: 0 },
      duration: ms,
    });
    this.current = { id, view };
    if (!previous) return;
    if (spec.kind === 'none' || !(ms > 0)) {
      this.discard(previous.view);
      return;
    }
    // 旧背景始终淡出（slide/zoom 时它在最底层，避免露出空白）
    this.leaving.add(previous.view);
    playLeave(this.deps.tweens, previous.view, 'fade', {
      to: { x: 0, y: 0 },
      duration: ms,
      onComplete: () => this.leaving.delete(previous.view),
    });
  }

  private async loadTexture(id: string): Promise<Texture | null> {
    try {
      return await this.deps.resolveTexture(id);
    } catch (error) {
      if (this.deps.onError) {
        this.deps.onError(error);
      } else {
        console.warn('[renderer] background unavailable:', error);
      }
      return null;
    }
  }

  private discard(view: Sprite): void {
    this.deps.tweens.cancelTarget(view);
    this.deps.tweens.cancelTarget(view.scale);
    this.leaving.delete(view);
    view.destroy();
  }

  private nextToken(): number {
    this.token += 1;
    return this.token;
  }
}

export default BackgroundManager;
