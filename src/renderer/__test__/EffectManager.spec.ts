import { Container } from 'pixi.js';
import EffectManager, {
  DEFAULT_FLASH_DURATION,
  DEFAULT_SHAKE_DURATION,
} from '../EffectManager';
import { resolveColor } from '../effects/FlashEffect';
import { BASE_PARTICLE_COUNT } from '../effects/ParticleEffect';
import { SHAKE_AMPLITUDE } from '../effects/ShakeEffect';
import TweenEngine from '../tween';

const SIZE = { width: 200, height: 100 };

function createManager(random?: () => number) {
  const parent = new Container();
  const shakeTarget = new Container();
  const tweens = new TweenEngine();
  const manager = new EffectManager({
    parent,
    shakeTarget,
    tweens,
    size: SIZE,
    random,
  });
  return { manager, parent, shakeTarget, tweens };
}

describe('EffectManager', () => {
  it('should shake the target within the intensity amplitude and restore it', () => {
    const { manager, shakeTarget } = createManager();

    manager.play({ type: 'shake', duration: 1000, intensity: 0.5 });
    manager.update(0.016);

    expect(Math.abs(shakeTarget.x)).toBeLessThanOrEqual(SHAKE_AMPLITUDE * 0.5);
    expect(Math.abs(shakeTarget.y)).toBeLessThanOrEqual(SHAKE_AMPLITUDE * 0.5);

    manager.update(1);
    expect(shakeTarget.x).toBe(0);
    expect(shakeTarget.y).toBe(0);

    manager.update(0.5);
    expect(shakeTarget.x).toBe(0);
  });

  it('should use the default shake duration when none is given', () => {
    const { manager, shakeTarget } = createManager();

    manager.play({ type: 'shake' });
    manager.update(DEFAULT_SHAKE_DURATION / 1000 + 0.001);

    expect(shakeTarget.x).toBe(0);
    expect(shakeTarget.y).toBe(0);
  });

  it('should fade a full-screen flash out and clean it up', () => {
    const { manager, parent, tweens } = createManager();

    manager.play({ type: 'flash', duration: 200, color: '#ff0000' });
    expect(parent.children).toHaveLength(1);
    const flash = parent.children[0];
    expect(flash.alpha).toBe(1);

    tweens.update(0.1);
    expect(flash.alpha).toBeCloseTo(0.5);

    tweens.update(0.1);
    expect(parent.children).toHaveLength(0);
    expect(flash.destroyed).toBe(true);
  });

  it('should use the default flash duration when none is given', () => {
    const { manager, parent, tweens } = createManager();

    manager.play({ type: 'flash' });
    tweens.update(DEFAULT_FLASH_DURATION / 1000);

    expect(parent.children).toHaveLength(0);
  });

  it('should replace a running effect of the same type', () => {
    const { manager, parent } = createManager(() => 0.5);

    manager.play({ type: 'snow' });
    const first = parent.children[0];
    manager.play({ type: 'rain' });

    expect(parent.children).toHaveLength(1);
    expect(first.destroyed).toBe(true);

    manager.play({ type: 'flash' });
    manager.play({ type: 'flash' });
    expect(parent.children).toHaveLength(2);
  });

  it('should spawn snow particles by density and let them fall, wrapping at the bottom', () => {
    const { manager, parent } = createManager(() => 0.5);

    manager.play({ type: 'snow', density: 0.5 });
    const field = parent.children[0];
    expect(field.children).toHaveLength(BASE_PARTICLE_COUNT * 0.5);

    const particle = field.children[0];
    expect(particle.x).toBe(100);
    expect(particle.y).toBe(50);

    manager.update(1);
    expect(particle.x).toBe(100);
    expect(particle.y).toBeCloseTo(15);

    manager.update(1);
    expect(parent.children).toHaveLength(1);
  });

  it('should spawn slanted rain streaks that keep falling', () => {
    const { manager, parent } = createManager(() => 0.5);

    manager.play({ type: 'rain' });
    const field = parent.children[0];
    expect(field.children).toHaveLength(BASE_PARTICLE_COUNT);

    const particle = field.children[0];
    manager.update(0.05);

    expect(particle.x).toBeCloseTo(96);
    expect(particle.y).toBeCloseTo(78);

    // 线段长边（本地 y 轴）对齐实际速度 (96-100, 78-50)：斜向雨丝而非竖直矩形
    expect(particle.rotation).toBeCloseTo(
      Math.atan2(78 - 50, 96 - 100) - Math.PI / 2,
    );
  });

  it('should auto-stop a particle effect that has a duration', () => {
    const { manager, parent } = createManager(() => 0.5);

    manager.play({ type: 'snow', duration: 200 });
    expect(parent.children).toHaveLength(1);

    manager.update(0.2);
    expect(parent.children).toHaveLength(0);
  });

  it('should clear every running effect on stop', () => {
    const { manager, parent, shakeTarget } = createManager(() => 0.5);

    manager.play({ type: 'shake', duration: 1000 });
    manager.play({ type: 'flash', duration: 1000 });
    manager.play({ type: 'snow' });
    manager.update(0.016);
    expect(parent.children).toHaveLength(2);

    manager.stop();

    expect(shakeTarget.x).toBe(0);
    expect(shakeTarget.y).toBe(0);
    expect(parent.children).toHaveLength(0);
  });

  it('should ignore an unknown effect type coming from a plugin', () => {
    const { manager, parent } = createManager(() => 0.5);

    expect(() =>
      manager.play({ type: 'sparkle' } as unknown as { type: 'flash' }),
    ).not.toThrow();
    expect(parent.children).toHaveLength(0);
  });

  it('should tolerate update calls without any effect', () => {
    const { manager } = createManager();

    expect(() => manager.update(0.016)).not.toThrow();
    expect(() => manager.destroy()).not.toThrow();
  });
});

describe('resolveColor', () => {
  it('should normalize a valid color to hex', () => {
    expect(resolveColor('#f00')).toBe('#ff0000');
    expect(resolveColor('red')).toBe('#ff0000');
  });

  it('should fall back to white for missing or invalid colors', () => {
    expect(resolveColor()).toBe(0xffffff);
    expect(resolveColor('')).toBe(0xffffff);
    expect(resolveColor('bogus')).toBe(0xffffff);
  });
});
