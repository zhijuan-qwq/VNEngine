import type { Container } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents, UiPanel } from '@/types/events';
import { UIComponent } from './UIComponent';
import { createIconButton } from './overlay';
import type { IconName } from './icon';

export interface MenuBarOptions {
  /** 屏幕逻辑宽度；用于缺省时把按钮栏贴到右上角 */
  width: number;
  x?: number;
  y?: number;
  buttonWidth?: number;
  buttonHeight?: number;
  gap?: number;
  /** 贴边留白，仅在缺省位置时使用 */
  margin?: number;
}

interface ResolvedOptions {
  x: number;
  y: number;
  buttonWidth: number;
  buttonHeight: number;
  gap: number;
}

interface MenuEntry {
  panel: UiPanel;
  icon: IconName;
  /** 悬停提示，兼作图标加载失败时的文字回落 */
  label: string;
}

const ENTRIES: readonly MenuEntry[] = [
  { panel: 'settings', icon: 'settings', label: '设置' },
  { panel: 'save', icon: 'save', label: '存档' },
  { panel: 'load', icon: 'load', label: '读档' },
  { panel: 'history', icon: 'history', label: '历史' },
];

/**
 * 常驻图标按钮栏：点击任一按钮在 EventBus 上 emit `ui:open`，作为四个内置面板的入口。
 * 缺省贴右上角，避免与底部对话框重叠。
 */
export class MenuBar extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly menuButtons: Container[] = [];

  constructor(bus: EventBus<EngineEvents>, options: MenuBarOptions) {
    super({ id: 'menu-bar' });
    const buttonWidth = options.buttonWidth ?? 44;
    const buttonHeight = options.buttonHeight ?? 44;
    const gap = options.gap ?? 8;
    const margin = options.margin ?? 12;
    const totalWidth =
      ENTRIES.length * buttonWidth + (ENTRIES.length - 1) * gap;
    this.opts = {
      x: options.x ?? options.width - totalWidth - margin,
      y: options.y ?? margin,
      buttonWidth,
      buttonHeight,
      gap,
    };

    ENTRIES.forEach((entry, index) => {
      const button = createIconButton({
        icon: entry.icon,
        size: Math.min(this.opts.buttonWidth, this.opts.buttonHeight),
        tooltip: entry.label,
        onTap: () => bus.emit('ui:open', { panel: entry.panel }),
      });
      button.x = this.opts.x + index * (this.opts.buttonWidth + this.opts.gap);
      button.y = this.opts.y;
      this.menuButtons.push(button);
      this.addChild(button);
    });
  }

  /** 测试/调试用：设置 / 存档 / 读档 / 历史 顺序的按钮 */
  get buttons(): Container[] {
    return this.menuButtons;
  }
}

export default MenuBar;
