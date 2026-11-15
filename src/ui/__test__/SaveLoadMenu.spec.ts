import type { Container, FederatedPointerEvent } from 'pixi.js';
import { SaveLoadMenu } from '../SaveLoadMenu';
import type { SaveLoadMenuOptions, SaveSlotInfo } from '../SaveLoadMenu';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeMenu(options: Partial<SaveLoadMenuOptions> = {}): SaveLoadMenu {
  return new SaveLoadMenu({
    width: 800,
    height: 600,
    slots: [0, 1, 2],
    ...options,
  });
}

function tap(button: { emit(event: string, payload: unknown): void }): void {
  button.emit('pointertap', {
    stopPropagation: vi.fn(),
  } as unknown as FederatedPointerEvent);
}

function textsOf(container: Container): string[] {
  const result: string[] = [];
  const visit = (node: Container): void => {
    const text = (node as unknown as { text?: unknown }).text;
    if (typeof text === 'string') {
      result.push(text);
    }
    for (const child of node.children) {
      visit(child as Container);
    }
  };
  visit(container);
  return result;
}

function findText(
  container: Container,
  text: string,
): { x: number; y: number } | null {
  let found: { x: number; y: number } | null = null;
  const visit = (node: Container): void => {
    if (found) return;
    if ((node as unknown as { text?: unknown }).text === text) {
      found = node as unknown as { x: number; y: number };
      return;
    }
    for (const child of node.children) {
      visit(child as Container);
    }
  };
  visit(container);
  return found;
}

describe('SaveLoadMenu', () => {
  it('should start hidden in load mode', () => {
    const menu = makeMenu();
    expect(menu.visible).toBe(false);
    expect(menu.mode).toBe('load');
  });

  it('should switch to save mode on show', () => {
    const menu = makeMenu();
    menu.show('save');
    expect(menu.mode).toBe('save');
    expect(menu.visible).toBe(true);
  });

  it('should treat an unknown mode as load', () => {
    const menu = makeMenu();
    menu.show('nope' as unknown as 'load');
    expect(menu.mode).toBe('load');
  });

  it('should create one card per slot', () => {
    const menu = makeMenu();
    menu.show('load');
    expect(menu.buttons).toHaveLength(3);
  });

  it('should show an empty state when there are no slots', () => {
    const menu = makeMenu({ slots: [] });
    menu.show('load');
    expect(menu.buttons).toHaveLength(0);
  });

  it('should lay slots out in a grid', () => {
    const menu = makeMenu({ slots: [0, 1, 2], columns: 2 });
    menu.show('load');
    expect(menu.buttons[0].y).toBe(menu.buttons[1].y);
    expect(menu.buttons[1].x).toBeGreaterThan(menu.buttons[0].x);
    expect(menu.buttons[2].y).toBeGreaterThan(menu.buttons[0].y);
  });

  it('should adapt columns to the available width', () => {
    const menu = new SaveLoadMenu({
      width: 1280,
      height: 720,
      slots: Array.from({ length: 12 }, (_, index) => index),
    });
    menu.show('load');
    expect(menu.buttons).toHaveLength(12);
    expect(menu.buttons[4].y).toBe(menu.buttons[0].y);
    expect(menu.buttons[5].y).toBeGreaterThan(menu.buttons[0].y);
    expect(menu.buttons[5].x).toBe(menu.buttons[0].x);
  });

  it('should render an empty placeholder for unsaved slots', () => {
    const menu = makeMenu();
    menu.show('save');
    expect(textsOf(menu.buttons[0])).toContain('空');
  });

  it('should render the save time on occupied cards', () => {
    const timestamp = new Date(2026, 0, 2, 3, 4).getTime();
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      getSlots: () => [{ slot: 0, timestamp }],
    });
    menu.show('load');
    expect(menu.times).toEqual(['01-02 03:04']);
    expect(textsOf(menu.buttons[0])).toContain('01-02 03:04');
  });

  it('should place the time centred below the thumbnail', () => {
    const timestamp = new Date(2026, 0, 2, 3, 4).getTime();
    const menu = makeMenu({
      columns: 2,
      getSlots: () => [{ slot: 0, timestamp }],
    });
    menu.show('load');
    const label = findText(menu.buttons[0], '01-02 03:04');
    expect(label).not.toBeNull();
    // 800 宽、页面左右各 24 内边距、两列一间隔
    const cellWidth = (800 - 48 - 24) / 2;
    const imageHeight = Math.round(cellWidth * (9 / 16));
    expect(label?.y).toBeGreaterThanOrEqual(imageHeight);
  });

  it('should call onSave with the slot in save mode and stay open', () => {
    const onSave = vi.fn();
    const menu = makeMenu({ onSave });
    menu.show('save');
    tap(menu.buttons[1]);
    expect(onSave).toHaveBeenCalledWith(1);
    expect(menu.visible).toBe(true);
  });

  it('should call onLoad with the slot in load mode', () => {
    const onLoad = vi.fn();
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      onLoad,
      getSlots: () => [
        { slot: 0, timestamp: 1 },
        { slot: 1, timestamp: 1 },
        { slot: 2, label: '章节二', timestamp: 1 },
      ],
    });
    menu.show('load');
    tap(menu.buttons[2]);
    expect(onLoad).toHaveBeenCalledWith(2);
  });

  it('should disable empty slots in load mode', () => {
    const onLoad = vi.fn();
    const menu = makeMenu({ onLoad, slots: [0, 1, 2] });
    menu.show('load');
    expect(menu.buttons[2].alpha).toBeLessThan(1);
    tap(menu.buttons[2]);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('should allow saving into an empty slot in save mode', () => {
    const onSave = vi.fn();
    const menu = makeMenu({ onSave, slots: [0, 1, 2] });
    menu.show('save');
    tap(menu.buttons[2]);
    expect(onSave).toHaveBeenCalledWith(2);
  });

  it('should prefer getSlots over slots', () => {
    const timestamp = new Date(2026, 5, 6, 7, 8).getTime();
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      slots: [0],
      getSlots: () => [{ slot: 5, label: '章节一', timestamp }, { slot: 6 }],
    });
    menu.show('load');
    expect(menu.buttons).toHaveLength(2);
    expect(menu.times).toEqual(['06-06 07:08']);
    expect(textsOf(menu.buttons[1])).toContain('空');
  });

  it('should rebuild cards when reopened with different slots', () => {
    let slots = [0, 1];
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      getSlots: () => slots.map((slot) => ({ slot })),
    });
    menu.show('load');
    expect(menu.buttons).toHaveLength(2);
    slots = [0, 1, 2, 3];
    menu.show('save');
    expect(menu.buttons).toHaveLength(4);
  });

  it('should rebuild cards on refresh while visible', () => {
    let slots: SaveSlotInfo[] = [{ slot: 0 }];
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      getSlots: () => slots,
    });
    menu.show('save');
    slots = [{ slot: 0, timestamp: 1 }, { slot: 1 }];
    menu.refresh();
    expect(menu.buttons).toHaveLength(2);
  });
});
