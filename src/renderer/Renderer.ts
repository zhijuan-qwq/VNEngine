import { Container, Graphics } from 'pixi.js';
import type { PointData } from 'pixi.js';
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
  /** pixi 根容器（app.stage）；场景与屏幕空间 UI 都挂在它下面 */
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
  /** pixi 根容器；整屏抓帧（含场景与 UI）以它为 target */
  private readonly stage: Container;
  /** 场景根：ScaleManager 的缩放/居中目标，只包含随画面缩放的内容 */
  private readonly sceneRoot: Container;
  /** 固定逻辑尺寸的视口容器：遮罩不随 shake 移动，只由 ScaleManager 缩放 */
  private readonly viewport: Container;
  /** 屏幕空间 UI 层：不受场景缩放与遮罩影响，渲染在场景之上 */
  private readonly uiLayer: Container;
  private readonly unbinds: Array<() => void> = [];
  private destroyed = false;

  constructor(options: RendererOptions) {
    this.size = { width: options.width, height: options.height };
    this.tweens = new TweenEngine();
    this.layers = new LayerStack();
    this.stage = options.stage;

    this.sceneRoot = new Container();
    this.sceneRoot.label = 'scene-root';
    options.stage.addChild(this.sceneRoot);

    // 画布可能大于逻辑画面（letterbox），必须在逻辑边界裁掉立绘/背景溢出，
    // 否则腿部和 cover 溢出的背景会露到黑边里；遮罩放在 viewport 上而非 layers 上，
    // 这样 shake 只移动内容、不移动裁剪窗口。
    this.viewport = new Container();
    this.viewport.label = 'viewport';
    const mask = new Graphics()
      .rect(0, 0, this.size.width, this.size.height)
      .fill(0xffffff);
    mask.label = 'viewport-mask';
    mask.eventMode = 'none';
    this.viewport.addChild(this.layers, mask);
    this.viewport.mask = mask;
    this.sceneRoot.addChild(this.viewport);

    this.scale = new ScaleManager(this.sceneRoot, options.scaleMode, this.size);

    // UI 不参与场景缩放：单独一层，挂在 stage 上、位于 sceneRoot 之后
    this.uiLayer = new Container();
    this.uiLayer.label = 'ui-layer';
    options.stage.addChild(this.uiLayer);

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

  public getUILayer(): Container {
    return this.uiLayer;
  }

  public getSceneRoot(): Container {
    return this.layers;
  }

  public getCaptureTarget(): Container {
    return this.stage;
  }

  public toLogical(point: PointData): { x: number; y: number } {
    return this.scale.toLogical(point);
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
    // 先解绑遮罩再销毁，避免 mask effect 引用已销毁的 Graphics
    this.viewport.mask = null;
    this.sceneRoot.destroy({ children: true });
    this.uiLayer.destroy({ children: true });
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
