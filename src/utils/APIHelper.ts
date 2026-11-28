/**
 * DOM / 全局 API 的唯一访问 seam（架构文档 §12）。
 *
 * 业务代码一律经此模块访问 `window` / `document` / `localStorage` /
 * `requestAnimationFrame` / `performance` / `ResizeObserver` / `matchMedia` /
 * `visualViewport`，不直接引用，以便：
 * - node / SSR / 隐私模式下缺少这些全局时给出**确定**的降级行为；
 * - 测试用 `vi.stubGlobal` 集中打桩。
 *
 * 降级语义：除 `requestFrame`（无 rAF 时抛错，见其注释）外，环境缺失时一律
 * 静默降级，不抛。
 */

export function createAudioContext(): AudioContext {
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return new AudioContextClass();
}

/** Web Storage；不可用（node / 隐私模式）时返回 null，由调用方降级 */
export function getStorage(): Storage | null {
  try {
    return (globalThis.localStorage as Storage | undefined) ?? null;
  } catch {
    return null;
  }
}

/** 设备像素比；无 `window` 时按 1 处理 */
export function getDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio ?? 1;
}

/** 按 id 取元素；无 `document` 时返回 null */
export function getElementById(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** 窗口视口（CSS px）；无 `window` 时返回全零 */
export function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** 文档根视口（CSS px）；无 `document` 时返回全零，供宿主尺寸异常时兜底 */
export function getDocumentSize(): ViewportSize {
  if (typeof document === 'undefined') return { width: 0, height: 0 };
  const root = document.documentElement;
  if (!root) return { width: 0, height: 0 };
  return { width: root.clientWidth, height: root.clientHeight };
}

/** 可视视口（CSS px，兼容缩放）；不可用时返回全零 */
export function getVisualViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const visual = window.visualViewport;
  if (!visual) return { width: 0, height: 0 };
  return { width: visual.width, height: visual.height };
}

/** 取元素的父节点；非 DOM 节点或无父节点时返回 null */
export function getParentElement(element: unknown): HTMLElement | null {
  if (!element || typeof element !== 'object') return null;
  const parent = (element as { parentElement?: HTMLElement | null })
    .parentElement;
  return parent ?? null;
}

/** 元素内容盒尺寸；元素缺失或任一维 <= 0 时返回 null */
export function getElementSize(
  element: HTMLElement | null,
): ViewportSize | null {
  if (!element) return null;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/** media query 是否命中；无 `window.matchMedia` 时返回 false */
export function matchesMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/**
 * 订阅视口变化：ResizeObserver(宿主)、window resize / orientationchange /
 * load / pageshow、visualViewport.resize 以及 devicePixelRatio 变化。
 * `load`/`pageshow` 用于移动端浏览器：布局与动态视口可能在 init 之后才稳定，
 * 且不一定伴随 resize 事件。
 * 返回幂等解除函数；无 `window` 时为空操作。
 */
export function observeViewport(
  target: HTMLElement | null,
  onChange: () => void,
): () => void {
  const cleanups: Array<() => void> = [];
  const handle = (): void => onChange();

  if (typeof window !== 'undefined') {
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', handle);
      window.addEventListener('orientationchange', handle);
      window.addEventListener('load', handle);
      window.addEventListener('pageshow', handle);
      cleanups.push(() => {
        window.removeEventListener('resize', handle);
        window.removeEventListener('orientationchange', handle);
        window.removeEventListener('load', handle);
        window.removeEventListener('pageshow', handle);
      });
    }

    const visualViewport = window.visualViewport;
    if (
      visualViewport &&
      typeof visualViewport.addEventListener === 'function'
    ) {
      visualViewport.addEventListener('resize', handle);
      cleanups.push(() => visualViewport.removeEventListener('resize', handle));
    }

    cleanups.push(observeDprChange(handle));
  }

  if (target && typeof ResizeObserver !== 'undefined') {
    try {
      const observer = new ResizeObserver(handle);
      observer.observe(target);
      cleanups.push(() => observer.disconnect());
    } catch {
      // 残缺环境：保留窗口事件作为退化路径
    }
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
}

/** DPR 变化监听：matchMedia 命中后按新 DPR 重新武装 */
function observeDprChange(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.matchMedia !== 'function') return () => {};

  let query: MediaQueryList | null = null;
  let active = true;

  const handle = (): void => {
    rearm();
    onChange();
  };

  const rearm = (): void => {
    if (!active) return;
    query?.removeEventListener('change', handle);
    query = null;
    // 直接使用原始 devicePixelRatio：四舍五入会让 (resolution: 2.63dppx)
    // 匹配不上真实的 2.625；原始值（包括 1.100000023841858）可正常匹配。
    // 极端环境下监听失效时，resize/orientation 仍会兜底。
    const next = window.matchMedia(
      `(resolution: ${window.devicePixelRatio ?? 1}dppx)`,
    );
    if (typeof next.addEventListener !== 'function') return;
    next.addEventListener('change', handle);
    query = next;
  };

  rearm();

  return () => {
    if (!active) return;
    active = false;
    query?.removeEventListener('change', handle);
    query = null;
  };
}

/** 高精度时间戳；无 `performance` 时回落 `Date.now` */
export function now(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

/**
 * 请求下一帧。无 `requestAnimationFrame` 时**抛错**而非回落 `setTimeout`：
 * 缺 rAF 的环境（node）本就不该跑帧循环，静默空转会把进程钉住。
 */
export function requestFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'undefined') {
    throw new Error(
      'requestAnimationFrame is not available in this environment',
    );
  }
  return requestAnimationFrame(callback);
}

/** 取消帧请求；无 rAF 时为空操作 */
export function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'undefined') return;
  cancelAnimationFrame(handle);
}

/**
 * 下一帧执行一次。无 rAF 的环境（node 测试）同步执行并返回空取消，
 * 与 `requestFrame` 的“无 rAF 抛错”不同：事件的合并逻辑在无帧环境下也要能跑。
 */
export function scheduleFrame(callback: FrameRequestCallback): () => void {
  if (typeof requestAnimationFrame === 'undefined') {
    callback(now());
    return () => {};
  }
  const handle = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(handle);
}

/** 是否处于全屏；无 `document` 时视为否 */
export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.fullscreenElement !== null;
}

/** 是否支持元素全屏；iOS 等不支持时返回 false */
export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof document.documentElement?.requestFullscreen === 'function';
}

/** 进入/退出全屏；无 `document` 或不支持时为空操作，Promise 一律吞掉 */
export function setFullscreen(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on && !isFullscreenSupported()) return;
  if (!on && typeof document.exitFullscreen !== 'function') return;
  const promise = on
    ? document.documentElement.requestFullscreen()
    : document.exitFullscreen();
  void promise.catch(() => {
    // 浏览器可能因非用户手势等原因拒绝，静默忽略
  });
}

/** 订阅全屏状态变化；无 `document` 时为空操作，返回幂等解除函数 */
export function observeFullscreen(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  if (typeof document.addEventListener !== 'function') return () => {};
  document.addEventListener('fullscreenchange', onChange);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    document.removeEventListener('fullscreenchange', onChange);
  };
}
