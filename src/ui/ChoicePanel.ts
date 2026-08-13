import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { Choice } from '@/types/script';
import { UIComponent } from './UIComponent';

export interface ChoicePanelOptions {
  width: number;
  x?: number;
  y?: number;
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
  x: number;
  y: number;
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
      x: options.x ?? 0,
      y: options.y ?? 0,
      buttonHeight: options.buttonHeight ?? 48,
      buttonGap: options.buttonGap ?? 8,
      fontSize: options.fontSize ?? 24,
      fontFamily: options.fontFamily ?? 'sans-serif',
      backgroundColor: options.backgroundColor ?? 0x333333,
      textColor: options.textColor ?? 0xffffff,
      disabledColor: options.disabledColor ?? 0x777777,
      onSelect: options.onSelect,
    };
    this.x = this.opts.x;
    this.y = this.opts.y;
    this.hide();
  }

  public show(choices: Choice[], _mode: 'adv' | 'nvl'): void {
    this.clearButtons();
    for (let index = 0; index < choices.length; index += 1) {
      const button = this.createButton(choices[index], index);
      this.choiceButtons.push(button);
      this.addChild(button);
    }
    this.visible = true;
  }

  public hide(): void {
    this.clearButtons();
    this.visible = false;
  }

  private createButton(choice: Choice, index: number): Container {
    const button = new Container();
    button.eventMode = 'static';
    button.hitArea = new Rectangle(
      0,
      0,
      this.opts.width,
      this.opts.buttonHeight,
    );
    button.y = index * (this.opts.buttonHeight + this.opts.buttonGap);

    const bg = new Graphics();
    bg.roundRect(0, 0, this.opts.width, this.opts.buttonHeight, 8);
    bg.fill(this.opts.backgroundColor, 1);
    button.addChild(bg);

    const label = new Text({
      text: choice.text,
      style: {
        fontSize: this.opts.fontSize,
        fontFamily: this.opts.fontFamily,
        fill: this.opts.textColor,
      },
    });
    label.x = 16;
    label.y = (this.opts.buttonHeight - label.height) / 2;
    button.addChild(label);

    if (choice.enabled === false) {
      button.alpha = 0.5;
      bg.tint = this.opts.disabledColor;
    } else {
      button.on('pointertap', (event) => {
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
