import { Container, Text } from 'pixi.js';
import type { DialogueEntry } from '@/types/engine';
import { PagePanel } from './PagePanel';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createPanelBox } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';
import { parseRichText } from './richtext';

export interface HistoryViewOptions {
  width: number;
  height: number;
  getEntries?: () => readonly DialogueEntry[];
  title?: string;
  fontSize?: number;
  lineHeight?: number;
  padding?: number;
  panelColor?: number;
  textColor?: number;
  /** 点击右下角返回；缺省隐藏自身 */
  onClose?: () => void;
  theme?: DeepPartial<UITheme>;
}

interface ResolvedOptions {
  width: number;
  height: number;
  getEntries?: () => readonly DialogueEntry[];
  title: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  panelColor?: number;
  textColor: number;
}

interface HistoryCard {
  node: Container;
  height: number;
  /** 角色名与台词拼成的一行，供测试/调试读取 */
  text: string;
}

export class HistoryView extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly page: PagePanel;
  private readonly scroll: ScrollView;
  private scrollWidth: number;
  private readonly historyCards: HistoryCard[] = [];

  constructor(options: HistoryViewOptions) {
    super({ id: 'history-view' });
    this.theme = resolveTheme(options.theme);
    const fontSize = options.fontSize ?? this.theme.typography.sizes.lg;
    this.opts = {
      width: options.width,
      height: options.height,
      getEntries: options.getEntries,
      title: options.title ?? '对话历史',
      fontSize,
      lineHeight:
        options.lineHeight ??
        Math.round(fontSize * this.theme.typography.lineHeights.relaxed),
      padding: options.padding ?? this.theme.spacing.s24,
      panelColor: options.panelColor,
      textColor: options.textColor ?? this.theme.colors.textPrimary,
    };

    this.page = new PagePanel({
      width: this.opts.width,
      height: this.opts.height,
      title: this.opts.title,
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onBack: this.hideOnClose(options.onClose),
      theme: this.theme,
    });
    this.addChild(this.page);

    this.scrollWidth = this.page.contentWidth;
    this.scroll = new ScrollView({
      width: this.scrollWidth,
      height: this.page.contentHeight,
      step: this.theme.sizes.scrollStep,
    });
    this.scroll.x = 0;
    this.scroll.y = 0;
    this.page.content.addChild(this.scroll);

    this.hide();
  }

  public override show(): void {
    this.rebuild();
    super.show();
  }

  /** 视口变化时重排页面与滚动区；可见时按新宽度重建卡片 */
  public resize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.page.relayout(width, height);
    this.scrollWidth = this.page.contentWidth;
    this.scroll.resize(this.scrollWidth, this.page.contentHeight);
    if (this.visible) {
      this.rebuild();
    }
  }

  private rebuild(): void {
    const entries = this.opts.getEntries?.() ?? [];
    this.clearCards();

    if (entries.length === 0) {
      this.addCard('', '（暂无对话记录）', this.theme.colors.textMuted);
    } else {
      for (const entry of entries) {
        // 记录里存的是原始文本，历史视图走与对话框同一套解析，剥掉富文本标记；
        // 非法富文本不应阻止历史面板打开，此时退回原始文本
        let plain: string;
        try {
          plain = parseRichText(entry.text).plain;
        } catch {
          plain = entry.text;
        }
        this.addCard(entry.speaker, plain, this.opts.textColor);
      }
    }

    const total = this.historyCards.reduce(
      (sum, card) => sum + card.height + this.theme.spacing.s8,
      0,
    );
    this.scroll.setContentHeight(total);
    this.scroll.setScroll(this.scroll.maxScroll);
  }

  private addCard(speaker: string, text: string, color: number): void {
    const width = this.scrollWidth;
    const pad = this.theme.spacing.s16;
    const card = new Container();

    const body = new Text({
      text,
      style: {
        fontFamily: this.theme.typography.fontFamilyBody,
        fontSize: this.opts.fontSize,
        fill: color,
        wordWrap: true,
        wordWrapWidth: Math.max(width - pad * 2, 1),
        lineHeight: this.opts.lineHeight,
      },
    });

    let y = pad;
    let rowText = text;
    if (speaker.length > 0) {
      const speakerText = new Text({
        text: speaker,
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize: this.theme.typography.sizes.md,
          fontWeight: this.theme.typography.weights.semibold,
          fill: this.theme.colors.accent,
        },
      });
      speakerText.x = pad;
      speakerText.y = y;
      card.addChild(speakerText);
      y += speakerText.height + this.theme.spacing.s8;
      rowText = `${speaker}：${text}`;
    }

    body.x = pad;
    body.y = y;
    const height = y + body.height + pad;

    const bg = createPanelBox(width, height, {
      theme: this.theme,
      alpha: 0.72,
    });
    card.addChildAt(bg, 0);
    card.addChild(body);
    card.y = this.historyCards.reduce(
      (sum, item) => sum + item.height + this.theme.spacing.s8,
      0,
    );

    this.historyCards.push({ node: card, height, text: rowText });
    this.scroll.content.addChild(card);
  }

  private clearCards(): void {
    for (const card of this.historyCards) {
      card.node.destroy();
    }
    this.historyCards.length = 0;
  }

  get rowCount(): number {
    return this.historyCards.length;
  }

  /** 测试/调试用：当前渲染的文本行 */
  get rowTexts(): string[] {
    return this.historyCards.map((card) => card.text);
  }
}

export default HistoryView;
