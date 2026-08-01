interface DurationLiteral {
  value: number;
  unit: string;
}

function isDuration(value: unknown): value is DurationLiteral {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return typeof node.value === 'number' && typeof node.unit === 'string';
}

export function toMs(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (isDuration(value))
    return value.unit === 's' ? value.value * 1000 : value.value;
  return undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function positionalArgs(args: Record<string, unknown>): unknown[] {
  const list: unknown[] = [];
  for (let i = 0; args[String(i)] !== undefined; i++) {
    list.push(args[String(i)]);
  }
  return list;
}

export function getVarName(arg: unknown): string {
  if (
    typeof arg === 'object' &&
    arg !== null &&
    (arg as Record<string, unknown>).type === 'var' &&
    typeof (arg as Record<string, unknown>).name === 'string'
  ) {
    return (arg as { name: string }).name;
  }
  throw new TypeError(`Expected a variable reference, got ${String(arg)}`);
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  throw new TypeError(`Expected a number, got ${String(value)}`);
}
