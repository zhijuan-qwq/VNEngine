import type { DialogueEntry, VNEngine } from '@/types/engine';
import type { StorageProvider } from '../SaveStorage';
import { SAVE_VERSION, SaveManager, migrate } from '../SaveManager';

function makeStorage(): StorageProvider {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    keys: () => [...map.keys()],
  };
}

interface Parts {
  eventBusEmit: ReturnType<typeof vi.fn>;
  scriptGetState: ReturnType<typeof vi.fn>;
  scriptLoad: ReturnType<typeof vi.fn>;
  rendererSetState: ReturnType<typeof vi.fn>;
  audioSetState: ReturnType<typeof vi.fn>;
  variableRestore: ReturnType<typeof vi.fn>;
  loadScript: ReturnType<typeof vi.fn>;
  historyRestore: ReturnType<typeof vi.fn>;
}

interface Harness {
  manager: SaveManager;
  engine: VNEngine;
  storage: StorageProvider;
  parts: Parts;
}

function makeHarness(
  options: {
    now?: () => number;
    slotCount?: number;
    currentText?: string;
    audioId?: string;
    storage?: StorageProvider;
    history?: DialogueEntry[];
  } = {},
): Harness {
  const storage = options.storage ?? makeStorage();

  const parts: Parts = {
    eventBusEmit: vi.fn(),
    scriptGetState: vi.fn(() => ({ currentScript: 'chapter1', pc: 7 })),
    scriptLoad: vi.fn(),
    rendererSetState: vi.fn(),
    audioSetState: vi.fn(),
    variableRestore: vi.fn(),
    loadScript: vi.fn(async () => ({ name: 'chapter1' })),
    historyRestore: vi.fn(),
  };

  const engine = {
    eventBus: { emit: parts.eventBusEmit },
    script: { getState: parts.scriptGetState, load: parts.scriptLoad },
    renderer: {
      getState: vi.fn(() => ({ bgImage: 'bg_room', characters: [] })),
      setState: parts.rendererSetState,
    },
    audio: {
      getState: vi.fn(() => ({
        id: options.audioId ?? 'bgm_theme',
        progress: 12,
      })),
      setState: parts.audioSetState,
    },
    variableStore: {
      dump: vi.fn(() => ({ variables: { hp: 10 }, flags: ['met_hero'] })),
      restore: parts.variableRestore,
    },
    resource: { loadScript: parts.loadScript },
    ui: {
      dialogueBox: { currentText: options.currentText ?? '你好，世界' },
      history: {
        entries: () => options.history ?? [],
        restore: parts.historyRestore,
      },
    },
  } as unknown as VNEngine;

  const manager = new SaveManager({
    storage,
    now: options.now,
    slotCount: options.slotCount,
  });

  return { manager, engine, storage, parts };
}

describe('SaveManager', () => {
  describe('capture', () => {
    it('should assemble a snapshot from every subsystem', async () => {
      const h = makeHarness({ now: () => 1234 });

      const data = await h.manager.capture(h.engine, 0);

      expect(data.version).toBe(SAVE_VERSION);
      expect(data.timestamp).toBe(1234);
      expect(data.slotLabel).toBe('你好，世界');
      expect(data.gameState).toEqual({
        currentScript: 'chapter1',
        scriptPC: 7,
        variables: { hp: 10 },
        flags: ['met_hero'],
        bgImage: 'bg_room',
        characters: [],
        bgm: { id: 'bgm_theme', progress: 12 },
        history: [],
        playTime: 0,
      });
    });

    it('should truncate the slot label to 30 characters', async () => {
      const h = makeHarness({ currentText: 'あ'.repeat(50) });

      const data = await h.manager.capture(h.engine, 0);

      expect(data.slotLabel).toHaveLength(30);
    });

    it('should normalize an empty BGM id to null', async () => {
      const h = makeHarness({ audioId: '' });

      const data = await h.manager.capture(h.engine, 0);

      expect(data.gameState.bgm).toBeNull();
    });

    it('should capture history entries from the ui', async () => {
      const entries = [{ speaker: 'Hero', text: 'Hi', timestamp: 1 }];
      const h = makeHarness({ history: entries });

      const data = await h.manager.capture(h.engine, 0);

      expect(data.gameState.history).toEqual(entries);
    });

    it('should persist the save as JSON under the slot key', async () => {
      const h = makeHarness();

      await h.manager.capture(h.engine, 3);

      const raw = h.storage.getItem('save_3');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).version).toBe(SAVE_VERSION);
    });

    it.each([-1, 1.5, Number.NaN])(
      'should reject an invalid slot %s',
      async (slot) => {
        const h = makeHarness();

        await expect(h.manager.capture(h.engine, slot)).rejects.toThrow(
          /Invalid save slot/,
        );
      },
    );

    it('should propagate a storage write failure', async () => {
      const storage = makeStorage();
      storage.setItem = () => {
        throw new Error('quota exceeded');
      };
      const h = makeHarness({ storage });

      await expect(h.manager.capture(h.engine, 0)).rejects.toThrow(
        /quota exceeded/,
      );
    });
  });

  describe('restore', () => {
    it('should restore variables, renderer state and script position', async () => {
      const h = makeHarness();
      await h.manager.capture(h.engine, 1);

      await h.manager.restore(h.engine, 1);

      expect(h.parts.variableRestore).toHaveBeenCalledWith({
        variables: { hp: 10 },
        flags: ['met_hero'],
      });
      expect(h.parts.rendererSetState).toHaveBeenCalledWith({
        bgImage: 'bg_room',
        characters: [],
      });
      expect(h.parts.loadScript).toHaveBeenCalledWith('chapter1');
      expect(h.parts.scriptLoad).toHaveBeenCalledWith(
        'chapter1',
        { name: 'chapter1' },
        7,
      );
    });

    it('should reload the script by the id stored during capture', async () => {
      const h = makeHarness();
      const data = await h.manager.capture(h.engine, 0);

      // The engine has since moved on; restore must use the saved id.
      h.parts.scriptGetState.mockReturnValue({ currentScript: 'other', pc: 0 });

      await h.manager.restore(h.engine, 0);

      const savedId = data.gameState.currentScript;
      expect(savedId).toBe('chapter1');
      expect(h.parts.loadScript).toHaveBeenCalledWith(savedId);
      expect(h.parts.scriptLoad).toHaveBeenCalledWith(
        savedId,
        { name: 'chapter1' },
        7,
      );
    });

    it('should replay the saved BGM', async () => {
      const h = makeHarness({ audioId: 'bgm_theme' });
      await h.manager.capture(h.engine, 0);

      await h.manager.restore(h.engine, 0);

      expect(h.parts.eventBusEmit).toHaveBeenCalledWith('audio:play', {
        id: 'bgm_theme',
        type: 'bgm',
        loop: true,
      });
      expect(h.parts.audioSetState).toHaveBeenCalledWith({
        id: 'bgm_theme',
        progress: 12,
      });
    });

    it('should stop BGM when the save has none', async () => {
      const h = makeHarness({ audioId: '' });
      await h.manager.capture(h.engine, 0);

      await h.manager.restore(h.engine, 0);

      expect(h.parts.eventBusEmit).toHaveBeenCalledWith('audio:stop', {
        type: 'bgm',
      });
      expect(h.parts.audioSetState).toHaveBeenCalledWith(null);
    });

    it('should restore history into the ui', async () => {
      const entries = [{ speaker: 'Hero', text: 'Hi', timestamp: 1 }];
      const h = makeHarness({ history: entries });
      await h.manager.capture(h.engine, 0);

      await h.manager.restore(h.engine, 0);

      expect(h.parts.historyRestore).toHaveBeenCalledWith(entries);
    });

    it('should reject an empty slot', async () => {
      const h = makeHarness();

      await expect(h.manager.restore(h.engine, 0)).rejects.toThrow(/is empty/);
    });

    it('should reject a corrupted slot', async () => {
      const h = makeHarness();
      h.storage.setItem('save_0', '{not json');

      await expect(h.manager.restore(h.engine, 0)).rejects.toThrow(
        /is corrupted/,
      );
    });

    it('should reject an invalid slot', async () => {
      const h = makeHarness();

      await expect(h.manager.restore(h.engine, -1)).rejects.toThrow(
        /Invalid save slot/,
      );
    });
  });

  describe('list', () => {
    it('should default to twelve slots', () => {
      const h = makeHarness();

      expect(h.manager.list()).toHaveLength(12);
    });

    it('should fill empty slots up to slotCount and sort by slot', async () => {
      const h = makeHarness({ slotCount: 3 });
      await h.manager.capture(h.engine, 1);

      const list = h.manager.list();

      expect(list.map((entry) => entry.slot)).toEqual([0, 1, 2]);
      expect(list[0].label).toBeUndefined();
      expect(list[1].label).toBe('你好，世界');
      expect(list[1].timestamp).toBeTypeOf('number');
    });

    it('should include saved slots beyond slotCount', async () => {
      const h = makeHarness({ slotCount: 3 });
      await h.manager.capture(h.engine, 5);

      expect(h.manager.list().map((entry) => entry.slot)).toEqual([0, 1, 2, 5]);
    });

    it('should ignore corrupted and unrelated keys', async () => {
      const h = makeHarness({ slotCount: 2 });
      h.storage.setItem('save_0', 'garbage');
      h.storage.setItem('save_', '{}');
      h.storage.setItem('other', '{}');

      const list = h.manager.list();

      expect(list.map((entry) => entry.slot)).toEqual([0, 1]);
      expect(list[0].label).toBeUndefined();
    });

    it('should round-trip label and timestamp through capture', async () => {
      const h = makeHarness({ now: () => 999 });
      await h.manager.capture(h.engine, 2);

      const info = h.manager.list().find((entry) => entry.slot === 2);

      expect(info).toMatchObject({
        slot: 2,
        label: '你好，世界',
        timestamp: 999,
      });
    });
  });
});

describe('migrate', () => {
  it('should accept a current-version payload unchanged', () => {
    const raw = { version: SAVE_VERSION, gameState: {} };

    expect(migrate(raw)).toBe(raw);
  });

  it('should reject a non-object payload', () => {
    expect(() => migrate(null)).toThrow(/Invalid save data/);
    expect(() => migrate('nope')).toThrow(/Invalid save data/);
  });

  it('should reject a payload without a version', () => {
    expect(() => migrate({})).toThrow(/missing a version/);
  });

  it('should reject a newer version', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(
      /newer than supported/,
    );
  });
});
