import { Sprite, type Container, type Texture } from 'pixi.js';
import type { CharacterState, Position, PositionKeyword } from '@/types/engine';
import type { EngineEvents } from '@/types/events';
import { easeOut, getEasing } from '@/utils/easing';
import type { Size } from './ScaleManager';
import { DEFAULT_SPRITE_NAME } from './spriteResolver';
import {
  DEFAULT_TRANSITION_DURATION,
  parseTransition,
  playEnter,
  playLeave,
  type PointData,
  type SlideDirection,
} from './transitions';
import type { TweenEngine } from './tween';

/** 立绘锚点：底部中心（位置参数给出的是立绘脚底落点） */
export const CHARACTER_ANCHOR = { x: 0.5, y: 1 };
/**
 * 位置关键字 → 逻辑宽度占比。offLeft/offRight 在屏幕外，用于站在画外（探身/移出）
 */
export const POSITION_RATIOS: Record<PositionKeyword, number> = {
  farLeft: 0.1,
  left: 0.25,
  center: 0.5,
  right: 0.75,
  farRight: 0.9,
  offLeft: -0.25,
  offRight: 1.25,
};
/** slide 转场时立绘在屏幕外的偏移量（逻辑像素） */
export const SLIDE_IN_OFFSET = 200;
/** zoom 入场时的起始缩放 */
export const CHARACTER_ZOOM_FROM = 0.85;

/** 位置参数 → 立绘脚底在逻辑分辨率中的落点 */
export function positionToPoint(position: Position, size: Size): PointData {
  if (typeof position === 'object') {
    return { x: position.x, y: position.y };
  }
  // 未识别的关键字按居中处理：宁可摆错也不要 NaN 破坏场景图（DSL 位置名不校验）
  const ratio = POSITION_RATIOS[position] ?? POSITION_RATIOS.center;
  return { x: size.width * ratio, y: size.height };
}

/** 位置是否等价（对象形式按坐标比较） */
function samePosition(a: Position, b: Position): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.x === b.x && a.y === b.y;
}

/** 位置所属的屏幕侧别；center 与自定义坐标无侧别（返回 null） */
function sideOfPosition(position: Position): SlideDirection | null {
  if (position === 'left' || position === 'farLeft' || position === 'offLeft') {
    return 'left';
  }
  if (
    position === 'right' ||
    position === 'farRight' ||
    position === 'offRight'
  ) {
    return 'right';
  }
  return null;
}

/**
 * slide 的屏幕外一端：显式方向（slideL/slideR）优先，
 * 否则 left 系从左侧、right 系从右侧，其余（center/自定义坐标）从下方
 */
function slideFrom(
  position: Position,
  to: PointData,
  direction?: SlideDirection,
): PointData {
  const side = direction ?? sideOfPosition(position);
  if (side === 'left') return { x: to.x - SLIDE_IN_OFFSET, y: to.y };
  if (side === 'right') return { x: to.x + SLIDE_IN_OFFSET, y: to.y };
  return { x: to.x, y: to.y + SLIDE_IN_OFFSET };
}

export interface CharacterRegistryDeps {
  /** 角色层 Container */
  parent: Container;
  tweens: TweenEngine;
  size: Size;
  resolveTexture(characterId: string, spriteName: string): Promise<Texture>;
  /** 资源缺失等异步失败，缺省 console.warn */
  onError?(error: unknown): void;
}

/**
 * 角色记账。entry 在 `show` 时同步登记、视图在纹理加载完成后才建立：
 * 加载途中的 move/sprite 请求改的是记账值，不会被静默丢弃
 * （ScriptEngine 每帧只走一条命令，`@show` 后紧接的 `@move` 可能早于纹理到达）
 */
interface CharacterEntry {
  id: string;
  /** 纹理解析完成前为 null */
  view: Sprite | null;
  /** 最近一次请求的立绘名（交叉淡入完成前也按目标记账） */
  spriteName: string;
  /** 最近一次请求的位置（补间中途也按目标位置记账） */
  position: Position;
  /** 目标不透明度（读档恢复半透明立绘用；视图建立后以 view.alpha 为准） */
  opacity: number;
}

/** 角色 → pixi Sprite 的生命周期管理：show/hide/move/sprite */
export class CharacterRegistry {
  private readonly deps: CharacterRegistryDeps;
  private readonly entries = new Map<string, CharacterEntry>();
  /** 已退场但仍在外层补间中的立绘（补间结束即销毁并移出） */
  private readonly leaving = new Set<Sprite>();
  /** 每个角色一张的纹理解析结果，避免重复从图集裁子纹理 */
  private readonly textures = new Map<string, Texture>();
  /**
   * 每个角色的操作序号：异步加载返回时序号已变则丢弃结果，
   * 避免「加载途中被 hide/替换」留下幽灵立绘
   */
  private readonly tokens = new Map<string, number>();

  constructor(deps: CharacterRegistryDeps) {
    this.deps = deps;
  }

  public show(payload: EngineEvents['character:show']): void {
    const spriteName = payload.sprite ?? DEFAULT_SPRITE_NAME;
    const existing = this.entries.get(payload.id);
    if (!existing) {
      this.entries.set(payload.id, {
        id: payload.id,
        view: null,
        spriteName,
        position: payload.position,
        opacity: 1,
      });
      void this.createEntry(
        payload.id,
        this.nextToken(payload.id),
        payload.transition,
        payload.duration,
      );
      return;
    }
    if (spriteName !== existing.spriteName) {
      this.applySpriteChange(
        existing,
        spriteName,
        payload.transition,
        payload.duration,
      );
    }
    if (!samePosition(existing.position, payload.position)) {
      this.move(existing.id, payload.position, payload.duration);
    }
  }

  /** id 为 'all' 时全部退场（对应 DSL 的 @hide 无参） */
  public hide(id: string, transition?: string, duration?: number): void {
    if (id === 'all') {
      this.invalidateAll();
      for (const entry of [...this.entries.values()]) {
        this.removeEntry(entry, transition, duration);
      }
      return;
    }
    this.nextToken(id);
    const entry = this.entries.get(id);
    if (entry) this.removeEntry(entry, transition, duration);
  }

  public move(
    id: string,
    position: Position,
    duration?: number,
    easing?: string,
  ): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.position = position;
    const view = entry.view;
    // 视图还在加载：落点已记账，建立时直接摆到该点
    if (!view) return;
    const to = positionToPoint(position, this.deps.size);
    // 顶掉在飞的移动补间：否则旧补间会继续写 x/y，把立绘拖回旧目标
    this.deps.tweens.cancelTarget(view, 'x');
    this.deps.tweens.cancelTarget(view, 'y');
    const ms = duration ?? DEFAULT_TRANSITION_DURATION;
    if (!(ms > 0)) {
      view.position.set(to.x, to.y);
      return;
    }
    const ease = getEasing(easing);
    this.deps.tweens.add(view, 'x', to.x, { duration: ms, easing: ease });
    this.deps.tweens.add(view, 'y', to.y, { duration: ms, easing: ease });
  }

  public changeSprite(
    id: string,
    spriteName: string,
    transition?: string,
    duration?: number,
  ): void {
    const entry = this.entries.get(id);
    if (!entry || entry.spriteName === spriteName) return;
    this.applySpriteChange(entry, spriteName, transition, duration);
  }

  public getState(): CharacterState[] {
    return [...this.entries.values()].map((entry) => ({
      id: entry.id,
      spriteId: entry.spriteName,
      position: entry.position,
      opacity: entry.view ? entry.view.alpha : entry.opacity,
    }));
  }

  /** 读档：清空当前立绘后按存档状态直接摆位，不走转场 */
  public setState(states: CharacterState[]): void {
    this.clear();
    for (const state of states) {
      this.entries.set(state.id, {
        id: state.id,
        view: null,
        spriteName: state.spriteId,
        position: state.position,
        opacity: state.opacity,
      });
      void this.createEntry(state.id, this.nextToken(state.id), 'none', 0);
    }
  }

  public clear(): void {
    this.invalidateAll();
    for (const entry of [...this.entries.values()]) {
      this.removeEntry(entry, 'none', 0);
    }
    for (const view of [...this.leaving]) {
      this.discard(view);
    }
  }

  public destroy(): void {
    this.clear();
    this.textures.clear();
  }

  /**
   * 换立绘：有视图走交叉淡入（成功落地后才改记账名，失败保持画面上那张）；
   * 视图还在加载则直接改记账名并按新名字重新发起（旧请求靠序号作废）
   */
  private applySpriteChange(
    entry: CharacterEntry,
    spriteName: string,
    transition?: string,
    duration?: number,
  ): void {
    if (entry.view) {
      void this.swapTexture(entry, spriteName, transition, duration);
      return;
    }
    entry.spriteName = spriteName;
    void this.createEntry(
      entry.id,
      this.nextToken(entry.id),
      transition,
      duration,
    );
  }

  private async createEntry(
    id: string,
    token: number,
    transition?: string,
    duration?: number,
  ): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    const texture = await this.loadTexture(id, entry.spriteName);
    // 加载途中被 hide/换立绘/重发：本次结果作废，entry 的去留由新请求决定
    if (this.tokens.get(id) !== token) return;
    // 资源缺失：不留永远没有视图的记账（否则存档里会有个渲染不出来的角色）
    if (!texture) {
      this.entries.delete(id);
      return;
    }
    // 加载途中可能被 hide/clear（entry 已删）或改过落点，按最新记账建视图
    const current = this.entries.get(id);
    if (!current) return;
    const view = new Sprite(texture);
    view.anchor.set(CHARACTER_ANCHOR.x, CHARACTER_ANCHOR.y);
    const to = positionToPoint(current.position, this.deps.size);
    const spec = parseTransition(transition);
    this.deps.parent.addChild(view);
    playEnter(this.deps.tweens, view, spec.kind, {
      from: slideFrom(current.position, to, spec.direction),
      to,
      duration: duration ?? DEFAULT_TRANSITION_DURATION,
      scaleFrom: CHARACTER_ZOOM_FROM,
      alphaTo: current.opacity,
    });
    current.view = view;
  }

  private async swapTexture(
    entry: CharacterEntry,
    spriteName: string,
    transition?: string,
    duration?: number,
  ): Promise<void> {
    const token = this.nextToken(entry.id);
    const texture = await this.loadTexture(entry.id, spriteName);
    const view = entry.view;
    // 加载失败（记错名字之类的素材问题）或加载期间又被换立绘/退场：保持原样
    if (!texture || !view || this.tokens.get(entry.id) !== token) return;
    const ms = duration ?? DEFAULT_TRANSITION_DURATION;
    const spec = parseTransition(transition);
    if (spec.kind === 'none' || !(ms > 0)) {
      view.texture = texture;
      entry.spriteName = spriteName;
      return;
    }
    // 交叉淡入：新立绘叠一层淡入，结束后换回本体纹理
    const overlay = new Sprite(texture);
    overlay.anchor.set(CHARACTER_ANCHOR.x, CHARACTER_ANCHOR.y);
    overlay.position.set(view.x, view.y);
    overlay.scale.set(view.scale.x, view.scale.y);
    overlay.alpha = 0;
    this.deps.parent.addChild(overlay);
    this.leaving.add(overlay);
    this.deps.tweens.add(overlay, 'alpha', view.alpha, {
      duration: ms,
      easing: easeOut,
      onComplete: () => {
        if (this.tokens.get(entry.id) === token) {
          view.texture = texture;
          entry.spriteName = spriteName;
        }
        this.discard(overlay);
      },
    });
  }

  private removeEntry(
    entry: CharacterEntry,
    transition?: string,
    duration?: number,
  ): void {
    this.entries.delete(entry.id);
    const view = entry.view;
    // 视图还在加载：序号已失效，创建时不会再建出来
    if (!view) return;
    // 退场补间接管该 Sprite 的动画属性：先取消在飞的移动/入场补间，避免两批补间互相打架
    this.deps.tweens.cancelTarget(view);
    this.deps.tweens.cancelTarget(view.scale);
    const ms = duration ?? DEFAULT_TRANSITION_DURATION;
    const spec = parseTransition(transition);
    if (spec.kind === 'none' || !(ms > 0)) {
      this.discard(view);
      return;
    }
    this.leaving.add(view);
    playLeave(this.deps.tweens, view, spec.kind, {
      to: slideFrom(
        entry.position,
        positionToPoint(entry.position, this.deps.size),
        spec.direction,
      ),
      duration: ms,
      scaleFrom: CHARACTER_ZOOM_FROM,
      onComplete: () => this.leaving.delete(view),
    });
  }

  /** 取消该 Sprite 上所有补间后销毁 */
  private discard(view: Sprite): void {
    this.deps.tweens.cancelTarget(view);
    this.deps.tweens.cancelTarget(view.scale);
    this.leaving.delete(view);
    view.destroy();
  }

  private async loadTexture(
    id: string,
    spriteName: string,
  ): Promise<Texture | null> {
    const key = `${id}/${spriteName}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    try {
      const texture = await this.deps.resolveTexture(id, spriteName);
      this.textures.set(key, texture);
      return texture;
    } catch (error) {
      this.reportError(error);
      return null;
    }
  }

  private reportError(error: unknown): void {
    if (this.deps.onError) {
      this.deps.onError(error);
      return;
    }
    console.warn('[renderer] character sprite unavailable:', error);
  }

  private nextToken(id: string): number {
    const token = (this.tokens.get(id) ?? 0) + 1;
    this.tokens.set(id, token);
    return token;
  }

  private invalidateAll(): void {
    for (const id of this.tokens.keys()) {
      this.nextToken(id);
    }
  }
}

export default CharacterRegistry;
