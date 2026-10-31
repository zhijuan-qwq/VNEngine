import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Choice } from '@/types/script';
import { UIComponent } from './UIComponent';
import { THEME } from './theme';

export interface ChoicePanelOptions {
  width: number;
  /** 逻辑画面高度；提供时选项块在对话框上方区域垂直居中 */
  height?: number;
  x?: number;
  y?: number;
  /** 选项按钮宽度；缺省取 72% 画面宽与 640px 的较小者 */
  buttonWidth?: number;
  buttonHeight?: number;
  buttonGap?: number;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: number;
  textColor?: number;
  disabledColor?: number;
  onSelect?: (label: string) => void;
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
  fontFamily: string;
  backgroundColor: number;
  textColor: number;
  disabledColor: number;
  onSelect?: (label: string) => void;
}

export class ChoicePanel extends UIComponent {
  private readonly opts: ResolvedOptions;
  private choiceButtons: Container[] = [];

  constructor(options: ChoicePanelOptions) {
    super({ id: 'choice-panel' });
    this.opts = {
      width: options.width,
      height: options.height ?? null,
      x: options.x ?? 0,
      y: options.y ?? 0,
      buttonWidth: options.buttonWidth ?? Math.min(options.width * 0.72, 640),
      buttonHeight: options.buttonHeight ?? 52,
      buttonGap: options.buttonGap ?? 14,
      fontSize: options.fontSize ?? 24,
      fontFamily: options.fontFamily ?? THEME.fontFamily,
      backgroundColor: options.backgroundColor ?? THEME.panel,
      textColor: options.textColor ?? THEME.text,
      disabledColor: options.disabledColor ?? THEME.textDim,
      onSelect: options.onSelect,
    };
    this.x = this.opts.x;
    this.y = this.opts.y;
    this.hide();
  }

  public show(choices: Choice[], _mode: 'adv' | 'nvl'): void {
    this.clearButtons();
    const total =
      choices.length * this.opts.buttonHeight +
      (choices.length - 1) * this.opts.buttonGap;
    // 选项块在对话框（底部约 30%）以上的区域居中；块过高时贴顶留白
    const areaHeight = this.opts.height
      ? this.opts.height * 0.66
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
    this.visible = true;
  }

  public hide(): void {
    this.clearButtons();
    this.visible = false;
  }

  private createButton(choice: Choice): Container {
    const button = new Container();
    button.eventMode = 'static';
    button.hitArea = new Rectangle(
      0,
      0,
      this.opts.buttonWidth,
      this.opts.buttonHeight,
    );
    button.cursor = 'pointer';

    const disabled = choice.enabled === false;
    const bg = new Graphics();
    const style = {
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      fill: disabled ? this.opts.disabledColor : this.opts.textColor,
    };
    const drawBg = (hover: boolean): void => {
      bg.clear();
      bg.roundRect(0, 0, this.opts.buttonWidth, this.opts.buttonHeight, 12);
      if (disabled) {
        bg.fill(this.opts.backgroundColor, 0.5);
        bg.stroke({ color: THEME.border, width: 1, alpha: 0.5 });
        return;
      }
      if (hover) {
        bg.fill(THEME.accent, 0.16);
        bg.stroke({ color: THEME.accent, width: 2 });
      } else {
        bg.fill(this.opts.backgroundColor, 0.88);
        bg.stroke({ color: THEME.border, width: 1.5 });
      }
    };
    drawBg(false);
    button.addChild(bg);

    const label = new Text({ text: choice.text, style });
    label.anchor.set(0.5);
    label.position.set(this.opts.buttonWidth / 2, this.opts.buttonHeight / 2);
    button.addChild(label);

    if (disabled) {
      button.alpha = 0.5;
      button.cursor = 'default';
    } else {
      button.on('pointerover', () => {
        drawBg(true);
        label.style = { ...style, fill: THEME.accentBright };
      });
      button.on('pointerout', () => {
        drawBg(false);
        label.style = style;
      });
      button.on('pointertap', (event: FederatedPointerEvent) => {
        event.stopPropagation();
        this.opts.onSelect?.(choice.label);
        this.hide();
      });
    }

    return button;
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
