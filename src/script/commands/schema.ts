import type { PositionKeyword } from '@/types/engine';

export interface ValueMatcher {
  /** 错误提示里描述期望值，例如 "a duration (e.g. 500ms)" */
  label: string;
  test: (value: unknown) => boolean;
}

export interface CommandSchema {
  /** 位置槽按类型匹配，数组下标就是槽位编号 */
  positional: ValueMatcher[];
  /** 允许的键值参数 */
  options?: Record<string, ValueMatcher>;
}

export interface MatchedArgs {
  /** 按槽位编号排列；未填的槽位是 undefined */
  positional: unknown[];
  options: Record<string, unknown>;
}

interface DurationLiteral {
  value: number;
  unit: string;
}

export const POSITION_KEYWORDS: readonly PositionKeyword[] = [
  'farLeft',
  'left',
  'center',
  'right',
  'farRight',
  'offLeft',
  'offRight',
];

export const TRANSITION_NAMES = [
  'fade',
  'slide',
  'slideL',
  'slideR',
  'zoom',
  'none',
] as const;

export const EASING_NAMES = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
] as const;

function isDurationLiteral(value: unknown): value is DurationLiteral {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.value === 'number' &&
    Number.isFinite(node.value) &&
    node.value >= 0 &&
    (node.unit === 'ms' || node.unit === 's')
  );
}

function isCoord(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).x === 'number' &&
    typeof (value as Record<string, unknown>).y === 'number'
  );
}

function isPosition(value: unknown): boolean {
  return (
    (typeof value === 'string' &&
      POSITION_KEYWORDS.includes(value as PositionKeyword)) ||
    isCoord(value)
  );
}

function isOneOf(names: readonly string[]): (value: unknown) => boolean {
  return (value) =>
    typeof value === 'string' && names.includes(value as string);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (isDurationLiteral(value)) return `${value.value}${value.unit}`;
  return String(value);
}

export const STRING: ValueMatcher = {
  label: 'a string',
  test: (value) => typeof value === 'string',
};

export const NUMBER: ValueMatcher = {
  label: 'a number',
  test: (value) => typeof value === 'number' && Number.isFinite(value),
};

/** 时长必须带单位：裸数字不再算合法时长 */
export const DURATION: ValueMatcher = {
  label: 'a duration with a unit (e.g. 500ms, 1.5s)',
  test: isDurationLiteral,
};

export const POSITION: ValueMatcher = {
  label: 'a position name',
  test: isPosition,
};

export const TRANSITION: ValueMatcher = {
  label: `a transition name (${TRANSITION_NAMES.join(', ')})`,
  test: isOneOf(TRANSITION_NAMES),
};

export const EASING: ValueMatcher = {
  label: `an easing name (${EASING_NAMES.join(', ')})`,
  test: isOneOf(EASING_NAMES),
};

export const LOOP: ValueMatcher = {
  label: '"loop" or "once"',
  test: isOneOf(['loop', 'once']),
};

/**
 * 把解析器产出的原始 args 按 schema 匹配成位置槽与键值参数。
 * 位置参数不按出现顺序盲取，而是找第一个尚未占用、且类型匹配的槽位，
 * 因此可以省略中间的可选槽位（例如 @show 省略位置直接写转场）。
 */
export function matchArgs(
  directive: string,
  args: Record<string, unknown>,
  schema: CommandSchema,
): MatchedArgs {
  const rawPositional: unknown[] = [];
  for (let i = 0; args[String(i)] !== undefined; i += 1) {
    rawPositional.push(args[String(i)]);
  }

  const used = new Set<number>();
  const positional: unknown[] = new Array(schema.positional.length);
  for (const value of rawPositional) {
    const slot = schema.positional.findIndex(
      (matcher, index) => !used.has(index) && matcher.test(value),
    );
    if (slot === -1) {
      throw new Error(
        `@${directive}: unexpected argument ${formatValue(value)}.`,
      );
    }
    used.add(slot);
    positional[slot] = value;
  }

  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/^[0-9]+$/.test(key)) continue;
    const matcher = schema.options?.[key];
    if (!matcher) {
      throw new Error(`@${directive}: unknown parameter "${key}".`);
    }
    if (!matcher.test(value)) {
      throw new Error(
        `@${directive}: parameter "${key}" expects ${matcher.label}, ` +
          `got ${formatValue(value)}.`,
      );
    }
    options[key] = value;
  }

  return { positional, options };
}

/** schema 已保证是合法时长；这里只做单位换算 */
export function durationMs(value: unknown): number | undefined {
  if (!isDurationLiteral(value)) return undefined;
  return value.unit === 's' ? value.value * 1000 : value.value;
}

export function requireDurationMs(
  directive: string,
  value: unknown,
  name: string,
): number {
  const ms = durationMs(value);
  if (ms === undefined) {
    throw new Error(
      `@${directive}: ${name} must be a duration with a unit ` +
        `(e.g. 500ms, 1.5s).`,
    );
  }
  return ms;
}
