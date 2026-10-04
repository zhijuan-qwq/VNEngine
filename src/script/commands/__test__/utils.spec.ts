import {
  asNumber,
  asString,
  getVarName,
  positionalArgs,
  toMs,
  toNumber,
} from '../utils';

describe('command utils', () => {
  describe('toMs', () => {
    it('should pass a plain number through unchanged', () => {
      expect(toMs(500)).toBe(500);
      expect(toMs(0)).toBe(0);
    });

    it('should convert a seconds duration to milliseconds', () => {
      expect(toMs({ value: 1.5, unit: 's' })).toBe(1500);
    });

    it('should keep a non-second duration value as-is', () => {
      expect(toMs({ value: 500, unit: 'ms' })).toBe(500);
      expect(toMs({ value: 2, unit: 'min' })).toBe(2);
    });

    it('should return undefined for values that are not a number or duration', () => {
      expect(toMs('2s')).toBeUndefined();
      expect(toMs(null)).toBeUndefined();
      expect(toMs(undefined)).toBeUndefined();
      expect(toMs({})).toBeUndefined();
      expect(toMs({ value: 1 })).toBeUndefined();
      expect(toMs({ value: '1', unit: 's' })).toBeUndefined();
    });
  });

  describe('asString', () => {
    it('should return strings unchanged', () => {
      expect(asString('fade')).toBe('fade');
      expect(asString('')).toBe('');
    });

    it('should return undefined for non-strings', () => {
      expect(asString(1)).toBeUndefined();
      expect(asString(null)).toBeUndefined();
      expect(asString(undefined)).toBeUndefined();
      expect(asString({})).toBeUndefined();
    });
  });

  describe('asNumber', () => {
    it('should return numbers unchanged', () => {
      expect(asNumber(0.5)).toBe(0.5);
      expect(asNumber(-3)).toBe(-3);
    });

    it('should return undefined for non-numbers', () => {
      expect(asNumber('5')).toBeUndefined();
      expect(asNumber(null)).toBeUndefined();
      expect(asNumber(undefined)).toBeUndefined();
      expect(asNumber({})).toBeUndefined();
    });
  });

  describe('positionalArgs', () => {
    it('should collect contiguous numeric keys in order', () => {
      expect(positionalArgs({ '0': 'a', '1': 'b', '2': 'c' })).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('should stop at the first missing index', () => {
      expect(positionalArgs({ '0': 'a', '2': 'c' })).toEqual(['a']);
    });

    it('should ignore non-positional keys', () => {
      expect(positionalArgs({ '0': 'a', transition: 'fade' })).toEqual(['a']);
    });

    it('should return an empty array when there are no positional args', () => {
      expect(positionalArgs({})).toEqual([]);
      expect(positionalArgs({ '1': 'b' })).toEqual([]);
      expect(positionalArgs({ sprite: 'smile' })).toEqual([]);
    });
  });

  describe('getVarName', () => {
    it('should return the name of a variable reference', () => {
      expect(getVarName({ type: 'var', name: 'score' })).toBe('score');
    });

    it('should throw when the value is not a variable reference', () => {
      expect(() => getVarName('score')).toThrow(
        'Expected a variable reference, got score',
      );
      expect(() => getVarName(null)).toThrow(
        'Expected a variable reference, got null',
      );
      expect(() => getVarName({ type: 'var' })).toThrow(
        'Expected a variable reference',
      );
      expect(() => getVarName({ type: 'flag', name: 'seen' })).toThrow(
        'Expected a variable reference',
      );
      expect(() => getVarName({ type: 'var', name: 1 })).toThrow(
        'Expected a variable reference',
      );
    });
  });

  describe('toNumber', () => {
    it('should return numbers unchanged', () => {
      expect(toNumber(42)).toBe(42);
      expect(toNumber(-1.5)).toBe(-1.5);
    });

    it('should parse numeric strings', () => {
      expect(toNumber('42')).toBe(42);
      expect(toNumber('-0.5')).toBe(-0.5);
    });

    it('should throw for values that cannot be converted', () => {
      expect(() => toNumber('abc')).toThrow('Expected a number, got abc');
      expect(() => toNumber('5px')).toThrow('Expected a number, got 5px');
      expect(() => toNumber(null)).toThrow('Expected a number, got null');
      expect(() => toNumber(undefined)).toThrow(
        'Expected a number, got undefined',
      );
      expect(() => toNumber(true)).toThrow('Expected a number, got true');
      expect(() => toNumber({})).toThrow(
        'Expected a number, got [object Object]',
      );
    });
  });
});
