import { Container } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { InputManager } from '../InputManager';
import type { InputManagerOptions } from '../InputManager';

function makeBus(): EventBus<EngineEvents> {
  return new EventBus<EngineEvents>();
}

function listen<K extends keyof EngineEvents>(
  bus: EventBus<EngineEvents>,
  event: K,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  bus.on(event, spy);
  return spy;
}

function makeOptions(
  overrides: Partial<InputManagerOptions> = {},
): InputManagerOptions {
  return {
    width: 800,
    height: 600,
    toLogical: (point) => ({ x: point.x * 2, y: point.y * 2 }),
    ...overrides,
  };
}

/** 命中层是 UI 根的第一个子节点 */
function hitOf(root: Container): Container {
  return root.children[0] as Container;
}

function tap(target: Container, x = 0, y = 0): void {
  target.emit('pointertap', {
    global: { x, y },
  } as unknown as FederatedPointerEvent);
}

describe('InputManager', () => {
  it('should emit input:click when the typewriter is idle', () => {
    const bus = makeBus();
    const click = listen(bus, 'input:click');
    const root = new Container();
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(root);
    tap(hitOf(root), 3, 4);
    expect(click).toHaveBeenCalledWith({ x: 6, y: 8 });
  });

  it('should emit input:skip while the typewriter is busy', () => {
    const bus = makeBus();
    const skip = listen(bus, 'input:skip');
    const click = listen(bus, 'input:click');
    const root = new Container();
    const input = new InputManager(
      bus,
      makeOptions({ isTypewriterBusy: () => true }),
    );
    input.setUIRoot(root);
    tap(hitOf(root), 3, 4);
    expect(skip).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it('should emit input:hover on pointer move', () => {
    const bus = makeBus();
    const hover = listen(bus, 'input:hover');
    const root = new Container();
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(root);
    hitOf(root).emit('pointermove', {
      global: { x: 5, y: 6 },
    } as unknown as FederatedPointerEvent);
    expect(hover).toHaveBeenCalledWith({ x: 10, y: 12 });
  });

  it('should attach the hit container as the first child of the root', () => {
    const bus = makeBus();
    const root = new Container();
    const sibling = new Container();
    root.addChild(sibling);
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(root);
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).not.toBe(sibling);
    expect(hitOf(root).eventMode).toBe('static');
  });

  it('should replace the previous hit container when re-attached', () => {
    const bus = makeBus();
    const root = new Container();
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(root);
    const first = hitOf(root);
    input.setUIRoot(root);
    expect(root.children).toHaveLength(1);
    expect(hitOf(root)).not.toBe(first);
    expect(first.destroyed).toBe(true);
  });

  it('should move the hit container to the new root', () => {
    const bus = makeBus();
    const first = new Container();
    const second = new Container();
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(first);
    input.setUIRoot(second);
    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(1);
  });

  it('should stop routing taps after destroy', () => {
    const bus = makeBus();
    const click = listen(bus, 'input:click');
    const root = new Container();
    const input = new InputManager(bus, makeOptions());
    input.setUIRoot(root);
    const hit = hitOf(root);
    input.destroy();
    tap(hit, 1, 1);
    expect(click).not.toHaveBeenCalled();
    expect(hit.destroyed).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('should not throw when destroyed before attaching a root', () => {
    const bus = makeBus();
    const input = new InputManager(bus, makeOptions());
    expect(() => input.destroy()).not.toThrow();
  });
});
