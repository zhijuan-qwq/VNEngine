import type { Container } from 'pixi.js';
import type EventBus from '@/core/EventBus';
import type { IRenderer, RendererState, ScaleMode } from '@/types/engine';
import type { EngineEvents } from '@/types/events';
import BackgroundManager from './BackgroundManager';
import CharacterRegistry from './CharacterRegistry';
import EffectManager from './EffectManager';
import LayerStack, { LAYER_Z_INDEX } from './LayerStack';
import ScaleManager, { type Size } from './ScaleManager';
import {
  resolveBackgroundTexture,
  resolveCharacterTexture,
  type TextureProvider,
} from './spriteResolver';
import TweenEngine from './tween';

export interface RendererOptions {
  /** pixi 根容器（app.stage）；ScaleManager 直接作用于它 */
  stage: Container;
  eventBus: EventBus<EngineEvents>;
  /** 资源访问面，ResourceManager 满足其结构 */
  resource: TextureProvider;
  /** 逻辑分辨率 */
  width: number;
  height: number;
  scaleMode: ScaleMode;
  /** 资源缺失等异步失败，缺省 console.warn */
  onError?(error: unknown): void;
}

export class Renderer implements IRenderer {
  public readonly layers: LayerStack;
  public readonly tweens: TweenEngine;
  public readonly scale: ScaleManager;
  public readonly characters: CharacterRegistry;
  public readonly backgrounds: BackgroundManager;
  public readonly effects: EffectManager;
  private readonly size: Size;
  private readonly unbinds: Array<() => void> = [];
  private destroyed = false;

  constructor(options: RendererOptions) {
    this.size = { width: options.width, height: options.height };
    this.tweens = new TweenEngine();
    this.layers = new LayerStack();
    options.stage.addChild(this.layers);
    this.scale = new ScaleManager(options.stage, options.scaleMode, this.size);

    this.backgrounds = new BackgroundManager({
      parent: this.layers.addLayer('bg', LAYER_Z_INDEX.bg),
      tweens: this.tweens,
      size: this.size,
      resolveTexture: (id) => resolveBackgroundTexture(options.resource, id),
      onError: options.onError,
    });
    this.characters = new CharacterRegistry({
      parent: this.layers.addLayer('chara', LAYER_Z_INDEX.chara),
      tweens: this.tweens,
      size: this.size,
      resolveTexture: (id, sprite) =>
        resolveCharacterTexture(options.resource, id, sprite),
      onError: options.onError,
    });
    this.effects = new EffectManager({
      parent: this.layers.addLayer('effect', LAYER_Z_INDEX.effect),
      shakeTarget: this.layers,
      tweens: this.tweens,
      size: this.size,
    });
    // UI 图层由渲染器预建，供后续 UI 子系统挂载
    this.layers.addLayer('ui', LAYER_Z_INDEX.ui);

    this.bind(options.eventBus);
  }

  /** dt 单位为秒（与 AudioManager 一致） */
  public update(dt: number): void {
    this.tweens.update(dt);
    this.effects.update(dt);
  }

  public getState(): RendererState {
    return {
      bgImage: this.backgrounds.getState(),
      characters: this.characters.getState(),
    };
  }

  public setState(state: RendererState): void {
    this.backgrounds.setState(state.bgImage);
    this.characters.setState(state.characters);
  }

  public resize(containerSize: Size): void {
    this.scale.update(containerSize);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unbind of this.unbinds) unbind();
    this.unbinds.length = 0;
    this.effects.destroy();
    this.characters.destroy();
    this.backgrounds.destroy();
    this.tweens.cancelAll();
    this.layers.destroy({ children: true });
  }

  private bind(eventBus: EventBus<EngineEvents>): void {
    this.subscribe(eventBus, 'bg:change', (payload) =>
      this.backgrounds.change(payload),
    );
    this.subscribe(eventBus, 'character:show', (payload) =>
      this.characters.show(payload),
    );
    this.subscribe(eventBus, 'character:hide', (payload) =>
      this.characters.hide(payload.id, payload.transition, payload.duration),
    );
    this.subscribe(eventBus, 'character:move', (payload) =>
      this.characters.move(
        payload.id,
        payload.position,
        payload.duration,
        payload.easing,
      ),
    );
    this.subscribe(eventBus, 'character:sprite', (payload) =>
      this.characters.changeSprite(
        payload.id,
        payload.sprite,
        payload.transition,
        payload.duration,
      ),
    );
    this.subscribe(eventBus, 'effect:play', (payload) =>
      this.effects.play(payload),
    );
    this.subscribe(eventBus, 'effect:stop', () => this.effects.stop());
  }

  private subscribe<K extends keyof EngineEvents>(
    eventBus: EventBus<EngineEvents>,
    event: K,
    handler: (payload: EngineEvents[K]) => void,
  ): void {
    eventBus.on(event, handler);
    this.unbinds.push(() => eventBus.off(event, handler));
  }
}

export default Renderer;
