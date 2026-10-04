import { makeCommandEnv } from '@/__testUtils__/commandEnv';
import type { CommandEnv } from '@/__testUtils__/commandEnv';
import type { EngineEvents } from '@/types/events';

describe('dialogue commands', () => {
  let env: CommandEnv;

  beforeEach(() => {
    env = makeCommandEnv();
  });

  function listen<K extends keyof EngineEvents>(
    event: K,
  ): ReturnType<typeof vi.fn> {
    const spy = vi.fn();
    env.bus.on(event, spy);
    return spy;
  }

  function execute(type: string, args: Record<string, unknown>): void {
    env.registry.execute(env.ctx, { type, args, line: 1 });
  }

  describe('@say', () => {
    it('should emit script:say and block on click', () => {
      const spy = listen('script:say');
      execute('say', { speaker: 'Hero', text: 'Hi' });
      expect(spy).toHaveBeenCalledWith({ speaker: 'Hero', text: 'Hi' });
      expect(env.wait.event).toBe('input:click');
    });

    it('should include voice, speed and mode options', () => {
      const spy = listen('script:say');
      execute('say', {
        speaker: 'Hero',
        text: 'Hi',
        voice: 'h001',
        speed: 30,
        mode: 'nvl',
      });
      expect(spy).toHaveBeenCalledWith({
        speaker: 'Hero',
        text: 'Hi',
        voice: 'h001',
        speed: 30,
        mode: 'nvl',
      });
    });

    it('should default speaker to empty string when missing', () => {
      const spy = listen('script:say');
      execute('say', { text: '......' });
      expect(spy).toHaveBeenCalledWith({ speaker: '', text: '......' });
    });

    it('should reject @say without text', () => {
      expect(() => execute('say', { speaker: 'Hero' })).toThrow(
        '@say requires dialogue text.',
      );
      expect(() => execute('say', {})).toThrow('@say requires dialogue text.');
    });

    it('should resume when the wait event fires', () => {
      listen('script:say');
      execute('say', { speaker: 'Hero', text: 'Hi' });
      expect(env.wait.handler).toBeDefined();
      env.wait.handler?.();
    });
  });

  describe('@choice', () => {
    it('should emit script:choice with choices and block on selection', () => {
      const spy = listen('script:choice');
      const choices = [
        { text: '回应他', label: 'respond' },
        { text: '无视他', label: 'ignore' },
      ];
      execute('choice', { choices });
      expect(spy).toHaveBeenCalledWith({ choices, mode: 'adv' });
      expect(env.wait.event).toBe('script:choice:selected');
    });

    it('should default to adv mode when missing', () => {
      const spy = listen('script:choice');
      const choices = [{ text: '回应他', label: 'respond' }];
      execute('choice', { choices });
      expect(spy).toHaveBeenCalledWith({ choices, mode: 'adv' });
    });

    it('should forward the nvl mode', () => {
      const spy = listen('script:choice');
      const choices = [{ text: '回应他', label: 'respond' }];
      execute('choice', { choices, mode: 'nvl' });
      expect(spy).toHaveBeenCalledWith({ choices, mode: 'nvl' });
    });

    it('should reject @choice without any choices', () => {
      expect(() => execute('choice', { choices: [] })).toThrow(
        '@choice requires at least one choice.',
      );
      expect(() => execute('choice', {})).toThrow(
        '@choice requires at least one choice.',
      );
    });

    it('should jump to the selected label when a choice is picked', () => {
      listen('script:choice');
      execute('choice', { choices: [{ text: '回应他', label: 'respond' }] });
      expect(env.wait.handler).toBeDefined();
      env.wait.handler?.({ label: 'respond' });
      expect(env.jumps).toEqual(['respond']);
    });

    it('should mark a choice enabled when its condition is truthy', () => {
      const spy = listen('script:choice');
      env.store.set('confidence', 60);
      execute('choice', {
        choices: [
          {
            text: '恶作剧',
            label: 'prank',
            condition: {
              type: 'binary',
              op: '>=',
              left: { type: 'var', name: 'confidence' },
              right: 50,
            },
          },
        ],
      });

      const payload = spy.mock.calls[0][0] as {
        choices: { enabled?: boolean }[];
      };
      expect(payload.choices[0].enabled).toBe(true);
    });

    it('should mark a choice disabled when its condition is falsy', () => {
      const spy = listen('script:choice');
      env.store.set('confidence', 10);
      execute('choice', {
        choices: [
          {
            text: '恶作剧',
            label: 'prank',
            condition: {
              type: 'binary',
              op: '>=',
              left: { type: 'var', name: 'confidence' },
              right: 50,
            },
          },
        ],
      });

      const payload = spy.mock.calls[0][0] as {
        choices: { enabled?: boolean }[];
      };
      expect(payload.choices[0].enabled).toBe(false);
    });
  });

  describe('@wait', () => {
    it('should block until the duration elapses', () => {
      vi.useFakeTimers();
      try {
        const spy = listen('script:wait:done');
        execute('wait', { '0': { value: 1.5, unit: 's' } });
        expect(spy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1500);
        expect(spy).toHaveBeenCalledWith({});
        expect(env.wait.event).toBe('script:wait:done');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should treat a missing duration as zero', () => {
      vi.useFakeTimers();
      try {
        const spy = listen('script:wait:done');
        execute('wait', {});
        vi.advanceTimersByTime(0);
        expect(spy).toHaveBeenCalledWith({});
      } finally {
        vi.useRealTimers();
      }
    });

    it('should pass a cleanup to the interpreter wait', () => {
      vi.useFakeTimers();
      try {
        execute('wait', { '0': { value: 1, unit: 's' } });
        expect(env.wait.cleanup).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel the pending timer when the wait is cancelled', () => {
      vi.useFakeTimers();
      try {
        const spy = listen('script:wait:done');
        execute('wait', { '0': { value: 1.5, unit: 's' } });
        env.wait.cleanup?.();
        vi.advanceTimersByTime(1500);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('@pause / @click', () => {
    it('should block @pause on click', () => {
      execute('pause', {});
      expect(env.wait.event).toBe('input:click');
    });

    it('should block @click on click', () => {
      execute('click', {});
      expect(env.wait.event).toBe('input:click');
    });
  });

  describe('@clear', () => {
    it('should emit script:clear', () => {
      const spy = listen('script:clear');
      execute('clear', {});
      expect(spy).toHaveBeenCalledWith({});
    });
  });
});
