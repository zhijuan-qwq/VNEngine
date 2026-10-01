import type { FederatedPointerEvent } from 'pixi.js';
import type { Choice } from '@/types/script';
import { ChoicePanel } from '../ChoicePanel';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function tapEvent(): FederatedPointerEvent {
  return { stopPropagation: vi.fn() } as unknown as FederatedPointerEvent;
}

const choices: Choice[] = [
  { text: '回应他', label: 'respond' },
  { text: '无视他', label: 'ignore' },
];

function makePanel(onSelect?: (label: string) => void): ChoicePanel {
  return new ChoicePanel({ width: 400, onSelect });
}

describe('ChoicePanel', () => {
  it('should start hidden with no buttons', () => {
    const panel = makePanel();
    expect(panel.visible).toBe(false);
    expect(panel.buttons).toHaveLength(0);
  });

  it('should create one button per choice on show', () => {
    const panel = makePanel();
    panel.show(choices, 'adv');
    expect(panel.visible).toBe(true);
    expect(panel.buttons).toHaveLength(2);
  });

  it('should call onSelect with the label when a button is tapped', () => {
    const onSelect = vi.fn();
    const panel = makePanel(onSelect);
    panel.show(choices, 'adv');
    const event = tapEvent();
    panel.buttons[1].emit('pointertap', event);
    expect(onSelect).toHaveBeenCalledWith('ignore');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should ignore taps on disabled choices', () => {
    const onSelect = vi.fn();
    const panel = makePanel(onSelect);
    panel.show([{ text: '锁定', label: 'locked', enabled: false }], 'adv');
    expect(panel.buttons[0].alpha).toBe(0.5);
    panel.buttons[0].emit('pointertap', tapEvent());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should hide and clear buttons on hide', () => {
    const panel = makePanel();
    panel.show(choices, 'adv');
    panel.hide();
    expect(panel.visible).toBe(false);
    expect(panel.buttons).toHaveLength(0);
  });

  it('should clear previous buttons when showing again', () => {
    const panel = makePanel();
    panel.show(choices, 'adv');
    panel.show([{ text: '再来一次', label: 'again' }], 'adv');
    expect(panel.buttons).toHaveLength(1);
    expect(panel.visible).toBe(true);
  });
});
