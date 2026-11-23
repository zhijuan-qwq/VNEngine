import * as APIHelper from '@/utils/APIHelper';
import { mountFullscreenHint } from '../fullscreenHint';

interface FakeElement {
  hidden: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  click(): void;
  count(type: string): number;
}

function makeElement(): FakeElement {
  const listeners = new Map<string, Set<() => void>>();
  return {
    hidden: false,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
    click: () => {
      for (const listener of listeners.get('click') ?? []) listener();
    },
    count: (type) => listeners.get(type)?.size ?? 0,
  };
}

function setup(options: { supported?: boolean; fullscreen?: boolean } = {}): {
  hint: FakeElement;
  action: FakeElement;
  dismiss: FakeElement;
  isFullscreen: ReturnType<typeof vi.fn>;
  stopObserving: ReturnType<typeof vi.fn>;
  notify(): void;
} {
  const hint = makeElement();
  const action = makeElement();
  const dismiss = makeElement();
  vi.spyOn(APIHelper, 'getElementById').mockImplementation((id) => {
    if (id === 'fullscreen-hint') return hint as unknown as HTMLElement;
    if (id === 'fullscreen-hint-action')
      return action as unknown as HTMLElement;
    if (id === 'fullscreen-hint-dismiss') {
      return dismiss as unknown as HTMLElement;
    }
    return null;
  });
  vi.spyOn(APIHelper, 'isFullscreenSupported').mockReturnValue(
    options.supported ?? true,
  );
  const isFullscreen = vi
    .spyOn(APIHelper, 'isFullscreen')
    .mockReturnValue(options.fullscreen ?? false);
  const stopObserving = vi.fn();
  let onChange: () => void = () => {};
  vi.spyOn(APIHelper, 'observeFullscreen').mockImplementation((callback) => {
    onChange = callback;
    return stopObserving;
  });
  return {
    hint,
    action,
    dismiss,
    isFullscreen,
    stopObserving,
    notify: () => onChange(),
  };
}

describe('mountFullscreenHint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should do nothing when the hint elements are absent', () => {
    vi.spyOn(APIHelper, 'getElementById').mockReturnValue(null);

    expect(() => mountFullscreenHint()()).not.toThrow();
  });

  it('should stay hidden when fullscreen is unsupported', () => {
    const { hint, action } = setup({ supported: false });
    hint.hidden = false;

    mountFullscreenHint();

    expect(hint.hidden).toBe(true);
    expect(action.addEventListener).not.toHaveBeenCalled();
  });

  it('should request fullscreen and follow fullscreen changes', () => {
    const { hint, action, isFullscreen, notify } = setup();
    const request = vi.fn();

    const cleanup = mountFullscreenHint({ onRequestFullscreen: request });

    expect(hint.hidden).toBe(false);
    action.click();
    expect(request).toHaveBeenCalledTimes(1);

    isFullscreen.mockReturnValue(true);
    notify();
    expect(hint.hidden).toBe(true);

    isFullscreen.mockReturnValue(false);
    notify();
    expect(hint.hidden).toBe(false);

    cleanup();
  });

  it('should fall back to setFullscreen and hide when dismissed', () => {
    const { hint, action, dismiss } = setup();
    const setFullscreen = vi
      .spyOn(APIHelper, 'setFullscreen')
      .mockImplementation(() => {});

    const cleanup = mountFullscreenHint();

    action.click();
    expect(setFullscreen).toHaveBeenCalledWith(true);

    dismiss.click();
    expect(hint.hidden).toBe(true);

    cleanup();
    expect(dismiss.count('click')).toBe(0);
  });

  it('should start hidden when already fullscreen', () => {
    const { hint } = setup({ fullscreen: true });

    const cleanup = mountFullscreenHint();

    expect(hint.hidden).toBe(true);
    cleanup();
  });

  it('should stop observing on cleanup and be idempotent', () => {
    const { stopObserving } = setup();

    const cleanup = mountFullscreenHint();
    cleanup();
    cleanup();

    expect(stopObserving).toHaveBeenCalledTimes(1);
  });
});
