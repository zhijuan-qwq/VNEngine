import { Rectangle } from 'pixi.js';
import type { Application, Container } from 'pixi.js';

const THUMBNAIL_WIDTH = 320;

/**
 * 把场景根容器按逻辑分辨率截成 16:9 缩略图（JPEG data URL）。
 * 截图失败（无 WebGL、被存储拒绝等）时返回空串，调用方降级为无图卡片。
 */
export function captureThumbnail(
  app: Application,
  target: Container,
  width: number,
  height: number,
): string {
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
