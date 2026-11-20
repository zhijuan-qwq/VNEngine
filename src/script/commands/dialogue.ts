import type { Choice, CommandHandler } from '@/types/script';
import { evaluateExpression, isTruthy } from '../ExpressionEvaluator';
import { asNumber, asString } from './utils';
import { DURATION, durationMs, matchArgs } from './schema';
import type { CommandSchema } from './schema';

const WAIT_SCHEMA: CommandSchema = { positional: [DURATION] };
const NO_ARGS_SCHEMA: CommandSchema = { positional: [] };

function asMode(value: unknown): 'adv' | 'nvl' {
  return value === 'nvl' ? 'nvl' : 'adv';
}

const waitForClick =
  (directive: string): CommandHandler['execute'] =>
  (ctx, args) => {
    matchArgs(directive, args, NO_ARGS_SCHEMA);
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
        mode: asMode(args.mode),
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
      const { positional } = matchArgs('wait', args, WAIT_SCHEMA);
      if (positional[0] === undefined) {
        throw new Error('@wait requires a duration (e.g. 500ms).');
      }
      const timer = setTimeout(() => {
        ctx.engine.eventBus.emit('script:wait:done', {});
      }, durationMs(positional[0]));
      ctx.interpreter.wait(
        'script:wait:done',
        () => {},
        () => clearTimeout(timer),
      );
    },
  },
  { type: 'pause', execute: waitForClick('pause') },
  { type: 'click', execute: waitForClick('click') },
  {
    type: 'clear',
    execute: (ctx, args) => {
      matchArgs('clear', args, NO_ARGS_SCHEMA);
      ctx.engine.eventBus.emit('script:clear', {});
    },
  },
];
