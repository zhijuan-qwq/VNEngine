import { Text } from 'pixi.js';
import type { DialogueEntry } from '@/types/engine';
import { ModalPanel } from './ModalPanel';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
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

export class HistoryView extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly modal: ModalPanel;
  private readonly scroll: ScrollView;
  private readonly scrollWidth: number;
  private readonly rows: Text[] = [];

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

    this.modal = new ModalPanel({
      width: this.opts.width,
      height: this.opts.height,
      boxWidthRatio: this.theme.sizes.modalWidthRatio,
      boxHeightRatio: this.theme.sizes.modalHeightRatio,
      title: this.opts.title,
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onClose: () => this.hide(),
      theme: this.theme,
    });
    this.addChild(this.modal);

    this.scrollWidth = this.modal.contentWidth;
    this.scroll = new ScrollView({
      width: this.scrollWidth,
      height: this.modal.contentHeight,
      step: this.theme.sizes.scrollStep,
    });
    this.scroll.x = 0;
    this.scroll.y = 0;
    this.modal.content.addChild(this.scroll);

    this.hide();
  }

  public override show(): void {
    this.rebuild();
    super.show();
  }

  private rebuild(): void {
    const entries = this.opts.getEntries?.() ?? [];
    this.clearRows();

    const width = this.scrollWidth;
    if (entries.length === 0) {
      this.addRow('（暂无对话记录）', width, this.theme.colors.textMuted);
    } else {
      for (const entry of entries) {
        const prefix = entry.speaker.length > 0 ? `${entry.speaker}：` : '';
        // 记录里存的是原始文本，历史视图走与对话框同一套解析，剥掉富文本标记
        this.addRow(
          `${prefix}${parseRichText(entry.text).plain}`,
          width,
          this.opts.textColor,
        );
      }
    }

    const total = this.rows.reduce(
      (sum, row) => sum + row.height + this.theme.spacing.s8,
      0,
    );
    this.scroll.setContentHeight(total);
    this.scroll.setScroll(this.scroll.maxScroll);
  }

  private addRow(text: string, width: number, color: number): void {
    const row = new Text({
      text,
      style: {
        fontFamily: this.theme.typography.fontFamilyBody,
        fontSize: this.opts.fontSize,
        fill: color,
        wordWrap: true,
        wordWrapWidth: Math.max(width, 1),
        lineHeight: this.opts.lineHeight,
      },
    });
    row.y = this.rows.reduce(
      (sum, item) => sum + item.height + this.theme.spacing.s8,
      0,
    );
    this.rows.push(row);
    this.scroll.content.addChild(row);
  }

  private clearRows(): void {
    for (const row of this.rows) {
      row.destroy();
    }
    this.rows.length = 0;
  }

  get rowCount(): number {
    return this.rows.length;
  }

  /** 测试/调试用：当前渲染的文本行 */
  get rowTexts(): string[] {
    return this.rows.map((row) => row.text);
  }
}

export default HistoryView;
