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

  it('should report busy while the typewriter is running', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'A long message' });
    expect(ui.isBusy()).toBe(true);
  });

  it('should report idle once the typewriter finishes', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });
    ui.update(100);
    expect(ui.isBusy()).toBe(false);
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

  it('should expose the built-in panels', () => {
    const { ui } = makeManager();
    expect(ui.confirmDialog).toBeDefined();
    expect(ui.saveLoadMenu).toBeDefined();
    expect(ui.settingsMenu).toBeDefined();
    expect(ui.historyView).toBeDefined();
  });

  it('should open a panel from a ui:open event', () => {
    const { bus, ui } = makeManager();
    bus.emit('ui:open', { panel: 'settings' });
    expect(ui.settingsMenu.visible).toBe(true);
  });

  it('should open the save menu in save mode', () => {
    const { bus, ui } = makeManager();
    bus.emit('ui:open', { panel: 'save' });
    expect(ui.saveLoadMenu.visible).toBe(true);
    expect(ui.saveLoadMenu.mode).toBe('save');
  });

  it('should close every panel on ui:close', () => {
    const { bus, ui } = makeManager();
    bus.emit('ui:open', { panel: 'history' });
    bus.emit('ui:close', {});
    expect(ui.historyView.visible).toBe(false);
  });

  it('should keep only one panel open at a time', () => {
    const { ui } = makeManager();
    ui.open('history');
    ui.open('settings');
    expect(ui.historyView.visible).toBe(false);
    expect(ui.settingsMenu.visible).toBe(true);
  });

  it('should resolve confirm through the confirm dialog', async () => {
    const { ui } = makeManager();
    const promise = ui.confirm({ message: '确定吗？' });
    expect(ui.confirmDialog.visible).toBe(true);
    ui.confirmDialog.buttons[1].emit('pointertap', {
      stopPropagation: vi.fn(),
    } as unknown as FederatedPointerEvent);
    await expect(promise).resolves.toBe(true);
  });

  it('should close open panels when a confirm opens', () => {
    const { ui } = makeManager();
    ui.open('settings');
    void ui.confirm({ message: '确定吗？' });
    expect(ui.settingsMenu.visible).toBe(false);
    expect(ui.confirmDialog.visible).toBe(true);
  });

  it('should stop listening to ui events after destroy', () => {
    const { bus, ui } = makeManager();
    ui.destroy();
    bus.emit('ui:open', { panel: 'settings' });
    expect(ui.settingsMenu.visible).toBe(false);
  });
});
