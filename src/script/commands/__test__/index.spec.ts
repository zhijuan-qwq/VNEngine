import CommandRegistry from '../../CommandRegistry';
import { registerBuiltinCommands } from '../index';
import { stateCommands } from '../state';
import { presentationCommands } from '../presentation';
import { dialogueCommands } from '../dialogue';

const BUILTIN_TYPES = [
  // state
  'set',
  'add',
  'sub',
  'mul',
  'div',
  'mod',
  'random',
  'flag',
  'unflag',
  'toggle',
  'clearFlags',
  // presentation
  'bg',
  'show',
  'hide',
  'move',
  'sprite',
  'playBgm',
  'stopBgm',
  'playSe',
  'playVoice',
  'playAmbient',
  'stopAmbient',
  'shake',
  'flash',
  'snow',
  'rain',
  'stopEffect',
  // dialogue
  'say',
  'choice',
  'wait',
  'pause',
  'click',
  'clear',
];

describe('registerBuiltinCommands', () => {
  it('should register every handler from the builtin command groups', () => {
    const registry = new CommandRegistry();
    registerBuiltinCommands(registry);

    const handlers = [
      ...stateCommands,
      ...presentationCommands,
      ...dialogueCommands,
    ];
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(registry.has(handler.type)).toBe(true);
    }
  });

  it('should register exactly the expected set of command types', () => {
    const registry = new CommandRegistry();
    registerBuiltinCommands(registry);

    const missing = BUILTIN_TYPES.filter((type) => !registry.has(type));
    expect(missing).toEqual([]);
  });

  it('should not throw when called more than once', () => {
    const registry = new CommandRegistry();
    registerBuiltinCommands(registry);
    expect(() => registerBuiltinCommands(registry)).not.toThrow();
    for (const type of BUILTIN_TYPES) {
      expect(registry.has(type)).toBe(true);
    }
  });
});
