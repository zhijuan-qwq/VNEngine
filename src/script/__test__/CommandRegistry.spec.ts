import CommandRegistry from '../CommandRegistry';
import type { CommandHandler, ScriptContext } from '@/types/script';
import type { VNEngine } from '@/types/engine';
import Interpreter from '../Interpreter';
import VariableStore from '../VariableStore';
import EventBus from '../../core/EventBus';

function makeCtx(): ScriptContext {
  const engine = { eventBus: new EventBus() } as unknown as VNEngine;
  const store = new VariableStore();
  const registry = new CommandRegistry();
  const interpreter = new Interpreter(store, registry, engine);
  return { engine, interpreter, store };
}

function makeHandler(
  type: string,
  execute?: CommandHandler['execute'],
): CommandHandler {
  return { type, execute: execute ?? vi.fn() };
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('register', () => {
    it('should allow a handler to be executed after registration', () => {
      const execute = vi.fn();
      registry.register(makeHandler('say', execute));

      registry.execute(makeCtx(), {
        type: 'say',
        args: { speaker: 'Hero' },
        line: 1,
      });

      expect(execute).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: expect.anything(),
          interpreter: expect.anything(),
          store: expect.anything(),
        }),
        { speaker: 'Hero' },
      );
    });

    it('should overwrite existing handler for the same type', () => {
      const first = vi.fn();
      const second = vi.fn();
      registry.register(makeHandler('say', first));
      registry.register(makeHandler('say', second));

      registry.execute(makeCtx(), {
        type: 'say',
        args: {},
        line: 1,
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe('unregister', () => {
    it('should remove a registered handler', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      registry.register(makeHandler('say'));
      registry.unregister('say');

      registry.execute(makeCtx(), {
        type: 'say',
        args: {},
        line: 1,
      });

      expect(spy).toHaveBeenCalledWith(
        'No handler registered for command type: say',
      );
      spy.mockRestore();
    });

    it('should not throw when unregistering a non-existent type', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should pass ctx and args to the handler', () => {
      const execute = vi.fn();
      registry.register(makeHandler('bg', execute));
      const ctx = makeCtx();

      registry.execute(ctx, {
        type: 'bg',
        args: { '0': 'classroom_day', '1': 'fade' },
        line: 8,
      });

      expect(execute).toHaveBeenCalledWith(ctx, {
        '0': 'classroom_day',
        '1': 'fade',
      });
    });

    it('should warn when no handler is registered for command type', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.execute(makeCtx(), {
        type: 'unknown',
        args: {},
        line: 99,
      });

      expect(spy).toHaveBeenCalledWith(
        'No handler registered for command type: unknown',
      );
      spy.mockRestore();
    });

    it('should not throw for unregistered command type', () => {
      expect(() =>
        registry.execute(makeCtx(), {
          type: 'nonexistent',
          args: {},
          line: 1,
        }),
      ).not.toThrow();
    });
  });
});
