import { Container, Text } from 'pixi.js';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton, createPanelBox } from './overlay';

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

const BUTTON_HEIGHT = 64;
const GAP = 12;

export class SaveLoadMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly title: Text;
  private readonly scroll: ScrollView;
  private readonly contentWidth: number;
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
      columns: Math.max(options.columns ?? 2, 1),
      fontSize: options.fontSize ?? 22,
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
    this.title = new Text({
      text: '',
      style: { fontSize: 26, fill: this.opts.textColor },
    });
    this.title.x = boxX + padding;
    this.title.y = boxY + padding;
    this.addChild(this.title);

    const closeHeight = 44;
    const scrollTop = boxY + padding + this.title.height + padding / 2;
    const scrollHeight =
      boxY + boxHeight - padding - closeHeight - padding - scrollTop;
    this.contentWidth = boxWidth - padding * 2;
    this.scroll = new ScrollView({
      width: this.contentWidth,
      height: scrollHeight,
    });
    this.scroll.x = boxX + padding;
    this.scroll.y = scrollTop;
    this.addChild(this.scroll);

    const close = createButton({
      width: 120,
      height: closeHeight,
      label: '关闭',
      fontSize: this.opts.fontSize,
      onTap: () => this.hide(),
    });
    close.x = boxX + (boxWidth - 120) / 2;
    close.y = boxY + boxHeight - padding - closeHeight;
    this.addChild(close);

    this.hide();
  }

  public get mode(): SaveLoadMode {
    return this.currentMode;
  }

  /** 打开菜单；未知模式按 'load' 处理 */
  public show(mode: SaveLoadMode): void {
    this.currentMode = mode === 'save' ? 'save' : 'load';
    this.title.text = this.currentMode === 'save' ? '保存进度' : '读取进度';
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
        style: { fontSize: this.opts.fontSize, fill: this.opts.textColor },
      });
      this.scroll.content.addChild(empty);
      this.scroll.setContentHeight(empty.height);
      return;
    }

    const columns = Math.min(this.opts.columns, slots.length);
    const cellWidth = (this.contentWidth - GAP * (columns - 1)) / columns;
    for (let index = 0; index < slots.length; index += 1) {
      const info = slots[index];
      const button = createButton({
        width: cellWidth,
        height: BUTTON_HEIGHT,
        label: this.labelFor(info),
        fontSize: this.opts.fontSize,
        onTap: () => this.select(info.slot),
      });
      button.x = (index % columns) * (cellWidth + GAP);
      button.y = Math.floor(index / columns) * (BUTTON_HEIGHT + GAP);
      this.slotButtons.push(button);
      this.scroll.content.addChild(button);
    }

    const rows = Math.ceil(slots.length / columns);
    this.scroll.setContentHeight(rows * (BUTTON_HEIGHT + GAP));
  }

  private labelFor(info: SaveSlotInfo): string {
    const slotTitle = `存档 ${info.slot + 1}`;
    const suffix = info.label ? `  ${info.label}` : '  空';
    return `${slotTitle}${suffix}`;
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

export default SaveLoadMenu;
