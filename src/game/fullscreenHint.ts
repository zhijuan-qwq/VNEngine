import {
  getElementById,
  isFullscreen,
  isFullscreenSupported,
  observeFullscreen,
  setFullscreen,
} from '@/utils/APIHelper';

export interface FullscreenHintOptions {
  /** 进入全屏的实现；缺省直接调用 setFullscreen(true) */
  onRequestFullscreen?: () => void;
}

/**
 * 横屏触摸设备的全屏引导。
 *
 * 显隐由 index.html 的媒体查询控制（仅触摸横屏）；这里负责在
 * 不支持全屏、已进入全屏或用户关闭提示时设置 hidden，
 * 并处理按钮点击与 fullscreenchange。返回幂等解除函数。
 */
export function mountFullscreenHint(
  options: FullscreenHintOptions = {},
): () => void {
  const hint = getElementById('fullscreen-hint');
  const action = getElementById('fullscreen-hint-action');
  const dismiss = getElementById('fullscreen-hint-dismiss');
  if (!hint || !action || !dismiss) return () => {};

  if (!isFullscreenSupported()) {
    hint.hidden = true;
    return () => {};
  }

  const request = options.onRequestFullscreen ?? (() => setFullscreen(true));
  let dismissed = false;

  const sync = (): void => {
    hint.hidden = dismissed || isFullscreen();
  };
  const onAction = (): void => request();
  const onDismiss = (): void => {
    dismissed = true;
    sync();
  };

  action.addEventListener('click', onAction);
  dismiss.addEventListener('click', onDismiss);
  const stopObserving = observeFullscreen(sync);
  sync();

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    action.removeEventListener('click', onAction);
    dismiss.removeEventListener('click', onDismiss);
    stopObserving();
  };
}
