import { Assets, Sprite, Text, Texture } from 'pixi.js';
import type { Container, Text as PixiText } from 'pixi.js';
import { THEME } from './theme';

export const ICON_NAMES = [
  'settings',
  'save',
  'load',
  'history',
  'close',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const ICON_FILES: Record<IconName, string> = {
  settings: '/ui/icons/settings.svg',
  save: '/ui/icons/save.svg',
  load: '/ui/icons/folder-open.svg',
  history: '/ui/icons/book-open.svg',
  close: '/ui/icons/x.svg',
};

const cache = new Map<IconName, Promise<Texture | null>>();

/**
 * 按名加载 `public/ui/icons` 下的图标纹理；失败（离线 / node 测试环境）
 * 时解析为 null，由调用方回落到文字，不阻塞 UI 构建。
 */
export function loadIconTexture(name: IconName): Promise<Texture | null> {
  // node 测试环境没有页面与相对 URL 的基准，直接回落
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  let pending = cache.get(name);
  if (!pending) {
    pending = startLoad(ICON_FILES[name]);
    cache.set(name, pending);
  }
  return pending;
}

function startLoad(url: string): Promise<Texture | null> {
  try {
    return Assets.load(url)
      .then((res) => (res instanceof Texture ? res : null))
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

export interface AttachIconOptions {
  /** 图标展示尺寸（正方形边长） */
  size: number;
  tint?: number;
  /** 图标不可用时的文字回落 */
  fallbackText: string;
  fontSize?: number;
  /** 图标中心点在 parent 内的坐标；缺省 (0,0) */
  x?: number;
  y?: number;
}

export interface AttachedIcon {
  sprite: Sprite;
  fallback: PixiText;
}

/**
 * 把图标贴进容器：纹理就绪前显示文字回落，就绪后原位替换。
 * sprite 初始 visible=false，命中加载失败则永远显示 fallback。
 */
export function attachIcon(
  parent: Container,
  name: IconName,
  options: AttachIconOptions,
): AttachedIcon {
  const fallback = new Text({
    text: options.fallbackText,
    style: {
      fontSize: options.fontSize ?? Math.round(options.size * 0.42),
      fontFamily: THEME.fontFamily,
      fill: THEME.text,
    },
  });
  fallback.anchor.set(0.5);
  fallback.position.set(options.x ?? 0, options.y ?? 0);
  parent.addChild(fallback);

  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.position.set(options.x ?? 0, options.y ?? 0);
  sprite.visible = false;
  if (options.tint !== undefined) sprite.tint = options.tint;
  parent.addChild(sprite);

  // node 测试环境无页面，跳过网络加载，保持文字回落
  if (typeof document !== 'undefined') {
    void loadIconTexture(name).then((texture) => {
      if (!texture) return;
      sprite.texture = texture;
      sprite.width = options.size;
      sprite.height = options.size;
      sprite.visible = true;
      fallback.visible = false;
    });
  }

  return { sprite, fallback };
}
