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
import { DEFAULT_SETTINGS } from '@/ui/SettingsMenu';
import SaveManager from '@/save/SaveManager';
import { LocalStorageProvider } from '@/save/SaveStorage';
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
}

const defaultFactories: GameFactories = {
  async createApplication(config) {
    const app = new Application();
    await app.init({
      canvas: config.canvas,
      width: config.width,
      height: config.height,
      autoDensity: true,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    });
    if (!config.canvas && typeof document !== 'undefined') {
      document.getElementById('app')?.appendChild(app.canvas);
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
      // 存读档菜单对契约编程：槽位/回调延迟求值，读取时 engine.save 必已就位
      saveLoadMenu: {
        getSlots: () => engine.save.list(),
        onSave: (slot) => engine.saveGame(slot),
        onLoad: (slot) => engine.loadGame(slot),
      },
    }),
  createSave: () =>
    new SaveManager({
      storage: new LocalStorageProvider(),
      getSettings: () => DEFAULT_SETTINGS,
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
  /** 输入子系统；未创建时为 null */
  public input: IInputManager | null = null;
  /** UI 门面；未创建时为 null */
  public ui: UIManager | null = null;
  /** 存档子系统；工厂未提供时为 null */
  public save: ISaveManager | null = null;

  private state: GameStatus = 'uninitialized';
  private readonly factories: GameFactories;

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
    this.variableStore = new VariableStore();
    this.resource = new ResourceManager(this.eventBus, config.assets);

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

    this.script = new ScriptEngine(this.eventBus, this.variableStore);

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
    this.script.load(script);
  }

  public async saveSlot(slot: number): Promise<void> {
    const saveManager = this.requireSaveManager();
    await saveManager.capture(this.engine, slot);
    this.eventBus.emit('game:save', { slot });
  }

  public async loadSlot(slot: number): Promise<void> {
    const saveManager = this.requireSaveManager();
    await saveManager.restore(this.engine, slot);
    this.eventBus.emit('game:load', { slot });
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
    for (const id of ids) {
      const script = await this.resource.loadScript(id);
      first ??= script;
    }
    if (first) this.script.load(first);
  }
}

export { Game };
export default Game;
