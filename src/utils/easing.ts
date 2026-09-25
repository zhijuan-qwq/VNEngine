import type { EasingFn } from '@/types/engine';

export const linear: EasingFn = (t) => t;

export const easeIn: EasingFn = (t) => t * t;

export const easeOut: EasingFn = (t) => 1 - (1 - t) * (1 - t);

export const easeInOut: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

export const ease: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const EASINGS: Record<string, EasingFn> = {
  linear,
  ease,
  easeIn,
  easeOut,
  easeInOut,
};

/** 未指定缓动时用 easeOut；未知名称回退 linear，避免拼错的名字静默套用别的曲线 */
export function getEasing(name?: string): EasingFn {
  if (name === undefined) return easeOut;
  return EASINGS[name] ?? linear;
}
