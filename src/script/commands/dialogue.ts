import type { Choice, CommandHandler } from '@/types/script';
import { evaluateExpression, isTruthy } from '../ExpressionEvaluator';
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
      const text = asString(args.text);
      if (text === undefined) {
        throw new Error('@say requires dialogue text.');
      }
      const speaker = asString(args.speaker) ?? '';
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
      const raw = Array.isArray(args.choices) ? (args.choices as Choice[]) : [];
      if (raw.length === 0) {
        throw new Error('@choice requires at least one choice.');
      }
      const choices = raw.map((choice) =>
        choice.condition === undefined
          ? choice
          : {
              ...choice,
              enabled: isTruthy(
                evaluateExpression(choice.condition, ctx.store),
              ),
            },
      );
      ctx.engine.eventBus.emit('script:choice', {
        choices,
        mode: asMode(args.mode),
      });
      ctx.interpreter.wait('script:choice:selected', (payload) => {
        ctx.interpreter.jump(payload.label);
      });
    },
  },
  {
    type: 'wait',
    execute: (ctx, args) => {
      const ms = toMs(args['0']) ?? 0;
      const timer = setTimeout(() => {
        ctx.engine.eventBus.emit('script:wait:done', {});
      }, ms);
      ctx.interpreter.wait(
        'script:wait:done',
        () => {},
        () => clearTimeout(timer),
      );
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
