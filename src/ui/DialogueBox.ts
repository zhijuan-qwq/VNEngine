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
  /** 显式底色时绘制实心面板；否则绘制透明到底部的渐变 */
  flatBackground: boolean;
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
  /** 全量布局的行数，用于逐字显示时保持文本块高度稳定 */
  private lineCount = 1;
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
      // 缺省为字幕渐变；显式底色才画实心面板
      backgroundAlpha:
        options.backgroundAlpha ??
        (options.backgroundColor !== undefined
          ? 1
          : this.theme.colors.surfaceDialogueAlpha),
      flatBackground: options.backgroundColor !== undefined,
      padding: options.padding ?? this.theme.spacing.s16,
      eventBus: options.eventBus,
      resolveVar: options.resolveVar,
    };
    this.fontSize = options.fontSize ?? this.theme.typography.sizes.base;
    this.lineHeight =
      options.lineHeight ??
      Math.round(this.fontSize * this.theme.typography.lineHeights.relaxed);
    this.defaultSpeed = options.defaultSpeed ?? 40;

    this.x = this.opts.x;
    this.y = this.opts.y;

    this.bg = new Graphics();
    this.drawBackdrop();
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
    this.recomputeLineCount();
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

  /** 渐变分片数；足够多时肉眼不可见色带，且无需依赖 DOM 的 FillGradient */
  private static readonly BACKDROP_STEPS = 32;

  private drawBackdrop(): void {
    if (this.opts.backgroundAlpha <= 0) {
      return;
    }
    if (this.opts.flatBackground) {
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
      return;
    }
    // 顶部全透明，向下过渡到半透明深色，保证字幕在明亮背景上可读
    const steps = DialogueBox.BACKDROP_STEPS;
    const sliceHeight = this.opts.height / steps;
    for (let i = 0; i < steps; i += 1) {
      const alpha = (this.opts.backgroundAlpha * (i + 1)) / steps;
      this.bg.rect(0, i * sliceHeight, this.opts.width, sliceHeight + 0.5);
      this.bg.fill({ color: this.opts.backgroundColor, alpha });
    }
  }

  /** 用完整文本布局推算行数；逐字显示时文本块高度保持稳定 */
  private recomputeLineCount(): void {
    if (!this.parsed) {
      this.lineCount = 1;
      return;
    }
    const items = computeTextLayout(
      this.parsed,
      this.parsed.plain.length,
      { width: this.bodyWidth, lineHeight: this.lineHeight },
      (text, style) => this.measureText(text, style),
    );
    let count = 0;
    for (const item of items) {
      count = Math.max(count, Math.round(item.y / this.lineHeight) + 1);
    }
    this.lineCount = Math.max(count, 1);
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
    this.recomputeLineCount();
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

    // 字幕：左对齐并保留小边距，文本块底对齐到画面下方（避开右下快捷栏）
    const blockHeight = this.lineCount * this.lineHeight;
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
      this.speakerText.x = this.opts.padding;
      this.speakerText.y = bodyTop - speakerGap - speakerHeight;
    }

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const text = this.bodyTexts[i];
      if (text.text !== item.text) {
        text.text = item.text;
      }
      text.x = this.opts.padding + item.x;
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
