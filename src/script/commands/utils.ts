export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
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
