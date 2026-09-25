import type { Container } from 'pixi.js';
import type { EngineEvents } from '@/types/events';
import type { Size } from './ScaleManager';
import type { TweenEngine } from './tween';
import FlashEffect from './effects/FlashEffect';
import ParticleEffect from './effects/ParticleEffect';
import ShakeEffect from './effects/ShakeEffect';

export const DEFAULT_SHAKE_DURATION = 500;
export const DEFAULT_FLASH_DURATION = 300;

export interface EffectManagerDeps {
  parent: Container;
  /** 屏幕震动作用对象：整个画面根（LayerStack） */
  shakeTarget: Container;
  tweens: TweenEngine;
  size: Size;
  random?: () => number;
}

/** snow/rain 无 duration 时持续到 effect:stop */
export class EffectManager {
  private readonly deps: EffectManagerDeps;
  private shake: ShakeEffect | null = null;
  private flash: FlashEffect | null = null;
  private particles: ParticleEffect | null = null;

  constructor(deps: EffectManagerDeps) {
    this.deps = deps;
  }

  public play(payload: EngineEvents['effect:play']): void {
    switch (payload.type) {
      case 'shake':
        this.stopShake();
        this.shake = new ShakeEffect(this.deps.shakeTarget, {
          duration: payload.duration ?? DEFAULT_SHAKE_DURATION,
          intensity: payload.intensity,
        });
        break;
      case 'flash':
        this.stopFlash();
        this.flash = new FlashEffect({
          parent: this.deps.parent,
          tweens: this.deps.tweens,
          size: this.deps.size,
          duration: payload.duration ?? DEFAULT_FLASH_DURATION,
          color: payload.color,
          onDone: () => {
            this.flash = null;
          },
        });
        break;
      case 'snow':
      case 'rain':
        this.stopParticles();
        this.particles = new ParticleEffect({
          kind: payload.type,
          size: this.deps.size,
          duration: payload.duration,
          density: payload.density,
          random: this.deps.random,
        });
        this.deps.parent.addChild(this.particles.view);
        break;
      default:
        break;
    }
  }

  public update(dt: number): void {
    if (this.shake) {
      this.shake.update(dt);
      if (this.shake.done) this.shake = null;
    }
    if (this.particles) {
      this.particles.update(dt);
      if (this.particles.done) {
        this.particles.stop();
        this.particles = null;
      }
    }
  }

  public stop(): void {
    this.stopShake();
    this.stopFlash();
    this.stopParticles();
  }

  public destroy(): void {
    this.stop();
  }

  private stopShake(): void {
    this.shake?.stop();
    this.shake = null;
  }

  private stopFlash(): void {
    this.flash?.stop();
    this.flash = null;
  }

  private stopParticles(): void {
    this.particles?.stop();
    this.particles = null;
  }
}

export default EffectManager;
