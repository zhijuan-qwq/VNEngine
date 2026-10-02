import {
  cancelFrame,
  createAudioContext,
  getDevicePixelRatio,
  getElementById,
  getStorage,
  isFullscreen,
  now,
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
});
