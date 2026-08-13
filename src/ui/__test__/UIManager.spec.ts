import type { FederatedPointerEvent } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { UIManager } from '../UIManager';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeManager(): { bus: EventBus<EngineEvents>; ui: UIManager } {
  const bus = new EventBus<EngineEvents>();
  const ui = new UIManager(bus, { width: 800, height: 600, autoTick: false });
  return { bus, ui };
}

function listen<K extends keyof EngineEvents>(
  bus: EventBus<EngineEvents>,
  event: K,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  bus.on(event, spy);
  return spy;
}

describe('UIManager', () => {
  it('should expose the ui root, dialogue box and choice panel', () => {
    const { ui } = makeManager();
    expect(ui.root).toBeDefined();
    expect(ui.dialogueBox).toBeDefined();
    expect(ui.choicePanel).toBeDefined();
  });

  it('should route script:say to the dialogue box', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });
    expect(ui.dialogueBox.visible).toBe(true);
    expect(ui.dialogueBox.isBusy()).toBe(true);
  });

  it('should route script:clear to clear the dialogue box', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });
    bus.emit('script:clear', {});
    expect(ui.dialogueBox.isBusy()).toBe(false);
    expect(ui.dialogueBox.visible).toBe(false);
  });

  it('should route script:choice to build choice buttons', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:choice', {
      choices: [
        { text: '回应他', label: 'respond' },
        { text: '无视他', label: 'ignore' },
      ],
    });
    expect(ui.choicePanel.buttons).toHaveLength(2);
  });

  it('should emit input:skip while the typewriter is busy', () => {
    const { bus, ui } = makeManager();
    const skip = listen(bus, 'input:skip');
    const click = listen(bus, 'input:click');
    bus.emit('script:say', { speaker: 'Hero', text: 'A long message' });
    ui.handleTap(10, 20);
    expect(skip).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it('should emit input:click when the typewriter is idle', () => {
    const { bus, ui } = makeManager();
    const skip = listen(bus, 'input:skip');
    const click = listen(bus, 'input:click');
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });
    ui.update(100);
    expect(ui.dialogueBox.isBusy()).toBe(false);
    ui.handleTap(30, 40);
    expect(click).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(skip).not.toHaveBeenCalled();
  });

  it('should emit script:choice:selected with the label when a choice is tapped', () => {
    const { bus, ui } = makeManager();
    const selected = listen(bus, 'script:choice:selected');
    bus.emit('script:choice', {
      choices: [
        { text: '回应他', label: 'respond' },
        { text: '无视他', label: 'ignore' },
      ],
    });
    ui.choicePanel.buttons[1].emit('pointertap', {
      global: { x: 10, y: 10 },
      stopPropagation: vi.fn(),
    } as unknown as FederatedPointerEvent);
    expect(selected).toHaveBeenCalledWith({ label: 'ignore' });
  });

  it('should drive the typewriter through update', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', {
      speaker: 'Hero',
      text: 'Hello world',
      speed: 100,
    });
    ui.update(16);
    expect(ui.dialogueBox.currentText.length).toBeGreaterThan(0);
  });

  it('should stop listening to script events after destroy', () => {
    const { bus, ui } = makeManager();
    ui.destroy();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });
    expect(ui.dialogueBox.visible).toBe(false);
  });
});
