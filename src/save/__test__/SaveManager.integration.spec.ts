import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { DialogueEntry, VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';
import VariableStore from '@/script/VariableStore';
import ScriptEngine from '@/script/ScriptEngine';
import Parser from '@/script/Parser';
import { SaveManager } from '../SaveManager';
import type { StorageProvider } from '../SaveStorage';

class MemoryStorage implements StorageProvider {
  private readonly map = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  public keys(): string[] {
    return [...this.map.keys()];
  }
}

interface Harness {
  engine: VNEngine;
  script: ScriptEngine;
  variableStore: VariableStore;
}

function makeEngine(
  scripts: Map<string, Script>,
  history: DialogueEntry[] = [],
): Harness {
  const bus = new EventBus<EngineEvents>();
  const variableStore = new VariableStore();
  const script = new ScriptEngine(bus, variableStore);
  const engine = {
    eventBus: bus,
    script,
    variableStore,
    resource: {
      loadScript: async (id: string) => {
        const found = scripts.get(id);
        if (!found) {
          throw new Error(`Script with id "${id}" not found in manifest.`);
        }
        return found;
      },
    },
    renderer: {
      getState: () => ({ bgImage: null, characters: [] }),
      setState: () => {},
    },
    audio: { getState: () => null, setState: () => {} },
    ui: {
      dialogueBox: { currentText: '' },
      history: {
        entries: () => history,
        restore: (entries: DialogueEntry[]) => {
          history.splice(0, history.length, ...entries);
        },
      },
    },
  } as unknown as VNEngine;
  return { engine, script, variableStore };
}

describe('SaveManager integration', () => {
  it('should restore a save by reloading the script with its resource id', async () => {
    // Parser leaves Script.name empty, so the id must be tracked by
    // ScriptEngine; otherwise restore reloads "" and throws.
    const parsed = new Parser().parseScript(
      '@set $a 1\n@set $b 2\n@set $c 3\n',
    );
    const scripts = new Map([['chapter1', parsed]]);
    const manager = new SaveManager({ storage: new MemoryStorage() });

    const source = makeEngine(scripts);
    source.script.load('chapter1', parsed);
    source.script.update(); // a = 1
    source.script.update(); // b = 2
    expect(source.script.getState()).toEqual({
      currentScript: 'chapter1',
      pc: 2,
    });

    await manager.capture(source.engine, 0);

    // A fresh engine (new run) loading the same save must succeed.
    const fresh = makeEngine(scripts);
    await manager.restore(fresh.engine, 0);

    expect(fresh.script.getState()).toEqual({
      currentScript: 'chapter1',
      pc: 2,
    });
    expect(fresh.variableStore.get('a')).toBe(1);
    expect(fresh.variableStore.get('b')).toBe(2);

    fresh.script.update(); // c = 3
    expect(fresh.variableStore.get('c')).toBe(3);
  });

  it('should replay a blocked @say on restore and trim the duplicated history', async () => {
    const parsed = new Parser().parseScript('Hero "你好"\nHeroine "早上好"\n');
    const scripts = new Map([['dialogue', parsed]]);
    const manager = new SaveManager({ storage: new MemoryStorage() });

    // The blocked line is already in the history (DialogueHistory recorded it
    // when the @say first emitted).
    const recorded: DialogueEntry[] = [
      { speaker: 'Hero', text: '你好', timestamp: 1 },
    ];
    const source = makeEngine(scripts, recorded);
    source.script.load('dialogue', parsed);
    source.script.update();
    expect(source.script.getState().pc).toBe(0);
    expect(source.script.getBlockedCommandType()).toBe('say');

    const data = await manager.capture(source.engine, 0);
    // Dropped from the save: replaying the command records it again.
    expect(data.gameState.history).toEqual([]);

    const fresh = makeEngine(scripts);
    const saySpy = vi.fn();
    fresh.engine.eventBus.on('script:say', saySpy);
    await manager.restore(fresh.engine, 0);

    expect(fresh.script.getState().pc).toBe(0);
    fresh.script.update();
    expect(saySpy).toHaveBeenCalledWith({ speaker: 'Hero', text: '你好' });
  });

  it('should reject an empty slot', async () => {
    const scripts = new Map<string, Script>();
    const manager = new SaveManager({ storage: new MemoryStorage() });

    await expect(
      manager.restore(makeEngine(scripts).engine, 3),
    ).rejects.toThrow('Save slot 3 is empty');
  });
});
