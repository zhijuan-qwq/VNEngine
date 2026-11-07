import type { TextStyleFontWeight } from 'pixi.js';

/**
 * UI 设计令牌（Refactoring UI · Workflow A）。
 *
 * 两层结构：
 * - primitive：由 Refactoring UI 调色板算法生成的原始色阶，组件不应直接引用。
 * - semantic：组件唯一允许引用的语义层，未来加明色主题时只需重映射这一层。
 *
 * PixiJS 的颜色是 0xRRGGBB 数字，透明度必须单独存放，不能用 CSS rgba()。
 */
export interface ThemeColors {
  // primitive · neutral（暖灰，temperature=warm）
  neutral50: number;
  neutral100: number;
  neutral200: number;
  neutral300: number;
  neutral400: number;
  neutral500: number;
  neutral600: number;
  neutral700: number;
  neutral800: number;
  neutral900: number;
  neutral950: number;

  // primitive · primary（暖金）
  primary100: number;
  primary200: number;
  primary300: number;
  primary400: number;
  primary500: number;
  primary600: number;
  primary700: number;
  primary800: number;
  primary900: number;

  // primitive · semantic accents
  danger: number;
  dangerLight: number;
  success: number;
  successLight: number;
  info: number;
  infoLight: number;

  // semantic · text（最多三级，见 §2.2.a）
  textPrimary: number;
  textSecondary: number;
  textMuted: number;
  textOnPrimary: number;

  // semantic · accent
  accent: number;
  accentStrong: number;

  // semantic · surfaces
  surfacePanel: number;
  surfacePanelAlpha: number;
  surfaceDialogue: number;
  surfaceDialogueAlpha: number;
  surfaceSunken: number;
  surfaceButton: number;
  surfaceButtonHover: number;
  surfaceButtonPressed: number;

  // semantic · border / overlay
  borderSubtle: number;
  borderSubtleAlpha: number;
  backdrop: number;
  backdropAlpha: number;
  disabledText: number;
  disabledAlpha: number;
}

export interface ThemeTypography {
  /** 正文系统无衬线栈，不新增字体文件 */
  fontFamilyBody: string[];
  /** 标题系统衬线栈；系统缺失时逐级回退 */
  fontFamilyHeading: string[];
  sizes: {
    xs: number;
    sm: number;
    base: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
    display: number;
  };
  weights: {
    regular: TextStyleFontWeight;
    semibold: TextStyleFontWeight;
  };
  lineHeights: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface ThemeSpacing {
  s4: number;
  s8: number;
  s12: number;
  s16: number;
  s24: number;
  s32: number;
  s48: number;
  s64: number;
}

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ThemeBorder {
  thin: number;
  thick: number;
}

export interface ThemeOpacity {
  disabled: number;
  backdrop: number;
  pressed: number;
}

export interface ThemeSizes {
  buttonSm: number;
  buttonMd: number;
  buttonLg: number;
  closeButtonWidth: number;
  closeButtonHeight: number;
  menuButtonWidth: number;
  menuButtonHeight: number;
  menuGap: number;
  menuMargin: number;
  modalWidthRatio: number;
  modalHeightRatio: number;
  settingsWidthRatio: number;
  confirmWidthRatio: number;
  confirmMaxWidth: number;
  confirmHeight: number;
  dialogueHeightRatio: number;
  choiceWidthRatio: number;
  choiceMaxWidth: number;
  choiceHeight: number;
  choiceGap: number;
  rowHeight: number;
  labelWidth: number;
  slotHeight: number;
  slotGap: number;
  sliderHeight: number;
  toggleWidth: number;
  toggleHeight: number;
  scrollStep: number;
}

export interface UITheme {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  border: ThemeBorder;
  opacity: ThemeOpacity;
  sizes: ThemeSizes;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export const DEFAULT_UI_THEME: UITheme = {
  colors: {
    neutral50: 0xfffffa,
    neutral100: 0xfdfdf6,
    neutral200: 0xe4e2d3,
    neutral300: 0xc8c3b1,
    neutral400: 0xaca391,
    neutral500: 0x8f8270,
    neutral600: 0x796a5c,
    neutral700: 0x625349,
    neutral800: 0x4c3c35,
    neutral900: 0x352722,
    neutral950: 0x1f1411,

    primary100: 0xfffeeb,
    primary200: 0xfff8d2,
    primary300: 0xffefb9,
    primary400: 0xffe1a0,
    primary500: 0xffcf87,
    primary600: 0xea9e56,
    primary700: 0xd06929,
    primary800: 0xa13811,
    primary900: 0x6b1d00,

    danger: 0xdc2626,
    dangerLight: 0xef724d,
    success: 0x4caf50,
    successLight: 0x6fc886,
    info: 0x42a5f5,
    infoLight: 0x65c9ff,

    textPrimary: 0xfff8f0,
    textSecondary: 0xc4b8ae,
    textMuted: 0xaca391,
    textOnPrimary: 0x2a2019,

    accent: 0xffcf87,
    accentStrong: 0xea9e56,

    // #262321 位于 neutral-900 与 950 之间：暖棕灰表面在背景图上半透明
    // 叠加时比纯中性深灰更接近日系 AVG 的观感。这是对色阶的有意微调，
    // 不是随手值；不要在没有设计评审的情况下继续增减表面色。
    surfacePanel: 0x262321,
    surfacePanelAlpha: 0.94,
    surfaceDialogue: 0x262321,
    surfaceDialogueAlpha: 0.88,
    surfaceSunken: 0x1f1411,
    surfaceButton: 0x3d3a38,
    surfaceButtonHover: 0x4a4643,
    surfaceButtonPressed: 0x56514d,

    borderSubtle: 0xfff8f0,
    borderSubtleAlpha: 0.14,
    backdrop: 0x000000,
    backdropAlpha: 0.66,
    disabledText: 0x8a7f76,
    disabledAlpha: 0.45,
  },
  typography: {
    fontFamilyBody: [
      'PingFang SC',
      'Hiragino Sans GB',
      'Microsoft YaHei',
      'Noto Sans CJK SC',
      'Source Han Sans SC',
      'sans-serif',
    ],
    fontFamilyHeading: [
      'Songti SC',
      'STSong',
      'Noto Serif CJK SC',
      'Source Han Serif SC',
      'SimSun',
      'serif',
    ],
    sizes: {
      xs: 12,
      sm: 14,
      base: 16,
      md: 18,
      lg: 20,
      xl: 24,
      xxl: 30,
      xxxl: 36,
      display: 48,
    },
    weights: {
      regular: '400',
      semibold: '600',
    },
    lineHeights: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.6,
    },
  },
  spacing: {
    s4: 4,
    s8: 8,
    s12: 12,
    s16: 16,
    s24: 24,
    s32: 32,
    s48: 48,
    s64: 64,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    pill: 999,
  },
  border: {
    thin: 1,
    thick: 2,
  },
  opacity: {
    disabled: 0.45,
    backdrop: 0.66,
    pressed: 0.85,
  },
  sizes: {
    buttonSm: 40,
    buttonMd: 44,
    buttonLg: 48,
    closeButtonWidth: 120,
    closeButtonHeight: 44,
    menuButtonWidth: 88,
    menuButtonHeight: 40,
    menuGap: 8,
    menuMargin: 12,
    modalWidthRatio: 0.8,
    modalHeightRatio: 0.8,
    settingsWidthRatio: 0.7,
    confirmWidthRatio: 0.6,
    confirmMaxWidth: 560,
    confirmHeight: 220,
    dialogueHeightRatio: 0.3,
    choiceWidthRatio: 0.72,
    choiceMaxWidth: 640,
    choiceHeight: 48,
    choiceGap: 8,
    rowHeight: 56,
    labelWidth: 130,
    slotHeight: 64,
    slotGap: 12,
    sliderHeight: 8,
    toggleWidth: 60,
    toggleHeight: 32,
    scrollStep: 40,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTheme(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return base;
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = mergeTheme(base[key], override[key]);
  }
  return result;
}

/**
 * 深合并主题覆盖；数组（字体栈）整体替换而不是逐项合并。
 * `base` 用于在已解析的全局主题上叠加局部的面板级覆盖。
 */
export function resolveTheme(
  overrides?: DeepPartial<UITheme>,
  base: UITheme = DEFAULT_UI_THEME,
): UITheme {
  if (!overrides) {
    return base;
  }
  return mergeTheme(base, overrides) as UITheme;
}
