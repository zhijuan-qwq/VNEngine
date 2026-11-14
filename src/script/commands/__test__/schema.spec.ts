import {
  DURATION,
  NUMBER,
  POSITION,
  STRING,
  TRANSITION,
  asPosition,
  durationMs,
  matchArgs,
} from '../schema';
import type { CommandSchema } from '../schema';

const SHOW_SCHEMA: CommandSchema = {
  positional: [STRING, POSITION, TRANSITION, DURATION],
  options: { sprite: STRING, volume: NUMBER },
};

describe('command schema', () => {
  it('should match positional args by type and skip optional slots', () => {
    const { positional, options } = matchArgs(
      'show',
      {
        '0': 'ch_hero',
        '1': 'slideL',
        '2': { value: 500, unit: 'ms' },
        sprite: 'smile',
        volume: 0.5,
      },
      SHOW_SCHEMA,
    );
    expect(positional).toEqual([
      'ch_hero',
      undefined,
      'slideL',
      { value: 500, unit: 'ms' },
    ]);
    expect(options).toEqual({ sprite: 'smile', volume: 0.5 });
  });

  it('should reject an unexpected positional arg', () => {
    expect(() =>
      matchArgs('show', { '0': 'ch_hero', '1': 'middle' }, SHOW_SCHEMA),
    ).toThrow('@show: unexpected argument "middle".');
  });

  it('should reject an unknown option', () => {
    expect(() =>
      matchArgs('show', { '0': 'ch_hero', foo: 1 }, SHOW_SCHEMA),
    ).toThrow('@show: unknown parameter "foo".');
  });

  it('should reject an option of the wrong type', () => {
    expect(() =>
      matchArgs('show', { '0': 'ch_hero', volume: '0.5' }, SHOW_SCHEMA),
    ).toThrow('@show: parameter "volume" expects a number, got "0.5".');
  });

  it('should require durations to carry a unit', () => {
    expect(() =>
      matchArgs('show', { '0': 'ch_hero', '1': 500 }, SHOW_SCHEMA),
    ).toThrow('@show: unexpected argument 500.');
  });

  it('should convert durations to milliseconds', () => {
    expect(durationMs({ value: 1.5, unit: 's' })).toBe(1500);
    expect(durationMs({ value: 500, unit: 'ms' })).toBe(500);
    expect(durationMs({ value: 2, unit: 'min' })).toBeUndefined();
    expect(durationMs(500)).toBeUndefined();
  });

  it('should bind a position and fall back to center', () => {
    expect(asPosition('left')).toBe('left');
    expect(asPosition({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(asPosition('middle')).toBe('center');
    expect(asPosition(undefined)).toBe('center');
  });
});
