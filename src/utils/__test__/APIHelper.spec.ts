import { createAudioContext } from '../APIHelper';

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
