import {
  computeCompactAmount,
  computeUiLayout,
  computeUiScale,
  isPositiveFinite,
  UI_COMPACT_FULL_WIDTH,
  UI_COMPACT_WIDTH,
  UI_DESIGN_WIDTH,
  UI_MAX_SCALE,
  UI_MIN_SCALE,
} from '../uiLayout';

describe('computeUiScale', () => {
  it('should follow the viewport width within the clamp range', () => {
    expect(computeUiScale(745)).toBe(UI_MIN_SCALE);
    expect(computeUiScale(1280)).toBe(1);
    expect(computeUiScale(1920)).toBe(1.5);
    expect(computeUiScale(3840)).toBe(UI_MAX_SCALE);
  });

  it('should fall back to 1 for an invalid width', () => {
    expect(computeUiScale(0)).toBe(1);
    expect(computeUiScale(Number.NaN)).toBe(1);
  });
});

describe('computeUiLayout', () => {
  it('should pin small landscape screens to the minimum scale', () => {
    const toolbar = computeUiLayout(745, 264);
    const fullscreen = computeUiLayout(785, 360);

    expect(toolbar.scale).toBe(UI_MIN_SCALE);
    expect(fullscreen.scale).toBe(UI_MIN_SCALE);
    expect(toolbar.width).toBeCloseTo(745 / UI_MIN_SCALE);
    expect(toolbar.height).toBeCloseTo(264 / UI_MIN_SCALE);
    expect(fullscreen.height).toBeCloseTo(360 / UI_MIN_SCALE);
  });

  it('should follow the width on desktop with a 1280 virtual width', () => {
    expect(computeUiLayout(1280, 720)).toEqual({
      scale: 1,
      width: 1280,
      height: 720,
    });
    expect(computeUiLayout(1920, 1080)).toEqual({
      scale: 1.5,
      width: 1280,
      height: 720,
    });
  });

  it('should cap the scale on very wide screens', () => {
    const layout = computeUiLayout(3840, 2160);

    expect(layout.scale).toBe(UI_MAX_SCALE);
    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(1080);
  });

  it('should keep the virtual height responsive on short heights', () => {
    const layout = computeUiLayout(1280, 500);

    expect(layout.scale).toBe(1);
    expect(layout.width).toBe(UI_DESIGN_WIDTH);
    expect(layout.height).toBe(500);
  });

  it('should fall back to the design frame for invalid sizes', () => {
    expect(computeUiLayout(0, -1)).toEqual({
      scale: 1,
      width: UI_DESIGN_WIDTH,
      height: 720,
    });
    expect(computeUiLayout(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      scale: 1,
      width: UI_DESIGN_WIDTH,
      height: 720,
    });
  });

  it('should align the virtual width to the scene frame when provided', () => {
    const layout = computeUiLayout(745, 264, { width: 469 });

    expect(layout.scale).toBe(UI_MIN_SCALE);
    expect(layout.width).toBeCloseTo(469 / UI_MIN_SCALE);
    expect(layout.height).toBeCloseTo(264 / UI_MIN_SCALE);
  });

  it('should fall back to the viewport when the frame width is invalid', () => {
    expect(computeUiLayout(745, 264, { width: 0 }).width).toBeCloseTo(
      745 / UI_MIN_SCALE,
    );
    expect(
      computeUiLayout(745, 264, { width: Number.POSITIVE_INFINITY }).width,
    ).toBeCloseTo(745 / UI_MIN_SCALE);
  });
});

describe('computeCompactAmount', () => {
  it('should be fully compact at or below the compact width', () => {
    expect(computeCompactAmount(UI_COMPACT_WIDTH)).toBe(1);
    expect(computeCompactAmount(745)).toBe(1);
  });

  it('should be off at or above the full width', () => {
    expect(computeCompactAmount(UI_COMPACT_FULL_WIDTH)).toBe(0);
    expect(computeCompactAmount(1920)).toBe(0);
  });

  it('should interpolate between the two widths', () => {
    expect(computeCompactAmount(896)).toBeCloseTo(0.5);
  });

  it('should fall back to desktop for an invalid width', () => {
    expect(computeCompactAmount(0)).toBe(0);
    expect(computeCompactAmount(Number.NaN)).toBe(0);
  });
});

describe('isPositiveFinite', () => {
  it('should accept finite positive sizes', () => {
    expect(isPositiveFinite(1)).toBe(true);
    expect(isPositiveFinite(0.5)).toBe(true);
  });

  it('should reject zero, negatives and non-finite values', () => {
    expect(isPositiveFinite(0)).toBe(false);
    expect(isPositiveFinite(-1)).toBe(false);
    expect(isPositiveFinite(Number.NaN)).toBe(false);
    expect(isPositiveFinite(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
