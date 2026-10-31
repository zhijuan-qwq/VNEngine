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

/** 槽位卡上的全部文字（标题/时间/摘要顺序不保证，按内容断言用） */
function textsOf(menu: SaveLoadMenu, index: number): string[] {
  return menu.buttons[index].children
    .filter((child) => 'text' in child)
    .map((child) => (child as unknown as { text: string }).text);
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
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      onLoad,
      getSlots: () => [
        { slot: 0 },
        { slot: 1 },
        { slot: 2, label: '章节二', timestamp: 1716900000000 },
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
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      slots: [0],
      getSlots: () => [
        { slot: 5, label: '章节一', timestamp: 1716900000000 },
        { slot: 6 },
      ],
    });
    menu.show('load');
    expect(menu.buttons).toHaveLength(2);
    expect(labelOf(menu, 0)).toBe('存档 6');
    expect(textsOf(menu, 0)).toContain('章节一');
    expect(labelOf(menu, 1)).toBe('存档 7');
    expect(textsOf(menu, 1)).toContain('空槽');
  });

  it('should clip an over-long summary with an ellipsis', () => {
    const menu = new SaveLoadMenu({
      width: 800,
      height: 600,
      getSlots: () => [
        { slot: 0, label: '一'.repeat(30), timestamp: 1716900000000 },
        { slot: 1, label: '短摘要', timestamp: 1716900000000 },
      ],
    });
    menu.show('load');
    const clipped = textsOf(menu, 0).pop();
    expect(clipped?.endsWith('…')).toBe(true);
    expect(clipped?.length).toBeLessThan(30);
    expect(textsOf(menu, 1)).toContain('短摘要');
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
