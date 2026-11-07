import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonAlign = 'left' | 'center';
export type ButtonState = 'normal' | 'hover' | 'pressed';

export interface OverlayOptions {
  theme?: DeepPartial<UITheme>;
}

/**
 * 全屏遮罩：不透明背景 + 命中层，吞掉面板之外的点击，
 * 使模态面板打开时底层的 input:click 不会触发。
 */
export function createBackdrop(
  width: number,
  height: number,
  options: OverlayOptions & { alpha?: number; color?: number } = {},
): Graphics {
  const theme = resolveTheme(options.theme);
  const backdrop = new Graphics();
  backdrop.rect(0, 0, width, height);
  backdrop.fill(
    options.color ?? theme.colors.backdrop,
    options.alpha ?? theme.colors.backdropAlpha,
  );
  backdrop.eventMode = 'static';
  backdrop.hitArea = new Rectangle(0, 0, width, height);
  backdrop.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
  });
  return backdrop;
}

export interface PanelBoxOptions extends OverlayOptions {
  radius?: number;
  color?: number;
  alpha?: number;
  borderWidth?: number;
  borderColor?: number;
  borderAlpha?: number;
}

export function createPanelBox(
  width: number,
  height: number,
  options: PanelBoxOptions = {},
): Graphics {
  const theme = resolveTheme(options.theme);
  const radius = options.radius ?? theme.radius.lg;
  const borderWidth = options.borderWidth ?? theme.border.thin;

  const box = new Graphics();
  box.roundRect(0, 0, width, height, radius);
  box.fill(
    options.color ?? theme.colors.surfacePanel,
    options.alpha ?? theme.colors.surfacePanelAlpha,
  );
  if (borderWidth > 0) {
    box.stroke({
      width: borderWidth,
      color: options.borderColor ?? theme.colors.borderSubtle,
      alpha: options.borderAlpha ?? theme.colors.borderSubtleAlpha,
    });
  }
  return box;
}

export interface ButtonOptions extends OverlayOptions {
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  fontFamily?: string | string[];
  backgroundColor?: number;
  textColor?: number;
  variant?: ButtonVariant;
  align?: ButtonAlign;
  disabled?: boolean;
  disabledTextColor?: number;
  onTap?: () => void;
}

interface VariantPalette {
  fill: number;
  fillAlpha: number;
  hoverFill: number;
  pressedFill: number;
  text: number;
  border: number;
  borderAlpha: number;
}

function paletteFor(theme: UITheme, variant: ButtonVariant): VariantPalette {
  const { colors } = theme;
  switch (variant) {
    case 'primary':
      return {
        fill: colors.accent,
        fillAlpha: 1,
        hoverFill: colors.accentStrong,
        pressedFill: colors.primary600,
        text: colors.textOnPrimary,
        border: colors.accent,
        borderAlpha: 0,
      };
    case 'danger':
      // 浅阶 dangerLight 在暗底上适合做文字/边框，做填充会压低白字对比度，
      // 因此 hover / pressed 保持主 danger 色，只用状态透明度表达。
      return {
        fill: colors.danger,
        fillAlpha: 1,
        hoverFill: colors.danger,
        pressedFill: colors.danger,
        text: colors.textPrimary,
        border: colors.danger,
        borderAlpha: 0,
      };
    case 'ghost':
      return {
        fill: colors.surfaceButton,
        fillAlpha: 0,
        hoverFill: colors.surfaceButtonHover,
        pressedFill: colors.surfaceButtonPressed,
        text: colors.textPrimary,
        border: colors.borderSubtle,
        borderAlpha: 0,
      };
    case 'secondary':
    default:
      return {
        fill: colors.surfaceButton,
        fillAlpha: 1,
        hoverFill: colors.surfaceButtonHover,
        pressedFill: colors.surfaceButtonPressed,
        text: colors.textPrimary,
        border: colors.borderSubtle,
        borderAlpha: colors.borderSubtleAlpha,
      };
  }
}

/** 带 hover / pressed / disabled 视觉状态的按钮 */
export class UIButton extends Container {
  public readonly labelText: Text;
  private readonly bg: Graphics;
  private readonly theme: UITheme;
  private readonly variant: ButtonVariant;
  private readonly widthValue: number;
  private readonly heightValue: number;
  private readonly fontSize: number;
  private readonly fontFamily: string | string[];
  /** 显式颜色覆盖需在每次重绘时复用，否则一次 hover 就会回落到主题色 */
  private readonly backgroundOverride?: number;
  private readonly textOverride?: number;
  private readonly disabledTextColor?: number;
  private readonly onTap?: () => void;
  private enabledValue: boolean;
  private stateValue: ButtonState = 'normal';

  constructor(options: ButtonOptions) {
    super();
    this.theme = resolveTheme(options.theme);
    this.variant = options.variant ?? 'secondary';
    this.widthValue = options.width;
    this.heightValue = options.height;
    this.backgroundOverride = options.backgroundColor;
    this.textOverride = options.textColor;
    this.disabledTextColor = options.disabledTextColor;
    this.onTap = options.onTap;
    this.enabledValue = options.disabled !== true;

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, options.width, options.height);

    this.bg = new Graphics();
    this.addChild(this.bg);

    const palette = paletteFor(this.theme, this.variant);
    this.fontSize = options.fontSize ?? this.theme.typography.sizes.md;
    this.fontFamily =
      options.fontFamily ?? this.theme.typography.fontFamilyBody;
    this.labelText = new Text({
      text: options.label,
      style: {
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        fontWeight: this.theme.typography.weights.regular,
        fill: options.textColor ?? palette.text,
      },
    });
    this.labelText.y = (options.height - this.labelText.height) / 2;
    this.addChild(this.labelText);

    this.layoutLabel(options.align ?? 'left');
    this.redraw();
    if (!this.enabledValue) {
      this.applyEnabledVisual();
    }

    this.on('pointerover', () => this.setState('hover'));
    this.on('pointerout', () => this.setState('normal'));
    this.on('pointerdown', () => this.setState('pressed'));
    this.on('pointerup', () => this.setState('hover'));
    this.on('pointerupoutside', () => this.setState('normal'));
    this.on('pointertap', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      if (this.enabledValue) {
        this.onTap?.();
      }
    });
  }

  public get enabled(): boolean {
    return this.enabledValue;
  }

  public get state(): ButtonState {
    return this.stateValue;
  }

  /** 运行时切换可用状态（SaveLoadMenu 的读档空槽、ChoicePanel 的禁用选项） */
  public setEnabled(enabled: boolean): void {
    if (this.enabledValue === enabled) {
      return;
    }
    this.enabledValue = enabled;
    if (enabled) {
      this.alpha = 1;
      this.stateValue = 'normal';
      this.redraw();
    } else {
      this.applyEnabledVisual();
    }
  }

  private layoutLabel(align: ButtonAlign): void {
    if (align === 'center') {
      this.labelText.x = (this.widthValue - this.labelText.width) / 2;
      return;
    }
    this.labelText.x = this.theme.spacing.s12;
  }

  private setState(next: ButtonState): void {
    if (!this.enabledValue || this.stateValue === next) {
      return;
    }
    this.stateValue = next;
    this.redraw();
  }

  private applyEnabledVisual(): void {
    this.alpha = this.theme.opacity.disabled;
    this.stateValue = 'normal';
    this.redraw();
  }

  /**
   * 重绘背景。保留 children 顺序 [背景, 文字]：现有测试通过
   * `button.children[1]` 读取标签文字。
   */
  private redraw(): void {
    const palette = paletteFor(this.theme, this.variant);
    const fill = this.backgroundOverride ?? this.fillForState(palette);
    // ghost 常态透明，但 hover / pressed 需要有可见底色才形成反馈。
    // 禁用态的整体变淡由容器 alpha（applyEnabledVisual）负责，这里不再二次压暗。
    const alpha = this.stateValue === 'normal' ? palette.fillAlpha : 1;

    this.bg.clear();
    this.bg.roundRect(
      0,
      0,
      this.widthValue,
      this.heightValue,
      this.theme.radius.md,
    );
    this.bg.fill(fill, alpha);
    if (palette.borderAlpha > 0) {
      this.bg.stroke({
        width: this.theme.border.thin,
        color: palette.border,
        alpha: palette.borderAlpha,
      });
    }

    this.labelText.style = {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.theme.typography.weights.regular,
      fill: this.enabledValue
        ? (this.textOverride ?? palette.text)
        : (this.disabledTextColor ?? this.theme.colors.disabledText),
    };
  }

  private fillForState(palette: VariantPalette): number {
    if (this.stateValue === 'pressed') {
      return palette.pressedFill;
    }
    if (this.stateValue === 'hover') {
      return palette.hoverFill;
    }
    return palette.fill;
  }
}

export function createButton(options: ButtonOptions): UIButton {
  return new UIButton(options);
}
