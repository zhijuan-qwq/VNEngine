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
  const bar = new MenuBar(bus, { width: 800, height: 600, ...options });
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

  it('should render an icon plus an uppercase label per button', () => {
    const { bar } = makeBar();
    const labels = bar.buttons.map(
      (button) => (button.children[1] as unknown as { text: string }).text,
    );
    expect(labels).toEqual(['SYSTEM', 'SAVE', 'LOAD', 'HISTORY']);
  });

  it('should default to the bottom right corner', () => {
    const { bar } = makeBar();
    const last = bar.buttons[3];
    const lastWidth = (last.hitArea as unknown as { width: number }).width;
    expect(last.x + lastWidth).toBeLessThanOrEqual(800 - 12);
    // 快捷栏高 26、贴边留白 12：600 - 26 - 12
    expect(bar.buttons[0].y).toBe(562);
  });

  it('should honor an explicit position', () => {
    const { bar } = makeBar({ x: 30, y: 40 });
    expect(bar.buttons[0].x).toBe(30);
    expect(bar.buttons[0].y).toBe(40);
  });

  it('should follow the bottom right corner on resize', () => {
    const { bar } = makeBar();
    bar.resize(1000, 700);
    const last = bar.buttons[3];
    const lastWidth = (last.hitArea as unknown as { width: number }).width;
    expect(bar.buttons[0].y).toBe(662);
    expect(last.x + lastWidth).toBeCloseTo(1000 - 12);
  });

  it('should clamp to the left margin on narrow screens', () => {
    const { bar } = makeBar();
    bar.resize(300, 900);
    expect(bar.buttons[0].x).toBe(12);
  });

  it('should shrink the buttons in compact mode', () => {
    const { bar } = makeBar();
    const defaultWidth = (
      bar.buttons[0].hitArea as unknown as { width: number }
    ).width;

    bar.resize(800, 600, true);

    // 26*0.8=20.8→21；12*0.8=9.6→10
    expect(bar.buttons[0].y).toBe(600 - 21 - 10);
    const compactWidth = (
      bar.buttons[0].hitArea as unknown as {
        width: number;
      }
    ).width;
    expect(compactWidth).toBeLessThan(defaultWidth);
    const last = bar.buttons[3];
    const lastWidth = (last.hitArea as unknown as { width: number }).width;
    expect(last.x + lastWidth).toBeCloseTo(800 - 10);
  });

  it('should restore the desktop size when compact turns off', () => {
    const { bar } = makeBar();
    bar.resize(800, 600, true);

    bar.resize(800, 600, false);

    expect(bar.buttons[0].y).toBe(562);
  });
});
