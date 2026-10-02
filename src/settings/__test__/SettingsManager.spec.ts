import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { Settings } from '@/types/engine';
import type { StorageProvider } from '@/save/SaveStorage';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsManager,
} from '../SettingsManager';

function makeStorage(initial: Record<string, string> = {}): {
  provider: StorageProvider;
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  const provider: StorageProvider = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    keys: () => [...store.keys()],
  };
  return { provider, store };
}

function makeManager(
  options: {
    storage?: StorageProvider;
    defaults?: Settings;
  } = {},
) {
  const bus = new EventBus<EngineEvents>();
  const emitSpy = vi.spyOn(bus, 'emit');
  const manager = new SettingsManager({ bus, ...options });
  return { bus, emitSpy, manager };
}

describe('SettingsManager', () => {
  describe('defaults', () => {
    it('should expose the default settings when no storage is given', () => {
      const { manager } = makeManager();

      expect(manager.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('should apply the provided defaults over the built-in ones', () => {
      const { manager } = makeManager({
        defaults: { ...DEFAULT_SETTINGS, textSpeed: 80 },
      });

      expect(manager.get().textSpeed).toBe(80);
    });
  });

  describe('get', () => {
    it('should return a copy so callers cannot mutate internal state', () => {
      const { manager } = makeManager();

      const snapshot = manager.get();
      snapshot.masterVolume = 0;

      expect(manager.get().masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    });
  });

  describe('onChange', () => {
    it('should merge the patch and expose it via get', () => {
      const { manager } = makeManager();

      manager.onChange({ masterVolume: 0.5, textSpeed: 60 });

      expect(manager.get().masterVolume).toBe(0.5);
      expect(manager.get().textSpeed).toBe(60);
    });

    it('should emit one game:settings event per changed key', () => {
      const { emitSpy, manager } = makeManager();

      manager.onChange({ masterVolume: 0.5, fontSize: 32 });

      const events = emitSpy.mock.calls.filter(
        ([name]) => name === 'game:settings',
      );
      expect(events).toEqual([
        ['game:settings', { key: 'masterVolume', value: 0.5 }],
        ['game:settings', { key: 'fontSize', value: 32 }],
      ]);
    });

    it('should persist the merged settings', () => {
      const { provider, store } = makeStorage();
      const { manager } = makeManager({ storage: provider });

      manager.onChange({ seVolume: 0.3 });

      const raw = store.get(SETTINGS_STORAGE_KEY);
      expect(raw).toBeDefined();
      expect(JSON.parse(raw as string).seVolume).toBe(0.3);
    });

    it('should ignore unknown keys', () => {
      const { emitSpy, manager } = makeManager();

      manager.onChange({ nope: 1 } as unknown as Partial<Settings>);

      expect(emitSpy).not.toHaveBeenCalledWith(
        'game:settings',
        expect.anything(),
      );
      expect(manager.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('should clamp out-of-range volumes into 0..1', () => {
      const { manager } = makeManager();

      manager.onChange({ masterVolume: 5, bgmVolume: -2 });

      expect(manager.get().masterVolume).toBe(1);
      expect(manager.get().bgmVolume).toBe(0);
    });

    it('should clamp textSpeed into 5..100', () => {
      const { manager } = makeManager();

      manager.onChange({ textSpeed: 1000 });

      expect(manager.get().textSpeed).toBe(100);
    });

    it('should reject NaN and Infinity', () => {
      const { emitSpy, manager } = makeManager();

      manager.onChange({
        fontSize: Number.NaN,
        autoSpeed: Number.POSITIVE_INFINITY,
      });

      expect(manager.get().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      expect(manager.get().autoSpeed).toBe(DEFAULT_SETTINGS.autoSpeed);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should reject a non-positive fontSize or autoSpeed', () => {
      const { manager } = makeManager();

      manager.onChange({ fontSize: 0, autoSpeed: -5 });

      expect(manager.get().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      expect(manager.get().autoSpeed).toBe(DEFAULT_SETTINGS.autoSpeed);
    });

    it('should reject an invalid skipMode value', () => {
      const { manager } = makeManager();

      manager.onChange({ skipMode: 'sometimes' as unknown as 'all' });

      expect(manager.get().skipMode).toBe(DEFAULT_SETTINGS.skipMode);
    });

    it('should accept the two valid skipMode values', () => {
      const { manager } = makeManager();

      manager.onChange({ skipMode: 'all' });
      expect(manager.get().skipMode).toBe('all');

      manager.onChange({ skipMode: 'read' });
      expect(manager.get().skipMode).toBe('read');
    });

    it('should reject a boolean fullscreen that is not a boolean', () => {
      const { manager } = makeManager();

      manager.onChange({ fullscreen: 'yes' as unknown as boolean });

      expect(manager.get().fullscreen).toBe(DEFAULT_SETTINGS.fullscreen);
    });

    it('should reject an empty language string', () => {
      const { manager } = makeManager();

      manager.onChange({ language: '' });

      expect(manager.get().language).toBe(DEFAULT_SETTINGS.language);
    });

    it('should not emit when the patch contains only invalid keys', () => {
      const { emitSpy, manager } = makeManager();

      manager.onChange({ fontSize: Number.NaN });

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('emitAll', () => {
    it('should broadcast every current key', () => {
      const { emitSpy, manager } = makeManager();

      manager.emitAll();

      const events = emitSpy.mock.calls.filter(
        ([name]) => name === 'game:settings',
      );
      expect(events).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
      expect(events).toContainEqual([
        'game:settings',
        { key: 'textSpeed', value: DEFAULT_SETTINGS.textSpeed },
      ]);
    });
  });

  describe('load', () => {
    it('should restore valid values from storage', () => {
      const { provider } = makeStorage({
        [SETTINGS_STORAGE_KEY]: JSON.stringify({
          masterVolume: 0.25,
          textSpeed: 75,
          fullscreen: true,
        }),
      });

      const { manager } = makeManager({ storage: provider });

      expect(manager.get().masterVolume).toBe(0.25);
      expect(manager.get().textSpeed).toBe(75);
      expect(manager.get().fullscreen).toBe(true);
      // 未在存档中出现的键保留缺省值
      expect(manager.get().language).toBe(DEFAULT_SETTINGS.language);
    });

    it('should clamp and drop invalid persisted values', () => {
      const { provider } = makeStorage({
        [SETTINGS_STORAGE_KEY]: JSON.stringify({
          textSpeed: 9999,
          skipMode: 'bogus',
          unknownKey: 1,
        }),
      });

      const { manager } = makeManager({ storage: provider });

      expect(manager.get().textSpeed).toBe(100);
      expect(manager.get().skipMode).toBe(DEFAULT_SETTINGS.skipMode);
    });

    it('should fall back to defaults on corrupt JSON', () => {
      const { provider } = makeStorage({
        [SETTINGS_STORAGE_KEY]: '{not json',
      });

      const { manager } = makeManager({ storage: provider });

      expect(manager.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('should fall back to defaults when the stored value is not an object', () => {
      const { provider } = makeStorage({
        [SETTINGS_STORAGE_KEY]: '"just a string"',
      });

      const { manager } = makeManager({ storage: provider });

      expect(manager.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('should start from defaults when the key is absent', () => {
      const { provider } = makeStorage();

      const { manager } = makeManager({ storage: provider });

      expect(manager.get()).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('without storage', () => {
    it('should keep changes in memory and not throw on change', () => {
      const { manager } = makeManager();

      expect(() => manager.onChange({ fullscreen: true })).not.toThrow();
      expect(manager.get().fullscreen).toBe(true);
    });
  });
});
