import { makeCommandEnv } from '@/__testUtils__/commandEnv';
import type { CommandEnv } from '@/__testUtils__/commandEnv';

describe('state commands', () => {
  let env: CommandEnv;

  beforeEach(() => {
    env = makeCommandEnv();
  });

  function execute(type: string, args: Record<string, unknown>): void {
    env.registry.execute(env.ctx, { type, args, line: 1 });
  }

  describe('@set', () => {
    it('should store a literal value', () => {
      execute('set', { '0': varRef('score'), '1': 10 });
      expect(env.store.get('score')).toBe(10);
    });

    it('should store a value resolved from another variable', () => {
      env.store.set('base', 5);
      execute('set', { '0': varRef('score'), '1': varRef('base') });
      expect(env.store.get('score')).toBe(5);
    });

    it('should throw when the target is not a variable reference', () => {
      expect(() => execute('set', { '0': 'score', '1': 10 })).toThrow(
        'Expected a variable reference',
      );
    });
  });

  describe('@add / @sub / @mul / @div / @mod', () => {
    it('should add to an existing variable', () => {
      env.store.set('score', 3);
      execute('add', { '0': varRef('score'), '1': 4 });
      expect(env.store.get('score')).toBe(7);
    });

    it('should treat an unset variable as zero for arithmetic', () => {
      execute('add', { '0': varRef('score'), '1': 4 });
      expect(env.store.get('score')).toBe(4);
    });

    it('should subtract', () => {
      env.store.set('hp', 10);
      execute('sub', { '0': varRef('hp'), '1': 3 });
      expect(env.store.get('hp')).toBe(7);
    });

    it('should multiply', () => {
      env.store.set('damage', 3);
      execute('mul', { '0': varRef('damage'), '1': 4 });
      expect(env.store.get('damage')).toBe(12);
    });

    it('should divide', () => {
      env.store.set('ratio', 10);
      execute('div', { '0': varRef('ratio'), '1': 2 });
      expect(env.store.get('ratio')).toBe(5);
    });

    it('should compute modulo', () => {
      env.store.set('remainder', 7);
      execute('mod', { '0': varRef('remainder'), '1': 3 });
      expect(env.store.get('remainder')).toBe(1);
    });

    it('should throw when the right-hand value is not numeric', () => {
      env.store.set('score', 1);
      expect(() =>
        execute('add', { '0': varRef('score'), '1': 'text' }),
      ).toThrow('Expected a number');
    });
  });

  describe('@random', () => {
    it('should store an integer within the inclusive range', () => {
      execute('random', { '0': varRef('dice'), '1': 1, '2': 6 });
      const value = env.store.get('dice') as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    });

    it('should throw when bounds are missing', () => {
      expect(() => execute('random', { '0': varRef('dice'), '1': 1 })).toThrow(
        'Expected a number',
      );
    });
  });

  describe('@flag / @unflag / @toggle / @clearFlags', () => {
    it('should set a flag', () => {
      execute('flag', { '0': 'met_hero' });
      expect(env.store.hasFlag('met_hero')).toBe(true);
    });

    it('should clear a flag', () => {
      env.store.setFlag('secret');
      execute('unflag', { '0': 'secret' });
      expect(env.store.hasFlag('secret')).toBe(false);
    });

    it('should toggle a flag on and off', () => {
      execute('toggle', { '0': 'auto_mode' });
      expect(env.store.hasFlag('auto_mode')).toBe(true);
      execute('toggle', { '0': 'auto_mode' });
      expect(env.store.hasFlag('auto_mode')).toBe(false);
    });

    it('should clear all flags', () => {
      env.store.setFlag('a');
      env.store.setFlag('b');
      execute('clearFlags', {});
      expect(env.store.hasFlag('a')).toBe(false);
      expect(env.store.hasFlag('b')).toBe(false);
    });
  });
});

function varRef(name: string): { type: 'var'; name: string } {
  return { type: 'var', name };
}
