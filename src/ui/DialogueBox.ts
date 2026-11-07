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
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface DialogueBoxOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string | string[];
  textColor?: number;
  speakerColor?: number;
  backgroundColor?: number;
  backgroundAlpha?: number;
  padding?: number;
  lineHeight?: number;
  defaultSpeed?: number;
  eventBus?: EventBus<EngineEvents>;
  resolveVar?: VarResolver;
  theme?: DeepPartial<UITheme>;
}

interface ResolvedOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  fontFamily: string | string[];
  speakerFontFamily: string | string[];
  textColor: number;
  speakerColor: number;
  backgroundColor: number;
  backgroundAlpha: number;
  padding: number;
  eventBus?: EventBus<EngineEvents>;
  resolveVar?: VarResolver;
}

export class DialogueBox extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly bg: Graphics;
  private readonly speakerText: Text;
  private readonly indicator: Text;
  private readonly scratchText: Text;
  private bodyTexts: Text[] = [];
  private parsed: ParsedText | null = null;
  private typewriter: TypewriterState | null = null;
  private lastRevealed = 0;
  /** 全量布局的每行宽度，用于逐字显示时保持行居中不抖动 */
  private lineWidths: number[] = [];
  /** 字号与行距可随 `game:settings` 变更，故为可变字段而非 options 快照 */
  private fontSize: number;
  private lineHeight: number;
  private defaultSpeed: number;

  constructor(options: DialogueBoxOptions) {
    super({ id: 'dialogue-box' });
    this.theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height,
      x: options.x ?? 0,
      y: options.y ?? 0,
      fontFamily: options.fontFamily ?? this.theme.typography.fontFamilyBody,
      speakerFontFamily: this.theme.typography.fontFamilyHeading,
      textColor: options.textColor ?? this.theme.colors.textPrimary,
      speakerColor: options.speakerColor ?? this.theme.colors.accent,
      backgroundColor:
        options.backgroundColor ?? this.theme.colors.surfaceDialogue,
      // 缺省无框字幕：只有显式传入背景色时才点亮面板底
      backgroundAlpha:
        options.backgroundAlpha ??
        (options.backgroundColor !== undefined ? 1 : 0),
      padding: options.padding ?? this.theme.spacing.s24,
      eventBus: options.eventBus,
      resolveVar: options.resolveVar,
    };
    this.fontSize = options.fontSize ?? 28;
    this.lineHeight =
      options.lineHeight ??
      Math.round(
        (options.fontSize ?? 28) * this.theme.typography.lineHeights.relaxed,
      );
    this.defaultSpeed = options.defaultSpeed ?? 40;

    this.x = this.opts.x;
    this.y = this.opts.y;

    this.bg = new Graphics();
    if (this.opts.backgroundAlpha > 0) {
      this.bg.roundRect(
        0,
        0,
        this.opts.width,
        this.opts.height,
        this.theme.radius.lg,
      );
      this.bg.fill(this.opts.backgroundColor, this.opts.backgroundAlpha);
      this.bg.stroke({
        width: this.theme.border.thin,
        color: this.theme.colors.borderSubtle,
        alpha: this.theme.colors.borderSubtleAlpha,
      });
    }
    this.addChild(this.bg);

    this.speakerText = new Text({
      text: '',
      style: {
        fontSize: this.fontSize,
        fontFamily: this.opts.speakerFontFamily,
        fontWeight: this.theme.typography.weights.semibold,
        fill: this.opts.speakerColor,
        dropShadow: this.textShadow(),
      },
    });
    this.speakerText.x = this.opts.padding;
    this.speakerText.y = this.opts.padding;
    this.addChild(this.speakerText);

    this.indicator = new Text({
      text: '▼',
      style: {
        fontSize: Math.round(this.fontSize * 0.8),
        fontFamily: this.opts.fontFamily,
        fill: this.theme.colors.infoLight,
        dropShadow: this.textShadow(),
      },
    });
    this.indicator.x =
      this.opts.width - this.opts.padding - Math.round(this.fontSize * 0.8);
    this.indicator.y =
      this.opts.height - this.opts.padding - Math.round(this.fontSize * 0.8);
    this.indicator.visible = false;
    this.addChild(this.indicator);

    this.scratchText = new Text({
      text: '',
      style: this.bodyTextStyle(),
    });

    if (this.opts.eventBus) {
      this.bind(this.opts.eventBus, 'input:skip', () => this.complete());
      this.bind(this.opts.eventBus, 'game:settings', (payload) =>
        this.applySetting(payload),
      );
    }

    this.hide();
  }

  public show(speaker: string, text: string, speed?: number): void {
    this.parsed = parseRichText(text, this.opts.resolveVar);
    this.typewriter = new TypewriterState({
      totalChars: this.parsed.plain.length,
      hints: this.parsed.hints,
      speed: speed ?? this.defaultSpeed,
    });
    this.speakerText.text = speaker;
    this.speakerText.visible = speaker.length > 0;
    this.indicator.visible = false;
    this.lastRevealed = 0;
    this.clearBodyTexts();
    this.visible = true;
    this.recomputeLineWidths();
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
      fontSize: this.fontSize,
      fontFamily: this.opts.fontFamily,
      fontWeight: this.theme.typography.weights.regular,
      fill: this.opts.textColor,
      wordWrap: false,
      dropShadow: this.textShadow(),
    };
  }

  private textShadow(): TextStyleOptions['dropShadow'] {
    return {
      color: this.theme.colors.textShadow,
      alpha: this.theme.colors.textShadowAlpha,
      blur: 4,
      distance: 2,
      angle: Math.PI / 2,
    };
  }

  private get bodyWidth(): number {
    return this.opts.width - this.opts.padding * 2;
  }

  /** 用完整文本布局推算每行宽度；逐字显示时按同一行宽居中，避免文字左右跳动 */
  private recomputeLineWidths(): void {
    if (!this.parsed) {
      this.lineWidths = [];
      return;
    }
    const items = computeTextLayout(
      this.parsed,
      this.parsed.plain.length,
      { width: this.bodyWidth, lineHeight: this.lineHeight },
      (text, style) => this.measureText(text, style),
    );
    const widths: number[] = [];
    for (const item of items) {
      const line = Math.round(item.y / this.lineHeight);
      const segment = this.parsed.segments[item.segmentIndex];
      const width = item.x + this.measureText(item.text, segment.style);
      widths[line] = Math.max(widths[line] ?? 0, width);
    }
    this.lineWidths = widths;
  }

  private measureText(text: string, style: TextStyle): number {
    this.scratchText.style = {
      ...this.bodyTextStyle(),
      fontSize: style.size ?? this.fontSize,
      ...(style.bold ? { fontWeight: 'bold' as const } : {}),
      ...(style.italic ? { fontStyle: 'italic' as const } : {}),
    };
    this.scratchText.text = text;
    return this.scratchText.width;
  }

  /** 应用 `game:settings` 变更：文字速度改默认打字速度，字号重设样式并重排 */
  private applySetting(payload: EngineEvents['game:settings']): void {
    if (payload.key === 'textSpeed') {
      if (typeof payload.value === 'number') this.defaultSpeed = payload.value;
      return;
    }
    if (payload.key === 'fontSize') {
      if (typeof payload.value !== 'number') return;
      this.fontSize = payload.value;
      this.lineHeight = Math.round(
        payload.value * this.theme.typography.lineHeights.relaxed,
      );
      this.applyFontSize();
    }
  }

  private applyFontSize(): void {
    this.speakerText.style = {
      fontSize: this.fontSize,
      fontFamily: this.opts.speakerFontFamily,
      fontWeight: this.theme.typography.weights.semibold,
      fill: this.opts.speakerColor,
      dropShadow: this.textShadow(),
    };
    const indicatorSize = Math.round(this.fontSize * 0.8);
    this.indicator.style = {
      fontSize: indicatorSize,
      fontFamily: this.opts.fontFamily,
      fill: this.theme.colors.infoLight,
      dropShadow: this.textShadow(),
    };
    this.indicator.x = this.opts.width - this.opts.padding - indicatorSize;
    this.indicator.y = this.opts.height - this.opts.padding - indicatorSize;
    this.scratchText.style = this.bodyTextStyle();
    for (const text of this.bodyTexts) {
      text.style = this.bodyTextStyle();
    }
    this.recomputeLineWidths();
    this.relayout();
  }

  private relayout(): void {
    if (!this.parsed || !this.typewriter) {
      return;
    }
    const items = computeTextLayout(
      this.parsed,
      this.typewriter.revealed,
      { width: this.bodyWidth, lineHeight: this.lineHeight },
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

    // 无框字幕：文本块底对齐到画面下方（避开右下快捷栏），逐行水平居中
    const lineCount = Math.max(this.lineWidths.length, 1);
    const blockHeight = lineCount * this.lineHeight;
    const bottom =
      this.opts.height -
      this.opts.padding -
      this.theme.sizes.dialogueBottomReserve;
    const speakerVisible = this.speakerText.text.length > 0;
    const speakerGap = this.theme.spacing.s8;
    const speakerHeight = this.speakerText.height;
    const minTop =
      this.opts.padding + (speakerVisible ? speakerHeight + speakerGap : 0);
    const bodyTop = Math.max(bottom - blockHeight, minTop);

    if (speakerVisible) {
      this.speakerText.x = (this.opts.width - this.speakerText.width) / 2;
      this.speakerText.y = bodyTop - speakerGap - speakerHeight;
    }

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const text = this.bodyTexts[i];
      if (text.text !== item.text) {
        text.text = item.text;
      }
      const line = Math.round(item.y / this.lineHeight);
      const lineWidth = this.lineWidths[line] ?? 0;
      text.x =
        this.opts.padding +
        Math.max(0, (this.bodyWidth - lineWidth) / 2) +
        item.x;
      text.y = bodyTop + item.y;
      text.visible = true;
    }

    const indicatorSize = Math.round(this.fontSize * 0.8);
    this.indicator.x = this.opts.width - this.opts.padding - indicatorSize;
    this.indicator.y = bodyTop + blockHeight - indicatorSize;
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
