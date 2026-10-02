import type { FederatedPointerEvent } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { MenuBar } from '../MenuBar';
import type { MenuBarOptions } from '../MenuBar';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeBar(options: Partial<MenuBarOptions> = {}): {
  bus: EventBus<EngineEvents>;
  bar: MenuBar;
} {
  const bus = new EventBus<EngineEvents>();
  const bar = new MenuBar(bus, { width: 800, ...options });
  return { bus, bar };
}

function tap(button: { emit(event: string, payload: unknown): void }): void {
  button.emit('pointertap', {
    stopPropagation: vi.fn(),
  } as unknown as FederatedPointerEvent);
}

function listen(bus: EventBus<EngineEvents>): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  bus.on('ui:open', spy);
  return spy;
}

describe('MenuBar', () => {
  it('should render one button per panel', () => {
    const { bar } = makeBar();
    expect(bar.buttons).toHaveLength(4);
  });

  it('should emit ui:open settings when the settings button is tapped', () => {
    const { bus, bar } = makeBar();
    const open = listen(bus);
    tap(bar.buttons[0]);
    expect(open).toHaveBeenCalledWith({ panel: 'settings' });
  });

  it('should emit ui:open save when the save button is tapped', () => {
    const { bus, bar } = makeBar();
    const open = listen(bus);
    tap(bar.buttons[1]);
    expect(open).toHaveBeenCalledWith({ panel: 'save' });
  });

  it('should emit ui:open load when the load button is tapped', () => {
    const { bus, bar } = makeBar();
    const open = listen(bus);
    tap(bar.buttons[2]);
    expect(open).toHaveBeenCalledWith({ panel: 'load' });
  });

  it('should emit ui:open history when the history button is tapped', () => {
    const { bus, bar } = makeBar();
    const open = listen(bus);
    tap(bar.buttons[3]);
    expect(open).toHaveBeenCalledWith({ panel: 'history' });
  });

  it('should lay buttons out in a horizontal row', () => {
    const { bar } = makeBar();
    expect(bar.buttons[1].x).toBeGreaterThan(bar.buttons[0].x);
    expect(bar.buttons[1].y).toBe(bar.buttons[0].y);
  });

  it('should default to the top right corner', () => {
    const { bar } = makeBar();
    const last = bar.buttons[3];
    expect(last.x + 88).toBeLessThanOrEqual(800 - 12);
    expect(bar.buttons[0].y).toBe(12);
  });

  it('should honor an explicit position', () => {
    const { bar } = makeBar({ x: 30, y: 40 });
    expect(bar.buttons[0].x).toBe(30);
    expect(bar.buttons[0].y).toBe(40);
  });
});
