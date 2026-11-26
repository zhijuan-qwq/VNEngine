export interface DesignResolution {
  width: number;
  height: number;
}

const DESKTOP: DesignResolution = { width: 1280, height: 720 };
const SMALL_TOUCH: DesignResolution = { width: 640, height: 360 };

/**
 * 启动期一次性选择逻辑/设计分辨率。
 *
 * 触摸-only 且视口短边 ≤ 720 CSS px 时用 640×360，让小屏上的 UI 字号保持可读；
 * 其余情况用 1280×720。设计分辨率运行期不变，视口变化只改变画布尺寸与缩放。
 */
export function selectDesignResolution(
  viewport: { width: number; height: number },
  touchOnly: boolean,
): DesignResolution {
  const shortSide = Math.min(viewport.width, viewport.height);
  if (touchOnly && shortSide > 0 && shortSide <= 720) {
    return { ...SMALL_TOUCH };
  }
  return { ...DESKTOP };
}
