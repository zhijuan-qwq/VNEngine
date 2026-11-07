import { Container, Text } from 'pixi.js';
import { ModalPanel } from './ModalPanel';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { createButton } from './overlay';
import type { UIButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

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
  theme?: DeepPartial<UITheme>;
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
  panelColor?: number;
  textColor: number;
}

export class SaveLoadMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly modal: ModalPanel;
  private readonly scroll: ScrollView;
  private readonly contentWidth: number;
  private slotButtons: Container[] = [];
  private currentMode: SaveLoadMode = 'load';

  constructor(options: SaveLoadMenuOptions) {
    super({ id: 'save-load-menu' });
    this.theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height,
      slots: options.slots ?? [],
      getSlots: options.getSlots,
      onSave: options.onSave,
      onLoad: options.onLoad,
      columns: Math.max(options.columns ?? 2, 1),
      fontSize: options.fontSize ?? this.theme.typography.sizes.md,
      padding: options.padding ?? this.theme.spacing.s24,
      panelColor: options.panelColor,
      textColor: options.textColor ?? this.theme.colors.textPrimary,
    };

    this.modal = new ModalPanel({
      width: this.opts.width,
      height: this.opts.height,
      boxWidthRatio: this.theme.sizes.modalWidthRatio,
      boxHeightRatio: this.theme.sizes.modalHeightRatio,
      title: '',
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onClose: () => this.hide(),
      theme: this.theme,
    });
    this.addChild(this.modal);

    this.contentWidth = this.modal.contentWidth;
    this.scroll = new ScrollView({
      width: this.contentWidth,
      height: this.modal.contentHeight,
      step: this.theme.sizes.scrollStep,
    });
    this.scroll.x = 0;
    this.scroll.y = 0;
    this.modal.content.addChild(this.scroll);

    this.hide();
  }

  public get mode(): SaveLoadMode {
    return this.currentMode;
  }

  /** 打开菜单；未知模式按 'load' 处理 */
  public show(mode: SaveLoadMode): void {
    this.currentMode = mode === 'save' ? 'save' : 'load';
    this.modal.setTitle(this.currentMode === 'save' ? '保存进度' : '读取进度');
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
    const slots: readonly SaveSlotInfo[] =
      this.opts.getSlots?.() ?? this.opts.slots.map((slot) => ({ slot }));

    if (slots.length === 0) {
      const empty = new Text({
        text: '（无可用存档槽）',
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize: this.opts.fontSize,
          fill: this.theme.colors.textMuted,
        },
      });
      this.scroll.content.addChild(empty);
      this.scroll.setContentHeight(empty.height);
      return;
    }

    const columns = Math.min(this.opts.columns, slots.length);
    const gap = this.theme.sizes.slotGap;
    const cellWidth = (this.contentWidth - gap * (columns - 1)) / columns;
    const cellHeight = this.theme.sizes.slotHeight;
    for (let index = 0; index < slots.length; index += 1) {
      const info = slots[index];
      // 读档模式下空槽不可用：没有存档可恢复，点了只会触发一次注定失败的读取
      const disabled =
        this.currentMode === 'load' && info.timestamp === undefined;
      const button: UIButton = createButton({
        width: cellWidth,
        height: cellHeight,
        label: this.clipText(
          this.labelFor(info),
          cellWidth - this.theme.spacing.s16 - this.theme.spacing.s8,
          this.opts.fontSize,
        ),
        fontSize: this.opts.fontSize,
        variant: 'secondary',
        align: 'left',
        disabled,
        theme: this.theme,
        onTap: disabled ? undefined : () => this.select(info.slot),
      });
      button.x = (index % columns) * (cellWidth + gap);
      button.y = Math.floor(index / columns) * (cellHeight + gap);
      this.slotButtons.push(button);
      this.scroll.content.addChild(button);
    }

    const rows = Math.ceil(slots.length / columns);
    this.scroll.setContentHeight(rows * (cellHeight + gap));
  }

  private labelFor(info: SaveSlotInfo): string {
    const slotTitle = `存档 ${info.slot + 1}`;
    const suffix = info.label ? `  ${info.label}` : '  空';
    return `${slotTitle}${suffix}`;
  }

  /** 超宽文本截断加省略号，避免摘要溢出槽位卡 */
  private clipText(text: string, maxWidth: number, fontSize: number): string {
    const measure = new Text({
      text,
      style: {
        fontSize,
        fontFamily: this.theme.typography.fontFamilyBody,
      },
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

export default SaveLoadMenu;
