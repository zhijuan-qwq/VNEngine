import { makeCommandEnv } from '@/__testUtils__/commandEnv';
import type { CommandEnv } from '@/__testUtils__/commandEnv';
import type { EngineEvents } from '@/types/events';

describe('presentation commands', () => {
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

  describe('@bg', () => {
    it('should emit bg:change with just an id', () => {
      const spy = listen('bg:change');
      execute('bg', { '0': 'classroom_day' });
      expect(spy).toHaveBeenCalledWith({ id: 'classroom_day' });
    });

    it('should emit bg:change with transition and duration', () => {
      const spy = listen('bg:change');
      execute('bg', {
        '0': 'classroom_day',
        '1': 'fade',
        '2': { value: 1.5, unit: 's' },
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'classroom_day',
        transition: 'fade',
        duration: 1500,
      });
    });

    it('should throw when id is missing', () => {
      expect(() => execute('bg', {})).toThrow('@bg requires a background id');
    });
  });

  describe('@show', () => {
    it('should emit character:show with position', () => {
      const spy = listen('character:show');
      execute('show', { '0': 'ch_hero', '1': 'center' });
      expect(spy).toHaveBeenCalledWith({ id: 'ch_hero', position: 'center' });
    });

    it('should default to center when position is omitted', () => {
      const spy = listen('character:show');
      execute('show', { '0': 'ch_hero' });
      expect(spy).toHaveBeenCalledWith({ id: 'ch_hero', position: 'center' });
    });

    it('should include the sprite option', () => {
      const spy = listen('character:show');
      execute('show', {
        '0': 'ch_hero',
        '1': 'left',
        sprite: 'smile',
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'ch_hero',
        position: 'left',
        sprite: 'smile',
      });
    });

    it('should include transition and duration', () => {
      const spy = listen('character:show');
      execute('show', {
        '0': 'ch_hero',
        '1': 'left',
        transition: 'fade',
        duration: { value: 500, unit: 'ms' },
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'ch_hero',
        position: 'left',
        transition: 'fade',
        duration: 500,
      });
    });

    it('should throw when id is missing', () => {
      expect(() => execute('show', {})).toThrow(
        '@show requires a character id',
      );
    });
  });

  describe('@hide', () => {
    it('should emit character:hide', () => {
      const spy = listen('character:hide');
      execute('hide', { '0': 'ch_hero' });
      expect(spy).toHaveBeenCalledWith({ id: 'ch_hero' });
    });

    it('should include transition and duration', () => {
      const spy = listen('character:hide');
      execute('hide', {
        '0': 'ch_hero',
        '1': 'fade',
        duration: { value: 1, unit: 's' },
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'ch_hero',
        transition: 'fade',
        duration: 1000,
      });
    });

    it('should default to all when id is omitted', () => {
      const spy = listen('character:hide');
      execute('hide', {});
      expect(spy).toHaveBeenCalledWith({ id: 'all' });
    });
  });

  describe('@move', () => {
    it('should emit character:move with position, duration and easing', () => {
      const spy = listen('character:move');
      execute('move', {
        '0': 'ch_hero',
        '1': 'center',
        '2': { value: 1, unit: 's' },
        '3': 'easeOut',
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'ch_hero',
        position: 'center',
        duration: 1000,
        easing: 'easeOut',
      });
    });

    it('should throw when id is missing', () => {
      expect(() => execute('move', {})).toThrow(
        '@move requires a character id',
      );
    });
  });

  describe('@sprite', () => {
    it('should emit character:sprite with transition and duration', () => {
      const spy = listen('character:sprite');
      execute('sprite', {
        '0': 'ch_hero',
        '1': 'angry',
        '2': 'fade',
        '3': { value: 300, unit: 'ms' },
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'ch_hero',
        sprite: 'angry',
        transition: 'fade',
        duration: 300,
      });
    });

    it('should throw when id is missing', () => {
      expect(() => execute('sprite', {})).toThrow(
        '@sprite requires a character id',
      );
    });

    it('should throw when sprite is missing', () => {
      expect(() => execute('sprite', { '0': 'ch_hero' })).toThrow(
        '@sprite requires a sprite id',
      );
    });
  });

  describe('audio commands', () => {
    it('@playBgm should emit audio:play with type bgm and options', () => {
      const spy = listen('audio:play');
      execute('playBgm', {
        '0': 'school_theme',
        '1': 'loop',
        fadein: { value: 2, unit: 's' },
        volume: 0.5,
      });
      expect(spy).toHaveBeenCalledWith({
        id: 'school_theme',
        type: 'bgm',
        loop: true,
        fadeIn: 2000,
        volume: 0.5,
      });
    });

    it('@playBgm should treat once as non-looping', () => {
      const spy = listen('audio:play');
      execute('playBgm', { '0': 'tense_bgm', '1': 'once' });
      expect(spy).toHaveBeenCalledWith({
        id: 'tense_bgm',
        type: 'bgm',
        loop: false,
      });
    });

    it('@playBgm should forward loop count', () => {
      const spy = listen('audio:play');
      execute('playBgm', { '0': 'theme', loop: 3 });
      expect(spy).toHaveBeenCalledWith({
        id: 'theme',
        type: 'bgm',
        loopCount: 3,
      });
    });

    it('@stopBgm should emit audio:stop with fade out', () => {
      const spy = listen('audio:stop');
      execute('stopBgm', { fade: { value: 2, unit: 's' } });
      expect(spy).toHaveBeenCalledWith({ type: 'bgm', fadeOut: 2000 });
    });

    it('@playSe should emit audio:play with type se and volume', () => {
      const spy = listen('audio:play');
      execute('playSe', { '0': 'door_open', volume: 0.8 });
      expect(spy).toHaveBeenCalledWith({
        id: 'door_open',
        type: 'se',
        volume: 0.8,
      });
    });

    it('@playVoice should emit audio:play with type voice', () => {
      const spy = listen('audio:play');
      execute('playVoice', { '0': 'hero_001' });
      expect(spy).toHaveBeenCalledWith({ id: 'hero_001', type: 'voice' });
    });

    it('@playAmbient should emit audio:play with type ambient', () => {
      const spy = listen('audio:play');
      execute('playAmbient', { '0': 'rain_loop', '1': 'loop' });
      expect(spy).toHaveBeenCalledWith({
        id: 'rain_loop',
        type: 'ambient',
        loop: true,
      });
    });

    it('@stopAmbient should emit audio:stop with type ambient', () => {
      const spy = listen('audio:stop');
      execute('stopAmbient', {});
      expect(spy).toHaveBeenCalledWith({ type: 'ambient' });
    });

    it('should throw when the audio id is missing', () => {
      expect(() => execute('playBgm', {})).toThrow(
        '@playBgm requires an audio id',
      );
    });
  });

  describe('screen effect commands', () => {
    it('@shake should emit effect:play with duration and intensity', () => {
      const spy = listen('effect:play');
      execute('shake', { '0': { value: 1, unit: 's' }, intensity: 0.8 });
      expect(spy).toHaveBeenCalledWith({
        type: 'shake',
        duration: 1000,
        intensity: 0.8,
      });
    });

    it('@flash should emit effect:play with color and duration', () => {
      const spy = listen('effect:play');
      execute('flash', {
        color: '#FFFFFF',
        duration: { value: 200, unit: 'ms' },
      });
      expect(spy).toHaveBeenCalledWith({
        type: 'flash',
        color: '#FFFFFF',
        duration: 200,
      });
    });

    it('@snow should emit effect:play with density', () => {
      const spy = listen('effect:play');
      execute('snow', { density: 0.6 });
      expect(spy).toHaveBeenCalledWith({ type: 'snow', density: 0.6 });
    });

    it('@rain should emit effect:play with density', () => {
      const spy = listen('effect:play');
      execute('rain', { density: 0.3 });
      expect(spy).toHaveBeenCalledWith({ type: 'rain', density: 0.3 });
    });

    it('@stopEffect should emit effect:stop', () => {
      const spy = listen('effect:stop');
      execute('stopEffect', {});
      expect(spy).toHaveBeenCalledWith({});
    });
  });
});
