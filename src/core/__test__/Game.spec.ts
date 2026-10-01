import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import EventBus from '@/core/EventBus';
import ResourceManager from '@/resource/ResourceManager';
import ScriptEngine from '@/script/ScriptEngine';
import type {
  GameConfig,
  IAudioManager,
  IInputManager,
  IRenderer,
  Plugin,
} from '@/types/engine';
import type { Script } from '@/types/script';
import type { ISaveManager } from '@/types/save';
import type { UIManager } from '@/ui/UIManager';
import Game, { type GameFactories } from '../Game';
import type { TickerLike } from '../Updater';

function makeScript(name = 'chapter1'): Script {
  return { name, commands: [], labels: new Map(), metadata: {} };
}

function makeTicker() {
  let handler: ((ticker: TickerLike) => void) | null = null;
  const ticker = {
    deltaMS: 1000 / 60,
    maxFPS: 60,
    started: false,
    add: vi.fn((fn: (ticker: TickerLike) => void) => {
      handler = fn;
    }),
    remove: vi.fn(() => {
      handler = null;
    }),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as TickerLike;
  return {
    ticker,
    fire: (deltaMS: number) => {
      ticker.deltaMS = deltaMS;
      handler?.(ticker);
    },
  };
}

function makeRenderer(uiLayer: Container | null = null): IRenderer {
  return {
    update: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
    resize: vi.fn(),
    getUILayer: vi.fn(() => uiLayer),
    toLogical: vi.fn((point: { x: number; y: number }) => point),
    destroy: vi.fn(),
  };
}

function makeFakeUI(): UIManager {
  return {
    root: new Container(),
    update: vi.fn(),
    isBusy: vi.fn(() => false),
    destroy: vi.fn(),
  } as unknown as UIManager;
}

function makeFakeInput(): {
  input: IInputManager;
  setUIRoot: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const setUIRoot = vi.fn();
  const destroy = vi.fn();
  return {
    input: { setUIRoot, destroy } as unknown as IInputManager,
    setUIRoot,
    destroy,
  };
}

function makeAudio(): IAudioManager {
  return {
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
    destroy: vi.fn(),
  };
}

interface Harness {
  game: Game;
  ticker: { fire(deltaMS: number): void; ticker: TickerLike };
  app: { destroy: ReturnType<typeof vi.fn> };
  renderer: IRenderer;
  audio: IAudioManager;
  emitSpy: ReturnType<typeof vi.spyOn>;
  config: GameConfig;
}

function makeHarness(options: {
  config?: Partial<GameConfig>;
  save?: ISaveManager | null;
  ui?: UIManager | null;
  input?: IInputManager | null;
  uiLayer?: Container | null;
}): Harness {
  const { ticker, fire } = makeTicker();
  const appDestroy = vi.fn();
  const app = { stage: {}, canvas: {}, ticker, destroy: appDestroy };
  const renderer = makeRenderer(options.uiLayer ?? null);
  const audio = makeAudio();
  const factories: Partial<GameFactories> = {
    createApplication: async () => app as unknown as Application,
    createRenderer: () => renderer,
    createAudio: () => audio,
    createInput: () => options.input ?? null,
    createUI: () => options.ui ?? null,
    createSave: () => options.save ?? null,
  };
  const game = new Game(factories);
  const config: GameConfig = {
    width: 800,
    height: 600,
    scaleMode: 'fit',
    fps: 60,
    scripts: [],
    assets: { images: {}, audio: {}, scripts: {}, spritesheets: {} },
    ...options.config,
  };
  const emitSpy = vi.spyOn(EventBus.prototype, 'emit');
  return {
    game,
    ticker: { fire, ticker },
    app: { destroy: appDestroy },
    renderer,
    audio,
    emitSpy,
    config,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Game', () => {
  describe('init', () => {
    it('should become ready and emit game:init', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);

      expect(h.game.status).toBe('ready');
      expect(h.emitSpy).toHaveBeenCalledWith('game:init', {});
    });

    it('should throw when init is called twice', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);

      await expect(h.game.init(h.config)).rejects.toThrow(/Cannot init/);
    });

    it('should allow re-init after destroy', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.destroy();
      await h.game.init(h.config);

      expect(h.game.status).toBe('ready');
    });

    it('should install configured plugins', async () => {
      const install = vi.fn();
      const plugin: Plugin = { name: 'p', version: '1.0.0', install };
      const h = makeHarness({ config: { plugins: [plugin] } });

      await h.game.init(h.config);

      expect(install).toHaveBeenCalledWith(h.game.engine);
    });

    it('should preload configured scripts and load the first one', async () => {
      const first = makeScript('a');
      const loadScript = vi
        .spyOn(ResourceManager.prototype, 'loadScript')
        .mockResolvedValue(first);
      const load = vi.spyOn(ScriptEngine.prototype, 'load');
      const h = makeHarness({ config: { scripts: ['a', 'b'] } });

      await h.game.init(h.config);

      expect(loadScript).toHaveBeenCalledWith('a');
      expect(loadScript).toHaveBeenCalledWith('b');
      expect(load).toHaveBeenCalledWith(first);
    });
  });

  describe('tick', () => {
    it('should drive renderer, script, audio and plugins each frame', async () => {
      const plugin: Plugin = {
        name: 'p',
        version: '1.0.0',
        install: vi.fn(),
        update: vi.fn(),
      };
      const scriptUpdate = vi.spyOn(ScriptEngine.prototype, 'update');
      const h = makeHarness({ config: { plugins: [plugin] } });

      await h.game.init(h.config);
      h.game.start();
      h.ticker.fire(16.6667);

      expect(h.renderer.update).toHaveBeenCalledWith(expect.closeTo(0.0166, 3));
      expect(scriptUpdate).toHaveBeenCalled();
      expect(h.audio.update).toHaveBeenCalledWith(expect.closeTo(0.0166, 3));
      expect(plugin.update).toHaveBeenCalledWith(expect.closeTo(0.0166, 3));
    });
  });

  describe('lifecycle', () => {
    it('should start from ready and emit game:start', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();

      expect(h.game.status).toBe('running');
      expect(h.emitSpy).toHaveBeenCalledWith('game:start', {});
      expect(vi.mocked(h.ticker.ticker.start)).toHaveBeenCalled();
    });

    it('should throw when starting before init', () => {
      const h = makeHarness({});
      expect(() => h.game.start()).toThrow(/before init/);
    });

    it('should pause from running and emit game:pause', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();
      h.game.pause();

      expect(h.game.status).toBe('paused');
      expect(h.emitSpy).toHaveBeenCalledWith('game:pause', {});
      expect(vi.mocked(h.ticker.ticker.stop)).toHaveBeenCalled();
    });

    it('should throw when pausing while not running', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      expect(() => h.game.pause()).toThrow(/Cannot pause/);
    });

    it('should resume from paused and emit game:resume', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();
      h.game.pause();
      h.game.resume();

      expect(h.game.status).toBe('running');
      expect(h.emitSpy).toHaveBeenCalledWith('game:resume', {});
    });

    it('should treat start from paused as a resume', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();
      h.game.pause();
      h.emitSpy.mockClear();
      h.game.start();

      expect(h.game.status).toBe('running');
      expect(h.emitSpy).toHaveBeenCalledWith('game:resume', {});
      expect(h.emitSpy).not.toHaveBeenCalledWith('game:start', {});
    });

    it('should be idempotent when starting an already running game', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();
      expect(() => h.game.start()).not.toThrow();

      expect(vi.mocked(h.ticker.ticker.start)).toHaveBeenCalledTimes(1);
    });

    it('should throw when resuming while not paused', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      expect(() => h.game.resume()).toThrow(/Cannot resume/);
    });

    it('should load a script through the resource manager', async () => {
      const script = makeScript('chapter2');
      const loadScript = vi
        .spyOn(ResourceManager.prototype, 'loadScript')
        .mockResolvedValue(script);
      const load = vi.spyOn(ScriptEngine.prototype, 'load');
      const h = makeHarness({});
      await h.game.init(h.config);

      await h.game.loadScript('chapter2');

      expect(loadScript).toHaveBeenCalledWith('chapter2');
      expect(load).toHaveBeenCalledWith(script);
    });

    it('should propagate a script load failure', async () => {
      vi.spyOn(ResourceManager.prototype, 'loadScript').mockRejectedValue(
        new Error('script not found'),
      );
      const h = makeHarness({});
      await h.game.init(h.config);

      await expect(h.game.loadScript('ghost')).rejects.toThrow(
        /script not found/,
      );
    });

    it('should destroy subsystems and return to uninitialized', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);
      h.game.start();
      h.game.destroy();

      expect(h.game.status).toBe('uninitialized');
      expect(h.emitSpy).toHaveBeenCalledWith('game:destroy', {});
      expect(h.renderer.destroy).toHaveBeenCalled();
      expect(h.audio.destroy).toHaveBeenCalled();
      expect(h.app.destroy).toHaveBeenCalled();
      expect(h.game.save).toBeNull();
      expect(h.game.input).toBeNull();
    });

    it('should be a no-op when destroying an uninitialized game', () => {
      const h = makeHarness({});
      expect(() => h.game.destroy()).not.toThrow();
      expect(h.emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('save / load', () => {
    it('should throw when no SaveManager is available', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);

      expect(() => h.game.saveGame(1)).toThrow(/not available/);
      expect(() => h.game.loadGame(1)).toThrow(/not available/);
    });

    it('should reject saveSlot/loadSlot when no SaveManager is available', async () => {
      const h = makeHarness({});
      await h.game.init(h.config);

      await expect(h.game.saveSlot(1)).rejects.toThrow(/not available/);
      await expect(h.game.loadSlot(1)).rejects.toThrow(/not available/);
    });

    it('should delegate to the injected SaveManager', async () => {
      const capture = vi.fn(async () => ({}) as never);
      const restore = vi.fn(async () => {});
      const save: ISaveManager = { capture, restore };
      const h = makeHarness({ save });

      await h.game.init(h.config);
      await h.game.saveSlot(2);
      await h.game.loadSlot(2);

      expect(capture).toHaveBeenCalledWith(h.game.engine, 2);
      expect(restore).toHaveBeenCalledWith(h.game.engine, 2);
      expect(h.emitSpy).toHaveBeenCalledWith('game:save', { slot: 2 });
      expect(h.emitSpy).toHaveBeenCalledWith('game:load', { slot: 2 });
    });

    it('should report a failing save instead of leaking a rejection', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const save: ISaveManager = {
        capture: vi.fn(async () => {
          throw new Error('disk full');
        }),
        restore: vi.fn(async () => {}),
      };
      const h = makeHarness({ save });
      await h.game.init(h.config);

      expect(() => h.game.saveGame(1)).not.toThrow();
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    });

    it('should report a failing load instead of leaking a rejection', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const save: ISaveManager = {
        capture: vi.fn(async () => ({}) as never),
        restore: vi.fn(async () => {
          throw new Error('slot missing');
        }),
      };
      const h = makeHarness({ save });
      await h.game.init(h.config);

      expect(() => h.game.loadGame(3)).not.toThrow();
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    });
  });

  describe('ui wiring', () => {
    it('should mount the ui root on the renderer ui layer', async () => {
      const layer = new Container();
      const ui = makeFakeUI();
      const { input, setUIRoot } = makeFakeInput();
      const h = makeHarness({ ui, input, uiLayer: layer });

      await h.game.init(h.config);

      expect(layer.children).toContain(ui.root);
      expect(setUIRoot).toHaveBeenCalledWith(ui.root);
    });

    it('should skip ui wiring when no UI is created', async () => {
      const { input, setUIRoot } = makeFakeInput();
      const h = makeHarness({ input });

      await h.game.init(h.config);

      expect(setUIRoot).not.toHaveBeenCalled();
      expect(h.game.ui).toBeNull();
    });

    it('should drive the ui through the updater', async () => {
      const ui = makeFakeUI();
      const h = makeHarness({ ui });

      await h.game.init(h.config);
      h.game.start();
      h.ticker.fire(16.6667);

      expect(ui.update).toHaveBeenCalled();
    });

    it('should destroy ui and input before the renderer', async () => {
      const order: string[] = [];
      const ui = makeFakeUI();
      vi.mocked(ui.destroy).mockImplementation(() => {
        order.push('ui');
      });
      const { input, destroy } = makeFakeInput();
      destroy.mockImplementation(() => {
        order.push('input');
      });
      const h = makeHarness({ ui, input, uiLayer: new Container() });
      await h.game.init(h.config);
      vi.mocked(h.renderer.destroy).mockImplementation(() => {
        order.push('renderer');
      });

      h.game.destroy();

      expect(order).toEqual(['ui', 'input', 'renderer']);
      expect(h.game.ui).toBeNull();
    });
  });
});
