import type { Container } from 'pixi.js';
import type { Choice } from '@/types/script';
import { UIComponent } from './UIComponent';
import { createButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface ChoicePanelOptions {
  width: number;
  /** 逻辑画面高度；提供时选项块在对话框上方区域垂直居中 */
  height?: number;
  x?: number;
  y?: number;
  /** 选项按钮宽度；缺省取 72% 画面宽与主题最大宽（560px）的较小者 */
  buttonWidth?: number;
  buttonHeight?: number;
  buttonGap?: number;
  fontSize?: number;
  fontFamily?: string | string[];
  backgroundColor?: number;
  textColor?: number;
  disabledColor?: number;
  onSelect?: (label: string) => void;
  theme?: DeepPartial<UITheme>;
}

interface ResolvedOptions {
  width: number;
  height: number | null;
  x: number;
  y: number;
  buttonWidth: number;
  buttonHeight: number;
  buttonGap: number;
  fontSize: number;
  fontFamily: string | string[];
  backgroundColor?: number;
  textColor?: number;
  disabledColor?: number;
  onSelect?: (label: string) => void;
}

export class ChoicePanel extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly buttonWidthOverride?: number;
  private readonly buttonHeightOverride?: number;
  private readonly buttonGapOverride?: number;
  private choiceButtons: Container[] = [];
  private currentChoices: Choice[] | null = null;

  constructor(options: ChoicePanelOptions) {
    super({ id: 'choice-panel' });
    this.theme = resolveTheme(options.theme);
    this.buttonWidthOverride = options.buttonWidth;
    this.buttonHeightOverride = options.buttonHeight;
    this.buttonGapOverride = options.buttonGap;
    this.opts = {
      width: options.width,
      height: options.height ?? null,
      x: options.x ?? 0,
      y: options.y ?? 0,
      buttonWidth:
        options.buttonWidth ??
        Math.min(
          options.width * this.theme.sizes.choiceWidthRatio,
          this.theme.sizes.choiceMaxWidth,
        ),
      buttonHeight: options.buttonHeight ?? this.theme.sizes.choiceHeight,
      buttonGap: options.buttonGap ?? this.theme.sizes.choiceGap,
      fontSize: options.fontSize ?? this.theme.typography.sizes.md,
      fontFamily: options.fontFamily ?? this.theme.typography.fontFamilyBody,
      backgroundColor: options.backgroundColor,
      textColor: options.textColor,
      disabledColor: options.disabledColor,
      onSelect: options.onSelect,
    };
    this.x = this.opts.x;
    this.y = this.opts.y;
    this.hide();
  }

  public show(choices: Choice[], _mode: 'adv' | 'nvl'): void {
    this.currentChoices = choices;
    this.layoutButtons();
    this.visible = true;
  }

  /** 视口变化时按新尺寸重新居中；已显示的选项会重建按钮 */
  public resize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.opts.buttonWidth =
      this.buttonWidthOverride ??
      Math.min(
        width * this.theme.sizes.choiceWidthRatio,
        this.theme.sizes.choiceMaxWidth,
      );
    this.opts.buttonHeight =
      this.buttonHeightOverride ?? this.theme.sizes.choiceHeight;
    this.opts.buttonGap = this.buttonGapOverride ?? this.theme.sizes.choiceGap;
    if (this.currentChoices) {
      this.layoutButtons();
    }
  }

  private layoutButtons(): void {
    this.clearButtons();
    const choices = this.currentChoices ?? [];
    const total =
      choices.length * this.opts.buttonHeight +
      (choices.length - 1) * this.opts.buttonGap;
    // 选项块在对话框（底部约 30%）以上的区域居中；块过高时贴顶留白。
    // 0.8 让块中心落在画面约 40% 处，比原先的 0.66（33%）略低。
    const areaHeight = this.opts.height
      ? this.opts.height * 0.8
      : Number.POSITIVE_INFINITY;
    const startY = this.opts.height
      ? Math.max(this.opts.height * 0.08, (areaHeight - total) / 2)
      : 0;
    const startX = (this.opts.width - this.opts.buttonWidth) / 2;

    for (let index = 0; index < choices.length; index += 1) {
      const button = this.createButton(choices[index]);
      button.x = startX;
      button.y =
        startY + index * (this.opts.buttonHeight + this.opts.buttonGap);
      this.choiceButtons.push(button);
      this.addChild(button);
    }
  }

  public hide(): void {
    this.currentChoices = null;
    this.clearButtons();
    this.visible = false;
  }

  private createButton(choice: Choice): Container {
    const disabled = choice.enabled === false;
    return createButton({
      width: this.opts.buttonWidth,
      height: this.opts.buttonHeight,
      label: choice.text,
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      backgroundColor: this.opts.backgroundColor,
      textColor: this.opts.textColor,
      disabledTextColor: this.opts.disabledColor,
      variant: 'choice',
      align: 'center',
      disabled,
      theme: this.theme,
      onTap: () => {
        this.opts.onSelect?.(choice.label);
        this.hide();
      },
    });
  }

  get buttons(): Container[] {
    return this.choiceButtons;
  }

  private clearButtons(): void {
    for (const button of this.choiceButtons) {
      button.removeAllListeners();
      button.destroy();
    }
    this.choiceButtons = [];
  }
}
