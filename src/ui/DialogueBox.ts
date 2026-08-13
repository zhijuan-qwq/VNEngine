import { Graphics, Text } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { ParsedText, TextStyle, VarResolver } from '@/types/text';
import { parseRichText } from './richtext';
import { TypewriterState } from './typewriter';
import { computeTextLayout } from './textLayout';
import type { TextLayoutItem } from './textLayout';
import { UIComponent } from './UIComponent';

export interface DialogueBoxOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  textColor?: number;
  speakerColor?: number;
  backgroundColor?: number;
  backgroundAlpha?: number;
  padding?: number;
  lineHeight?: number;
  defaultSpeed?: number;
  eventBus?: EventBus<EngineEvents>;
  resolveVar?: VarResolver;
}

interface ResolvedOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  textColor: number;
  speakerColor: number;
  backgroundColor: number;
  backgroundAlpha: number;
  padding: number;
  lineHeight: number;
  defaultSpeed: number;
  eventBus?: EventBus<EngineEvents>;
  resolveVar?: VarResolver;
}

export class DialogueBox extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly bg: Graphics;
  private readonly speakerText: Text;
  private readonly indicator: Text;
  private readonly scratchText: Text;
  private bodyTexts: Text[] = [];
  private parsed: ParsedText | null = null;
  private typewriter: TypewriterState | null = null;
  private lastRevealed = 0;

  constructor(options: DialogueBoxOptions) {
    super({ id: 'dialogue-box' });
    this.opts = {
      width: options.width,
      height: options.height,
      x: options.x ?? 0,
      y: options.y ?? 0,
      fontSize: options.fontSize ?? 28,
      fontFamily: options.fontFamily ?? 'sans-serif',
      textColor: options.textColor ?? 0xffffff,
      speakerColor: options.speakerColor ?? 0xffe082,
      backgroundColor: options.backgroundColor ?? 0x000000,
      backgroundAlpha: options.backgroundAlpha ?? 0.7,
      padding: options.padding ?? 20,
      lineHeight:
        options.lineHeight ?? Math.round((options.fontSize ?? 28) * 1.4),
      defaultSpeed: options.defaultSpeed ?? 40,
      eventBus: options.eventBus,
      resolveVar: options.resolveVar,
    };

    this.x = this.opts.x;
    this.y = this.opts.y;

    this.bg = new Graphics();
    this.bg.roundRect(0, 0, this.opts.width, this.opts.height, 12);
    this.bg.fill(this.opts.backgroundColor, this.opts.backgroundAlpha);
    this.addChild(this.bg);

    this.speakerText = new Text({
      text: '',
      style: {
        fontSize: this.opts.fontSize,
        fontFamily: this.opts.fontFamily,
        fill: this.opts.speakerColor,
      },
    });
    this.speakerText.x = this.opts.padding;
    this.speakerText.y = this.opts.padding;
    this.addChild(this.speakerText);

    this.indicator = new Text({
      text: '▼',
      style: {
        fontSize: Math.round(this.opts.fontSize * 0.8),
        fontFamily: this.opts.fontFamily,
        fill: this.opts.textColor,
      },
    });
    this.indicator.x =
      this.opts.width -
      this.opts.padding -
      Math.round(this.opts.fontSize * 0.8);
    this.indicator.y =
      this.opts.height -
      this.opts.padding -
      Math.round(this.opts.fontSize * 0.8);
    this.indicator.visible = false;
    this.addChild(this.indicator);

    this.scratchText = new Text({
      text: '',
      style: this.bodyTextStyle(),
    });

    if (this.opts.eventBus) {
      this.bind(this.opts.eventBus, 'input:skip', () => this.complete());
    }

    this.hide();
  }

  public show(speaker: string, text: string, speed?: number): void {
    this.parsed = parseRichText(text, this.opts.resolveVar);
    this.typewriter = new TypewriterState({
      totalChars: this.parsed.plain.length,
      hints: this.parsed.hints,
      speed: speed ?? this.opts.defaultSpeed,
    });
    this.speakerText.text = speaker;
    this.speakerText.visible = speaker.length > 0;
    this.indicator.visible = false;
    this.lastRevealed = 0;
    this.clearBodyTexts();
    this.visible = true;
    this.relayout();
  }

  public update(dt: number): void {
    if (!this.typewriter) {
      return;
    }
    this.typewriter.update(dt);
    if (this.typewriter.revealed !== this.lastRevealed) {
      this.lastRevealed = this.typewriter.revealed;
      this.relayout();
    }
    if (this.typewriter.isComplete) {
      this.indicator.visible = true;
    }
  }

  public complete(): void {
    if (!this.typewriter) {
      return;
    }
    this.typewriter.revealAll();
    this.lastRevealed = this.typewriter.revealed;
    this.relayout();
    this.indicator.visible = true;
  }

  public clear(): void {
    this.typewriter = null;
    this.parsed = null;
    this.speakerText.text = '';
    this.indicator.visible = false;
    this.clearBodyTexts();
    this.hide();
  }

  public isBusy(): boolean {
    return this.typewriter !== null && !this.typewriter.isComplete;
  }

  public get currentText(): string {
    return this.bodyTexts.map((text) => text.text).join('');
  }

  private bodyTextStyle(): TextStyleOptions {
    return {
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      fill: this.opts.textColor,
      wordWrap: false,
    };
  }

  private get bodyWidth(): number {
    return this.opts.width - this.opts.padding * 2;
  }

  private get textTop(): number {
    return this.opts.padding * 2 + Math.round(this.opts.fontSize * 1.2);
  }

  private measureText(text: string, style: TextStyle): number {
    this.scratchText.style = {
      ...this.bodyTextStyle(),
      fontSize: style.size ?? this.opts.fontSize,
      ...(style.bold ? { fontWeight: 'bold' as const } : {}),
      ...(style.italic ? { fontStyle: 'italic' as const } : {}),
    };
    this.scratchText.text = text;
    return this.scratchText.width;
  }

  private relayout(): void {
    if (!this.parsed || !this.typewriter) {
      return;
    }
    const items = computeTextLayout(
      this.parsed,
      this.typewriter.revealed,
      { width: this.bodyWidth, lineHeight: this.opts.lineHeight },
      (text, style) => this.measureText(text, style),
    );
    this.renderItems(items);
  }

  private renderItems(items: TextLayoutItem[]): void {
    while (this.bodyTexts.length < items.length) {
      const text = new Text({ text: '', style: this.bodyTextStyle() });
      this.addChild(text);
      this.bodyTexts.push(text);
    }
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const text = this.bodyTexts[i];
      if (text.text !== item.text) {
        text.text = item.text;
      }
      text.x = this.opts.padding + item.x;
      text.y = this.textTop + item.y;
      text.visible = true;
    }
    for (let i = items.length; i < this.bodyTexts.length; i += 1) {
      const text = this.bodyTexts[i];
      if (text.text !== '') {
        text.text = '';
      }
      text.visible = false;
    }
  }

  private clearBodyTexts(): void {
    for (const text of this.bodyTexts) {
      text.text = '';
      text.visible = false;
    }
  }
}
