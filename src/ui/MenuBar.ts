import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents, UiPanel } from '@/types/events';
import { UIComponent } from './UIComponent';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';
import { isPositiveFinite, UI_MIN_SCALE } from './uiLayout';

export interface MenuBarOptions {
  /** 屏幕逻辑宽度；用于缺省时把快捷栏贴到右下角 */
  width: number;
  /** 屏幕逻辑高度；用于缺省时贴底 */
  height: number;
  x?: number;
  y?: number;
  /** 固定项宽；缺省按图标与标签实测宽度 */
  buttonWidth?: number;
  buttonHeight?: number;
  gap?: number;
  fontSize?: number;
  /** 贴边留白，仅在缺省位置时使用 */
  margin?: number;
  theme?: DeepPartial<UITheme>;
}

interface ResolvedOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  buttonWidth?: number;
  buttonHeight: number;
  gap: number;
  fontSize: number;
  margin: number;
}

interface MenuEntry {
  panel: UiPanel;
  label: string;
}

const ENTRIES: readonly MenuEntry[] = [
  { panel: 'settings', label: 'SYSTEM' },
  { panel: 'save', label: 'SAVE' },
  { panel: 'load', label: 'LOAD' },
  { panel: 'history', label: 'HISTORY' },
];

interface IconStroke {
  width?: number;
  alpha?: number;
  /** false 时保留已绘制的线条，用于在同一 Graphics 上叠加描边垫底层 */
  clear?: boolean;
}

/** 在 size×size 的局部坐标内绘制极简线性图标 */
function drawIcon(
  g: Graphics,
  panel: UiPanel,
  color: number,
  size: number,
  { width = 1.5, alpha = 1, clear = true }: IconStroke = {},
): void {
  const c = size / 2;
  const stroke = {
    width,
    color,
    alpha,
    cap: 'round' as const,
    join: 'round' as const,
  };
  if (clear) {
    g.clear();
  }
  switch (panel) {
    case 'settings': {
      // 齿轮：外环 + 八根短齿 + 内孔
      for (let i = 0; i < 8; i += 1) {
        const angle = (i * Math.PI) / 4;
        g.moveTo(
          c + Math.cos(angle) * size * 0.34,
          c + Math.sin(angle) * size * 0.34,
        );
        g.lineTo(
          c + Math.cos(angle) * size * 0.48,
          c + Math.sin(angle) * size * 0.48,
        );
      }
      g.circle(c, c, size * 0.28);
      g.circle(c, c, size * 0.13);
      g.stroke(stroke);
      break;
    }
    case 'save': {
      g.moveTo(c, size * 0.12);
      g.lineTo(c, size * 0.58);
      g.moveTo(c - size * 0.2, size * 0.4);
      g.lineTo(c, size * 0.62);
      g.lineTo(c + size * 0.2, size * 0.4);
      g.moveTo(size * 0.16, size * 0.7);
      g.lineTo(size * 0.16, size * 0.86);
      g.lineTo(size * 0.84, size * 0.86);
      g.lineTo(size * 0.84, size * 0.7);
      g.stroke(stroke);
      break;
    }
    case 'load': {
      g.moveTo(c, size * 0.62);
      g.lineTo(c, size * 0.16);
      g.moveTo(c - size * 0.2, size * 0.38);
      g.lineTo(c, size * 0.14);
      g.lineTo(c + size * 0.2, size * 0.38);
      g.moveTo(size * 0.16, size * 0.7);
      g.lineTo(size * 0.16, size * 0.86);
      g.lineTo(size * 0.84, size * 0.86);
      g.lineTo(size * 0.84, size * 0.7);
      g.stroke(stroke);
      break;
    }
    case 'history': {
      // 时钟：表盘 + 指针
      g.circle(c, c, size * 0.38);
      g.moveTo(c, c);
      g.lineTo(c, c - size * 0.24);
      g.moveTo(c, c);
      g.lineTo(c + size * 0.18, c + size * 0.1);
      g.stroke(stroke);
      break;
    }
  }
}

/** 移动端紧凑模式的整体缩放 */
const COMPACT_SCALE = 0.8;
/** 紧凑模式字号下限按物理像素反推：最差缩放档下仍不小于 11 CSS px */
const COMPACT_MIN_FONT = Math.ceil(11 / UI_MIN_SCALE);

interface LayoutMetrics {
  itemHeight: number;
  gap: number;
  margin: number;
}

/**
 * 右下角快捷栏：图标 + 大写标签，覆盖在画面上方。
 * 点击任一按钮在 EventBus 上 emit `ui:open`，作为设置/保存/读取/历史四个页面的入口。
 *
 * 移动端（UI 缩放落在最小档）可开启紧凑模式，按钮按 `COMPACT_SCALE` 收缩；
 * 桌面保持原尺寸。
 */
export class MenuBar extends UIComponent {
  private readonly bus: EventBus<EngineEvents>;
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly menuButtons: Container[] = [];
  private readonly itemWidths: number[] = [];
  private metrics: LayoutMetrics = { itemHeight: 0, gap: 0, margin: 0 };
  /** 0 为正常尺寸，1 为完全紧凑；中间值随视口宽度线性过渡 */
  private compactAmount = 0;
  private buildKey = '';

  constructor(bus: EventBus<EngineEvents>, options: MenuBarOptions) {
    super({ id: 'menu-bar' });
    this.bus = bus;
    this.theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      buttonWidth: options.buttonWidth,
      buttonHeight: options.buttonHeight ?? this.theme.sizes.quickBarHeight,
      gap: options.gap ?? this.theme.spacing.s16,
      fontSize: options.fontSize ?? this.theme.typography.sizes.sm,
      margin: options.margin ?? this.theme.spacing.s12,
    };

    this.build();
    this.layout();
  }

  /**
   * 视口变化时重算尺寸与位置。
   * `compactAmount` 为 0–1 的连续值，只有取整后的尺寸变化时才重建按钮。
   */
  public resize(
    width: number,
    height: number,
    compactAmount = this.compactAmount,
  ): void {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
      return;
    }
    this.opts.width = width;
    this.opts.height = height;
    if (Number.isFinite(compactAmount)) {
      this.compactAmount = Math.min(Math.max(compactAmount, 0), 1);
    }
    this.build();
    this.layout();
  }

  private build(): void {
    const factor = 1 - (1 - COMPACT_SCALE) * this.compactAmount;
    const scaled = (value: number): number => Math.round(value * factor);
    const itemHeight = Math.max(1, scaled(this.opts.buttonHeight));
    // 自定义小字号不被紧凑缩放继续压低，也不被下限强行放大
    const fontFloor = Math.min(COMPACT_MIN_FONT, this.opts.fontSize);
    const fontSize = Math.max(fontFloor, scaled(this.opts.fontSize));
    const iconSize = Math.max(1, scaled(this.theme.sizes.quickBarIcon));
    const iconGap = Math.max(0, scaled(this.theme.spacing.s4));
    const paddingX = Math.max(0, scaled(this.theme.spacing.s4));
    const metrics: LayoutMetrics = {
      itemHeight,
      gap: Math.max(0, scaled(this.opts.gap)),
      margin: Math.max(0, scaled(this.opts.margin)),
    };

    const key = `${itemHeight}/${fontSize}/${iconSize}/${iconGap}/${paddingX}/${metrics.gap}/${metrics.margin}`;
    this.metrics = metrics;
    if (key === this.buildKey && this.menuButtons.length === ENTRIES.length) {
      return;
    }
    this.buildKey = key;

    for (const child of this.children.slice()) {
      child.destroy({ children: true });
    }
    this.menuButtons.length = 0;
    this.itemWidths.length = 0;

    interface BuiltItem {
      container: Container;
      width: number;
    }

    const items: BuiltItem[] = ENTRIES.map((entry) => {
      const label = new Text({
        text: entry.label,
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize,
          fontWeight: this.theme.typography.weights.semibold,
          letterSpacing: 0.5,
          fill: this.theme.colors.quickBarText,
          // 与对话框字幕一致：浅色文字加深色阴影，压在亮画面上仍可辨
          dropShadow: {
            color: this.theme.colors.textShadow,
            alpha: this.theme.colors.textShadowAlpha,
            blur: 3,
            distance: 1.5,
            angle: Math.PI / 2,
          },
        },
      });
      label.x = paddingX + iconSize + iconGap;
      label.y = (itemHeight - label.height) / 2;

      const icon = new Graphics();
      icon.x = paddingX;
      icon.y = (itemHeight - iconSize) / 2;
      /** 先描一层深色底再画线条；Graphics 无阴影，用更粗的暗色描边代替 */
      const paintIcon = (color: number): void => {
        drawIcon(icon, entry.panel, this.theme.colors.textShadow, iconSize, {
          width: Math.max(1, scaled(3)),
          alpha: this.theme.colors.textShadowAlpha,
        });
        drawIcon(icon, entry.panel, color, iconSize, { clear: false });
      };
      paintIcon(this.theme.colors.quickBarText);

      const width =
        this.opts.buttonWidth ??
        paddingX * 2 + iconSize + iconGap + label.width;

      const container = new Container();
      container.addChild(icon, label);
      container.eventMode = 'static';
      container.hitArea = new Rectangle(0, 0, width, itemHeight);
      container.on('pointerover', () => {
        label.style.fill = this.theme.colors.quickBarTextHover;
        paintIcon(this.theme.colors.quickBarTextHover);
      });
      container.on('pointerout', () => {
        label.style.fill = this.theme.colors.quickBarText;
        paintIcon(this.theme.colors.quickBarText);
      });
      container.on('pointerdown', () => {
        container.alpha = 0.7;
      });
      container.on('pointerup', () => {
        container.alpha = 1;
      });
      container.on('pointerupoutside', () => {
        container.alpha = 1;
      });
      container.on('pointertap', (event) => {
        event.stopPropagation();
        this.bus.emit('ui:open', { panel: entry.panel });
      });

      return { container, width };
    });

    for (const item of items) {
      this.menuButtons.push(item.container);
      this.itemWidths.push(item.width);
      this.addChild(item.container);
    }
  }

  private layout(): void {
    const { gap, margin } = this.metrics;
    const totalWidth =
      this.itemWidths.reduce((sum, width) => sum + width, 0) +
      gap * Math.max(this.itemWidths.length - 1, 0);
    const startX =
      this.opts.x ?? Math.max(margin, this.opts.width - totalWidth - margin);
    const startY = this.opts.y ?? this.opts.height - this.reserveHeight;

    let x = startX;
    for (let index = 0; index < this.menuButtons.length; index += 1) {
      const button = this.menuButtons[index];
      button.x = x;
      button.y = startY;
      x += this.itemWidths[index] + gap;
    }
  }

  /**
   * 快捷栏占用的底部高度（按钮高度 + 贴边留白）。
   * 自定义 `y` 时不再贴底，返回 0，避免 UIManager 错误预留空间。
   */
  get reserveHeight(): number {
    if (this.opts.y !== undefined) {
      return 0;
    }
    return this.metrics.itemHeight + this.metrics.margin;
  }

  /** 测试/调试用：设置 / 存档 / 读档 / 历史 顺序的按钮 */
  get buttons(): Container[] {
    return this.menuButtons;
  }
}

export default MenuBar;
