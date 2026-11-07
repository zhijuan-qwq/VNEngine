import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents, UiPanel } from '@/types/events';
import { UIComponent } from './UIComponent';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

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

/** 在 size×size 的局部坐标内绘制极简线性图标 */
function drawIcon(
  g: Graphics,
  panel: UiPanel,
  color: number,
  size: number,
): void {
  const c = size / 2;
  const stroke = {
    width: 1.5,
    color,
    cap: 'round' as const,
    join: 'round' as const,
  };
  g.clear();
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

/**
 * 右下角快捷栏：图标 + 大写标签，覆盖在画面上方。
 * 点击任一按钮在 EventBus 上 emit `ui:open`，作为四个内置面板的入口。
 */
export class MenuBar extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly menuButtons: Container[] = [];

  constructor(bus: EventBus<EngineEvents>, options: MenuBarOptions) {
    super({ id: 'menu-bar' });
    this.theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      buttonWidth: options.buttonWidth,
      buttonHeight: options.buttonHeight ?? this.theme.sizes.quickBarHeight,
      gap: options.gap ?? this.theme.spacing.s24,
      fontSize: options.fontSize ?? this.theme.typography.sizes.sm,
      margin: options.margin ?? this.theme.spacing.s16,
    };

    const iconSize = this.theme.sizes.quickBarIcon;
    const iconGap = this.theme.spacing.s8;
    const paddingX = this.theme.spacing.s8;
    const itemHeight = this.opts.buttonHeight;

    interface BuiltItem {
      container: Container;
      width: number;
    }

    const items: BuiltItem[] = ENTRIES.map((entry) => {
      const label = new Text({
        text: entry.label,
        style: {
          fontFamily: this.theme.typography.fontFamilyBody,
          fontSize: this.opts.fontSize,
          letterSpacing: 0.5,
          fill: this.theme.colors.quickBarText,
        },
      });
      label.x = paddingX + iconSize + iconGap;
      label.y = (itemHeight - label.height) / 2;

      const icon = new Graphics();
      icon.x = paddingX;
      icon.y = (itemHeight - iconSize) / 2;
      drawIcon(icon, entry.panel, this.theme.colors.quickBarText, iconSize);

      const width =
        this.opts.buttonWidth ??
        paddingX * 2 + iconSize + iconGap + label.width;

      const container = new Container();
      container.addChild(icon, label);
      container.eventMode = 'static';
      container.hitArea = new Rectangle(0, 0, width, itemHeight);
      container.on('pointerover', () => {
        label.style.fill = this.theme.colors.quickBarTextHover;
        drawIcon(
          icon,
          entry.panel,
          this.theme.colors.quickBarTextHover,
          iconSize,
        );
      });
      container.on('pointerout', () => {
        label.style.fill = this.theme.colors.quickBarText;
        drawIcon(icon, entry.panel, this.theme.colors.quickBarText, iconSize);
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
        bus.emit('ui:open', { panel: entry.panel });
      });

      return { container, width };
    });

    const totalWidth =
      items.reduce((sum, item) => sum + item.width, 0) +
      this.opts.gap * (items.length - 1);
    const startX =
      this.opts.x ?? this.opts.width - totalWidth - this.opts.margin;
    const startY =
      this.opts.y ?? this.opts.height - itemHeight - this.opts.margin;

    let x = startX;
    for (const item of items) {
      item.container.x = x;
      item.container.y = startY;
      this.menuButtons.push(item.container);
      this.addChild(item.container);
      x += item.width + this.opts.gap;
    }
  }

  /** 测试/调试用：设置 / 存档 / 读档 / 历史 顺序的按钮 */
  get buttons(): Container[] {
    return this.menuButtons;
  }
}

export default MenuBar;
