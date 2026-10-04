import type { CommandHandler } from '@/types/script';
import type { Position, PositionKeyword } from '@/types/engine';
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

// Position is narrowed rather than blindly cast: an unknown keyword or a malformed
// coord object falls back to 'center', mirroring the renderer's own fallback
// (CharacterRegistry: POSITION_RATIOS[position] ?? center).
const POSITION_KEYWORDS: readonly PositionKeyword[] = [
  'farLeft',
  'left',
  'center',
  'right',
  'farRight',
  'offLeft',
  'offRight',
];

function isCoord(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).x === 'number' &&
    typeof (value as Record<string, unknown>).y === 'number'
  );
}

function isPositionSpec(value: unknown): boolean {
  return (
    (typeof value === 'string' &&
      POSITION_KEYWORDS.includes(value as PositionKeyword)) ||
    isCoord(value)
  );
}

function toPosition(value: unknown): Position {
  return isPositionSpec(value) ? (value as Position) : 'center';
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
      const position = toPosition(pos[1]);
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
      // The position is optional, so an omitted one must not shift the remaining
      // args: only consume pos[1] as the position when it actually is one.
      let rest = pos.slice(1);
      let position: Position = 'center';
      if (isPositionSpec(rest[0])) {
        position = toPosition(rest[0]);
        rest = rest.slice(1);
      }
      let duration: number | undefined;
      let easing: string | undefined;
      for (const arg of rest) {
        const ms = toMs(arg);
        if (ms !== undefined) {
          duration = ms;
          continue;
        }
        const name = asString(arg);
        if (name !== undefined) easing = name;
      }
      if (duration === undefined) duration = toMs(args.duration);
      if (easing === undefined) easing = asString(args.easing);
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
