import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { DestroyOptions, FederatedPointerEvent } from 'pixi.js';
import { PagePanel } from './PagePanel';
import { ScrollView } from './controls/ScrollView';
import { UIComponent } from './UIComponent';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';
import type { SaveSlotInfo } from '@/types/save';
import { isPositiveFinite } from './uiLayout';

export type SaveLoadMode = 'save' | 'load';

export interface SaveLoadMenuOptions {
  width: number;
  height: number;
  /** 槽位编号列表（与 getSlots 二选一，getSlots 优先） */
  slots?: number[];
  /** 槽位元数据提供方；缺省时由 slots 生成空槽 */
  getSlots?: () => readonly SaveSlotInfo[];
  /** thumbnail 由 UIManager 包装回调时注入，菜单自身只传槽位 */
  onSave?: (slot: number, thumbnail?: string) => void;
  onLoad?: (slot: number) => void;
  /** 点击右下角返回；缺省隐藏自身 */
  onClose?: () => void;
  /** 固定列数；缺省按内容宽度自适应 */
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
  /** thumbnail 由 UIManager 包装回调时注入，菜单自身只传槽位 */
  onSave?: (slot: number, thumbnail?: string) => void;
  onLoad?: (slot: number) => void;
  columns?: number;
  fontSize: number;
  padding: number;
  panelColor?: number;
  textColor: number;
}

const CARD_ASPECT = 9 / 16;

interface SlotCard {
  node: Container;
  /** 已存槽位的时间文案；空槽为 undefined */
  time?: string;
}

export class SaveLoadMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly page: PagePanel;
  private readonly scroll: ScrollView;
  private contentWidth: number;
  private slotCards: SlotCard[] = [];
  private readonly thumbnailImages = new Map<string, HTMLImageElement>();
  private readonly thumbnailTextures = new Map<string, Texture>();
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
      columns: options.columns,
      fontSize: options.fontSize ?? this.theme.typography.sizes.md,
      padding: options.padding ?? this.theme.spacing.s24,
      panelColor: options.panelColor,
      textColor: options.textColor ?? this.theme.colors.textPrimary,
    };

    this.page = new PagePanel({
      width: this.opts.width,
      height: this.opts.height,
      title: '读取进度',
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onBack: this.hideOnClose(options.onClose),
      theme: this.theme,
    });
    this.addChild(this.page);

    this.contentWidth = this.page.contentWidth;
    this.scroll = new ScrollView({
      width: this.contentWidth,
      height: this.page.contentHeight,
      step: this.theme.sizes.scrollStep,
    });
    this.scroll.x = 0;
    this.scroll.y = 0;
    this.page.content.addChild(this.scroll);

    this.hide();
  }

  public get mode(): SaveLoadMode {
    return this.currentMode;
  }

  /** 打开菜单；未知模式按 'load' 处理 */
  public show(mode: SaveLoadMode): void {
    this.currentMode = mode === 'save' ? 'save' : 'load';
    this.page.setTitle(this.currentMode === 'save' ? '保存进度' : '读取进度');
    this.rebuild();
    super.show();
  }

  /** 存档写入完成后刷新卡片（缩略图/时间） */
  public refresh(): void {
    if (this.visible) {
      this.rebuild();
    }
  }

  /** 视口变化时重排页面与滚动区；可见时按新宽度重建卡片 */
  public resize(width: number, height: number): void {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
      return;
    }
    this.opts.width = width;
    this.opts.height = height;
    this.page.relayout(width, height);
    this.contentWidth = this.page.contentWidth;
    this.scroll.resize(this.contentWidth, this.page.contentHeight);
    if (this.visible) {
      this.rebuild();
    }
  }

  public override hide(): void {
    this.clearCards();
    super.hide();
  }

  /** 测试/调试用：当前槽位卡片；返回新数组，避免调用方改动内部记录 */
  get buttons(): Container[] {
    return this.slotCards.map((card) => card.node);
  }

  /** 测试/调试用：当前渲染的时间标签 */
  get times(): string[] {
    return this.slotCards.flatMap((card) =>
      card.time === undefined ? [] : [card.time],
    );
  }

  private rebuild(): void {
    this.clearCards();
    const slots: readonly SaveSlotInfo[] =
      this.opts.getSlots?.() ?? this.opts.slots.map((slot) => ({ slot }));
    this.pruneThumbnailCache(slots);

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

    const gap = this.theme.sizes.slotGap;
    const columns = this.columnCount(slots.length);
    const cellWidth = (this.contentWidth - gap * (columns - 1)) / columns;
    const imageHeight = Math.round(cellWidth * CARD_ASPECT);
    const timeGap = this.theme.spacing.s8;
    const timeHeight = this.measureTimeHeight();
    const cellHeight = imageHeight + timeGap + timeHeight;
    for (let index = 0; index < slots.length; index += 1) {
      const info = slots[index];
      // 读档模式下空槽不可用：没有存档可恢复，点了只会触发一次注定失败的读取
      const disabled =
        this.currentMode === 'load' && info.timestamp === undefined;
      const time =
        info.timestamp === undefined
          ? undefined
          : this.formatTime(info.timestamp);
      const card = this.buildCard(
        info,
        cellWidth,
        imageHeight,
        timeGap,
        timeHeight,
        time,
        disabled,
      );
      card.x = (index % columns) * (cellWidth + gap);
      card.y = Math.floor(index / columns) * (cellHeight + gap);
      this.slotCards.push({ node: card, time });
      this.scroll.content.addChild(card);
    }

    const rows = Math.ceil(slots.length / columns);
    this.scroll.setContentHeight(rows * (cellHeight + gap));
  }

  private columnCount(count: number): number {
    if (this.opts.columns !== undefined) {
      return Math.max(1, Math.min(this.opts.columns, count));
    }
    const gap = this.theme.sizes.slotGap;
    const min = this.theme.sizes.slotMinWidth;
    return Math.max(
      1,
      Math.min(count, Math.floor((this.contentWidth + gap) / (min + gap))),
    );
  }

  private buildCard(
    info: SaveSlotInfo,
    width: number,
    imageHeight: number,
    timeGap: number,
    timeHeight: number,
    time: string | undefined,
    disabled: boolean,
  ): Container {
    const card = new Container();
    card.eventMode = 'static';
    card.hitArea = new Rectangle(
      0,
      0,
      width,
      imageHeight + timeGap + timeHeight,
    );

    const bg = new Graphics();
    bg.roundRect(0, 0, width, imageHeight, this.theme.radius.lg);
    bg.fill(this.theme.colors.surfaceButton, 0.92);
    card.addChild(bg);

    const occupied = time !== undefined;
    if (occupied && info.thumbnail) {
      this.attachThumbnail(card, info.thumbnail, width, imageHeight);
    }

    if (time !== undefined) {
      const label = new Text({
        text: time,
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize: this.theme.typography.sizes.sm,
          fill: this.theme.colors.textSecondary,
        },
      });
      label.x = (width - label.width) / 2;
      label.y = imageHeight + timeGap;
      card.addChild(label);
    } else {
      const empty = new Text({
        text: '空',
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize: this.theme.typography.sizes.lg,
          fill: this.theme.colors.textMuted,
        },
      });
      empty.x = (width - empty.width) / 2;
      empty.y = (imageHeight - empty.height) / 2;
      card.addChild(empty);
    }

    const border = new Graphics();
    const paintBorder = (hover: boolean): void => {
      border.clear();
      border.roundRect(0, 0, width, imageHeight, this.theme.radius.lg);
      border.stroke({
        width: this.theme.border.thin,
        color: hover
          ? this.theme.colors.accent
          : this.theme.colors.borderSubtle,
        alpha: hover ? 0.9 : this.theme.colors.borderSubtleAlpha,
      });
    };
    paintBorder(false);
    card.addChild(border);

    if (disabled) {
      card.alpha = this.theme.opacity.disabled;
      return card;
    }

    card.on('pointerover', () => paintBorder(true));
    card.on('pointerout', () => paintBorder(false));
    card.on('pointerdown', () => {
      card.alpha = this.theme.opacity.pressed;
    });
    card.on('pointerup', () => {
      card.alpha = 1;
    });
    card.on('pointerupoutside', () => {
      card.alpha = 1;
    });
    card.on('pointertap', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      this.select(info.slot);
    });

    return card;
  }

  /**
   * data URL 先交给 Image 解码，再转成纹理贴上卡片。
   * `Texture.from(string)` 只查资源缓存、不会主动加载，直接建 Sprite 会拿到空纹理；
   * 图片解码期间卡片保留底色和时间，不阻塞页面打开。
   */
  private attachThumbnail(
    card: Container,
    uri: string,
    width: number,
    height: number,
  ): void {
    // node 测试环境没有 DOM；生产端由浏览器提供 Image
    if (typeof document === 'undefined') {
      return;
    }
    const apply = (image: HTMLImageElement): void => {
      if (card.destroyed || image.naturalWidth === 0) {
        return;
      }
      const texture = this.thumbnailTextures.get(uri) ?? Texture.from(image);
      this.thumbnailTextures.set(uri, texture);
      const sprite = new Sprite(texture);
      sprite.width = width;
      sprite.height = height;
      const mask = new Graphics();
      mask.roundRect(0, 0, width, height, this.theme.radius.lg);
      mask.fill(0xffffff);
      card.addChildAt(sprite, 1);
      card.addChildAt(mask, 2);
      sprite.mask = mask;
    };

    const cached = this.thumbnailImages.get(uri);
    if (cached) {
      if (cached.complete) {
        apply(cached);
      } else {
        cached.addEventListener('load', () => apply(cached), { once: true });
      }
      return;
    }

    const image = new Image();
    this.thumbnailImages.set(uri, image);
    image.addEventListener('load', () => apply(image), { once: true });
    image.src = uri;
  }

  /** 只保留当前槽位仍引用的缩略图与纹理，避免反复存档后缓存无限增长 */
  private pruneThumbnailCache(slots: readonly SaveSlotInfo[]): void {
    const keep = new Set<string>();
    for (const info of slots) {
      if (info.thumbnail) {
        keep.add(info.thumbnail);
      }
    }
    for (const uri of [...this.thumbnailImages.keys()]) {
      if (!keep.has(uri)) {
        this.thumbnailImages.delete(uri);
      }
    }
    for (const [uri, texture] of [...this.thumbnailTextures]) {
      if (!keep.has(uri)) {
        texture.destroy(true);
        this.thumbnailTextures.delete(uri);
      }
    }
  }

  /** 用真实 Text 量时间行高度，避免不同字体下热区比字形矮 */
  private measureTimeHeight(): number {
    const probe = new Text({
      text: '00-00 00:00',
      style: {
        fontFamily: this.theme.typography.fontFamilyBody,
        fontSize: this.theme.typography.sizes.sm,
      },
    });
    const height = probe.height;
    probe.destroy();
    return height;
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private select(slot: number): void {
    if (this.currentMode === 'save') {
      this.opts.onSave?.(slot);
    } else {
      this.opts.onLoad?.(slot);
    }
  }

  private clearCards(): void {
    for (const child of this.scroll.content.children.slice()) {
      child.removeAllListeners();
      child.destroy({ children: true });
    }
    this.slotCards = [];
  }

  public override destroy(options?: DestroyOptions): void {
    this.thumbnailImages.clear();
    for (const texture of this.thumbnailTextures.values()) {
      texture.destroy(true);
    }
    this.thumbnailTextures.clear();
    super.destroy(options);
  }
}

export default SaveLoadMenu;
