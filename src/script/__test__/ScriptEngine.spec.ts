import ScriptEngine from '../ScriptEngine';
import EventBus from '../../core/EventBus';
import VariableStore from '../VariableStore';
import Parser from '../Parser';
import type { EngineEvents } from '@/types/events';
import type { VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';

function makeBus(): EventBus<EngineEvents> {
  return new EventBus<EngineEvents>();
}

// Parse source into a Script; the resource id is tracked by the engine, not
// stored on the Script (Parser leaves name empty).
function makeScript(source: string): Script {
  return new Parser().parseScript(source);
}

describe('ScriptEngine', () => {
  let engine: ScriptEngine;
  let bus: EventBus<EngineEvents>;
  let store: VariableStore;

  beforeEach(() => {
    bus = makeBus();
    store = new VariableStore();
    engine = new ScriptEngine({ eventBus: bus } as unknown as VNEngine, store);
  });

  describe('constructor', () => {
    it('should expose commandRegistry with builtin commands registered', () => {
      expect(engine.commandRegistry).toBeDefined();

      // Verify @say is registered and works via inline dialogue
      const busSpy = vi.fn();
      bus.on('script:say', busSpy);

      engine.load('test', makeScript('Hero "Hello"\n'));
      engine.update();

      expect(busSpy).toHaveBeenCalledWith(
        expect.objectContaining({ speaker: 'Hero', text: 'Hello' }),
      );
    });

    it('should initialize getState with empty script name and pc 0', () => {
      expect(engine.getState()).toEqual({ currentScript: '', pc: 0 });
    });
  });

  describe('load', () => {
    it('should record the resource id as currentScript, not script.name', () => {
      const script = makeScript('@set $a 1\n');

      engine.load('bg-01', script);

      expect(engine.getState().currentScript).toBe('bg-01');
      expect(script.name).toBe('');
    });

    it('should set pc to the given startPc', () => {
      engine.load('vars', makeScript('@set $a 1\n@set $b 2\n'), 1);

      expect(engine.getState().pc).toBe(1);
    });

    it('should default pc to 0 when startPc is not provided', () => {
      engine.load('vars', makeScript('@set $a 1\n'));

      expect(engine.getState().pc).toBe(0);
    });

    it('should reload the same script object at a different startPc', () => {
      const script = makeScript('@set $a 1\n@set $b 2\n@set $c 3\n');
      engine.load('vars', script);
      // Advance pc to 2 by stepping twice
      engine.update();
      engine.update();
      expect(engine.getState().pc).toBe(2);

      // Reload the same parsed script at startPc 1 (caching lives in
      // ResourceManager; ScriptEngine just re-executes the provided script)
      engine.load('vars', script, 1);
      expect(engine.getState().pc).toBe(1);

      // Should still run from the same 3-command script
      engine.update(); // runs command at pc 1: @set $b 2
      expect(store.get('b')).toBe(2);
    });

    it('should handle empty script source', () => {
      engine.load('empty', makeScript('\n'));
      expect(engine.getState().currentScript).toBe('empty');
      // Calling update on empty script should trigger script:end
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);
      engine.update();
      expect(endSpy).toHaveBeenCalled();
    });

    it('should throw on a negative startPc and not mutate currentScript', () => {
      const script = makeScript('@set $a 1\n');
      expect(() => engine.load('vars', script, -1)).toThrow(
        'Invalid startPc -1 for script "vars" (expected an integer in 0..1).',
      );
      expect(engine.getState().currentScript).toBe('');
    });

    it('should throw when startPc is beyond the last command', () => {
      expect(() => engine.load('vars', makeScript('@set $a 1\n'), 2)).toThrow(
        /Invalid startPc 2/,
      );
    });

    it('should accept startPc equal to the command count', () => {
      engine.load('vars', makeScript('@set $a 1\n'), 1);
      expect(engine.getState().pc).toBe(1);
    });
  });

  describe('getState', () => {
    it('should reflect the current script name after load', () => {
      engine.load('chapter1', makeScript('@set $x 1\n'));

      expect(engine.getState().currentScript).toBe('chapter1');
    });

    it('should reflect pc advances after update calls', () => {
      engine.load('vars', makeScript('@set $x 1\n@set $y 2\n@set $z 3\n'));

      expect(engine.getState().pc).toBe(0);
      engine.update();
      expect(engine.getState().pc).toBe(1);
      engine.update();
      expect(engine.getState().pc).toBe(2);
    });
  });

  describe('update', () => {
    it('should execute non-blocking commands and advance pc', () => {
      engine.load('vars', makeScript('@set $x 42\n@set $y 99\n'));

      engine.update();
      expect(store.get('x')).toBe(42);
      expect(engine.getState().pc).toBe(1);

      engine.update();
      expect(store.get('y')).toBe(99);
      expect(engine.getState().pc).toBe(2);
    });

    it('should emit script:end exactly once when script completes', () => {
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);

      engine.load('short', makeScript('@set $x 1\n'));
      engine.update(); // executes @set and completes
      expect(endSpy).toHaveBeenCalledTimes(1);

      // calling update again must not re-emit
      engine.update();
      engine.update();
      expect(endSpy).toHaveBeenCalledTimes(1);
    });

    it('should not end while the last @say is still waiting for a click', () => {
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);

      engine.load('last', makeScript('Hero "最后一句"\n'));
      engine.update(); // emits script:say and enters waiting
      expect(endSpy).not.toHaveBeenCalled();

      // still waiting — no premature end on subsequent frames
      engine.update();
      expect(endSpy).not.toHaveBeenCalled();

      // the click resolves the wait, then the script ends exactly once
      bus.emit('input:click', { x: 0, y: 0 });
      engine.update();
      expect(endSpy).toHaveBeenCalledTimes(1);

      engine.update();
      expect(endSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle flag commands', () => {
      engine.load(
        'flags',
        makeScript('@flag seen_intro\n@toggle music\n@unflag seen_intro\n'),
      );

      engine.update();
      expect(store.hasFlag('seen_intro')).toBe(true);

      engine.update();
      expect(store.hasFlag('music')).toBe(true);

      engine.update();
      expect(store.hasFlag('seen_intro')).toBe(false);
    });

    it('should handle arithmetic commands', () => {
      store.set('score', 10);
      engine.load('math', makeScript('@add $score 5\n@mul $score 2\n'));

      engine.update();
      expect(store.get('score')).toBe(15);

      engine.update();
      expect(store.get('score')).toBe(30);
    });

    it('should set a variable with @set', () => {
      engine.load('vars', makeScript('@set $name "Alice"\n@set $count 42\n'));

      engine.update();
      expect(store.get('name')).toBe('Alice');

      engine.update();
      expect(store.get('count')).toBe(42);
    });

    it('should emit background change event for @bg command', () => {
      const bgSpy = vi.fn();
      bus.on('bg:change', bgSpy);

      engine.load('scene', makeScript('@bg classroom_day fade\n'));
      engine.update();

      expect(bgSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'classroom_day' }),
      );
    });

    it('should emit character:show event for @show command', () => {
      const showSpy = vi.fn();
      bus.on('character:show', showSpy);

      engine.load('scene', makeScript('@show ch_hero center sprite=neutral\n'));
      engine.update();

      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch_hero' }),
      );
    });

    it('should handle @say via inline dialogue syntax', () => {
      const saySpy = vi.fn();
      bus.on('script:say', saySpy);

      engine.load('dialogue', makeScript('Narrator "一切从这里开始。"\n'));
      engine.update();

      expect(saySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          speaker: 'Narrator',
          text: '一切从这里开始。',
        }),
      );
    });

    it('should handle conditional branching with @if', () => {
      store.set('score', 100);
      engine.load(
        'branch',
        makeScript(
          '@if $score > 50\n  @set $passed 1\n@else\n  @set $passed 0\n@endif\n',
        ),
      );

      // @if → true, enters if block
      engine.update();
      // @set $passed 1
      engine.update();

      expect(store.get('passed')).toBe(1);
    });

    it('should take else branch when condition is false', () => {
      store.set('score', 10);
      engine.load(
        'branch',
        makeScript(
          '@if $score > 50\n  @set $passed 1\n@else\n  @set $passed 0\n@endif\n',
        ),
      );

      engine.update(); // @if → false, jumps to @else
      engine.update(); // @else → enters else block
      engine.update(); // @set $passed 0

      expect(store.get('passed')).toBe(0);
    });

    it('should handle @label and @jump for looping', () => {
      engine.load(
        'loop',
        makeScript(
          '@set $i 0\n@label loop\n@add $i 1\n@if $i < 3\n  @jump loop\n@endif\n',
        ),
      );

      // Execute the loop — step through enough times
      for (let step = 0; step < 20; step++) {
        engine.update();
      }

      expect(store.get('i')).toBe(3);
    });

    it('should handle inline dialogue and waiting state', () => {
      engine.load('dialogue', makeScript('Hero "你好"\nHeroine "早上好"\n'));

      // First dialogue: enters waiting state for input:click, reporting the
      // blocked command's pc so a save replays it
      engine.update();
      expect(engine.getState().pc).toBe(0);

      // Second update: should skip because still waiting
      engine.update();
      expect(engine.getState().pc).toBe(0);

      // Simulate user click to unblock
      bus.emit('input:click', { x: 0, y: 0 });
      engine.update();
      expect(engine.getState().pc).toBe(1); // now blocked on second dialogue
    });

    it('should report the blocked command type while waiting', () => {
      engine.load('dialogue', makeScript('Hero "你好"\n'));

      engine.update();
      expect(engine.getBlockedCommandType()).toBe('say');

      bus.emit('input:click', { x: 0, y: 0 });
      engine.update();
      expect(engine.getBlockedCommandType()).toBeNull();
    });

    it('should replay the blocked command after reloading at the blocked pc', () => {
      const saySpy = vi.fn();
      bus.on('script:say', saySpy);
      const script = makeScript('Hero "你好"\nHeroine "早上好"\n');
      engine.load('dialogue', script);

      engine.update();
      expect(saySpy).toHaveBeenCalledTimes(1);

      const saved = engine.getState();
      // Restore: reload the same script at the blocked pc
      engine.load(saved.currentScript, script, saved.pc);
      engine.update();
      expect(saySpy).toHaveBeenCalledTimes(2);
      expect(saySpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ speaker: 'Hero', text: '你好' }),
      );
    });

    it('should pass the resource id in the script:error payload', () => {
      const errorSpy = vi.fn();
      bus.on('script:error', errorSpy);
      engine.commandRegistry.register({
        type: 'boom',
        execute: () => {
          throw new Error('nope');
        },
      });

      engine.load('chapter-1', makeScript('@boom\n'));
      engine.update();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'nope', script: 'chapter-1' }),
      );
    });

    it('should keep updating after a command fails', () => {
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);
      engine.commandRegistry.register({
        type: 'boom',
        execute: () => {
          throw new Error('nope');
        },
      });

      engine.load('bad', makeScript('@boom\n@set $x 1\n'));
      expect(() => engine.update()).not.toThrow();
      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(store.get('x')).toBeUndefined();

      expect(() => engine.update()).not.toThrow();
      expect(endSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('choose', () => {
    it('should handle @choice block', () => {
      const choiceSpy = vi.fn();
      bus.on('script:choice', choiceSpy);

      engine.load(
        'choose',
        makeScript(
          '@choice\n  -> "打招呼": greet\n  -> "离开": leave\n@endchoice\n',
        ),
      );
      engine.update();

      expect(choiceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: [
            expect.objectContaining({ text: '打招呼', label: 'greet' }),
            expect.objectContaining({ text: '离开', label: 'leave' }),
          ],
        }),
      );
    });
  });

  describe('commandRegistry', () => {
    it('should expose the injected engine to command handlers', () => {
      const injected = { eventBus: bus } as unknown as VNEngine;
      const localEngine = new ScriptEngine(injected, store);
      let seen: VNEngine | undefined;
      localEngine.commandRegistry.register({
        type: 'peek',
        execute: (ctx) => {
          seen = ctx.engine;
        },
      });

      localEngine.load('peek', makeScript('@peek\n'));
      localEngine.update();

      expect(seen).toBe(injected);
    });

    it('should allow registering custom commands', () => {
      const executeSpy = vi.fn();
      engine.commandRegistry.register({
        type: 'custom',
        execute: executeSpy,
      });

      engine.load('test', makeScript('@custom hello world\n'));
      engine.update();

      expect(executeSpy).toHaveBeenCalledOnce();
    });

    it('should reject a script that uses an unregistered command', () => {
      engine.commandRegistry.unregister('set');

      expect(() => engine.load('test', makeScript('@set $x 1\n'))).toThrow(
        'Unknown command "@set" in script "test" at line 1.',
      );
    });

    it('should reject an unknown command at load time', () => {
      expect(() => engine.load('bad', makeScript('@nope 1\n'))).toThrow(
        'Unknown command "@nope" in script "bad" at line 1.',
      );
    });

    it('should accept registered builtins and flow commands', () => {
      expect(() =>
        engine.load(
          'ok',
          makeScript('@label start\n@set $x 1\n@if $x > 0\n@endif\n'),
        ),
      ).not.toThrow();
    });
  });

  describe('save/restore scenario', () => {
    it('should support reloading a script at a specific pc', () => {
      // First load: execute partially
      const script = makeScript('@set $a 1\n@set $b 2\n@set $c 3\n@set $d 4\n');
      engine.load('saveTest', script);
      engine.update(); // a = 1
      engine.update(); // b = 2

      const state = engine.getState();
      expect(state).toEqual({ currentScript: 'saveTest', pc: 2 });

      // Simulate restore: reload the same (resource-managed) script at saved pc
      engine.load(state.currentScript, script, state.pc);

      engine.update(); // c = 3
      expect(store.get('c')).toBe(3);
    });
  });
});
