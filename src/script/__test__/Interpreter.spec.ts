import Interpreter from '../Interpreter';
import CommandRegistry from '../CommandRegistry';
import VariableStore from '../VariableStore';
import EventBus from '../../core/EventBus';
import type { Script, CommandHandler } from '@/types/script';
import type { VNEngine } from '@/types/engine';

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
        { type: 'label', args: { name: 'sub' }, line: 1 },
        { type: 'end', args: {}, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      interpreter.load(script);
      expect(() => interpreter.return()).toThrow('Call stack is empty');
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
    it('should push pc and jump to label on call', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'start' }, line: 1 },
        { type: 'label', args: { name: 'sub' }, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      expect(interpreter.getPc()).toBe(1);
    });

    it('should restore pc from call stack on return', () => {
      const script = makeScript([
        { type: 'say', args: {}, line: 1 },
        { type: 'label', args: { name: 'sub' }, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.call('sub');
      interpreter.return();
      expect(interpreter.getPc()).toBe(0);
    });

    it('should support nested calls', () => {
      const script = makeScript([
        { type: 'label', args: { name: 'a' }, line: 1 },
        { type: 'label', args: { name: 'b' }, line: 2 },
      ]);
      interpreter.load(script);
      interpreter.call('b');
      interpreter.call('a');
      interpreter.return();
      expect(interpreter.getPc()).toBe(1);
      interpreter.return();
      expect(interpreter.getPc()).toBe(0);
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
});
