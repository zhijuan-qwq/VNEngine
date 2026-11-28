import type { Container } from 'pixi.js';
import type { Choice } from '@/types/script';
import { UIComponent } from './UIComponent';
import { createButton } from './overlay';
import type { UIButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';
import { isPositiveFinite, UI_MIN_SCALE } from './uiLayout';

export interface ChoicePanelOptions {
  width: number;
  /** 逻辑画面高度；提供时选项块在对话框上方区域垂直居中 */
  height?: number;
  x?: number;
  y?: number;
  /** 选项按钮宽度；缺省取 64% 画面宽与主题最大宽（500px）的较小者 */
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
  fontSize: number;
  fontFamily: string | string[];
  backgroundColor?: number;
  textColor?: number;
  disabledColor?: number;
  onSelect?: (label: string) => void;
}

interface ChoiceMetrics {
  buttonWidth: number;
  buttonHeight: number;
  buttonGap: number;
  fontSize: number;
}

/** 移动端紧凑模式的整体缩放 */
const COMPACT_SCALE = 0.85;
/** 紧凑模式字号下限按物理像素反推：最差缩放档下仍不小于 11 CSS px */
const COMPACT_MIN_FONT = Math.ceil(11 / UI_MIN_SCALE);

export class ChoicePanel extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly buttonWidthOverride?: number;
  private readonly buttonHeightOverride?: number;
  private readonly buttonGapOverride?: number;
  private choiceButtons: UIButton[] = [];
  private currentChoices: Choice[] | null = null;
  /** 0 为正常尺寸，1 为完全紧凑；中间值随视口宽度线性过渡 */
  private compactAmount = 0;
  private metrics: ChoiceMetrics;

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
      fontSize: options.fontSize ?? this.theme.typography.sizes.md,
      fontFamily: options.fontFamily ?? this.theme.typography.fontFamilyBody,
      backgroundColor: options.backgroundColor,
      textColor: options.textColor,
      disabledColor: options.disabledColor,
      onSelect: options.onSelect,
    };
    this.metrics = this.resolveMetrics();
    this.x = this.opts.x;
    this.y = this.opts.y;
    this.hide();
  }

  public show(choices: Choice[], _mode: 'adv' | 'nvl'): void {
    this.currentChoices = choices;
    this.metrics = this.resolveMetrics();
    this.layoutButtons();
    this.visible = true;
  }

  /**
   * 视口变化时重新居中；选项数量不变时原地更新按钮尺寸，
   * 保留 hover / pressed 状态与进行中的按压。
   */
  public resize(
    width: number,
    height: number,
    compactAmount = this.compactAmount,
  ): void {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
      return;
    }
    this.opts.width = width;
    this.opts.height = height;
    if (Number.isFinite(compactAmount)) {
      this.compactAmount = Math.min(Math.max(compactAmount, 0), 1);
    }
    this.metrics = this.resolveMetrics();
    if (!this.currentChoices) {
      return;
    }
    if (this.choiceButtons.length === this.currentChoices.length) {
      this.updateButtons();
    } else {
      this.layoutButtons();
    }
  }

  private resolveMetrics(): ChoiceMetrics {
    const factor = 1 - (1 - COMPACT_SCALE) * this.compactAmount;
    const width =
      this.buttonWidthOverride ??
      Math.min(
        this.opts.width * this.theme.sizes.choiceWidthRatio,
        this.theme.sizes.choiceMaxWidth,
      );
    const height = this.buttonHeightOverride ?? this.theme.sizes.choiceHeight;
    const gap = this.buttonGapOverride ?? this.theme.sizes.choiceGap;
    return {
      buttonWidth: Math.round(width * factor),
      buttonHeight: Math.round(height * factor),
      buttonGap: Math.round(gap * factor),
      fontSize: Math.max(
        Math.min(COMPACT_MIN_FONT, this.opts.fontSize),
        Math.round(this.opts.fontSize * factor),
      ),
    };
  }

  private blockOrigin(count: number): { startX: number; startY: number } {
    const { buttonWidth, buttonHeight, buttonGap } = this.metrics;
    const total = count * buttonHeight + (count - 1) * buttonGap;
    // 选项块在对话框（底部约 30%）以上的区域居中；块过高时贴顶留白。
    // 0.8 让块中心落在画面约 40% 处，比原先的 0.66（33%）略低。
    const areaHeight = this.opts.height
      ? this.opts.height * 0.8
      : Number.POSITIVE_INFINITY;
    const startY = this.opts.height
      ? Math.max(this.opts.height * 0.08, (areaHeight - total) / 2)
      : 0;
    const startX = (this.opts.width - buttonWidth) / 2;
    return { startX, startY };
  }

  private layoutButtons(): void {
    this.clearButtons();
    const choices = this.currentChoices ?? [];
    const { buttonHeight, buttonGap } = this.metrics;
    const { startX, startY } = this.blockOrigin(choices.length);

    for (let index = 0; index < choices.length; index += 1) {
      const button = this.createButton(choices[index]);
      button.x = startX;
      button.y = startY + index * (buttonHeight + buttonGap);
      this.choiceButtons.push(button);
      this.addChild(button);
    }
  }

  private updateButtons(): void {
    const choices = this.currentChoices ?? [];
    const { buttonWidth, buttonHeight, buttonGap, fontSize } = this.metrics;
    const { startX, startY } = this.blockOrigin(choices.length);
    for (let index = 0; index < this.choiceButtons.length; index += 1) {
      const button = this.choiceButtons[index];
      button.setLayout(buttonWidth, buttonHeight, fontSize);
      button.x = startX;
      button.y = startY + index * (buttonHeight + buttonGap);
    }
  }

  public hide(): void {
    this.currentChoices = null;
    this.clearButtons();
    this.visible = false;
  }

  private createButton(choice: Choice): UIButton {
    const disabled = choice.enabled === false;
    return createButton({
      width: this.metrics.buttonWidth,
      height: this.metrics.buttonHeight,
      label: choice.text,
      fontSize: this.metrics.fontSize,
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

  /** 选项块底边（虚拟坐标）；无选项时为 0，供对话框避让 */
  public blockBottom(): number {
    const count = this.currentChoices?.length ?? 0;
    if (count === 0) {
      return 0;
    }
    const { startY } = this.blockOrigin(count);
    const { buttonHeight, buttonGap } = this.metrics;
    return startY + count * buttonHeight + (count - 1) * buttonGap;
  }

  get buttons(): Container[] {
    return this.choiceButtons;
  }

  private clearButtons(): void {
    for (const button of this.choiceButtons) {
      button.removeAllListeners();
      button.destroy({ children: true });
    }
    this.choiceButtons = [];
  }
}
