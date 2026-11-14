import type { CommandHandler } from '@/types/script';
import { evaluateExpression } from '../ExpressionEvaluator';
import { getVarName, toNumber } from './utils';
import { STRING, matchArgs } from './schema';
import type { CommandSchema } from './schema';

const FLAG_SCHEMA: CommandSchema = { positional: [STRING] };
const NO_ARGS_SCHEMA: CommandSchema = { positional: [] };

function flagName(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  throw new TypeError(`Expected a flag name, got ${String(arg)}`);
}

function arithmetic(
  ctx: Parameters<CommandHandler['execute']>[0],
  args: Record<string, unknown>,
  op: (current: number, operand: number) => number,
): void {
  const name = getVarName(args['0']);
  const currentValue = ctx.store.get(name);
  const current =
    currentValue === undefined || currentValue === null
      ? 0
      : toNumber(currentValue);
  const operand = toNumber(evaluateExpression(args['1'], ctx.store));
  ctx.store.set(name, op(current, operand));
}

export const stateCommands: CommandHandler[] = [
  {
    type: 'set',
    execute: (ctx, args) => {
      if (args['1'] === undefined) {
        throw new Error('@set requires a value.');
      }
      ctx.store.set(
        getVarName(args['0']),
        evaluateExpression(args['1'], ctx.store),
      );
    },
  },
  {
    type: 'add',
    execute: (ctx, args) => {
      arithmetic(ctx, args, (current, operand) => current + operand);
    },
  },
  {
    type: 'sub',
    execute: (ctx, args) => {
      arithmetic(ctx, args, (current, operand) => current - operand);
    },
  },
  {
    type: 'mul',
    execute: (ctx, args) => {
      arithmetic(ctx, args, (current, operand) => current * operand);
    },
  },
  {
    type: 'div',
    execute: (ctx, args) => {
      arithmetic(ctx, args, (current, operand) => current / operand);
    },
  },
  {
    type: 'mod',
    execute: (ctx, args) => {
      arithmetic(ctx, args, (current, operand) => current % operand);
    },
  },
  {
    type: 'random',
    execute: (ctx, args) => {
      const name = getVarName(args['0']);
      const min = toNumber(evaluateExpression(args['1'], ctx.store));
      const max = toNumber(evaluateExpression(args['2'], ctx.store));
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new Error(
          `@random requires integer bounds with min <= max, got ${min}..${max}.`,
        );
      }
      ctx.store.set(name, Math.floor(Math.random() * (max - min + 1)) + min);
    },
  },
  {
    type: 'flag',
    execute: (ctx, args) => {
      const { positional } = matchArgs('flag', args, FLAG_SCHEMA);
      ctx.store.setFlag(flagName(positional[0]));
    },
  },
  {
    type: 'unflag',
    execute: (ctx, args) => {
      const { positional } = matchArgs('unflag', args, FLAG_SCHEMA);
      ctx.store.clearFlag(flagName(positional[0]));
    },
  },
  {
    type: 'toggle',
    execute: (ctx, args) => {
      const { positional } = matchArgs('toggle', args, FLAG_SCHEMA);
      ctx.store.toggleFlag(flagName(positional[0]));
    },
  },
  {
    type: 'clearFlags',
    execute: (ctx, args) => {
      matchArgs('clearFlags', args, NO_ARGS_SCHEMA);
      ctx.store.clearAllFlags();
    },
  },
];
