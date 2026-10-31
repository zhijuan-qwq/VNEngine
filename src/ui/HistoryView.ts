import { Text } from 'pixi.js';
import type { DialogueEntry } from '@/types/engine';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createFullscreenPanel, createPanelHeader } from './overlay';
import { THEME } from './theme';
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
}

interface ResolvedOptions {
  width: number;
  height: number;
  getEntries?: () => readonly DialogueEntry[];
  title: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  panelColor: number;
  textColor: number;
}

/** 每条记录两行式：金色说话人小字 + 暖白正文 */
interface HistoryRow {
  speaker: Text | null;
  body: Text;
}

const ENTRY_GAP = 18;
/** 整页文本列的最大宽度（全屏界面下保证长行可读） */
const TEXT_MAX_WIDTH = 1040;
const PAGE_TOP = 28;

export class HistoryView extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly scroll: ScrollView;
  private readonly scrollWidth: number;
  private rows: HistoryRow[] = [];

  constructor(options: HistoryViewOptions) {
    super({ id: 'history-view' });
    this.opts = {
      width: options.width,
      height: options.height,
      getEntries: options.getEntries,
      title: options.title ?? '对话历史',
      fontSize: options.fontSize ?? 22,
      lineHeight: options.lineHeight ?? 34,
      padding: options.padding ?? 48,
      panelColor: options.panelColor ?? THEME.panel,
      textColor: options.textColor ?? THEME.text,
    };

    // 独占全屏：整页底色即界面，不透出底下画面
    this.addChild(
      createFullscreenPanel(this.opts.width, this.opts.height, {
        color: this.opts.panelColor,
      }),
    );

    const padding = this.opts.padding;
    const pageWidth = this.opts.width - padding * 2;
    const header = createPanelHeader({
      title: this.opts.title,
      width: pageWidth,
      onClose: () => this.hide(),
    });
    header.root.x = padding;
    header.root.y = PAGE_TOP;
    this.addChild(header.root);

    const scrollTop = PAGE_TOP + header.height + 20;
    const scrollHeight = this.opts.height - scrollTop - padding;
    this.scrollWidth = Math.min(pageWidth, TEXT_MAX_WIDTH);
    this.scroll = new ScrollView({
      width: pageWidth,
      height: scrollHeight,
    });
    this.scroll.x = padding;
    this.scroll.y = scrollTop;
    this.addChild(this.scroll);

    this.hide();
  }

  public override show(): void {
    this.rebuild();
    super.show();
  }

  private rebuild(): void {
    const entries = this.opts.getEntries?.() ?? [];
    this.clearRows();

    if (entries.length === 0) {
      this.addRow(null, '（暂无对话记录）');
    } else {
      for (const entry of entries) {
        // 记录里存的是原始文本，历史视图走与对话框同一套解析，剥掉富文本标记
        this.addRow(
          entry.speaker.length > 0 ? entry.speaker : null,
          parseRichText(entry.text).plain,
        );
      }
    }

    let total = 0;
    for (const row of this.rows) {
      total +=
        (row.speaker ? row.speaker.height + 6 : 0) +
        row.body.height +
        ENTRY_GAP;
    }
    this.scroll.setContentHeight(total);
    this.scroll.setScroll(this.scroll.maxScroll);
  }

  private addRow(speaker: string | null, body: string): void {
    let y = 0;
    for (const row of this.rows) {
      y +=
        (row.speaker ? row.speaker.height + 6 : 0) +
        row.body.height +
        ENTRY_GAP;
    }

    let speakerText: Text | null = null;
    if (speaker) {
      speakerText = new Text({
        text: speaker,
        style: {
          fontSize: 20,
          fontFamily: THEME.fontFamily,
          fill: THEME.accent,
          fontWeight: 'bold',
        },
      });
      speakerText.x = 0;
      speakerText.y = y;
      this.scroll.content.addChild(speakerText);
    }

    const bodyText = new Text({
      text: body,
      style: {
        fontSize: this.opts.fontSize,
        fontFamily: THEME.fontFamily,
        fill: this.opts.textColor,
        wordWrap: true,
        wordWrapWidth: Math.max(this.scrollWidth, 1),
        lineHeight: this.opts.lineHeight,
      },
    });
    bodyText.x = 0;
    bodyText.y = y + (speakerText ? speakerText.height + 6 : 0);
    this.scroll.content.addChild(bodyText);

    this.rows.push({ speaker: speakerText, body: bodyText });
  }

  private clearRows(): void {
    for (const row of this.rows) {
      row.speaker?.destroy();
      row.body.destroy();
    }
    this.rows = [];
  }

  get rowCount(): number {
    return this.rows.length;
  }

  /** 测试/调试用：当前渲染的正文文本 */
  get rowTexts(): string[] {
    return this.rows.map((row) => row.body.text);
  }

  /** 测试/调试用：与 rowTexts 对齐的说话人名（无名人配 null） */
  get rowSpeakers(): (string | null)[] {
    return this.rows.map((row) => (row.speaker ? row.speaker.text : null));
  }
}

export default HistoryView;
