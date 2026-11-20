import { asNumber, asString, getVarName, toNumber } from '../utils';

describe('command utils', () => {
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
