import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createFullscreenPanel, createPanelHeader } from './overlay';
import { THEME } from './theme';

export type SaveLoadMode = 'save' | 'load';

export interface SaveSlotInfo {
  slot: number;
  label?: string;
  timestamp?: number;
}

export interface SaveLoadMenuOptions {
  width: number;
  height: number;
  /** 槽位编号列表（与 getSlots 二选一，getSlots 优先） */
  slots?: number[];
  /** 槽位元数据提供方；缺省时由 slots 生成空槽 */
  getSlots?: () => readonly SaveSlotInfo[];
  onSave?: (slot: number) => void;
  onLoad?: (slot: number) => void;
  columns?: number;
  fontSize?: number;
  padding?: number;
  panelColor?: number;
  textColor?: number;
}

interface ResolvedOptions {
  width: number;
  height: number;
  slots: number[];
  getSlots?: () => readonly SaveSlotInfo[];
  onSave?: (slot: number) => void;
  onLoad?: (slot: number) => void;
  columns: number;
  fontSize: number;
  padding: number;
  panelColor: number;
  textColor: number;
}

const BUTTON_HEIGHT = 88;
const GAP = 16;
const PAGE_TOP = 28;

export class SaveLoadMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly scroll: ScrollView;
  private readonly contentWidth: number;
  private readonly headerTitle: Text;
  private slotButtons: Container[] = [];
  private currentMode: SaveLoadMode = 'load';

  constructor(options: SaveLoadMenuOptions) {
    super({ id: 'save-load-menu' });
    this.opts = {
      width: options.width,
      height: options.height,
      slots: options.slots ?? [],
      getSlots: options.getSlots,
      onSave: options.onSave,
      onLoad: options.onLoad,
      columns: Math.max(options.columns ?? 4, 1),
      fontSize: options.fontSize ?? 22,
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
    const contentWidth = this.opts.width - padding * 2;
    this.contentWidth = contentWidth;
    const header = createPanelHeader({
      title: '',
      width: contentWidth,
      onClose: () => this.hide(),
    });
    header.root.x = padding;
    header.root.y = PAGE_TOP;
    this.addChild(header.root);
    this.headerTitle = header.title;

    const scrollTop = PAGE_TOP + header.height + 20;
    const scrollHeight = this.opts.height - scrollTop - padding;
    this.scroll = new ScrollView({
      width: contentWidth,
      height: scrollHeight,
    });
    this.scroll.x = padding;
    this.scroll.y = scrollTop;
    this.addChild(this.scroll);

    this.hide();
  }

  public get mode(): SaveLoadMode {
    return this.currentMode;
  }

  /** 打开菜单；未知模式按 'load' 处理 */
  public show(mode: SaveLoadMode): void {
    this.currentMode = mode === 'save' ? 'save' : 'load';
    this.headerTitle.text =
      this.currentMode === 'save' ? '保存进度' : '读取进度';
    this.rebuild();
    super.show();
  }

  public override hide(): void {
    this.clearButtons();
    super.hide();
  }

  get buttons(): Container[] {
    return this.slotButtons;
  }

  private rebuild(): void {
    this.clearButtons();
    const slots =
      this.opts.getSlots?.() ?? this.opts.slots.map((slot) => ({ slot }));

    if (slots.length === 0) {
      const empty = new Text({
        text: '（无可用存档槽）',
        style: {
          fontSize: this.opts.fontSize,
          fontFamily: THEME.fontFamily,
          fill: this.opts.textColor,
        },
      });
      this.scroll.content.addChild(empty);
      this.scroll.setContentHeight(empty.height);
      return;
    }

    const columns = Math.min(this.opts.columns, slots.length);
    const cellWidth = (this.contentWidth - GAP * (columns - 1)) / columns;
    for (let index = 0; index < slots.length; index += 1) {
      const info = slots[index];
      const button = this.createSlotButton(info, cellWidth);
      button.x = (index % columns) * (cellWidth + GAP);
      button.y = Math.floor(index / columns) * (BUTTON_HEIGHT + GAP);
      this.slotButtons.push(button);
      this.scroll.content.addChild(button);
    }

    const rows = Math.ceil(slots.length / columns);
    this.scroll.setContentHeight(rows * (BUTTON_HEIGHT + GAP));
  }

  /** 槽位卡：首行「存档 N + 时间」，次行摘要；读档模式下空槽禁用 */
  private createSlotButton(info: SaveSlotInfo, cellWidth: number): Container {
    const button = new Container();
    button.eventMode = 'static';
    button.hitArea = new Rectangle(0, 0, cellWidth, BUTTON_HEIGHT);

    const occupied = info.timestamp !== undefined;
    // BUG-006：读档模式下空槽不可点，避免触发一次注定失败的恢复
    const disabled = this.currentMode === 'load' && !occupied;

    const bg = new Graphics();
    const drawBg = (hover: boolean): void => {
      bg.clear();
      bg.roundRect(0, 0, cellWidth, BUTTON_HEIGHT, 12);
      if (disabled) {
        bg.fill(THEME.panel, 0.5);
        bg.stroke({ color: THEME.border, width: 1, alpha: 0.4 });
        return;
      }
      if (hover) {
        bg.fill(THEME.accent, 0.14);
        bg.stroke({ color: THEME.accent, width: 2 });
      } else {
        bg.fill(THEME.panelSoft, 0.9);
        bg.stroke({ color: THEME.border, width: 1.5 });
      }
    };
    drawBg(false);
    button.addChild(bg);

    const title = new Text({
      text: `存档 ${info.slot + 1}`,
      style: {
        fontSize: 20,
        fontFamily: THEME.fontFamily,
        fill: THEME.accent,
        fontWeight: 'bold',
      },
    });
    title.x = 18;
    title.y = 16;
    button.addChild(title);

    if (occupied) {
      const ts = new Text({
        text: formatTimestamp(info.timestamp as number),
        style: {
          fontSize: 14,
          fontFamily: THEME.fontFamily,
          fill: THEME.textDim,
        },
      });
      ts.x = cellWidth - 18 - ts.width;
      ts.y = 20;
      button.addChild(ts);
    }

    const detail = occupied
      ? info.label || '已保存'
      : this.currentMode === 'save'
        ? '空槽 · 点击保存'
        : '空槽';
    const detailText = new Text({
      text: this.clipText(detail, cellWidth - 36, 18),
      style: {
        fontSize: 18,
        fontFamily: THEME.fontFamily,
        fill: THEME.textDim,
      },
    });
    detailText.x = 18;
    detailText.y = 50;
    button.addChild(detailText);

    if (disabled) {
      button.alpha = 0.45;
      button.cursor = 'default';
    } else {
      button.cursor = 'pointer';
      button.on('pointerover', () => drawBg(true));
      button.on('pointerout', () => drawBg(false));
      button.on('pointertap', (event: FederatedPointerEvent) => {
        event.stopPropagation();
        this.select(info.slot);
      });
    }

    return button;
  }

  /** 超宽文本截断加省略号，避免摘要溢出槽位卡 */
  private clipText(text: string, maxWidth: number, fontSize: number): string {
    const measure = new Text({
      text,
      style: { fontSize, fontFamily: THEME.fontFamily },
    });
    if (measure.width <= maxWidth) {
      measure.destroy();
      return text;
    }
    let cut = text.length - 1;
    while (cut > 1) {
      measure.text = `${text.slice(0, cut)}…`;
      if (measure.width <= maxWidth) break;
      cut -= 1;
    }
    measure.destroy();
    return `${text.slice(0, cut)}…`;
  }

  private select(slot: number): void {
    if (this.currentMode === 'save') {
      this.opts.onSave?.(slot);
    } else {
      this.opts.onLoad?.(slot);
    }
    this.hide();
  }

  private clearButtons(): void {
    for (const child of this.scroll.content.children.slice()) {
      child.removeAllListeners();
      child.destroy();
    }
    this.slotButtons = [];
  }
}

/** 存档时间 → `YYYY-MM-DD HH:MM`（本地时区） */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${datePart} ${timePart}`;
}

export default SaveLoadMenu;
