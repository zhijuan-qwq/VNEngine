import { Rectangle } from 'pixi.js';
import type { Application, Container } from 'pixi.js';

const THUMBNAIL_WIDTH = 320;

/**
 * 把场景根容器截成宽 320px 的 JPEG data URL，高度随画面比例缩放（16:9 即 320×180）。
 * 尺寸非法或截图失败（无 WebGL、被存储拒绝等）时返回空串，调用方降级为无图卡片。
 */
export function captureThumbnail(
  app: Application,
  target: Container,
  width: number,
  height: number,
): string {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return '';
  }
  try {
    const canvas = app.renderer.extract.canvas({
      target,
      frame: new Rectangle(0, 0, width, height),
      resolution: THUMBNAIL_WIDTH / width,
    });
    const exporter = canvas as {
      toDataURL?: (type: string, quality?: number) => string;
    };
    if (typeof exporter.toDataURL !== 'function') {
      return '';
    }
    return exporter.toDataURL('image/jpeg', 0.7);
  } catch (error) {
    console.warn('[VNEngine] thumbnail capture failed', error);
    return '';
  }
}

export default captureThumbnail;
