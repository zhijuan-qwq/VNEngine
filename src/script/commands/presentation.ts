import type { CommandHandler } from '@/types/script';
import type { Position } from '@/types/engine';
import { asNumber, asString, positionalArgs, toMs } from './utils';

function requireString(pos: unknown[], index: number, message: string): string {
  const value = asString(pos[index]);
  if (value === undefined) throw new Error(message);
  return value;
}

function parseTransition(
  pos: unknown[],
  start: number,
  args?: Record<string, unknown>,
): { transition: string | undefined; duration: number | undefined } {
  let transition: string | undefined;
  let duration: number | undefined;
  for (const p of pos.slice(start)) {
    const ms = toMs(p);
    if (ms !== undefined) {
      duration = ms;
    } else {
      const s = asString(p);
      if (s !== undefined) transition = s;
    }
  }
  if (args) {
    if (transition === undefined) transition = asString(args.transition);
    if (duration === undefined) duration = toMs(args.duration);
  }
  return { transition, duration };
}

function parseLoopOption(pos: unknown[]): boolean | undefined {
  if (pos[1] === 'loop') return true;
  if (pos[1] === 'once') return false;
  return undefined;
}

function withoutUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export const presentationCommands: CommandHandler[] = [
  {
    type: 'bg',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@bg requires a background id');
      const { transition, duration } = parseTransition(pos, 1);
      ctx.engine.eventBus.emit('bg:change', {
        id,
        ...withoutUndefined({ transition, duration }),
      });
    },
  },
  {
    type: 'show',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@show requires a character id');
      const position = (asString(pos[1]) ?? 'center') as Position;
      const { transition, duration } = parseTransition(pos, 2, args);
      ctx.engine.eventBus.emit('character:show', {
        id,
        position,
        ...withoutUndefined({
          sprite: asString(args.sprite),
          transition,
          duration,
        }),
      });
    },
  },
  {
    type: 'hide',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = asString(pos[0]) ?? 'all';
      const { transition, duration } = parseTransition(pos, 1, args);
      ctx.engine.eventBus.emit('character:hide', {
        id,
        ...withoutUndefined({ transition, duration }),
      });
    },
  },
  {
    type: 'move',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@move requires a character id');
      const position = (asString(pos[1]) ?? 'center') as Position;
      const duration = toMs(pos[2]) ?? toMs(args.duration);
      const easing = asString(pos[3]) ?? asString(args.easing);
      ctx.engine.eventBus.emit('character:move', {
        id,
        position,
        ...withoutUndefined({ duration, easing }),
      });
    },
  },
  {
    type: 'sprite',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@sprite requires a character id');
      const sprite = requireString(pos, 1, '@sprite requires a sprite id');
      const { transition, duration } = parseTransition(pos, 2);
      ctx.engine.eventBus.emit('character:sprite', {
        id,
        sprite,
        ...withoutUndefined({ transition, duration }),
      });
    },
  },
  {
    type: 'playBgm',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@playBgm requires an audio id');
      const loop = parseLoopOption(pos);
      const loopCount = asNumber(args.loop);
      const fadeIn = toMs(args.fadein);
      const volume = asNumber(args.volume);
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'bgm',
        ...withoutUndefined({ loop, loopCount, fadeIn, volume }),
      });
    },
  },
  {
    type: 'stopBgm',
    execute: (ctx, args) => {
      const fadeOut = toMs(args.fade);
      ctx.engine.eventBus.emit('audio:stop', {
        type: 'bgm',
        ...withoutUndefined({ fadeOut }),
      });
    },
  },
  {
    type: 'playSe',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@playSe requires an audio id');
      const volume = asNumber(args.volume);
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'se',
        ...withoutUndefined({ volume }),
      });
    },
  },
  {
    type: 'playVoice',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@playVoice requires an audio id');
      ctx.engine.eventBus.emit('audio:play', { id, type: 'voice' });
    },
  },
  {
    type: 'playAmbient',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const id = requireString(pos, 0, '@playAmbient requires an audio id');
      const loop = parseLoopOption(pos);
      const fadeIn = toMs(args.fadein);
      const volume = asNumber(args.volume);
      ctx.engine.eventBus.emit('audio:play', {
        id,
        type: 'ambient',
        ...withoutUndefined({ loop, fadeIn, volume }),
      });
    },
  },
  {
    type: 'stopAmbient',
    execute: (ctx, args) => {
      const fadeOut = toMs(args.fade);
      ctx.engine.eventBus.emit('audio:stop', {
        type: 'ambient',
        ...withoutUndefined({ fadeOut }),
      });
    },
  },
  {
    type: 'shake',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const duration = toMs(pos[0]);
      const intensity = asNumber(args.intensity);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'shake',
        ...withoutUndefined({ duration, intensity }),
      });
    },
  },
  {
    type: 'flash',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const duration = toMs(pos[0]) ?? toMs(args.duration);
      const color = asString(args.color);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'flash',
        ...withoutUndefined({ duration, color }),
      });
    },
  },
  {
    type: 'snow',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const duration = toMs(pos[0]);
      const density = asNumber(args.density);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'snow',
        ...withoutUndefined({ duration, density }),
      });
    },
  },
  {
    type: 'rain',
    execute: (ctx, args) => {
      const pos = positionalArgs(args);
      const duration = toMs(pos[0]);
      const density = asNumber(args.density);
      ctx.engine.eventBus.emit('effect:play', {
        type: 'rain',
        ...withoutUndefined({ duration, density }),
      });
    },
  },
  {
    type: 'stopEffect',
    execute: (ctx) => {
      ctx.engine.eventBus.emit('effect:stop', {});
    },
  },
];
