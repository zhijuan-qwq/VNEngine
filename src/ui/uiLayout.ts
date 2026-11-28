/** UI 逻辑设计宽度；与场景设计分辨率无关，UI 始终按 1280 宽换算 */
export const UI_DESIGN_WIDTH = 1280;
/** 小屏最小物理缩放：保证手机横屏正文字号可读 */
export const UI_MIN_SCALE = 0.8;
/** 大屏最大物理缩放：避免 4K 屏 UI 过度放大 */
export const UI_MAX_SCALE = 2;
/** 视口宽度不高于此值时完全启用紧凑尺寸 */
export const UI_COMPACT_WIDTH = 768;
/** 视口宽度不低于此值时不启用紧凑尺寸，中间线性过渡 */
export const UI_COMPACT_FULL_WIDTH = 1024;

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

/** 尺寸入参是否为正的有限数；NaN / Infinity / 非正数一律拒绝 */
export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
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

/**
 * 紧凑尺寸占比：1 为完全紧凑，0 为正常尺寸。
 *
 * 在 `UI_COMPACT_WIDTH`–`UI_COMPACT_FULL_WIDTH` 之间线性过渡，避免窄窗口
 * 跨过缩放钳制点时快捷栏/选项突然跳变。桌面宽度保持 0。
 */
export function computeCompactAmount(viewportWidth: number): number {
  const width = positiveOr(viewportWidth, UI_DESIGN_WIDTH);
  if (width <= UI_COMPACT_WIDTH) return 1;
  if (width >= UI_COMPACT_FULL_WIDTH) return 0;
  return (
    (UI_COMPACT_FULL_WIDTH - width) / (UI_COMPACT_FULL_WIDTH - UI_COMPACT_WIDTH)
  );
}

/**
 * 由视口尺寸计算 UI 的屏幕空间布局。
 *
 * 传入 `frame`（场景画面在屏幕上的矩形）时，虚拟宽度对齐画面、不覆盖
 * 两侧黑边；未传入或无效时退回视口宽度。高度始终取视口高度。
 */
export function computeUiLayout(
  viewportWidth: number,
  viewportHeight: number,
  frame?: { width: number },
): UiLayout {
  const viewWidth = positiveOr(viewportWidth, UI_DESIGN_WIDTH);
  const height = positiveOr(viewportHeight, DESIGN_HEIGHT);
  const width =
    frame && isPositiveFinite(frame.width) ? frame.width : viewWidth;
  const scale = computeUiScale(viewWidth);
  return { scale, width: width / scale, height: height / scale };
}
