import { Container, Graphics } from 'pixi.js';
import type { Size } from '../ScaleManager';

export type ParticleKind = 'snow' | 'rain';

export const BASE_PARTICLE_COUNT = 100;

export interface ParticleEffectOptions {
  kind: ParticleKind;
  size: Size;
  /** 毫秒；缺省时持续到 effect:stop */
  duration?: number;
  /** 粒子数量倍率，缺省 1 */
  density?: number;
  /** 测试用随机源，缺省 Math.random */
  random?: () => number;
}

interface Particle {
  view: Graphics;
  vx: number;
  vy: number;
}

/** 雪/雨粒子：pixi v8 无兼容的粒子插件，用 Graphics 粒子在特效层自定义实现 */
export class ParticleEffect {
  public readonly view: Container;
  private readonly particles: Particle[] = [];
  private readonly size: Size;
  private readonly random: () => number;
  private readonly durationMs: number | null;
  private elapsed = 0;
  private finished = false;

  constructor(options: ParticleEffectOptions) {
    this.size = options.size;
    this.random = options.random ?? Math.random;
    this.durationMs =
      options.duration !== undefined && options.duration > 0
        ? options.duration
        : null;
    this.view = new Container();

    const count = Math.max(
      1,
      Math.round(BASE_PARTICLE_COUNT * (options.density ?? 1)),
    );
    for (let i = 0; i < count; i += 1) {
      const particle = this.createParticle(options.kind);
      this.particles.push(particle);
      this.view.addChild(particle.view);
    }
  }

  public get done(): boolean {
    return this.finished;
  }

  public update(dt: number): void {
    if (this.finished) return;
    if (this.durationMs !== null) {
      this.elapsed += dt * 1000;
      if (this.elapsed >= this.durationMs) {
        this.finished = true;
        return;
      }
    }
    const { width, height } = this.size;
    for (const particle of this.particles) {
      const view = particle.view;
      view.x += particle.vx * dt;
      view.y += particle.vy * dt;
      if (view.y > height) {
        view.y -= height;
        view.x = this.random() * width;
      }
      if (view.x > width) {
        view.x -= width;
      } else if (view.x < 0) {
        view.x += width;
      }
    }
  }

  public stop(): void {
    this.finished = true;
    this.particles.length = 0;
    this.view.destroy({ children: true });
  }

  private createParticle(kind: ParticleKind): Particle {
    const view =
      kind === 'rain'
        ? new Graphics()
            .rect(0, 0, 1 + this.random(), 8 + this.random() * 10)
            .fill({ color: 0xaaccff, alpha: 0.6 })
        : new Graphics()
            .circle(0, 0, 1.5 + this.random() * 2)
            .fill({ color: 0xffffff, alpha: 0.85 });
    view.x = this.random() * this.size.width;
    view.y = this.random() * this.size.height;

    if (kind === 'rain') {
      const vx = -80 + (this.random() * 2 - 1) * 20;
      const vy = 420 + this.random() * 280;
      // 线段的长边是本地 y 轴，转到速度方向即为斜向雨丝
      view.rotation = Math.atan2(vy, vx) - Math.PI / 2;
      return { view, vx, vy };
    }
    return {
      view,
      vx: (this.random() * 2 - 1) * 25,
      vy: 40 + this.random() * 50,
    };
  }
}

export default ParticleEffect;
