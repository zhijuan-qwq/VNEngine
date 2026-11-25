import {
  cancelFrame,
  createAudioContext,
  getDevicePixelRatio,
  getElementById,
  getElementSize,
  getParentElement,
  getStorage,
  getViewportSize,
  isFullscreen,
  isFullscreenSupported,
  matchesMediaQuery,
  now,
  observeFullscreen,
  observeViewport,
  requestFrame,
  setFullscreen,
} from '../APIHelper';

/** 临时把全局某个属性重定义为抛错的 getter，返回还原函数 */
function withThrowingGlobal(key: string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() {
      throw new Error(`access to ${key} denied`);
    },
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[key];
    }
  };
}

class FakeAudioContext {
  public static instances: FakeAudioContext[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

class FakeWebkitAudioContext {
  public static instances: FakeWebkitAudioContext[] = [];

  constructor() {
    FakeWebkitAudioContext.instances.push(this);
  }
}

describe('createAudioContext', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeWebkitAudioContext.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should construct an audio context from window.AudioContext', () => {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });

    const context = createAudioContext();

    expect(context).toBeInstanceOf(FakeAudioContext);
    expect(FakeAudioContext.instances).toEqual([context]);
  });

  it('should fall back to webkitAudioContext when AudioContext is undefined', () => {
    vi.stubGlobal('window', {
      AudioContext: undefined,
      webkitAudioContext: FakeWebkitAudioContext,
    });

    const context = createAudioContext();

    expect(context).toBeInstanceOf(FakeWebkitAudioContext);
    expect(FakeWebkitAudioContext.instances).toEqual([context]);
  });

  it('should fall back to webkitAudioContext when AudioContext is null', () => {
    vi.stubGlobal('window', {
      AudioContext: null,
      webkitAudioContext: FakeWebkitAudioContext,
    });

    const context = createAudioContext();

    expect(context).toBeInstanceOf(FakeWebkitAudioContext);
    expect(FakeWebkitAudioContext.instances).toEqual([context]);
  });

  it('should prefer window.AudioContext over the webkit prefix', () => {
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      webkitAudioContext: FakeWebkitAudioContext,
    });

    createAudioContext();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeWebkitAudioContext.instances).toHaveLength(0);
  });

  it('should throw when neither constructor is available', () => {
    vi.stubGlobal('window', {
      AudioContext: undefined,
      webkitAudioContext: undefined,
    });

    expect(() => createAudioContext()).toThrow(TypeError);
  });
});

describe('getStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return the global localStorage when available', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);

    expect(getStorage()).toBe(storage);
  });

  it('should return null when localStorage is undefined', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(getStorage()).toBeNull();
  });

  it('should return null when accessing localStorage throws', () => {
    const restore = withThrowingGlobal('localStorage');

    try {
      expect(getStorage()).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('getDevicePixelRatio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return window.devicePixelRatio when window exists', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2.5 });

    expect(getDevicePixelRatio()).toBe(2.5);
  });

  it('should return 1 when devicePixelRatio is undefined', () => {
    vi.stubGlobal('window', { devicePixelRatio: undefined });

    expect(getDevicePixelRatio()).toBe(1);
  });

  it('should return 1 when window is undefined', () => {
    vi.stubGlobal('window', undefined);

    expect(getDevicePixelRatio()).toBe(1);
  });
});

describe('getElementById', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delegate to document.getElementById', () => {
    const element = { id: 'app' };
    const getById = vi.fn(() => element);
    vi.stubGlobal('document', { getElementById: getById });

    expect(getElementById('app')).toBe(element);
    expect(getById).toHaveBeenCalledWith('app');
  });

  it('should return null when document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(getElementById('app')).toBeNull();
  });
});

describe('now', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should use performance.now when available', () => {
    vi.stubGlobal('performance', { now: () => 1234 });

    expect(now()).toBe(1234);
  });

  it('should fall back to Date.now when performance is undefined', () => {
    vi.stubGlobal('performance', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(5678);

    expect(now()).toBe(5678);
  });
});

describe('requestFrame / cancelFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should delegate to requestAnimationFrame and return its handle', () => {
    const raf = vi.fn(() => 7);
    vi.stubGlobal('requestAnimationFrame', raf);

    const handle = requestFrame(() => {});

    expect(handle).toBe(7);
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('should throw when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);

    expect(() => requestFrame(() => {})).toThrow(/requestAnimationFrame/);
  });

  it('should delegate to cancelAnimationFrame when available', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    cancelFrame(7);

    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('should be a no-op when cancelAnimationFrame is unavailable', () => {
    vi.stubGlobal('cancelAnimationFrame', undefined);

    expect(() => cancelFrame(7)).not.toThrow();
  });
});

describe('isFullscreen / setFullscreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should report true when document.fullscreenElement is set', () => {
    vi.stubGlobal('document', { fullscreenElement: {} });

    expect(isFullscreen()).toBe(true);
  });

  it('should report false when document.fullscreenElement is null', () => {
    vi.stubGlobal('document', { fullscreenElement: null });

    expect(isFullscreen()).toBe(false);
  });

  it('should report false when document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(isFullscreen()).toBe(false);
  });

  it('should request fullscreen when turning on', () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen },
      exitFullscreen: vi.fn(),
    });

    setFullscreen(true);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('should exit fullscreen when turning off', () => {
    const exitFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen: vi.fn() },
      exitFullscreen,
    });

    setFullscreen(false);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('should be a no-op when document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(() => setFullscreen(true)).not.toThrow();
  });

  it('should swallow a rejected fullscreen promise', async () => {
    const denial = new Error('denied');
    vi.stubGlobal('document', {
      documentElement: {
        requestFullscreen: vi.fn(() => Promise.reject(denial)),
      },
      exitFullscreen: vi.fn(),
    });

    expect(() => setFullscreen(true)).not.toThrow();
    await Promise.resolve();
  });

  it('should be a no-op when fullscreen is unsupported', () => {
    vi.stubGlobal('document', { documentElement: {} });

    expect(() => setFullscreen(true)).not.toThrow();
  });

  it('should be a no-op when exitFullscreen is unsupported', () => {
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen: vi.fn() },
    });

    expect(() => setFullscreen(false)).not.toThrow();
  });
});

describe('isFullscreenSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should report true when requestFullscreen exists', () => {
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen: vi.fn() },
    });

    expect(isFullscreenSupported()).toBe(true);
  });

  it('should report false when requestFullscreen is missing', () => {
    vi.stubGlobal('document', { documentElement: {} });

    expect(isFullscreenSupported()).toBe(false);
  });

  it('should report false when document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(isFullscreenSupported()).toBe(false);
  });
});

describe('observeFullscreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should subscribe to and unsubscribe from fullscreenchange', () => {
    const doc = makeEventTarget();
    vi.stubGlobal('document', {
      addEventListener: doc.addEventListener,
      removeEventListener: doc.removeEventListener,
    });
    const onChange = vi.fn();

    const cleanup = observeFullscreen(onChange);
    doc.emit('fullscreenchange');

    expect(onChange).toHaveBeenCalledTimes(1);

    cleanup();
    expect(doc.count('fullscreenchange')).toBe(0);
    cleanup();
    expect(doc.count('fullscreenchange')).toBe(0);
  });

  it('should be a no-op without document', () => {
    vi.stubGlobal('document', undefined);

    expect(() => observeFullscreen(vi.fn())()).not.toThrow();
  });
});

describe('getViewportSize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return window dimensions', () => {
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768 });

    expect(getViewportSize()).toEqual({ width: 1024, height: 768 });
  });

  it('should return zeros when window is undefined', () => {
    vi.stubGlobal('window', undefined);

    expect(getViewportSize()).toEqual({ width: 0, height: 0 });
  });
});

describe('matchesMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delegate to window.matchMedia', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });

    expect(matchesMediaQuery('(pointer: coarse)')).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('should return false when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {});

    expect(matchesMediaQuery('(pointer: coarse)')).toBe(false);
  });

  it('should return false when window is undefined', () => {
    vi.stubGlobal('window', undefined);

    expect(matchesMediaQuery('(pointer: coarse)')).toBe(false);
  });
});

describe('getParentElement', () => {
  it('should return the parent element', () => {
    const parent = {};
    expect(getParentElement({ parentElement: parent })).toBe(parent);
  });

  it('should return null for detached or non-DOM values', () => {
    expect(getParentElement(null)).toBeNull();
    expect(getParentElement(undefined)).toBeNull();
    expect(getParentElement('canvas')).toBeNull();
    expect(getParentElement({})).toBeNull();
  });
});

describe('getElementSize', () => {
  it('should return the client size', () => {
    expect(
      getElementSize({
        clientWidth: 800,
        clientHeight: 600,
      } as HTMLElement),
    ).toEqual({ width: 800, height: 600 });
  });

  it('should return null for missing or zero-sized elements', () => {
    expect(getElementSize(null)).toBeNull();
    expect(
      getElementSize({ clientWidth: 0, clientHeight: 600 } as HTMLElement),
    ).toBeNull();
    expect(
      getElementSize({ clientWidth: 800, clientHeight: 0 } as HTMLElement),
    ).toBeNull();
  });
});

type Listener = () => void;

function makeEventTarget(): {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  emit(type: string): void;
  count(type: string): number;
} {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    emit: (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

class FakeResizeObserver {
  public static instances: FakeResizeObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();
  public readonly callback: () => void;

  public constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
}

interface FakeMediaQueryList {
  query: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  emit(): void;
}

function makeMatchMedia(): {
  matchMedia: ReturnType<typeof vi.fn>;
  queries: FakeMediaQueryList[];
} {
  const queries: FakeMediaQueryList[] = [];
  const matchMedia = vi.fn((query: string) => {
    const listeners = new Set<Listener>();
    const list: FakeMediaQueryList = {
      query,
      addEventListener: vi.fn((_type: string, listener: Listener) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: Listener) => {
        listeners.delete(listener);
      }),
      emit: () => {
        for (const listener of listeners) listener();
      },
    };
    queries.push(list);
    return list;
  });
  return { matchMedia, queries };
}

describe('observeViewport', () => {
  afterEach(() => {
    FakeResizeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  function stubWindow(state: { devicePixelRatio: number }): {
    win: ReturnType<typeof makeEventTarget>;
    visualViewport: ReturnType<typeof makeEventTarget>;
    queries: FakeMediaQueryList[];
  } {
    const win = makeEventTarget();
    const visualViewport = makeEventTarget();
    const { matchMedia, queries } = makeMatchMedia();
    vi.stubGlobal('window', {
      ...state,
      addEventListener: win.addEventListener,
      removeEventListener: win.removeEventListener,
      visualViewport,
      matchMedia,
    });
    return { win, visualViewport, queries };
  }

  it('should observe the target and notify on every source', () => {
    const { win, visualViewport } = stubWindow({ devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const onChange = vi.fn();
    const target = {} as HTMLElement;

    const cleanup = observeViewport(target, onChange);

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]?.observe).toHaveBeenCalledWith(
      target,
    );

    win.emit('resize');
    win.emit('orientationchange');
    win.emit('load');
    win.emit('pageshow');
    visualViewport.emit('resize');
    FakeResizeObserver.instances[0]?.callback();

    expect(onChange).toHaveBeenCalledTimes(6);

    cleanup();

    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(
      1,
    );
    expect(win.count('resize')).toBe(0);
    expect(win.count('orientationchange')).toBe(0);
    expect(win.count('load')).toBe(0);
    expect(win.count('pageshow')).toBe(0);
    expect(visualViewport.count('resize')).toBe(0);
  });

  it('should be idempotent when cleaned up twice', () => {
    stubWindow({ devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const cleanup = observeViewport({} as HTMLElement, vi.fn());
    cleanup();
    cleanup();

    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(
      1,
    );
  });

  it('should fall back to window events when ResizeObserver is unavailable', () => {
    const { win } = stubWindow({ devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', undefined);
    const onChange = vi.fn();

    const cleanup = observeViewport(null, onChange);
    win.emit('resize');

    expect(onChange).toHaveBeenCalledTimes(1);

    cleanup();
    expect(win.count('resize')).toBe(0);
  });

  it('should fall back when the observer constructor throws', () => {
    const { win } = stubWindow({ devicePixelRatio: 1 });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public constructor() {
          throw new Error('unsupported');
        }
      },
    );
    const onChange = vi.fn();

    const cleanup = observeViewport({} as HTMLElement, onChange);
    win.emit('resize');

    expect(onChange).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('should be a no-op without window', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    const onChange = vi.fn();

    expect(() => observeViewport(null, onChange)()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should re-arm the DPR watcher after a change', () => {
    const { win, queries } = stubWindow({ devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', undefined);
    const onChange = vi.fn();

    const cleanup = observeViewport(null, onChange);

    expect(queries[0]?.query).toBe('(resolution: 1dppx)');

    const windowState = (
      globalThis as unknown as { window: { devicePixelRatio: number } }
    ).window;
    windowState.devicePixelRatio = 2;
    queries[0]?.emit();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(queries[1]?.query).toBe('(resolution: 2dppx)');

    cleanup();
    expect(queries[1]?.removeEventListener).toHaveBeenCalled();
    expect(win.count('resize')).toBe(0);
  });

  it('should keep the raw fractional DPR in the media query', () => {
    const { queries } = stubWindow({ devicePixelRatio: 2.625 });
    vi.stubGlobal('ResizeObserver', undefined);

    const cleanup = observeViewport(null, vi.fn());

    expect(queries[0]?.query).toBe('(resolution: 2.625dppx)');
    cleanup();
  });

  it('should skip DPR watching when matchMedia lacks addEventListener', () => {
    const win = makeEventTarget();
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: win.addEventListener,
      removeEventListener: win.removeEventListener,
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    vi.stubGlobal('ResizeObserver', undefined);

    expect(() => observeViewport(null, vi.fn())()).not.toThrow();
  });
});
