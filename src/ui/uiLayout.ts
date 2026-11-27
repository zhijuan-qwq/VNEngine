/** UI 逻辑设计宽度；与场景设计分辨率无关，UI 始终按 1280 宽换算 */
export const UI_DESIGN_WIDTH = 1280;
/** 小屏最小物理缩放：保证手机横屏正文字号可读 */
export const UI_MIN_SCALE = 0.8;
/** 大屏最大物理缩放：避免 4K 屏 UI 过度放大 */
export const UI_MAX_SCALE = 2;

export interface UiLayout {
  /** UI 物理缩放（虚拟坐标 → CSS px） */
  scale: number;
  /** 虚拟宽度（UI 布局坐标） */
  width: number;
  /** 虚拟高度（UI 布局坐标） */
  height: number;
}

const DESIGN_HEIGHT = (UI_DESIGN_WIDTH * 9) / 16;

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * UI 的物理缩放：只跟随视口宽度。
 *
 * 横屏时浏览器工具栏/地址栏伸缩改变的是可用高度，若把高度纳入缩放
 * 会让 UI 忽大忽小。窄屏统一压到 `UI_MIN_SCALE`。
 */
export function computeUiScale(viewportWidth: number): number {
  const width = positiveOr(viewportWidth, UI_DESIGN_WIDTH);
  return Math.min(
    UI_MAX_SCALE,
    Math.max(UI_MIN_SCALE, width / UI_DESIGN_WIDTH),
  );
}

/** 由视口尺寸计算 UI 的屏幕空间布局（未传入场景画面时的缺省行为） */
export function computeUiLayout(
  viewportWidth: number,
  viewportHeight: number,
): UiLayout {
  const width = positiveOr(viewportWidth, UI_DESIGN_WIDTH);
  const height = positiveOr(viewportHeight, DESIGN_HEIGHT);
  const scale = computeUiScale(width);
  return { scale, width: width / scale, height: height / scale };
}
