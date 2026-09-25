import { Container } from 'pixi.js';
import ScaleManager from '../ScaleManager';

const LOGICAL = { width: 1280, height: 720 };

describe('ScaleManager', () => {
  it('should letterbox a fit stage and keep the aspect ratio', () => {
    const stage = new Container();
    const scale = new ScaleManager(stage, 'fit', LOGICAL);

    scale.update({ width: 1000, height: 1000 });

    expect(stage.scale.x).toBeCloseTo(0.78125);
    expect(stage.scale.y).toBeCloseTo(0.78125);
    expect(stage.x).toBeCloseTo(0);
    expect(stage.y).toBeCloseTo(218.75);
  });

  it('should stretch a stage without keeping the aspect ratio', () => {
    const stage = new Container();
    const scale = new ScaleManager(stage, 'stretch', LOGICAL);

    scale.update({ width: 1000, height: 1000 });

    expect(stage.scale.x).toBeCloseTo(0.78125);
    expect(stage.scale.y).toBeCloseTo(1.3888, 3);
    expect(stage.x).toBe(0);
    expect(stage.y).toBe(0);
  });

  it('should center a fixed stage at its original resolution', () => {
    const stage = new Container();
    const scale = new ScaleManager(stage, 'fixed', LOGICAL);

    scale.update({ width: 1000, height: 1000 });

    expect(stage.scale.x).toBe(1);
    expect(stage.scale.y).toBe(1);
    expect(stage.x).toBe(-140);
    expect(stage.y).toBe(140);
  });

  it('should start as an identity transform for the logical size', () => {
    const stage = new Container();
    new ScaleManager(stage, 'fit', LOGICAL);

    expect(stage.scale.x).toBe(1);
    expect(stage.x).toBe(0);
    expect(stage.y).toBe(0);
  });

  it('should convert global coordinates back to logical coordinates', () => {
    const stage = new Container();
    const scale = new ScaleManager(stage, 'fixed', LOGICAL);
    scale.update({ width: 1000, height: 1000 });

    const global = stage.toGlobal({ x: 320, y: 720 });

    expect(global.x).toBeCloseTo(-140 + 320);
    expect(global.y).toBeCloseTo(140 + 720);
    expect(scale.toLogical(global)).toEqual({ x: 320, y: 720 });
  });

  it('should tolerate a zero-sized container', () => {
    const stage = new Container();
    const scale = new ScaleManager(stage, 'fit', LOGICAL);

    scale.update({ width: 0, height: 0 });

    expect(stage.scale.x).toBe(0);
    expect(stage.x).toBe(0);
    expect(stage.y).toBe(0);
  });

  it('should reject a non-positive logical size', () => {
    const stage = new Container();

    expect(
      () => new ScaleManager(stage, 'fit', { width: 0, height: 720 }),
    ).toThrow(RangeError);
    expect(
      () => new ScaleManager(stage, 'fit', { width: 1280, height: -1 }),
    ).toThrow(RangeError);
  });
});
