import type { Container, FederatedPointerEvent } from 'pixi.js';
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

  it('should place the dialogue box at the bottom by default', () => {
    const { ui } = makeManager();
    expect(ui.dialogueBox.x).toBe(0);
    expect(ui.dialogueBox.y).toBe(420);
  });

  it('should honour an explicit dialogue box height', () => {
    const bus = new EventBus<EngineEvents>();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      dialogueBox: { height: 200 },
    });
    expect(ui.dialogueBox.y).toBe(400);
  });

  it('should scale the root and report the virtual size on resize', () => {
    const { ui } = makeManager();

    const virtual = ui.resize({ width: 745, height: 264 });

    expect(ui.root.scale.x).toBeCloseTo(0.8);
    expect(virtual.width).toBeCloseTo(745 / 0.8);
    expect(virtual.height).toBeCloseTo(264 / 0.8);
    expect(ui.dialogueBox.y).toBeCloseTo(virtual.height - 120);
    // 手机档（scale=0.8）快捷栏用紧凑尺寸：高 21 + 留白 10
    expect(ui.menuBar.buttons[0].y).toBeCloseTo(virtual.height - 31);
  });

  it('should grow the dialogue box to fit long text on short screens', () => {
    const { bus, ui } = makeManager();
    const virtual = ui.resize({ width: 745, height: 264 });

    bus.emit('script:say', {
      speaker: '星弥',
      text: '长'.repeat(200),
      mode: 'adv',
    });

    const cap = Math.round(virtual.height * 0.7);
    expect(ui.dialogueBox.y).toBeLessThan(virtual.height - 120);
    expect(ui.dialogueBox.y).toBeGreaterThanOrEqual(virtual.height - cap);

    bus.emit('script:clear', {});
    expect(ui.dialogueBox.y).toBeCloseTo(virtual.height - 120);
  });

  it('should ignore a non-finite viewport size', () => {
    const { ui } = makeManager();
    const before = ui.resize({ width: 745, height: 264 });

    const after = ui.resize({
      width: Number.POSITIVE_INFINITY,
      height: Number.NaN,
    });

    expect(after).toEqual(before);
  });

  it('should keep the dialogue above visible choices without overlap', () => {
    const { bus, ui } = makeManager();
    const virtual = ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    bus.emit('script:say', {
      speaker: '星弥',
      text: '字'.repeat(70),
      mode: 'adv',
    });
    bus.emit('script:choice', {
      choices: [
        { text: '继续', label: 'continue' },
        { text: '停下', label: 'stop' },
      ],
    });

    expect(ui.dialogueBox.visible).toBe(true);
    expect(ui.choicePanel.buttons).toHaveLength(2);
    expect(ui.dialogueBox.y).toBeGreaterThanOrEqual(
      ui.choicePanel.blockBottom() + 8 - 0.001,
    );
    const textBottom = ui.dialogueBox.y + ui.dialogueBox.textBottomOffset();
    const menuBarTop = virtual.height - ui.menuBar.reserveHeight;
    expect(textBottom).toBeLessThanOrEqual(menuBarTop + 0.001);
  });

  it('should keep a short dialogue below three choices when it fits', () => {
    const { bus, ui } = makeManager();
    const virtual = ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    bus.emit('script:say', {
      speaker: '星弥',
      text: '字'.repeat(20),
      mode: 'adv',
    });
    bus.emit('script:choice', {
      choices: [
        { text: '继续', label: 'continue' },
        { text: '停下', label: 'stop' },
        { text: '退出', label: 'quit' },
      ],
    });

    expect(ui.dialogueBox.visible).toBe(true);
    expect(ui.choicePanel.buttons).toHaveLength(3);
    expect(ui.dialogueBox.y).toBeGreaterThanOrEqual(
      ui.choicePanel.blockBottom() + 8 - 0.001,
    );
    expect(
      ui.dialogueBox.y + ui.dialogueBox.textBottomOffset(),
    ).toBeLessThanOrEqual(virtual.height - ui.menuBar.reserveHeight + 0.001);
  });

  it('should restore the dialogue after a choice is selected', () => {
    const { bus, ui } = makeManager();
    ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    bus.emit('script:say', {
      speaker: '星弥',
      text: '字'.repeat(160),
      mode: 'adv',
    });
    bus.emit('script:choice', {
      choices: [
        { text: '继续', label: 'continue' },
        { text: '停下', label: 'stop' },
        { text: '退出', label: 'quit' },
      ],
    });
    expect(ui.dialogueBox.visible).toBe(false);

    tapNode(ui.choicePanel.buttons[0]);

    expect(ui.choicePanel.visible).toBe(false);
    expect(ui.dialogueBox.visible).toBe(true);
  });

  it('should apply the choice avoidance to an explicit dialogue height', () => {
    const bus = new EventBus<EngineEvents>();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      dialogueBox: { height: 200 },
    });
    ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    bus.emit('script:say', {
      speaker: '星弥',
      text: '字'.repeat(160),
      mode: 'adv',
    });
    bus.emit('script:choice', {
      choices: [
        { text: '继续', label: 'continue' },
        { text: '停下', label: 'stop' },
        { text: '退出', label: 'quit' },
      ],
    });

    expect(ui.dialogueBox.visible).toBe(false);
  });

  it('should hide the dialogue when choices leave no room above it', () => {
    const { bus, ui } = makeManager();
    ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    bus.emit('script:say', {
      speaker: '星弥',
      text: '字'.repeat(160),
      mode: 'adv',
    });
    bus.emit('script:choice', {
      choices: [
        { text: '继续', label: 'continue' },
        { text: '停下', label: 'stop' },
        { text: '退出', label: 'quit' },
      ],
    });

    expect(ui.dialogueBox.visible).toBe(false);
    expect(ui.choicePanel.buttons).toHaveLength(3);
  });

  it('should align the ui width to the scene frame', () => {
    const { ui } = makeManager();

    const virtual = ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 469, height: 264 },
    );

    expect(ui.root.scale.x).toBeCloseTo(0.8);
    expect(ui.root.x).toBeCloseTo(138);
    expect(virtual.width).toBeCloseTo(469 / 0.8);
    expect(virtual.height).toBeCloseTo(264 / 0.8);
    const last = ui.menuBar.buttons[3];
    const lastWidth = (last.hitArea as unknown as { width: number }).width;
    expect(last.x + lastWidth).toBeCloseTo(virtual.width - 10);
  });

  it('should fall back to the viewport when the frame is invalid', () => {
    const { ui } = makeManager();

    const virtual = ui.resize(
      { width: 745, height: 264 },
      { x: 138, y: 0, width: 0, height: 0 },
    );

    expect(ui.root.x).toBe(0);
    expect(virtual.width).toBeCloseTo(745 / 0.8);
  });

  it('should skip relayout when the viewport is unchanged', () => {
    const { ui } = makeManager();
    ui.resize({ width: 745, height: 264 });
    const resize = vi.spyOn(ui.dialogueBox, 'resize');

    ui.resize({ width: 745, height: 264 });

    expect(resize).not.toHaveBeenCalled();
  });

  it('should ignore a zero-size viewport', () => {
    const { ui } = makeManager();
    const virtual = ui.resize({ width: 0, height: 0 });

    expect(virtual).toEqual({ width: 800, height: 600 });
    expect(ui.root.scale.x).toBe(1);
  });

  it('should keep an explicit dialogue height across resize', () => {
    const bus = new EventBus<EngineEvents>();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      dialogueBox: { height: 200 },
    });

    const virtual = ui.resize({ width: 745, height: 264 });

    expect(ui.dialogueBox.y).toBeCloseTo(virtual.height - 200);
  });

  it('should route script:say to the dialogue box', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    expect(ui.dialogueBox.visible).toBe(true);
    expect(ui.dialogueBox.isBusy()).toBe(true);
  });

  it('should route script:clear to clear the dialogue box', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    bus.emit('script:clear', {});
    expect(ui.dialogueBox.isBusy()).toBe(false);
    expect(ui.dialogueBox.visible).toBe(false);
  });

  it('should clear dialogue and choices on game:load', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    bus.emit('script:choice', {
      choices: [{ text: '回应他', label: 'respond' }],
    });
    expect(ui.dialogueBox.visible).toBe(true);
    expect(ui.choicePanel.buttons).toHaveLength(1);

    bus.emit('game:load', { slot: 1 });

    expect(ui.dialogueBox.visible).toBe(false);
    expect(ui.dialogueBox.isBusy()).toBe(false);
    expect(ui.choicePanel.buttons).toHaveLength(0);
  });

  it('should stop listening to game:load after destroy', () => {
    const { bus, ui } = makeManager();
    const clearSpy = vi.spyOn(ui.dialogueBox, 'clear');
    ui.destroy();

    bus.emit('game:load', { slot: 1 });

    expect(clearSpy).not.toHaveBeenCalled();
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
    bus.emit('script:say', {
      speaker: 'Hero',
      text: 'A long message',
      mode: 'adv',
    });
    expect(ui.isBusy()).toBe(true);
  });

  it('should report idle once the typewriter finishes', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
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
      mode: 'adv',
      speed: 100,
    });
    ui.update(0.016); // update 以秒为单位：16ms
    expect(ui.dialogueBox.currentText.length).toBeGreaterThan(0);
  });

  it('should stop listening to script events after destroy', () => {
    const { bus, ui } = makeManager();
    ui.destroy();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    expect(ui.dialogueBox.visible).toBe(false);
  });

  it('should expose the built-in panels', () => {
    const { ui } = makeManager();
    expect(ui.confirmDialog).toBeDefined();
    expect(ui.saveLoadMenu).toBeDefined();
    expect(ui.settingsMenu).toBeDefined();
    expect(ui.historyView).toBeDefined();
    expect(ui.menuBar).toBeDefined();
  });

  it('should record dialogue into the history buffer', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    expect(ui.history.entries()).toHaveLength(1);
    expect(ui.history.entries()[0]).toMatchObject({
      speaker: 'Hero',
      text: 'Hi',
    });
  });

  it('should default the history view to the history buffer', () => {
    const { bus, ui } = makeManager();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi', mode: 'adv' });
    ui.open('history');
    expect(ui.historyView.rowTexts).toEqual(['Hero：Hi']);
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
    ui.update(0.2);
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

  it('should fade pages in and out over the update loop', () => {
    const { ui } = makeManager();
    ui.open('settings');
    expect(ui.settingsMenu.visible).toBe(true);
    expect(ui.settingsMenu.alpha).toBe(0);
    ui.update(0.2);
    expect(ui.settingsMenu.alpha).toBe(1);
    ui.close();
    ui.update(0.2);
    expect(ui.settingsMenu.visible).toBe(false);
  });

  it('should shield input during page transitions', () => {
    // 真实命中顺序由 Pixi 层序保证（shield 在页面之上、确认框之下）；
    // 这里验证屏蔽层随过渡开关，动作回调的过渡期守卫由下一条用例覆盖。
    const { ui } = makeManager();
    ui.open('settings');
    expect(ui.inputLocked).toBe(true);
    ui.update(0.2);
    expect(ui.inputLocked).toBe(false);
    ui.close();
    expect(ui.inputLocked).toBe(true);
    ui.update(0.2);
    expect(ui.inputLocked).toBe(false);
    expect(ui.settingsMenu.visible).toBe(false);
  });

  it('should ignore save taps during fade-out', () => {
    const bus = new EventBus<EngineEvents>();
    const onSave = vi.fn();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      saveLoadMenu: { getSlots: () => [{ slot: 0 }], onSave },
    });
    ui.open('save');
    ui.update(0.2);
    tapNode(ui.saveLoadMenu.buttons[0]);
    expect(onSave).toHaveBeenCalledOnce();

    ui.close();
    tapNode(ui.saveLoadMenu.buttons[0]);
    expect(onSave).toHaveBeenCalledOnce();

    ui.update(0.2);
    expect(ui.saveLoadMenu.visible).toBe(false);
  });

  it('should finish fades immediately while the game is paused', () => {
    const { bus, ui } = makeManager();
    ui.open('settings');
    expect(ui.settingsMenu.alpha).toBe(0);

    bus.emit('game:pause', {});
    expect(ui.settingsMenu.alpha).toBe(1);
    expect(ui.inputLocked).toBe(false);

    ui.open('history');
    expect(ui.historyView.alpha).toBe(1);
    expect(ui.inputLocked).toBe(false);
    ui.close();
    expect(ui.historyView.visible).toBe(false);
  });

  function tapNode(node: Container): void {
    node.emit('pointertap', {
      stopPropagation: vi.fn(),
    } as unknown as FederatedPointerEvent);
  }

  it('should capture a thumbnail before opening the save page', () => {
    const bus = new EventBus<EngineEvents>();
    const capture = vi.fn(() => 'data:image/jpeg;base64,thumb');
    const onSave = vi.fn();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      captureThumbnail: capture,
      saveLoadMenu: { getSlots: () => [{ slot: 0 }], onSave },
    });
    ui.open('save');
    expect(capture).toHaveBeenCalledOnce();
    ui.update(0.2);
    tapNode(ui.saveLoadMenu.buttons[0]);
    expect(onSave).toHaveBeenCalledWith(0, 'data:image/jpeg;base64,thumb');
  });

  it('should confirm before overwriting an existing save and keep the page open', async () => {
    const bus = new EventBus<EngineEvents>();
    const onSave = vi.fn();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      captureThumbnail: () => 'data:image/jpeg;base64,thumb',
      saveLoadMenu: {
        getSlots: () => [{ slot: 0, timestamp: 1 }],
        onSave,
      },
    });
    ui.open('save');
    ui.update(0.2);
    tapNode(ui.saveLoadMenu.buttons[0]);
    expect(ui.confirmDialog.visible).toBe(true);
    expect(ui.saveLoadMenu.visible).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    tapNode(ui.confirmDialog.buttons[1]);
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(0, 'data:image/jpeg;base64,thumb');
    expect(ui.saveLoadMenu.visible).toBe(true);
  });

  it('should confirm before loading and return to the game', async () => {
    const bus = new EventBus<EngineEvents>();
    const onLoad = vi.fn();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      saveLoadMenu: {
        getSlots: () => [{ slot: 2, timestamp: 1 }],
        onLoad,
      },
    });
    ui.open('load');
    ui.update(0.2);
    tapNode(ui.saveLoadMenu.buttons[0]);
    expect(ui.confirmDialog.visible).toBe(true);
    tapNode(ui.confirmDialog.buttons[1]);
    await Promise.resolve();
    expect(onLoad).toHaveBeenCalledWith(2);
    expect(ui.saveLoadMenu.visible).toBe(false);
  });

  it('should keep the page open when load is cancelled', async () => {
    const bus = new EventBus<EngineEvents>();
    const onLoad = vi.fn();
    const ui = new UIManager(bus, {
      width: 800,
      height: 600,
      autoTick: false,
      saveLoadMenu: {
        getSlots: () => [{ slot: 0, timestamp: 1 }],
        onLoad,
      },
    });
    ui.open('load');
    ui.update(0.2);
    tapNode(ui.saveLoadMenu.buttons[0]);
    tapNode(ui.confirmDialog.buttons[0]);
    await Promise.resolve();
    expect(onLoad).not.toHaveBeenCalled();
    expect(ui.saveLoadMenu.visible).toBe(true);
  });
});
