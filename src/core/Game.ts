import { Application } from 'pixi.js';
import Renderer, { type RendererOptions } from '@/renderer/Renderer';
import { captureThumbnail } from '@/renderer/thumbnail';
import AudioManager from '@/audio/AudioManager';
import ResourceManager from '@/resource/ResourceManager';
import ScriptEngine from '@/script/ScriptEngine';
import VariableStore from '@/script/VariableStore';
import EventBus from '@/core/EventBus';
import PluginManager from '@/core/PluginManager';
import Updater, { type Updatable } from '@/core/Updater';
import InputManager from '@/input/InputManager';
import { UIManager } from '@/ui/UIManager';
import SettingsManager from '@/settings/SettingsManager';
import SaveManager from '@/save/SaveManager';
import { LocalStorageProvider } from '@/save/SaveStorage';
import {
  getDevicePixelRatio,
  getElementById,
  getElementSize,
  getParentElement,
  getStorage,
  getViewportSize,
  isFullscreen,
  observeFullscreen,
  observeViewport,
  setFullscreen,
} from '@/utils/APIHelper';
import type { EngineEvents } from '@/types/events';
import type { Script } from '@/types/script';
import type {
  GameConfig,
  IAudioManager,
  IInputManager,
  IRenderer,
  VNEngine,
} from '@/types/engine';
import type { ISaveManager } from '@/types/save';

/** 引擎生命周期状态（架构文档 §3.1） */
export type GameStatus = 'uninitialized' | 'ready' | 'running' | 'paused';

/** SE 音轨池容量（GameConfig 未暴露，使用默认值） */
export const DEFAULT_MAX_SE_TRACKS = 8;

/**
 * 把无法在 node 环境运行的构造过程收进工厂，便于测试注入 fake。
 * 生产端使用 defaultFactories。
 */
export interface GameFactories {
  createApplication(config: GameConfig): Promise<Application>;
  createRenderer(options: RendererOptions): IRenderer;
  createAudio(engine: VNEngine): IAudioManager;
  createInput(engine: VNEngine, config: GameConfig): IInputManager | null;
  createUI(engine: VNEngine, config: GameConfig): UIManager | null;
  createSave(engine: VNEngine): ISaveManager | null;
  createSettings(engine: VNEngine): SettingsManager;
}

const defaultFactories: GameFactories = {
  async createApplication(config) {
    const app = new Application();
    await app.init({
      canvas: config.canvas,
      width: config.width,
      height: config.height,
      autoDensity: true,
      resolution: getDevicePixelRatio(),
    });
    if (!config.canvas) {
      getElementById('app')?.appendChild(app.canvas);
    }
    return app;
  },
  createRenderer: (options) => new Renderer(options),
  createAudio: (engine) =>
    new AudioManager(
      engine.eventBus,
      DEFAULT_MAX_SE_TRACKS,
      engine.resource as ResourceManager,
    ),
  createInput: (engine, config) =>
    new InputManager(engine.eventBus, {
      // 命中层使用逻辑分辨率：画布尺寸随视口变化，命中区域始终覆盖整个逻辑画面
      width: config.width,
      height: config.height,
      toLogical: (point) => engine.renderer.toLogical(point),
      // 惰性：ui 在本工厂之后才创建，点击时才求值
      isTypewriterBusy: () => engine.ui?.isBusy() ?? false,
    }),
  createUI: (engine, config) =>
    new UIManager(engine.eventBus, {
      width: config.width,
      height: config.height,
      autoTick: false,
      theme: config.theme,
      resolveVar: (name) => engine.variableStore.get(name),
      // 设置菜单对契约编程：直接以 SettingsManager 作为 controller
      settingsMenu: { controller: engine.settings },
      // 存读档菜单对契约编程：槽位/回调延迟求值，读取时 engine.save 必已就位
      saveLoadMenu: {
        getSlots: () => engine.save.list(),
        onSave: (slot, thumbnail) => engine.saveGame(slot, thumbnail),
        onLoad: (slot) => engine.loadGame(slot),
      },
      // 打开存档页前由 UIManager 调用；失败时返回空串，卡片降级为无图
      captureThumbnail: () =>
        captureThumbnail(
          engine.app,
          engine.renderer.getSceneRoot(),
          config.width,
          config.height,
        ),
    }),
  createSave: () => new SaveManager({ storage: new LocalStorageProvider() }),
  createSettings: (engine) =>
    new SettingsManager({
      bus: engine.eventBus,
      // 存储不可用（node / 隐私模式）时仅内存生效，不持久化
      storage: getStorage() ? new LocalStorageProvider() : undefined,
    }),
};

class Game {
  public app!: Application;
  public eventBus!: EventBus<EngineEvents>;
  public updater!: Updater;
  public renderer!: IRenderer;
  public script!: ScriptEngine;
  public audio!: IAudioManager;
  public resource!: ResourceManager;
  public plugins!: PluginManager;
  public variableStore!: VariableStore;
  /** 设置子系统：全局持久化 + `game:settings` 广播 */
  public settings!: SettingsManager;
  /** 输入子系统；未创建时为 null */
  public input: IInputManager | null = null;
  /** UI 门面；未创建时为 null */
  public ui: UIManager | null = null;
  /** 存档子系统；工厂未提供时为 null */
  public save: ISaveManager | null = null;

  private state: GameStatus = 'uninitialized';
  private readonly factories: GameFactories;

  /** 解除视口监听；未启用响应式或已销毁时为 null */
  private viewportCleanup: (() => void) | null = null;
  private viewportActive = false;
  /** 上一次应用的画布尺寸与 DPR，用于去重 */
  private lastViewport = { width: 0, height: 0, dpr: 0 };
  /** 解除 fullscreenchange 订阅；未初始化/已销毁时为 null */
  private fullscreenCleanup: (() => void) | null = null;
  /** app 是否已创建且尚未销毁；init 失败后 destroy 也要释放画布 */
  private appLive = false;

  /** 订阅 `game:settings` 的 fullscreen 键。点亮时进入全屏；关闭时仅在确已全屏才退出，
   * 避免启动阶段 `emitAll` 的 `false` 误触发 `document.exitFullscreen()`。 */
  private readonly onSettingsChange = (
    payload: EngineEvents['game:settings'],
  ): void => {
    if (payload.key !== 'fullscreen') return;
    if (payload.value === true) {
      setFullscreen(true);
    } else if (payload.value === false && isFullscreen()) {
      setFullscreen(false);
    }
  };

  /** 用户通过 Esc/手势退出全屏时把设置回写为 false，避免菜单显示与实际不符。
   * 进入全屏由设置驱动，这里只处理退出；onSettingsChange 对 false 有 isFullscreen 守卫，不会回环。 */
  private readonly onFullscreenChange = (): void => {
    if (!isFullscreen() && this.settings.get().fullscreen) {
      this.settings.onChange({ fullscreen: false });
    }
  };

  constructor(factories: Partial<GameFactories> = {}) {
    this.factories = { ...defaultFactories, ...factories };
  }

  public get status(): GameStatus {
    return this.state;
  }

  /** 运行时门面：单点断言，供插件与子系统共享（input/save 可能为 null） */
  public get engine(): VNEngine {
    return this as unknown as VNEngine;
  }

  /** 初始化引擎：创建全部子系统并启动前置加载。仅允许从 uninitialized 调用。 */
  public async init(config: GameConfig): Promise<void> {
    if (this.state !== 'uninitialized') {
      throw new Error(`Cannot init while status is "${this.state}"`);
    }

    this.eventBus = new EventBus<EngineEvents>();
    this.eventBus.on('game:settings', this.onSettingsChange);
    this.variableStore = new VariableStore();
    this.resource = new ResourceManager(this.eventBus, config.assets);

    // 设置先于消费它的子系统（渲染/音频/UI）创建，其 get() 立即可用
    this.settings = this.factories.createSettings(this.engine);
    // 外部退出全屏（Esc/手势）时回写设置；node 下为空操作
    this.fullscreenCleanup = observeFullscreen(this.onFullscreenChange);

    this.app = await this.factories.createApplication(config);
    this.appLive = true;

    this.renderer = this.factories.createRenderer({
      stage: this.app.stage,
      eventBus: this.eventBus,
      resource: this.resource,
      width: config.width,
      height: config.height,
      scaleMode: config.scaleMode,
    });

    // 渲染器（ScaleManager）就绪后立即按实际宿主尺寸应用一次，再开始监听；
    // 早于输入/UI/首帧，逻辑坐标与 UI 布局均不受影响。
    // 缺省：引擎自建 canvas 时开启；embedder 自带 canvas 时保持旧的固定尺寸行为
    const responsive = config.responsive ?? config.canvas === undefined;
    if (responsive) {
      this.startViewport();
    }

    this.input = this.factories.createInput(this.engine, config);
    this.audio = this.factories.createAudio(this.engine);
    this.save = this.factories.createSave(this.engine);

    // UI 挂到渲染器预建的 ui 图层，并把命中层交给输入子系统
    this.ui = this.factories.createUI(this.engine, config);
    if (this.ui) {
      this.renderer.getUILayer()?.addChild(this.ui.root);
      this.input?.setUIRoot(this.ui.root);
    }

    this.script = new ScriptEngine(this.engine, this.variableStore);

    this.plugins = new PluginManager(this.engine);
    this.plugins.loadAll(config.plugins ?? []);

    const updatables: Updatable[] = [
      this.renderer,
      this.script,
      this.audio,
      this.plugins,
    ];
    if (this.ui) updatables.push(this.ui);

    this.updater = new Updater({
      app: this.app,
      eventBus: this.eventBus,
      updatables,
      fps: config.fps,
    });

    await this.preloadScripts(config.scripts);

    // 各子系统已就绪，推送初始设置使其应用当前值
    this.settings.emitAll();

    this.state = 'ready';
    this.eventBus.emit('game:init', {});
  }

  /** 启动游戏循环；ready 或 paused 状态均可调用（paused 时等价于 resume） */
  public start(): void {
    if (this.state === 'uninitialized') {
      throw new Error('Cannot start before init');
    }
    if (this.state === 'running') return;
    if (this.state === 'paused') {
      this.resume();
      return;
    }
    this.updater.start();
    this.state = 'running';
    this.eventBus.emit('game:start', {});
  }

  public pause(): void {
    if (this.state !== 'running') {
      throw new Error(`Cannot pause while status is "${this.state}"`);
    }
    this.updater.pause();
    this.state = 'paused';
    this.eventBus.emit('game:pause', {});
  }

  public resume(): void {
    if (this.state !== 'paused') {
      throw new Error(`Cannot resume while status is "${this.state}"`);
    }
    this.updater.resume();
    this.state = 'running';
    this.eventBus.emit('game:resume', {});
  }

  /** 销毁全部子系统并回到 uninitialized；未初始化时只释放可能已创建的 app/监听 */
  public destroy(): void {
    // 放在状态判断之前：init 失败（仍为 uninitialized）时也要解绑监听并释放画布
    this.stopViewport();
    this.stopFullscreenObserver();
    if (this.state === 'uninitialized') {
      this.destroyApp();
      return;
    }

    this.eventBus.off('game:settings', this.onSettingsChange);
    this.eventBus.emit('game:destroy', {});
    this.updater.destroy();
    // ui/input 先于 renderer：renderer 会以 { children: true } 销毁 ui 图层
    this.ui?.destroy();
    this.input?.destroy();
    this.renderer.destroy();
    this.audio.destroy();
    this.resource.clear();
    this.destroyApp();

    this.input = null;
    this.ui = null;
    this.save = null;
    this.state = 'uninitialized';
  }

  /** 运行时动态加载脚本并交由 ScriptEngine 执行 */
  public async loadScript(id: string): Promise<void> {
    const script = await this.resource.loadScript(id);
    this.script.load(id, script);
  }

  public async saveSlot(slot: number, thumbnail?: string): Promise<void> {
    const saveManager = this.requireSaveManager();
    await saveManager.capture(this.engine, slot, thumbnail);
    this.eventBus.emit('game:save', { slot });
  }

  public async loadSlot(slot: number): Promise<void> {
    const saveManager = this.requireSaveManager();
    // 恢复期间冻结帧循环，避免读到一半的状态被渲染；仅从 running 进入，
    // ready/paused 不自动恢复（respect 调用方原本的暂停状态）。
    const wasRunning = this.state === 'running';
    if (wasRunning) this.pause();
    try {
      await saveManager.restore(this.engine, slot);
      this.eventBus.emit('game:load', { slot });
    } finally {
      if (wasRunning && this.state === 'paused') this.resume();
    }
  }

  /** VNEngine 门面：同步签名，内部转发到异步 saveSlot */
  public saveGame(slot: number, thumbnail?: string): void {
    this.requireSaveManager();
    void this.saveSlot(slot, thumbnail).catch((error: unknown) => {
      console.error('[VNEngine] save failed', error);
    });
  }

  public loadGame(slot: number): void {
    this.requireSaveManager();
    void this.loadSlot(slot).catch((error: unknown) => {
      console.error('[VNEngine] load failed', error);
    });
  }

  /** 按宿主尺寸应用一次并开始监听视口变化 */
  private startViewport(): void {
    this.viewportActive = true;
    this.applyViewport();
    this.viewportCleanup = observeViewport(
      getParentElement(this.app.canvas),
      () => this.applyViewport(),
    );
  }

  /** 画布铺满宿主；逻辑分辨率不变，由 ScaleManager 负责缩放/居中 */
  private applyViewport(): void {
    if (!this.viewportActive) return;

    const size = this.measureViewport();
    if (!size) return;

    const dpr = Math.max(1, getDevicePixelRatio());
    if (
      size.width === this.lastViewport.width &&
      size.height === this.lastViewport.height &&
      dpr === this.lastViewport.dpr
    ) {
      return;
    }

    this.app.renderer.resize(size.width, size.height, dpr);
    this.renderer.resize(size);
    // 应用成功后才记录，避免 resize 抛错后被误判为已处理
    this.lastViewport = { width: size.width, height: size.height, dpr };
  }

  /**
   * 优先测量 canvas 宿主；宿主存在但尺寸为 0（隐藏）时跳过，
   * 只有完全无宿主（embedder 的游离 canvas）才退回窗口尺寸。
   */
  private measureViewport(): { width: number; height: number } | null {
    const host = getParentElement(this.app.canvas);
    if (host) return getElementSize(host);

    const viewport = getViewportSize();
    return viewport.width > 0 && viewport.height > 0 ? viewport : null;
  }

  private stopViewport(): void {
    this.viewportActive = false;
    this.viewportCleanup?.();
    this.viewportCleanup = null;
    this.lastViewport = { width: 0, height: 0, dpr: 0 };
  }

  private stopFullscreenObserver(): void {
    this.fullscreenCleanup?.();
    this.fullscreenCleanup = null;
  }

  /** 销毁已创建的 pixi Application（含 canvas）；重复调用安全 */
  private destroyApp(): void {
    if (!this.appLive) return;
    this.appLive = false;
    this.app.destroy(true);
  }

  private requireSaveManager(): ISaveManager {
    if (!this.save) throw new Error('SaveManager is not available yet');
    return this.save;
  }

  /** 预加载配置中的脚本到资源缓存，并把首个脚本载入解释器 */
  private async preloadScripts(ids: string[]): Promise<void> {
    let first: Script | null = null;
    let firstId = '';
    for (const id of ids) {
      const script = await this.resource.loadScript(id);
      if (!first) {
        first = script;
        firstId = id;
      }
    }
    if (first) this.script.load(firstId, first);
  }
}

export { Game };
export default Game;
