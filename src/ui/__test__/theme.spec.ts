import { DEFAULT_UI_THEME, resolveTheme } from '../theme';

/** WCAG 相对亮度（sRGB） */
function luminance(color: number): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((color >> 16) & 0xff);
  const g = channel((color >> 8) & 0xff);
  const b = channel(color & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 半透明前景叠在纯色背景后的实际颜色 */
function blend(foreground: number, alpha: number, background: number): number {
  const channel = (shift: number): number => {
    const fg = (foreground >> shift) & 0xff;
    const bg = (background >> shift) & 0xff;
    return Math.round(fg * alpha + bg * (1 - alpha));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

describe('theme', () => {
  it('should expose every token group in the default theme', () => {
    for (const group of [
      'colors',
      'typography',
      'spacing',
      'radius',
      'border',
      'opacity',
      'sizes',
    ] as const) {
      expect(DEFAULT_UI_THEME[group]).toBeDefined();
    }
    expect(DEFAULT_UI_THEME.colors.neutral950).toBe(0x1f1411);
    expect(DEFAULT_UI_THEME.typography.sizes.lg).toBe(20);
    expect(DEFAULT_UI_THEME.spacing.s24).toBe(24);
    expect(DEFAULT_UI_THEME.radius.pill).toBeGreaterThan(100);
  });

  it('should return the default theme unchanged when no overrides are given', () => {
    expect(resolveTheme()).toBe(DEFAULT_UI_THEME);
  });

  it('should deep-merge color overrides without touching the defaults', () => {
    const theme = resolveTheme({ colors: { accent: 0x123456 } });
    expect(theme.colors.accent).toBe(0x123456);
    expect(theme.colors.textPrimary).toBe(DEFAULT_UI_THEME.colors.textPrimary);
    expect(DEFAULT_UI_THEME.colors.accent).toBe(0xffcf87);
  });

  it('should replace font stacks wholesale instead of merging arrays', () => {
    const theme = resolveTheme({
      typography: { fontFamilyBody: ['Only Sans'] },
    });
    expect(theme.typography.fontFamilyBody).toEqual(['Only Sans']);
    expect(theme.typography.fontFamilyHeading).toEqual(
      DEFAULT_UI_THEME.typography.fontFamilyHeading,
    );
  });

  it('should merge overrides onto an explicit base theme', () => {
    const base = resolveTheme({ colors: { accent: 0x111111 } });
    const merged = resolveTheme({ colors: { textPrimary: 0x222222 } }, base);
    expect(merged.colors.accent).toBe(0x111111);
    expect(merged.colors.textPrimary).toBe(0x222222);
    expect(base.colors.textPrimary).toBe(DEFAULT_UI_THEME.colors.textPrimary);
  });

  it('should merge nested size overrides', () => {
    const theme = resolveTheme({ sizes: { slotHeight: 72 } });
    expect(theme.sizes.slotHeight).toBe(72);
    expect(theme.sizes.slotGap).toBe(12);
  });

  it('should meet WCAG 4.5:1 for body text on panel surfaces', () => {
    const { colors } = DEFAULT_UI_THEME;
    expect(
      contrast(colors.textPrimary, colors.surfacePanel),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.textSecondary, colors.surfacePanel),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accent, colors.surfacePanel)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('should meet WCAG 4.5:1 for text on primary buttons', () => {
    const { colors } = DEFAULT_UI_THEME;
    expect(
      contrast(colors.textOnPrimary, colors.accent),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('should keep choice labels readable on the glass over any scene', () => {
    const { colors } = DEFAULT_UI_THEME;
    for (const scene of [0xffffff, 0x000000]) {
      const surface = blend(
        colors.surfaceChoice,
        colors.surfaceChoiceAlpha,
        scene,
      );
      expect(contrast(colors.textChoice, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
