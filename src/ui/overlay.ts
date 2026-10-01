import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

/**
 * 全屏遮罩：不透明背景 + 命中层，吞掉面板之外的点击，
 * 使模态面板打开时底层的 input:click 不会触发。
 */
export function createBackdrop(
  width: number,
  height: number,
  alpha = 0.6,
): Graphics {
  const backdrop = new Graphics();
  backdrop.rect(0, 0, width, height);
  backdrop.fill(0x000000, alpha);
  backdrop.eventMode = 'static';
  backdrop.hitArea = new Rectangle(0, 0, width, height);
  backdrop.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
  });
  return backdrop;
}

export function createPanelBox(
  width: number,
  height: number,
  options: { radius?: number; color?: number; alpha?: number } = {},
): Graphics {
  const box = new Graphics();
  box.roundRect(0, 0, width, height, options.radius ?? 12);
  box.fill(options.color ?? 0x222222, options.alpha ?? 0.95);
  return box;
}

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: number;
  textColor?: number;
  onTap?: () => void;
}

export function createButton(options: ButtonOptions): Container {
  const button = new Container();
  button.eventMode = 'static';
  button.hitArea = new Rectangle(0, 0, options.width, options.height);

  const bg = new Graphics();
  bg.roundRect(0, 0, options.width, options.height, 6);
  bg.fill(options.backgroundColor ?? 0x444444, 1);
  button.addChild(bg);

  const label = new Text({
    text: options.label,
    style: {
      fontSize: options.fontSize ?? 22,
      fontFamily: options.fontFamily ?? 'sans-serif',
      fill: options.textColor ?? 0xffffff,
    },
  });
  label.x = 12;
  label.y = (options.height - label.height) / 2;
  button.addChild(label);

  button.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    options.onTap?.();
  });

  return button;
}
