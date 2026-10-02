/**
 * DOM / 全局 API 的唯一访问 seam（架构文档 §12）。
 *
 * 业务代码一律经此模块访问 `window` / `document` / `localStorage` /
 * `requestAnimationFrame` / `performance`，不直接引用，以便：
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

/** 是否处于全屏；无 `document` 时视为否 */
export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.fullscreenElement !== null;
}

/** 进入/退出全屏；无 `document` 时为空操作，Promise 一律吞掉 */
export function setFullscreen(on: boolean): void {
  if (typeof document === 'undefined') return;
  const promise = on
    ? document.documentElement.requestFullscreen()
    : document.exitFullscreen();
  void promise.catch(() => {
    // 浏览器可能因非用户手势等原因拒绝，静默忽略
  });
}
