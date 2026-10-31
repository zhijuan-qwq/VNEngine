import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { THEME } from './theme';
import { attachIcon } from './icon';
import type { IconName } from './icon';

/**
 * 全屏遮罩：不透明背景 + 命中层，吞掉面板之外的点击，
 * 使模态面板打开时底层的 input:click 不会触发。
 */
export function createBackdrop(
  width: number,
  height: number,
  alpha = 0.62,
): Graphics {
  const backdrop = new Graphics();
  backdrop.rect(0, 0, width, height);
  backdrop.fill(THEME.veil, alpha);
  backdrop.eventMode = 'static';
  backdrop.hitArea = new Rectangle(0, 0, width, height);
  backdrop.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
  });
  return backdrop;
}

/** 独占全屏的界面：整页不透明底，兼作命中层吞掉底层点击 */
export function createFullscreenPanel(
  width: number,
  height: number,
  options: { color?: number } = {},
): Graphics {
  const bg = new Graphics();
  bg.rect(0, 0, width, height);
  bg.fill(options.color ?? THEME.panel, 1);
  bg.eventMode = 'static';
  bg.hitArea = new Rectangle(0, 0, width, height);
  bg.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
  });
  return bg;
}

export interface PanelBoxOptions {
  radius?: number;
  color?: number;
  alpha?: number;
  borderColor?: number;
  borderWidth?: number;
}

export function createPanelBox(
  width: number,
  height: number,
  options: PanelBoxOptions = {},
): Graphics {
  const box = new Graphics();
  box.roundRect(0, 0, width, height, options.radius ?? 16);
  box.fill(options.color ?? THEME.panel, options.alpha ?? 0.94);
  box.stroke({
    color: options.borderColor ?? THEME.border,
    width: options.borderWidth ?? 1.5,
    alpha: 0.9,
  });
  return box;
}

export type ButtonVariant = 'default' | 'primary' | 'ghost';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  variant?: ButtonVariant;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: number;
  textColor?: number;
  onTap?: () => void;
}

function drawButtonBg(
  bg: Graphics,
  width: number,
  height: number,
  variant: ButtonVariant,
  hover: boolean,
  fillOverride?: number,
): void {
  bg.clear();
  bg.roundRect(0, 0, width, height, 10);
  if (variant === 'primary') {
    bg.fill(fillOverride ?? THEME.accent, hover ? 1 : 0.94);
    bg.stroke({ color: THEME.accentBright, width: 1.5, alpha: 0.5 });
    return;
  }
  if (variant === 'ghost') {
    if (hover) {
      bg.fill(THEME.panelSoft, 0.9);
    }
    bg.stroke({ color: hover ? THEME.accent : THEME.border, width: 1.5 });
    return;
  }
  if (hover) {
    bg.fill(THEME.accent, 0.18);
    bg.stroke({ color: THEME.accent, width: 1.5 });
  } else {
    bg.fill(fillOverride ?? THEME.panelSoft, 0.92);
    bg.stroke({ color: THEME.border, width: 1.5 });
  }
}

function labelColor(
  variant: ButtonVariant,
  hover: boolean,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (variant === 'primary') return THEME.onAccent;
  return hover ? THEME.accentBright : THEME.text;
}

/** 常规文字按钮：居中文字 + hover 高亮（金边 + 亮字） */
export function createButton(options: ButtonOptions): Container {
  const button = new Container();
  button.eventMode = 'static';
  button.hitArea = new Rectangle(0, 0, options.width, options.height);
  button.cursor = 'pointer';
  const variant = options.variant ?? 'default';

  const bg = new Graphics();
  drawButtonBg(bg, options.width, options.height, variant, false);
  button.addChild(bg);

  const style = {
    fontSize: options.fontSize ?? 22,
    fontFamily: options.fontFamily ?? THEME.fontFamily,
    fill: labelColor(variant, false, options.textColor),
  };
  const label = new Text({ text: options.label, style });
  label.anchor.set(0.5);
  label.position.set(options.width / 2, options.height / 2);
  button.addChild(label);

  const setHover = (hover: boolean): void => {
    drawButtonBg(bg, options.width, options.height, variant, hover);
    label.style = {
      ...style,
      fill: labelColor(variant, hover, options.textColor),
    };
  };
  button.on('pointerover', () => setHover(true));
  button.on('pointerout', () => setHover(false));
  button.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    options.onTap?.();
  });

  return button;
}

export interface IconButtonOptions {
  icon: IconName;
  /** 正方形按钮边长 */
  size?: number;
  /** 悬停时按钮下方浮现的说明文字 */
  tooltip?: string;
  onTap?: () => void;
}

/** 图标按钮：图标加载失败时回落为文字；hover 高亮并显示提示 */
export function createIconButton(options: IconButtonOptions): Container {
  const size = options.size ?? 44;
  const button = new Container();
  button.eventMode = 'static';
  button.hitArea = new Rectangle(0, 0, size, size);
  button.cursor = 'pointer';

  const bg = new Graphics();
  const drawBg = (hover: boolean): void => {
    bg.clear();
    bg.roundRect(0, 0, size, size, 10);
    bg.fill(THEME.veil, hover ? 0.85 : 0.55);
    bg.stroke({
      color: hover ? THEME.accent : THEME.border,
      width: 1.5,
      alpha: hover ? 1 : 0.8,
    });
  };
  drawBg(false);
  button.addChild(bg);

  const { sprite } = attachIcon(button, options.icon, {
    size: Math.round(size * 0.5),
    tint: THEME.text,
    fallbackText: options.tooltip ?? '',
    x: size / 2,
    y: size / 2,
  });

  let tooltip: Text | null = null;
  if (options.tooltip) {
    tooltip = new Text({
      text: options.tooltip,
      style: {
        fontSize: 14,
        fontFamily: THEME.fontFamily,
        fill: THEME.accent,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    tooltip.anchor.set(0.5, 0);
    tooltip.position.set(size / 2, size + 6);
    tooltip.visible = false;
    button.addChild(tooltip);
  }

  button.on('pointerover', () => {
    drawBg(true);
    sprite.tint = THEME.accentBright;
    if (tooltip) tooltip.visible = true;
  });
  button.on('pointerout', () => {
    drawBg(false);
    sprite.tint = THEME.text;
    if (tooltip) tooltip.visible = false;
  });
  button.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    options.onTap?.();
  });

  return button;
}

export interface PanelHeaderOptions {
  title: string;
  /** 头部内容区宽度（标题起点到关闭按钮） */
  width: number;
  fontSize?: number;
  onClose?: () => void;
}

export interface PanelHeader {
  root: Container;
  /** 标题文本（面板可按模式改写） */
  title: Text;
  /** 头部占用的总高度，内容区从 root.y + height 开始 */
  height: number;
}

/** 面板头部：金色标题 + 短下划线 + 通栏分隔线 + 可选右上角关闭图标 */
export function createPanelHeader(options: PanelHeaderOptions): PanelHeader {
  const root = new Container();
  const fontSize = options.fontSize ?? 30;

  const title = new Text({
    text: options.title,
    style: {
      fontSize,
      fontFamily: THEME.fontFamily,
      fill: THEME.accent,
      fontWeight: 'bold',
    },
  });
  root.addChild(title);

  const underline = new Graphics();
  underline.roundRect(0, 0, 64, 3, 1.5);
  underline.fill(THEME.accent, 0.85);
  underline.y = title.height + 8;
  root.addChild(underline);

  // 通栏发丝线，与标题行一同把整页界面与内容区分开
  const divider = new Graphics();
  divider.rect(0, 0, options.width, 1);
  divider.fill(THEME.border, 0.55);
  divider.y = title.height + 22;
  root.addChild(divider);

  if (options.onClose) {
    const close = createIconButton({
      icon: 'close',
      size: 40,
      onTap: options.onClose,
    });
    close.x = options.width - 40;
    close.y = -2;
    root.addChild(close);
  }

  return { root, title, height: title.height + 22 + 20 };
}
