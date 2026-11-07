import type { FederatedPointerEvent } from 'pixi.js';
import {
  createBackdrop,
  createButton,
  createPanelBox,
  UIButton,
} from '../overlay';
import { DEFAULT_UI_THEME } from '../theme';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function tapEvent(): FederatedPointerEvent {
  return { stopPropagation: vi.fn() } as unknown as FederatedPointerEvent;
}

function makeButton(
  options: Partial<Parameters<typeof createButton>[0]> = {},
): UIButton {
  return createButton({
    width: 200,
    height: 48,
    label: '确定',
    ...options,
  });
}

function labelOf(button: UIButton): { text: string; style: unknown } {
  return button.children[1] as unknown as { text: string; style: unknown };
}

function fillOf(button: UIButton): { color: number; alpha: number } {
  const bg = button.children[0] as unknown as {
    context: {
      instructions: Array<{
        action: string;
        data: { style: { color: number; alpha: number } };
      }>;
    };
  };
  const fill = bg.context.instructions.find(
    (instruction) => instruction.action === 'fill',
  );
  if (!fill) throw new Error('button background has no fill instruction');
  return fill.data.style;
}

describe('createBackdrop', () => {
  it('should fill the whole screen and swallow taps', () => {
    const backdrop = createBackdrop(800, 600);
    expect(backdrop.eventMode).toBe('static');
    expect(backdrop.hitArea).toMatchObject({
      width: 800,
      height: 600,
    });
    const event = tapEvent();
    backdrop.emit('pointertap', event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should accept explicit color and alpha overrides', () => {
    const backdrop = createBackdrop(10, 10, { color: 0xffffff, alpha: 0.5 });
    expect(backdrop).toBeDefined();
  });
});

describe('createPanelBox', () => {
  it('should return a drawable graphics object', () => {
    const box = createPanelBox(400, 300);
    expect(box).toBeDefined();
  });
});

describe('createButton', () => {
  it('should keep children order [background, label]', () => {
    const button = makeButton();
    expect(button.children).toHaveLength(2);
    expect(labelOf(button).text).toBe('确定');
  });

  it('should default to a secondary button in the normal state', () => {
    const button = makeButton();
    expect(button.state).toBe('normal');
    const style = labelOf(button).style as { fill: number };
    expect(style.fill).toBe(DEFAULT_UI_THEME.colors.textPrimary);
  });

  it('should use the on-primary text color for primary buttons', () => {
    const button = makeButton({ variant: 'primary' });
    const style = labelOf(button).style as { fill: number };
    expect(style.fill).toBe(DEFAULT_UI_THEME.colors.textOnPrimary);
  });

  it('should move through hover and pressed states', () => {
    const button = makeButton();
    button.emit('pointerover', tapEvent());
    expect(button.state).toBe('hover');
    button.emit('pointerdown', tapEvent());
    expect(button.state).toBe('pressed');
    button.emit('pointerup', tapEvent());
    expect(button.state).toBe('hover');
    button.emit('pointerout', tapEvent());
    expect(button.state).toBe('normal');
  });

  it('should left-align labels by 12px and center when asked', () => {
    const left = makeButton();
    expect(left.children[1].x).toBe(DEFAULT_UI_THEME.spacing.s12);

    const centered = makeButton({ align: 'center' });
    const label = centered.children[1] as unknown as { width: number };
    expect(centered.children[1].x).toBeCloseTo((200 - label.width) / 2);
  });

  it('should dim disabled buttons and ignore taps', () => {
    const onTap = vi.fn();
    const button = makeButton({ disabled: true, onTap });
    expect(button.alpha).toBe(DEFAULT_UI_THEME.opacity.disabled);
    expect(button.enabled).toBe(false);

    button.emit('pointerover', tapEvent());
    expect(button.state).toBe('normal');

    button.emit('pointertap', tapEvent());
    expect(onTap).not.toHaveBeenCalled();
  });

  it('should restore interactivity through setEnabled', () => {
    const onTap = vi.fn();
    const button = makeButton({ disabled: true, onTap });
    button.setEnabled(true);
    expect(button.alpha).toBe(1);
    button.emit('pointertap', tapEvent());
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('should stop tap propagation for enabled buttons', () => {
    const button = makeButton({ onTap: vi.fn() });
    const event = tapEvent();
    button.emit('pointertap', event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should honour explicit background and text colors', () => {
    const button = makeButton({
      backgroundColor: 0x112233,
      textColor: 0x445566,
    });
    const style = labelOf(button).style as { fill: number };
    expect(style.fill).toBe(0x445566);
    expect(fillOf(button).color).toBe(0x112233);
  });

  it('should keep explicit colors across hover and re-enable', () => {
    const button = makeButton({
      backgroundColor: 0x112233,
      textColor: 0x445566,
    });
    button.emit('pointerover', tapEvent());
    button.emit('pointerout', tapEvent());
    expect(fillOf(button).color).toBe(0x112233);
    expect((labelOf(button).style as { fill: number }).fill).toBe(0x445566);

    button.setEnabled(false);
    button.setEnabled(true);
    expect(fillOf(button).color).toBe(0x112233);
    expect((labelOf(button).style as { fill: number }).fill).toBe(0x445566);
  });

  it('should use the disabled text color while disabled', () => {
    const button = makeButton({
      textColor: 0x445566,
      disabledTextColor: 0x778899,
      disabled: true,
    });
    expect((labelOf(button).style as { fill: number }).fill).toBe(0x778899);
  });
});
