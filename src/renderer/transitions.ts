import type { Sprite } from 'pixi.js';
import type { EasingFn } from '@/types/engine';
import { easeOut } from '@/utils/easing';
import type { TweenEngine } from './tween';

export const DEFAULT_TRANSITION_DURATION = 300;
/** zoom 转场的默认起始缩放（由大缩小；角色放大入场时传更小的 scaleFrom） */
export const DEFAULT_ZOOM_FROM = 1.1;

export type TransitionKind = 'fade' | 'slide' | 'zoom' | 'none';

/** slide 的方向：入场表示从哪一侧滑入，退场表示滑向哪一侧 */
export type SlideDirection = 'left' | 'right';

export interface PointData {
  x: number;
  y: number;
}

export interface TransitionSpec {
  kind: TransitionKind;
  /** 仅 slide 携带；缺省时由调用方按目标位置推断 */
  direction?: SlideDirection;
}

/** 转场名 → kind（+ slide 方向）：缺省 fade；wipe/pixelate 及未知名称按直切处理（后续迭代） */
export function parseTransition(name?: string): TransitionSpec {
  switch (name) {
    case undefined:
    case '':
    case 'fade':
      return { kind: 'fade' };
    case 'slide':
      return { kind: 'slide' };
    case 'slideL':
      return { kind: 'slide', direction: 'left' };
    case 'slideR':
      return { kind: 'slide', direction: 'right' };
    case 'zoom':
      return { kind: 'zoom' };
    default:
      return { kind: 'none' };
  }
}

export interface EnterSpec {
  from: PointData;
  to: PointData;
  /** 毫秒；<= 0 视为直切 */
  duration: number;
  scaleFrom?: number;
  /** 结束时的 alpha，缺省 1（读档恢复半透明立绘用） */
  alphaTo?: number;
  easing?: EasingFn;
}

export interface LeaveSpec {
  to: PointData;
  /** 毫秒；<= 0 视为直切 */
  duration: number;
  scaleFrom?: number;
  easing?: EasingFn;
  onComplete?: () => void;
}

/** 入场转场；结束后视图销毁由调用方负责 */
export function playEnter(
  tweens: TweenEngine,
  view: Sprite,
  kind: TransitionKind,
  spec: EnterSpec,
): void {
  const duration = spec.duration;
  const easing = spec.easing ?? easeOut;
  const alphaTo = spec.alphaTo ?? 1;
  if (kind === 'none' || !(duration > 0)) {
    view.position.set(spec.to.x, spec.to.y);
    view.alpha = alphaTo;
    return;
  }
  switch (kind) {
    case 'slide':
      view.position.set(spec.from.x, spec.from.y);
      view.alpha = alphaTo;
      tweens.add(view, 'x', spec.to.x, { duration, easing });
      tweens.add(view, 'y', spec.to.y, { duration, easing });
      break;
    case 'zoom': {
      view.position.set(spec.to.x, spec.to.y);
      view.scale.set(spec.scaleFrom ?? DEFAULT_ZOOM_FROM);
      view.alpha = 0;
      tweens.add(view, 'alpha', alphaTo, { duration, easing });
      tweens.add(view.scale, 'x', 1, { duration, easing });
      tweens.add(view.scale, 'y', 1, { duration, easing });
      break;
    }
    case 'fade':
    default:
      view.position.set(spec.to.x, spec.to.y);
      view.alpha = 0;
      tweens.add(view, 'alpha', alphaTo, { duration, easing });
      break;
  }
}

/** 退场转场：先销毁视图再回调 onComplete */
export function playLeave(
  tweens: TweenEngine,
  view: Sprite,
  kind: TransitionKind,
  spec: LeaveSpec,
): void {
  const finish = (): void => {
    view.destroy();
    spec.onComplete?.();
  };
  const duration = spec.duration;
  if (kind === 'none' || !(duration > 0)) {
    finish();
    return;
  }
  const easing = spec.easing ?? easeOut;
  switch (kind) {
    case 'slide':
      tweens.add(view, 'x', spec.to.x, { duration, easing });
      tweens.add(view, 'y', spec.to.y, {
        duration,
        easing,
        onComplete: finish,
      });
      break;
    case 'zoom':
      tweens.add(view, 'alpha', 0, { duration, easing });
      tweens.add(view.scale, 'x', spec.scaleFrom ?? DEFAULT_ZOOM_FROM, {
        duration,
        easing,
      });
      tweens.add(view.scale, 'y', spec.scaleFrom ?? DEFAULT_ZOOM_FROM, {
        duration,
        easing,
        onComplete: finish,
      });
      break;
    case 'fade':
    default:
      tweens.add(view, 'alpha', 0, { duration, easing, onComplete: finish });
      break;
  }
}
