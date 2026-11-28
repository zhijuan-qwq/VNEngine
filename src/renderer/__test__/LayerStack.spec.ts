import { Container } from 'pixi.js';
import LayerStack, { LAYER_Z_INDEX } from '../LayerStack';

describe('LayerStack', () => {
  it('should add layers ordered by zIndex', () => {
    const stack = new LayerStack();
    const fore = stack.addLayer('fore', LAYER_Z_INDEX.fore);
    const bg = stack.addLayer('bg', LAYER_Z_INDEX.bg);

    expect(stack.children.map((child) => child.label)).toEqual(['bg', 'fore']);
    expect(bg).toBe(stack.getLayer('bg'));
    expect(fore).toBe(stack.getLayer('fore'));
    expect(stack.getLayer('missing')).toBeNull();
  });

  it('should keep the documented zIndex convention', () => {
    expect(LAYER_Z_INDEX.bg).toBeLessThan(LAYER_Z_INDEX.cg);
    expect(LAYER_Z_INDEX.cg).toBeLessThan(LAYER_Z_INDEX.middle);
    expect(LAYER_Z_INDEX.middle).toBeLessThan(LAYER_Z_INDEX.chara);
    expect(LAYER_Z_INDEX.chara).toBeLessThan(LAYER_Z_INDEX.fore);
    expect(LAYER_Z_INDEX.fore).toBeLessThan(LAYER_Z_INDEX.effect);
  });

  it('should return the existing layer and update its zIndex on a repeated add', () => {
    const stack = new LayerStack();
    const first = stack.addLayer('chara', 300);
    const second = stack.addLayer('chara', 350);

    expect(second).toBe(first);
    expect(stack.children).toHaveLength(1);
    expect(first.zIndex).toBe(350);
  });

  it('should reorder layers when reorderLayer is called', () => {
    const stack = new LayerStack();
    const bg = stack.addLayer('bg', 0);
    const effect = stack.addLayer('effect', 500);

    stack.reorderLayer('bg', 700);

    expect(bg.zIndex).toBe(700);
    expect(stack.children.map((child) => child.label)).toEqual([
      'effect',
      'bg',
    ]);
    expect(effect.zIndex).toBe(500);
  });

  it('should ignore reorderLayer and removeLayer for unknown ids', () => {
    const stack = new LayerStack();
    stack.addLayer('bg', 0);

    expect(() => stack.reorderLayer('missing', 10)).not.toThrow();
    expect(() => stack.removeLayer('missing')).not.toThrow();
    expect(stack.children).toHaveLength(1);
  });

  it('should detach and destroy a removed layer with its children', () => {
    const stack = new LayerStack();
    const layer = stack.addLayer('chara', 300);
    const child = new Container();
    layer.addChild(child);

    stack.removeLayer('chara');

    expect(stack.getLayer('chara')).toBeNull();
    expect(stack.children).toHaveLength(0);
    expect(layer.destroyed).toBe(true);
    expect(child.destroyed).toBe(true);
  });

  it('should drop the layer map when the stack is destroyed', () => {
    const stack = new LayerStack();
    stack.addLayer('bg', 0);

    stack.destroy({ children: true });

    expect(stack.layers.size).toBe(0);
    expect(stack.destroyed).toBe(true);
  });
});
