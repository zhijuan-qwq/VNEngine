import { Text } from 'pixi.js';
import type { DialogueEntry } from '@/types/engine';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton, createPanelBox } from './overlay';

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

export class HistoryView extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly scroll: ScrollView;
  private readonly scrollWidth: number;
  private readonly rows: Text[] = [];

  constructor(options: HistoryViewOptions) {
    super({ id: 'history-view' });
    this.opts = {
      width: options.width,
      height: options.height,
      getEntries: options.getEntries,
      title: options.title ?? '对话历史',
      fontSize: options.fontSize ?? 22,
      lineHeight: options.lineHeight ?? 32,
      padding: options.padding ?? 24,
      panelColor: options.panelColor ?? 0x222222,
      textColor: options.textColor ?? 0xffffff,
    };

    this.addChild(createBackdrop(this.opts.width, this.opts.height));

    const boxWidth = this.opts.width * 0.8;
    const boxHeight = this.opts.height * 0.8;
    const boxX = (this.opts.width - boxWidth) / 2;
    const boxY = (this.opts.height - boxHeight) / 2;
    const box = createPanelBox(boxWidth, boxHeight, {
      color: this.opts.panelColor,
    });
    box.x = boxX;
    box.y = boxY;
    this.addChild(box);

    const padding = this.opts.padding;
    const title = new Text({
      text: this.opts.title,
      style: { fontSize: 26, fill: this.opts.textColor },
    });
    title.x = boxX + padding;
    title.y = boxY + padding;
    this.addChild(title);

    const buttonHeight = 44;
    const scrollTop = boxY + padding + title.height + padding / 2;
    const scrollHeight =
      boxY + boxHeight - padding - buttonHeight - padding - scrollTop;
    this.scrollWidth = boxWidth - padding * 2;
    this.scroll = new ScrollView({
      width: this.scrollWidth,
      height: scrollHeight,
    });
    this.scroll.x = boxX + padding;
    this.scroll.y = scrollTop;
    this.addChild(this.scroll);

    const close = createButton({
      width: 120,
      height: buttonHeight,
      label: '关闭',
      fontSize: this.opts.fontSize,
      onTap: () => this.hide(),
    });
    close.x = boxX + (boxWidth - 120) / 2;
    close.y = boxY + boxHeight - padding - buttonHeight;
    this.addChild(close);

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
      this.addRow('（暂无对话记录）', width);
    } else {
      for (const entry of entries) {
        const prefix = entry.speaker.length > 0 ? `${entry.speaker}：` : '';
        this.addRow(`${prefix}${entry.text}`, width);
      }
    }

    const total = this.rows.reduce((sum, row) => sum + row.height + 8, 0);
    this.scroll.setContentHeight(total);
    this.scroll.setScroll(this.scroll.maxScroll);
  }

  private addRow(text: string, width: number): void {
    const row = new Text({
      text,
      style: {
        fontSize: this.opts.fontSize,
        fill: this.opts.textColor,
        wordWrap: true,
        wordWrapWidth: Math.max(width, 1),
        lineHeight: this.opts.lineHeight,
      },
    });
    row.y = this.rows.reduce((sum, item) => sum + item.height + 8, 0);
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
