import type { Choice, CommandHandler } from '@/types/script';
import { asNumber, asString, toMs } from './utils';

function asMode(value: unknown): 'adv' | 'nvl' {
  return value === 'nvl' ? 'nvl' : 'adv';
}

function asOptionalMode(value: unknown): 'adv' | 'nvl' | undefined {
  return value === 'adv' || value === 'nvl' ? value : undefined;
}

const waitForClick: CommandHandler['execute'] = (ctx) => {
  ctx.interpreter.wait('input:click', () => {});
};

export const dialogueCommands: CommandHandler[] = [
  {
    type: 'say',
    execute: (ctx, args) => {
      const speaker = asString(args.speaker) ?? '';
      const text = asString(args.text) ?? '';
      ctx.engine.eventBus.emit('script:say', {
        speaker,
        text,
        voice: asString(args.voice),
        speed: asNumber(args.speed),
        mode: asOptionalMode(args.mode),
      });
      ctx.interpreter.wait('input:click', () => {});
    },
  },
  {
    type: 'choice',
    execute: (ctx, args) => {
      const choices = Array.isArray(args.choices)
        ? (args.choices as Choice[])
        : [];
      ctx.engine.eventBus.emit('script:choice', {
        choices,
        mode: asMode(args.mode),
      });
      ctx.interpreter.wait('script:choice:selected', () => {});
    },
  },
  {
    type: 'wait',
    execute: (ctx, args) => {
      const ms = toMs(args['0']) ?? 0;
      setTimeout(() => {
        ctx.engine.eventBus.emit('script:wait:done', {});
      }, ms);
      ctx.interpreter.wait('script:wait:done', () => {});
    },
  },
  { type: 'pause', execute: waitForClick },
  { type: 'click', execute: waitForClick },
  {
    type: 'clear',
    execute: (ctx) => {
      ctx.engine.eventBus.emit('script:clear', {});
    },
  },
];
