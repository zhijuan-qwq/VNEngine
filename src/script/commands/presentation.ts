import type { CommandHandler } from '@/types/script';
import type { Position } from '@/types/engine';
import { asNumber, asString } from './utils';
import {
  DURATION,
  EASING,
  LOOP,
  NUMBER,
  POSITION,
  STRING,
  TRANSITION,
  durationMs,
  matchArgs,
} from './schema';
import type { CommandSchema } from './schema';

function requireString(value: unknown, message: string): string {
  const text = asString(value);
  if (text === undefined) throw new Error(message);
  return text;
}

function withoutUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function transitionOf(
  positional: unknown[],
  options: Record<string, unknown>,
  slot: number,
): string | undefined {
  return asString(positional[slot]) ?? asString(options.transition);
}

function durationOf(
  positional: unknown[],
  options: Record<string, unknown>,
  slot: number,
): number | undefined {
  return positional[slot] !== undefined
    ? durationMs(positional[slot])
    : durationMs(options.duration);
}

const BG_SCHEMA: CommandSchema = {
  positional: [STRING, TRANSITION, DURATION],
  options: { transition: TRANSITION, duration: DURATION },
};

const SHOW_SCHEMA: CommandSchema = {
  positional: [STRING, POSITION, TRANSITION, DURATION],
  options: { sprite: STRING, transition: TRANSITION, duration: DURATION },
};

const HIDE_SCHEMA: CommandSchema = {
  positional: [STRING, TRANSITION, DURATION],
  options: { transition: TRANSITION, duration: DURATION },
};

const MOVE_SCHEMA: CommandSchema = {
  positional: [STRING, POSITION, DURATION, EASING],
  options: { duration: DURATION, easing: EASING },
};

const SPRITE_SCHEMA: CommandSchema = {
  positional: [STRING, STRING, TRANSITION, DURATION],
  options: { transition: TRANSITION, duration: DURATION },
};

const PLAY_AUDIO_SCHEMA: CommandSchema = {
  positional: [STRING, LOOP],
  options: { loop: NUMBER, fadein: DURATION, volume: NUMBER },
};

const PLAY_SE_SCHEMA: CommandSchema = {
  positional: [STRING],
  options: { volume: NUMBER },
};

const PLAY_VOICE_SCHEMA: CommandSchema = {
  positional: [STRING],
};

const STOP_AUDIO_SCHEMA: CommandSchema = {
  positional: [],
  options: { fade: DURATION },
};

const SHAKE_SCHEMA: CommandSchema = {
  positional: [DURATION],
  options: { intensity: NUMBER },
};

const FLASH_SCHEMA: CommandSchema = {
  positional: [DURATION],
  options: { color: STRING, duration: DURATION },
};

const PARTICLE_SCHEMA: CommandSchema = {
  positional: [DURATION],
  options: { density: NUMBER },
};

const NO_ARGS_SCHEMA: CommandSchema = {
  positional: [],
};

export const presentationCommands: CommandHandler[] = [
  {
    type: 'bg',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('bg', args, BG_SCHEMA);
      const id = requireString(positional[0], '@bg requires a background id');
      ctx.engine.eventBus.emit('bg:change', {
        id,
        ...withoutUndefined({
          transition: transitionOf(positional, options, 1),
          duration: durationOf(positional, options, 2),
        }),
      });
    },
  },
  {
    type: 'show',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('show', args, SHOW_SCHEMA);
      const id = requireString(positional[0], '@show requires a character id');
      ctx.engine.eventBus.emit('character:show', {
        id,
        position:
          positional[1] === undefined ? 'center' : (positional[1] as Position),
        ...withoutUndefined({
          sprite: asString(options.sprite),
          transition: transitionOf(positional, options, 2),
          duration: durationOf(positional, options, 3),
        }),
      });
    },
  },
  {
    type: 'hide',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('hide', args, HIDE_SCHEMA);
      ctx.engine.eventBus.emit('character:hide', {
        id: asString(positional[0]) ?? 'all',
        ...withoutUndefined({
          transition: transitionOf(positional, options, 1),
          duration: durationOf(positional, options, 2),
        }),
      });
    },
  },
  {
    type: 'move',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('move', args, MOVE_SCHEMA);
      const id = requireString(positional[0], '@move requires a character id');
      ctx.engine.eventBus.emit('character:move', {
        id,
        position:
          positional[1] === undefined ? 'center' : (positional[1] as Position),
        ...withoutUndefined({
          duration: durationOf(positional, options, 2),
          easing: asString(positional[3]) ?? asString(options.easing),
        }),
      });
    },
  },
  {
    type: 'sprite',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('sprite', args, SPRITE_SCHEMA);
      const id = requireString(
        positional[0],
        '@sprite requires a character id',
      );
      const sprite = requireString(
        positional[1],
        '@sprite requires a sprite id',
      );
      ctx.engine.eventBus.emit('character:sprite', {
        id,
        sprite,
        ...withoutUndefined({
          transition: transitionOf(positional, options, 2),
          duration: durationOf(positional, options, 3),
        }),
      });
    },
  },
  {
    type: 'playBgm',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs(
        'playBgm',
        args,
        PLAY_AUDIO_SCHEMA,
      );
      const id = requireString(positional[0], '@playBgm requires an audio id');
      const loop =
        positional[1] === 'loop'
          ? true
          : positional[1] === 'once'
            ? false
            : undefined;
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'bgm',
        ...withoutUndefined({
          loop,
          loopCount: asNumber(options.loop),
          fadeIn: durationMs(options.fadein),
          volume: asNumber(options.volume),
        }),
      });
    },
  },
  {
    type: 'stopBgm',
    execute: (ctx, args) => {
      const { options } = matchArgs('stopBgm', args, STOP_AUDIO_SCHEMA);
      ctx.engine.eventBus.emit('audio:stop', {
        type: 'bgm',
        ...withoutUndefined({ fadeOut: durationMs(options.fade) }),
      });
    },
  },
  {
    type: 'playSe',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('playSe', args, PLAY_SE_SCHEMA);
      const id = requireString(positional[0], '@playSe requires an audio id');
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'se',
        ...withoutUndefined({ volume: asNumber(options.volume) }),
      });
    },
  },
  {
    type: 'playVoice',
    execute: (ctx, args) => {
      const { positional } = matchArgs('playVoice', args, PLAY_VOICE_SCHEMA);
      const id = requireString(
        positional[0],
        '@playVoice requires an audio id',
      );
      ctx.engine.eventBus.emit('audio:play', { id, type: 'voice' });
    },
  },
  {
    type: 'playAmbient',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs(
        'playAmbient',
        args,
        PLAY_AUDIO_SCHEMA,
      );
      const id = requireString(
        positional[0],
        '@playAmbient requires an audio id',
      );
      const loop =
        positional[1] === 'loop'
          ? true
          : positional[1] === 'once'
            ? false
            : undefined;
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'ambient',
        ...withoutUndefined({
          loop,
          loopCount: asNumber(options.loop),
          fadeIn: durationMs(options.fadein),
          volume: asNumber(options.volume),
        }),
      });
    },
  },
  {
    type: 'stopAmbient',
    execute: (ctx, args) => {
      const { options } = matchArgs('stopAmbient', args, STOP_AUDIO_SCHEMA);
      ctx.engine.eventBus.emit('audio:stop', {
        type: 'ambient',
        ...withoutUndefined({ fadeOut: durationMs(options.fade) }),
      });
    },
  },
  {
    type: 'shake',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('shake', args, SHAKE_SCHEMA);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'shake',
        ...withoutUndefined({
          duration: durationMs(positional[0]),
          intensity: asNumber(options.intensity),
        }),
      });
    },
  },
  {
    type: 'flash',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('flash', args, FLASH_SCHEMA);
      if (positional[0] !== undefined && options.duration !== undefined) {
        throw new Error(
          '@flash: duration given both positionally and via duration=.',
        );
      }
      ctx.engine.eventBus.emit('effect:play', {
        type: 'flash',
        ...withoutUndefined({
          duration:
            positional[0] !== undefined
              ? durationMs(positional[0])
              : durationMs(options.duration),
          color: asString(options.color),
        }),
      });
    },
  },
  {
    type: 'snow',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('snow', args, PARTICLE_SCHEMA);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'snow',
        ...withoutUndefined({
          duration: durationMs(positional[0]),
          density: asNumber(options.density),
        }),
      });
    },
  },
  {
    type: 'rain',
    execute: (ctx, args) => {
      const { positional, options } = matchArgs('rain', args, PARTICLE_SCHEMA);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'rain',
        ...withoutUndefined({
          duration: durationMs(positional[0]),
          density: asNumber(options.density),
        }),
      });
    },
  },
  {
    type: 'stopEffect',
    execute: (ctx, args) => {
      matchArgs('stopEffect', args, NO_ARGS_SCHEMA);
      ctx.engine.eventBus.emit('effect:stop', {});
    },
  },
];
