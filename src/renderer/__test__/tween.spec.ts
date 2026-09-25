import { easeOut, linear } from '@/utils/easing';
import TweenEngine from '../tween';

describe('TweenEngine', () => {
  it('should interpolate a numeric property over time', () => {
    const engine = new TweenEngine();
    const target = { alpha: 0 };
    engine.add(target, 'alpha', 1, { duration: 1000, easing: linear });
    expect(engine.activeCount).toBe(1);

    engine.update(0.25);
    expect(target.alpha).toBeCloseTo(0.25);
    engine.update(0.25);
    expect(target.alpha).toBeCloseTo(0.5);

    engine.update(0.5);
    expect(target.alpha).toBe(1);
    expect(engine.activeCount).toBe(0);
  });

  it('should apply the supplied easing curve', () => {
    const engine = new TweenEngine();
    const target = { alpha: 0 };
    engine.add(target, 'alpha', 1, { duration: 1000, easing: easeOut });
    engine.update(0.5);
    expect(target.alpha).toBeCloseTo(0.75);
  });

  it('should snap to the target value when dt overshoots the duration', () => {
    const engine = new TweenEngine();
    const target = { x: 10 };
    engine.add(target, 'x', 100, { duration: 500, easing: linear });
    engine.update(2);
    expect(target.x).toBe(100);
    expect(engine.activeCount).toBe(0);
  });

  it('should run onComplete exactly once', () => {
    const engine = new TweenEngine();
    const onComplete = vi.fn();
    const target = { x: 0 };
    engine.add(target, 'x', 1, { duration: 100, easing: linear, onComplete });

    engine.update(0.05);
    expect(onComplete).not.toHaveBeenCalled();
    engine.update(0.05);
    expect(onComplete).toHaveBeenCalledTimes(1);
    engine.update(0.5);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should finish a non-positive duration immediately', () => {
    const engine = new TweenEngine();
    const onComplete = vi.fn();
    const target = { alpha: 0 };
    engine.add(target, 'alpha', 1, { duration: 0, onComplete });

    expect(target.alpha).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(engine.activeCount).toBe(0);
  });

  it('should not advance on a non-positive dt', () => {
    const engine = new TweenEngine();
    const target = { alpha: 0 };
    engine.add(target, 'alpha', 1, { duration: 1000, easing: linear });

    engine.update(0);
    engine.update(-0.5);
    expect(target.alpha).toBe(0);
    expect(engine.activeCount).toBe(1);
  });

  it('should throw when the property is not a finite number', () => {
    const engine = new TweenEngine();
    const text = { alpha: 'zero' as unknown as number };
    expect(() => engine.add(text, 'alpha', 1, { duration: 100 })).toThrow(
      TypeError,
    );

    const nan = { alpha: Number.NaN };
    expect(() => engine.add(nan, 'alpha', 1, { duration: 100 })).toThrow(
      TypeError,
    );
  });

  it('should stop a tween cancelled through its handle', () => {
    const engine = new TweenEngine();
    const onComplete = vi.fn();
    const target = { alpha: 0 };
    const handle = engine.add(target, 'alpha', 1, {
      duration: 1000,
      easing: linear,
      onComplete,
    });

    engine.update(0.25);
    handle.cancel();
    engine.update(1);

    expect(target.alpha).toBeCloseTo(0.25);
    expect(onComplete).not.toHaveBeenCalled();
    expect(engine.activeCount).toBe(0);
  });

  it('should cancel every tween of a given target only', () => {
    const engine = new TweenEngine();
    const sprite = { x: 0, y: 0 };
    const other = { x: 0 };
    engine.add(sprite, 'x', 100, { duration: 1000, easing: linear });
    engine.add(sprite, 'y', 100, { duration: 1000, easing: linear });
    engine.add(other, 'x', 100, { duration: 1000, easing: linear });

    engine.cancelTarget(sprite);
    expect(engine.activeCount).toBe(1);

    engine.update(0.5);
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(0);
    expect(other.x).toBe(50);
  });

  it('should cancel every tween on cancelAll', () => {
    const engine = new TweenEngine();
    const target = { x: 0 };
    engine.add(target, 'x', 100, { duration: 1000, easing: linear });
    engine.add(target, 'x', 50, { duration: 1000, easing: linear });

    engine.cancelAll();
    engine.update(0.5);

    expect(engine.activeCount).toBe(0);
    expect(target.x).toBe(0);
  });

  it('should cancel only the named property when given a prop', () => {
    const engine = new TweenEngine();
    const sprite = { x: 0, alpha: 0 };
    engine.add(sprite, 'x', 100, { duration: 1000, easing: linear });
    engine.add(sprite, 'alpha', 1, { duration: 1000, easing: linear });

    engine.cancelTarget(sprite, 'x');
    engine.update(0.5);

    expect(sprite.x).toBe(0);
    expect(sprite.alpha).toBeCloseTo(0.5);
  });

  it('should honour a cancelTarget issued from onComplete in the same update', () => {
    const engine = new TweenEngine();
    const first = { x: 0 };
    const second = { alpha: 0 };
    engine.add(first, 'x', 1, {
      duration: 100,
      easing: linear,
      onComplete: () => engine.cancelTarget(second),
    });
    engine.add(second, 'alpha', 1, { duration: 1000, easing: linear });

    engine.update(0.1);

    expect(engine.activeCount).toBe(0);
    engine.update(1);
    expect(second.alpha).toBe(0);
  });

  it('should defer tweens added by onComplete to the next update', () => {
    const engine = new TweenEngine();
    const first = { x: 0 };
    const chained = { y: 0 };
    engine.add(first, 'x', 1, {
      duration: 100,
      easing: linear,
      onComplete: () => {
        engine.add(chained, 'y', 10, { duration: 1000, easing: linear });
      },
    });

    engine.update(0.1);
    expect(engine.activeCount).toBe(1);
    expect(chained.y).toBe(0);

    engine.update(0.5);
    expect(chained.y).toBeCloseTo(5);
  });
});
