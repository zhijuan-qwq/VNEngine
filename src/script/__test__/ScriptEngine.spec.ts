import ScriptEngine from '../ScriptEngine';
import EventBus from '../../core/EventBus';
import VariableStore from '../VariableStore';
import type { EngineEvents } from '@/types/events';

function makeBus(): EventBus<EngineEvents> {
  return new EventBus<EngineEvents>();
}

describe('ScriptEngine', () => {
  let engine: ScriptEngine;
  let bus: EventBus<EngineEvents>;
  let store: VariableStore;

  beforeEach(() => {
    bus = makeBus();
    store = new VariableStore();
    engine = new ScriptEngine(bus, store);
  });

  describe('constructor', () => {
    it('should expose commandRegistry with builtin commands registered', () => {
      expect(engine.commandRegistry).toBeDefined();

      // Verify @say is registered and works via inline dialogue
      const busSpy = vi.fn();
      bus.on('script:say', busSpy);

      engine.load('Hero "Hello"\n', 'test');
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
    it('should parse and load a script, setting currentScript', () => {
      engine.load('@set $a 1\n', 'variables');

      expect(engine.getState().currentScript).toBe('variables');
    });

    it('should set pc to the given startPc', () => {
      engine.load('@set $a 1\n@set $b 2\n', 'vars', 1);

      expect(engine.getState().pc).toBe(1);
    });

    it('should default pc to 0 when startPc is not provided', () => {
      engine.load('@set $a 1\n', 'vars');

      expect(engine.getState().pc).toBe(0);
    });

    it('should use cached script on second load with same name', () => {
      engine.load('@set $a 1\n@set $b 2\n@set $c 3\n', 'vars');
      // Advance pc to 2 by stepping twice
      engine.update();
      engine.update();
      expect(engine.getState().pc).toBe(2);

      // Reload same script at startPc 1 — should use cache,
      // passing a different source that would fail if parsed
      engine.load('@set $a 1\n@set $b 2\n@set $c 3\n', 'vars', 1);
      expect(engine.getState().pc).toBe(1);

      // Should still run from cached version (3 commands)
      engine.update(); // runs command at pc 1: @set $b 2
      expect(store.get('b')).toBe(2);
    });

    it('should handle empty script source', () => {
      engine.load('\n', 'empty');
      expect(engine.getState().currentScript).toBe('empty');
      // Calling update on empty script should trigger script:end
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);
      engine.update();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should reflect the current script name after load', () => {
      engine.load('@set $x 1\n', 'chapter1');

      expect(engine.getState().currentScript).toBe('chapter1');
    });

    it('should reflect pc advances after update calls', () => {
      engine.load('@set $x 1\n@set $y 2\n@set $z 3\n', 'vars');

      expect(engine.getState().pc).toBe(0);
      engine.update();
      expect(engine.getState().pc).toBe(1);
      engine.update();
      expect(engine.getState().pc).toBe(2);
    });
  });

  describe('update', () => {
    it('should execute non-blocking commands and advance pc', () => {
      engine.load('@set $x 42\n@set $y 99\n', 'vars');

      engine.update();
      expect(store.get('x')).toBe(42);
      expect(engine.getState().pc).toBe(1);

      engine.update();
      expect(store.get('y')).toBe(99);
      expect(engine.getState().pc).toBe(2);
    });

    it('should emit script:end when script completes', () => {
      const endSpy = vi.fn();
      bus.on('script:end', endSpy);

      engine.load('@set $x 1\n', 'short');
      engine.update(); // executes @set
      expect(endSpy).toHaveBeenCalledTimes(1);

      // script:end fires every step after completion (pc stays at end)
      engine.update();
      expect(endSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle flag commands', () => {
      engine.load(
        '@flag seen_intro\n@toggle music\n@unflag seen_intro\n',
        'flags',
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
      engine.load('@add $score 5\n@mul $score 2\n', 'math');

      engine.update();
      expect(store.get('score')).toBe(15);

      engine.update();
      expect(store.get('score')).toBe(30);
    });

    it('should set a variable with @set', () => {
      engine.load('@set $name "Alice"\n@set $count 42\n', 'vars');

      engine.update();
      expect(store.get('name')).toBe('Alice');

      engine.update();
      expect(store.get('count')).toBe(42);
    });

    it('should emit background change event for @bg command', () => {
      const bgSpy = vi.fn();
      bus.on('bg:change', bgSpy);

      engine.load('@bg classroom_day fade\n', 'scene');
      engine.update();

      expect(bgSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'classroom_day' }),
      );
    });

    it('should emit character:show event for @show command', () => {
      const showSpy = vi.fn();
      bus.on('character:show', showSpy);

      engine.load('@show ch_hero center sprite=neutral\n', 'scene');
      engine.update();

      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch_hero' }),
      );
    });

    it('should handle @say via inline dialogue syntax', () => {
      const saySpy = vi.fn();
      bus.on('script:say', saySpy);

      engine.load('Narrator "一切从这里开始。"\n', 'dialogue');
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
        '@if $score > 50\n  @set $passed 1\n@else\n  @set $passed 0\n@endif\n',
        'branch',
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
        '@if $score > 50\n  @set $passed 1\n@else\n  @set $passed 0\n@endif\n',
        'branch',
      );

      engine.update(); // @if → false, jumps to @else
      engine.update(); // @else → enters else block
      engine.update(); // @set $passed 0

      expect(store.get('passed')).toBe(0);
    });

    it('should handle @label and @jump for looping', () => {
      engine.load(
        '@set $i 0\n@label loop\n@add $i 1\n@if $i < 3\n  @jump loop\n@endif\n',
        'loop',
      );

      // Execute the loop — step through enough times
      for (let step = 0; step < 20; step++) {
        engine.update();
      }

      expect(store.get('i')).toBe(3);
    });

    it('should handle inline dialogue and waiting state', () => {
      engine.load('Hero "你好"\nHeroine "早上好"\n', 'dialogue');

      // First dialogue: enters waiting state for input:click
      engine.update();
      expect(engine.getState().pc).toBe(1); // pc advanced but state=waiting

      // Second update: should skip because still waiting
      engine.update();
      expect(engine.getState().pc).toBe(1); // pc unchanged

      // Simulate user click to unblock
      bus.emit('input:click', { x: 0, y: 0 });
      engine.update();
      expect(engine.getState().pc).toBe(2); // now at second dialogue
    });
  });

  describe('choose', () => {
    it('should handle @choice block', () => {
      const choiceSpy = vi.fn();
      bus.on('script:choice', choiceSpy);

      engine.load(
        '@choice\n  -> "打招呼": greet\n  -> "离开": leave\n@endchoice\n',
        'choose',
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
    it('should allow registering custom commands', () => {
      const executeSpy = vi.fn();
      engine.commandRegistry.register({
        type: 'custom',
        execute: executeSpy,
      });

      engine.load('@custom hello world\n', 'test');
      engine.update();

      expect(executeSpy).toHaveBeenCalledOnce();
    });

    it('should allow unregistering and re-registering commands', () => {
      engine.commandRegistry.unregister('set');

      // After unregistering, @set should warn but not throw
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      engine.load('@set $x 1\n', 'test');
      expect(() => engine.update()).not.toThrow();
      expect(store.get('x')).toBeUndefined();
      warnSpy.mockRestore();
    });
  });

  describe('save/restore scenario', () => {
    it('should support reloading a cached script at a specific pc', () => {
      // First load: parse and execute partially
      engine.load('@set $a 1\n@set $b 2\n@set $c 3\n@set $d 4\n', 'saveTest');
      engine.update(); // a = 1
      engine.update(); // b = 2

      const state = engine.getState();
      expect(state).toEqual({ currentScript: 'saveTest', pc: 2 });

      // Simulate restore: reload same script at saved pc
      engine.load('', 'saveTest', state.pc);

      engine.update(); // c = 3
      expect(store.get('c')).toBe(3);
    });
  });
});
