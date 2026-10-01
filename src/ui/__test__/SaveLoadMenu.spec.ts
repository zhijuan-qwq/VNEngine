import type { FederatedPointerEvent } from 'pixi.js';
import { SaveLoadMenu } from '../SaveLoadMenu';
import type { SaveLoadMenuOptions } from '../SaveLoadMenu';

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

function labelOf(menu: SaveLoadMenu, index: number): string {
  const label = menu.buttons[index].children[1] as unknown as { text: string };
  return label.text;
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

  it('should create one button per slot', () => {
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

  it('should call onSave with the slot in save mode and hide', () => {
    const onSave = vi.fn();
    const menu = makeMenu({ onSave });
    menu.show('save');
    tap(menu.buttons[1]);
    expect(onSave).toHaveBeenCalledWith(1);
    expect(menu.visible).toBe(false);
  });

  it('should call onLoad with the slot in load mode', () => {
    const onLoad = vi.fn();
    const menu = makeMenu({ onLoad });
    menu.show('load');
    tap(menu.buttons[2]);
    expect(onLoad).toHaveBeenCalledWith(2);
  });

  it('should prefer getSlots over slots', () => {
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      slots: [0],
      getSlots: () => [{ slot: 5, label: '章节一' }, { slot: 6 }],
    });
    menu.show('load');
    expect(menu.buttons).toHaveLength(2);
    expect(labelOf(menu, 0)).toBe('存档 6  章节一');
    expect(labelOf(menu, 1)).toBe('存档 7  空');
  });

  it('should rebuild buttons when reopened with different slots', () => {
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
});
