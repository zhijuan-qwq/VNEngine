import Interpreter from '../Interpreter';
import CommandRegistry from '../CommandRegistry';
import VariableStore from '../VariableStore';
import EventBus from '../../core/EventBus';
import type { Script, CommandHandler } from '@/types/script';
import type { VNEngine } from '@/types/engine';

function makeCmd(
  type: string,
  args: Record<string, unknown> = {},
  line = 1,
): { type: string; args: Record<string, unknown>; line: number } {
  return { type, args, line };
}

function makeScript(
  commands: Array<{
    type: string;
    args: Record<string, unknown>;
    line: number;
  }>,
  name = 'test',
): Script {
  const labels = new Map<string, number>();
  commands.forEach((cmd, i) => {
    if (cmd.type === 'label' && typeof cmd.args.name === 'string') {
      labels.set(cmd.args.name, i);
    }
  });
  return { name, commands, labels, metadata: {} };
}

function makeEngine(bus: EventBus): VNEngine {
  return { eventBus: bus } as unknown as VNEngine;
}

describe('Interpreter', () => {
  let interpreter: Interpreter;
  let store: VariableStore;
  let registry: CommandRegistry;
  let bus: EventBus;
  let engine: VNEngine;

  beforeEach(() => {
    store = new VariableStore();
    registry = new CommandRegistry();
    bus = new EventBus();
    engine = makeEngine(bus);
    interpreter = new Interpreter(store, registry, engine);
  });

  describe('getPc', () => {
    it('should return 0 after construction', () => {
      expect(interpreter.getPc()).toBe(0);
    });

    it('should return the pc set by load with startPc', () => {
      const script = makeScript([
        { type: 'say', args: {}, line: 1 },
        { type: 'say', args: {}, line: 2 },
      ]);
      interpreter.load(script, 1);
      expect(interpreter.getPc()).toBe(1);
    });
  });

  describe('load', () => {
    it('should reset pc to 0 by default', () => {
      const script = makeScript([{ type: 'say', args: {}, line: 1 }]);
      interpreter.load(script);
      expect(interpreter.getPc()).toBe(0);
    });

    it('should reset call stack', () => {
      const script = makeScript([
        makeCmd('say', {}, 1),
        makeCmd('label', { name: 'sub' }, 2),
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      interpreter.load(script);
      expect(() => interpreter.return()).toThrow(
        'Call stack is empty. Cannot return from function.',
      );
    });

    it('should accept an optional startPc', () => {
      const script = makeScript([
        { type: 'say', args: {}, line: 1 },
        { type: 'say', args: {}, line: 2 },
        { type: 'say', args: {}, line: 3 },
      ]);
      interpreter.load(script, 2);
      expect(interpreter.getPc()).toBe(2);
    });
  });

  describe('step', () => {
    it('should emit script:end for an empty script', () => {
      const handler = vi.fn();
      bus.on('script:end', handler);
      interpreter.load(makeScript([]));
      interpreter.step();
      expect(handler).toHaveBeenCalledWith('test');
    });

    it('should emit script:end when pc reaches end of commands', () => {
      const handler = vi.fn();
      bus.on('script:end', handler);
      const script = makeScript([{ type: 'say', args: {}, line: 1 }]);
      registry.register({ type: 'say', execute: vi.fn() });
      interpreter.load(script);
      interpreter.step();
      expect(handler).toHaveBeenCalledWith('test');
    });

    it('should skip when state is waiting', () => {
      const execute = vi.fn();
      registry.register({ type: 'say', execute });
      const script = makeScript([
        { type: 'say', args: { speaker: 'Hero' }, line: 1 },
        { type: 'end', args: {}, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.wait('click', () => {});
      interpreter.step();
      expect(execute).not.toHaveBeenCalled();
    });

    it('should skip label commands and increment pc', () => {
      const execute = vi.fn();
      registry.register({ type: 'say', execute });
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
        { type: 'say', args: { speaker: 'Hero' }, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.step();
      expect(interpreter.getPc()).toBe(1);
      expect(execute).not.toHaveBeenCalled();
    });

    it('should dispatch command to registry', () => {
      const execute = vi.fn();
      registry.register({ type: 'say', execute } as CommandHandler);
      const script = makeScript([
        { type: 'say', args: { speaker: 'Hero', text: 'Hi' }, line: 1 },
      ]);
      interpreter.load(script);
      interpreter.step();
      expect(execute).toHaveBeenCalledOnce();
    });

    it('should increment pc after executing a command', () => {
      registry.register({ type: 'say', execute: vi.fn() });
      const script = makeScript([
        { type: 'say', args: {}, line: 1 },
        { type: 'end', args: {}, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.step();
      expect(interpreter.getPc()).toBe(1);
    });
  });

  describe('jump', () => {
    it('should set pc to the label position', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
        { type: 'label', args: { name: 'target' }, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.jump('target');
      expect(interpreter.getPc()).toBe(1);
    });

    it('should throw when label does not exist', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
      ]);
      interpreter.load(script);
      expect(() => interpreter.jump('nonexistent')).toThrow(
        'Label "nonexistent" not found in script "test".',
      );
    });

    it('should throw when jump is called without a loaded script', () => {
      expect(() => interpreter.jump('any')).toThrow(
        'Label "any" not found in script "".',
      );
    });
  });

  describe('call and return', () => {
    it('should push pc+1 and jump to label on call', () => {
      const script = makeScript([
        makeCmd('label', { name: 'start' }, 1),
        makeCmd('label', { name: 'sub' }, 2),
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      expect(interpreter.getPc()).toBe(1);
    });

    it('should restore pc from call stack on return', () => {
      const script = makeScript([
        makeCmd('say', {}, 1),
        makeCmd('label', { name: 'sub' }, 2),
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      interpreter.return();
      expect(interpreter.getPc()).toBe(1);
    });

    it('should support nested calls', () => {
      const script = makeScript([
        makeCmd('say', {}, 1),
        makeCmd('label', { name: 'a' }, 2),
        makeCmd('say', {}, 3),
        makeCmd('label', { name: 'b' }, 4),
      ]);
      interpreter.load(script);
      interpreter.call('b');
      expect(interpreter.getPc()).toBe(3);
      interpreter.call('a');
      expect(interpreter.getPc()).toBe(1);
      interpreter.return();
      expect(interpreter.getPc()).toBe(4);
      interpreter.return();
      expect(interpreter.getPc()).toBe(1);
    });

    it('should throw on return with empty call stack', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
      ]);
      interpreter.load(script);
      expect(() => interpreter.return()).toThrow(
        'Call stack is empty. Cannot return from function.',
      );
    });

    it('should throw on call to non-existent label', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
      ]);
      interpreter.load(script);
      expect(() => interpreter.call('nonexistent')).toThrow(
        'Label "nonexistent" not found in script "test".',
      );
    });
  });

  describe('wait', () => {
    it('should set state to waiting and prevent step execution', () => {
      const execute = vi.fn();
      registry.register({ type: 'say', execute });
      const script = makeScript([
        { type: 'say', args: { speaker: 'Hero' }, line: 1 },
      ]);
      interpreter.load(script);
      interpreter.wait('click', () => {});
      interpreter.step();
      expect(execute).not.toHaveBeenCalled();
    });

    it('should call handler and set state to running when event fires', () => {
      const callback = vi.fn();
      const execute = vi.fn();
      registry.register({ type: 'say', execute });
      const script = makeScript([
        { type: 'say', args: { speaker: 'Hero' }, line: 1 },
      ]);
      interpreter.load(script);
      interpreter.wait('click', callback);
      bus.emit('click');
      expect(callback).toHaveBeenCalledOnce();
      interpreter.step();
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  describe('flow commands via step', () => {
    describe('@jump', () => {
      it('should jump to label via step', () => {
        const script = makeScript([
          makeCmd('jump', { '0': 'target' }, 1),
          makeCmd('say', {}, 2),
          makeCmd('label', { name: 'target' }, 3),
          makeCmd('say', {}, 4),
        ]);
        registry.register({ type: 'say', execute: vi.fn() });
        interpreter.load(script);
        interpreter.step();
        expect(interpreter.getPc()).toBe(2);
      });

      it('should error on jump via step to non-existent label', () => {
        const script = makeScript([makeCmd('jump', { '0': 'missing' }, 1)]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow(
          'Label "missing" not found in script "test".',
        );
      });
    });

    describe('@call', () => {
      it('should call and push return address via step', () => {
        const script = makeScript([
          makeCmd('call', { '0': 'sub' }, 1),
          makeCmd('end', {}, 2),
          makeCmd('label', { name: 'sub' }, 3),
          makeCmd('say', {}, 4),
        ]);
        registry.register({ type: 'say', execute: vi.fn() });
        interpreter.load(script);
        interpreter.step();
        expect(interpreter.getPc()).toBe(2);
      });
    });

    describe('@return', () => {
      it('should return to caller via step', () => {
        const script = makeScript([
          makeCmd('jump', { '0': 'main' }, 1),
          makeCmd('label', { name: 'sub' }, 2),
          makeCmd('say', { text: 'in sub' }, 3),
          makeCmd('return', {}, 4),
          makeCmd('label', { name: 'main' }, 5),
          makeCmd('call', { '0': 'sub' }, 6),
          makeCmd('say', { text: 'after' }, 7),
        ]);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        interpreter.load(script);
        interpreter.step();
        expect(interpreter.getPc()).toBe(4);
        interpreter.step();
        expect(interpreter.getPc()).toBe(5);
        interpreter.step();
        expect(interpreter.getPc()).toBe(1);
        interpreter.step();
        expect(interpreter.getPc()).toBe(2);
        interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'in sub',
        });
        interpreter.step();
        expect(interpreter.getPc()).toBe(6);
        interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(2);
        expect(sayExecute).toHaveBeenLastCalledWith(expect.any(Object), {
          text: 'after',
        });
      });

      it('should error on @return with empty call stack via step', () => {
        const script = makeScript([makeCmd('return', {}, 1)]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow(
          'Call stack is empty. Cannot return from function.',
        );
      });
    });

    describe('@if / @elseif / @else / @endif', () => {
      it('should execute if-block when condition is true', () => {
        store.set('x', 10);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 5) }, 1),
          makeCmd('say', { text: 'yes' }, 2),
          makeCmd('endif', {}, 3),
        ]);
        interpreter.load(script);
        interpreter.step();
        interpreter.step();
        expect(sayExecute).toHaveBeenCalledOnce();
        expect(interpreter.getPc()).toBe(2);
      });

      it('should skip if-block when condition is false', () => {
        store.set('x', 3);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 5) }, 1),
          makeCmd('say', { text: 'yes' }, 2),
          makeCmd('endif', {}, 3),
          makeCmd('say', { text: 'after' }, 4),
        ]);
        interpreter.load(script);
        interpreter.step();
        expect(interpreter.getPc()).toBe(2);
        interpreter.step();
        expect(interpreter.getPc()).toBe(3);
        interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'after',
        });
      });

      it('should execute elseif when first condition is false and second is true', () => {
        store.set('x', 7);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 10) }, 1),
          makeCmd('say', { text: 'gt10' }, 2),
          makeCmd('elseif', { expression: createGtExpr('x', 5) }, 3),
          makeCmd('say', { text: 'gt5' }, 4),
          makeCmd('endif', {}, 5),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 5; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'gt5',
        });
      });

      it('should execute else when all conditions are false', () => {
        store.set('x', 2);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 10) }, 1),
          makeCmd('say', { text: 'gt10' }, 2),
          makeCmd('else', {}, 3),
          makeCmd('say', { text: 'fallback' }, 4),
          makeCmd('endif', {}, 5),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 5; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'fallback',
        });
      });

      it('should skip else when if condition is true', () => {
        store.set('x', 15);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 10) }, 1),
          makeCmd('say', { text: 'gt10' }, 2),
          makeCmd('else', {}, 3),
          makeCmd('say', { text: 'fallback' }, 4),
          makeCmd('endif', {}, 5),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 5; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'gt10',
        });
      });

      it('should only execute first matching branch', () => {
        store.set('x', 7);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 10) }, 1),
          makeCmd('say', { text: 'gt10' }, 2),
          makeCmd('elseif', { expression: createGtExpr('x', 5) }, 3),
          makeCmd('say', { text: 'gt5' }, 4),
          makeCmd('elseif', { expression: createGtExpr('x', 0) }, 5),
          makeCmd('say', { text: 'gt0' }, 6),
          makeCmd('endif', {}, 7),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 7; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'gt5',
        });
      });

      it('should handle nested if blocks', () => {
        store.set('a', 10);
        store.set('b', 20);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('a', 5) }, 1),
          makeCmd('if', { expression: createGtExpr('b', 15) }, 2),
          makeCmd('say', { text: 'inner' }, 3),
          makeCmd('endif', {}, 4),
          makeCmd('endif', {}, 5),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 5; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'inner',
        });
      });

      it('should skip everything in nested false if', () => {
        store.set('a', 0);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('a', 5) }, 1),
          makeCmd('say', { text: 'outer' }, 2),
          makeCmd('if', { expression: { type: 'var', name: 'b' } }, 3),
          makeCmd('say', { text: 'inner' }, 4),
          makeCmd('endif', {}, 5),
          makeCmd('endif', {}, 6),
          makeCmd('say', { text: 'after' }, 7),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 7; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
        expect(sayExecute).toHaveBeenCalledWith(expect.any(Object), {
          text: 'after',
        });
      });

      it('should error on @elseif without @if', () => {
        const script = makeScript([
          makeCmd('elseif', { expression: createGtExpr('x', 0) }, 1),
        ]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow(
          '@elseif without matching @if',
        );
      });

      it('should error on @else without @if', () => {
        const script = makeScript([makeCmd('else', {}, 1)]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow('@else without matching @if');
      });

      it('should error on @endif without @if', () => {
        const script = makeScript([makeCmd('endif', {}, 1)]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow('@endif without matching @if');
      });

      it('should error on unclosed @if', () => {
        store.set('x', 0);
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 5) }, 1),
          makeCmd('say', {}, 2),
        ]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow(
          'Unclosed @if block starting at line 1.',
        );
      });

      it('should error on unclosed nested @if', () => {
        store.set('x', 0);
        const script = makeScript([
          makeCmd('if', { expression: createGtExpr('x', 5) }, 1),
          makeCmd('if', { expression: createGtExpr('x', 0) }, 2),
          makeCmd('say', {}, 3),
          makeCmd('endif', {}, 4),
        ]);
        interpreter.load(script);
        expect(() => interpreter.step()).toThrow(
          'Unclosed @if block starting at line 1.',
        );
      });

      it('should evaluate flag conditions', () => {
        store.setFlag('seen');
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: { type: 'flag', name: 'seen' } }, 1),
          makeCmd('say', { text: 'flagged' }, 2),
          makeCmd('endif', {}, 3),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 3; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
      });

      it('should evaluate variable condition (non-zero is truthy)', () => {
        store.set('score', 100);
        const sayExecute = vi.fn();
        registry.register({ type: 'say', execute: sayExecute });
        const script = makeScript([
          makeCmd('if', { expression: { type: 'var', name: 'score' } }, 1),
          makeCmd('say', { text: 'has score' }, 2),
          makeCmd('endif', {}, 3),
        ]);
        interpreter.load(script);
        for (let i = 0; i < 3; i++) interpreter.step();
        expect(sayExecute).toHaveBeenCalledTimes(1);
      });
    });
  });
});

function createGtExpr(
  varName: string,
  value: number,
): { type: string; op: string; left: unknown; right: unknown } {
  return {
    type: 'binary',
    op: '>',
    left: { type: 'var', name: varName },
    right: value,
  };
}
