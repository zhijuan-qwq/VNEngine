import {
  computeUiLayout,
  UI_DESIGN_WIDTH,
  UI_MAX_SCALE,
  UI_MIN_SCALE,
} from '../uiLayout';

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
});
