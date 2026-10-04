import { Application } from 'pixi.js';
import Renderer, { type RendererOptions } from '@/renderer/Renderer';
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
  getStorage,
  isFullscreen,
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
  createInput(engine: VNEngine): IInputManager | null;
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
  createInput: (engine) =>
    new InputManager(engine.eventBus, {
      width: engine.app.screen.width,
      height: engine.app.screen.height,
      toLogical: (point) => engine.renderer.toLogical(point),
      // 惰性：ui 在本工厂之后才创建，点击时才求值
      isTypewriterBusy: () => engine.ui?.isBusy() ?? false,
    }),
  createUI: (engine, config) =>
    new UIManager(engine.eventBus, {
      width: config.width,
      height: config.height,
      autoTick: false,
      resolveVar: (name) => engine.variableStore.get(name),
      // 设置菜单对契约编程：直接以 SettingsManager 作为 controller
      settingsMenu: { controller: engine.settings },
      // 存读档菜单对契约编程：槽位/回调延迟求值，读取时 engine.save 必已就位
      saveLoadMenu: {
        getSlots: () => engine.save.list(),
        onSave: (slot) => engine.saveGame(slot),
        onLoad: (slot) => engine.loadGame(slot),
      },
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

    this.app = await this.factories.createApplication(config);

    this.renderer = this.factories.createRenderer({
      stage: this.app.stage,
      eventBus: this.eventBus,
      resource: this.resource,
      width: config.width,
      height: config.height,
      scaleMode: config.scaleMode,
    });
    this.input = this.factories.createInput(this.engine);
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

  /** 销毁全部子系统并回到 uninitialized；未初始化时为 no-op */
  public destroy(): void {
    if (this.state === 'uninitialized') return;

    this.eventBus.off('game:settings', this.onSettingsChange);
    this.eventBus.emit('game:destroy', {});
    this.updater.destroy();
    // ui/input 先于 renderer：renderer 会以 { children: true } 销毁 ui 图层
    this.ui?.destroy();
    this.input?.destroy();
    this.renderer.destroy();
    this.audio.destroy();
    this.resource.clear();
    this.app.destroy(true);

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

  public async saveSlot(slot: number): Promise<void> {
    const saveManager = this.requireSaveManager();
    await saveManager.capture(this.engine, slot);
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
  public saveGame(slot: number): void {
    this.requireSaveManager();
    void this.saveSlot(slot).catch((error: unknown) => {
      console.error('[VNEngine] save failed', error);
    });
  }

  public loadGame(slot: number): void {
    this.requireSaveManager();
    void this.loadSlot(slot).catch((error: unknown) => {
      console.error('[VNEngine] load failed', error);
    });
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
