import { ease, easeIn, easeInOut, easeOut, getEasing, linear } from '../easing';

const ALL_EASINGS = [linear, ease, easeIn, easeOut, easeInOut];

describe('easing', () => {
  it('should map the endpoints 0 and 1 to themselves', () => {
    for (const fn of ALL_EASINGS) {
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
    }
  });

  it('should return t unchanged for linear', () => {
    expect(linear(0.25)).toBe(0.25);
    expect(linear(0.75)).toBe(0.75);
  });

  it('should stay below linear for easeIn', () => {
    expect(easeIn(0.5)).toBeCloseTo(0.25);
  });

  it('should stay above linear for easeOut', () => {
    expect(easeOut(0.5)).toBeCloseTo(0.75);
  });

  it('should be point-symmetric for easeInOut', () => {
    expect(easeInOut(0.25)).toBeCloseTo(0.125);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.75)).toBeCloseTo(0.875);
  });

  it('should be symmetric but steeper than quadratic for ease', () => {
    expect(ease(0.25)).toBeCloseTo(0.0625);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(0.75)).toBeCloseTo(0.9375);
  });
});

describe('getEasing', () => {
  it('should return the function matching each DSL name', () => {
    expect(getEasing('linear')).toBe(linear);
    expect(getEasing('ease')).toBe(ease);
    expect(getEasing('easeIn')).toBe(easeIn);
    expect(getEasing('easeOut')).toBe(easeOut);
    expect(getEasing('easeInOut')).toBe(easeInOut);
  });

  it('should default to easeOut when no name is given', () => {
    expect(getEasing()).toBe(easeOut);
  });

  it('should fall back to linear for an unknown name', () => {
    expect(getEasing('bounce')).toBe(linear);
  });
});
