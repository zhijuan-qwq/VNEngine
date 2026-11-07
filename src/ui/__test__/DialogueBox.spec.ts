import { Sprite } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { DialogueBox } from '../DialogueBox';
import { DEFAULT_UI_THEME } from '../theme';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeBox(): DialogueBox {
  return new DialogueBox({ width: 600, height: 180 });
}

describe('DialogueBox', () => {
  it('should start hidden and not busy', () => {
    const box = makeBox();
    expect(box.visible).toBe(false);
    expect(box.isBusy()).toBe(false);
  });

  it('should become busy when showing a message', () => {
    const box = makeBox();
    box.show('Hero', 'Hello world', 100);
    expect(box.visible).toBe(true);
    expect(box.isBusy()).toBe(true);
    expect(box.currentText).toBe('');
  });

  it('should reveal characters as time passes', () => {
    const box = makeBox();
    // speed 100 chars/s → 16ms ≈ 1.6 chars per frame
    box.show('Hero', 'Hello world', 100);
    box.update(16);
    expect(box.currentText.length).toBeGreaterThan(0);
    expect(box.currentText.length).toBeLessThan('Hello world'.length);
  });

  it('should stop being busy once the full text is revealed', () => {
    const box = makeBox();
    box.show('Hero', 'Hello world', 100);
    box.update(200);
    expect(box.currentText).toBe('Hello world');
    expect(box.isBusy()).toBe(false);
  });

  it('should complete and reveal the full text via complete()', () => {
    const box = makeBox();
    box.show('Hero', 'Long message', 1);
    box.complete();
    expect(box.currentText).toBe('Long message');
    expect(box.isBusy()).toBe(false);
  });

  it('should show the speaker name', () => {
    const box = makeBox();
    box.show('Hero', 'Hi', 100);
    const speaker = box.children.find(
      (child) => 'text' in child && child.visible === true,
    ) as { text: string } | undefined;
    expect(speaker?.text).toBe('Hero');
  });

  it('should fade the backdrop in from transparent at the top', () => {
    const box = makeBox();
    const bg = box.children[0];
    expect(bg).toBeInstanceOf(Sprite);

    const sprite = bg as unknown as Sprite;
    expect(sprite.width).toBe(600);
    expect(sprite.height).toBe(180);

    const resource = sprite.texture.source.resource as Uint8Array;
    const rows = Math.max(2, Math.round(sprite.height));
    expect(sprite.texture.source.height).toBe(rows);
    expect(resource).toHaveLength(rows * 4);
    // 纹理首行为完全透明，末行为设置的半透明度
    expect(resource[3]).toBe(0);
    const last = (rows - 1) * 4;
    expect(resource[last + 3]).toBe(
      Math.round(DEFAULT_UI_THEME.colors.surfaceDialogueAlpha * 255),
    );
    const color = DEFAULT_UI_THEME.colors.surfaceDialogue;
    expect([resource[last], resource[last + 1], resource[last + 2]]).toEqual([
      (color >> 16) & 0xff,
      (color >> 8) & 0xff,
      color & 0xff,
    ]);
  });

  it('should draw a flat background panel when a backgroundColor is given', () => {
    const box = new DialogueBox({
      width: 600,
      height: 180,
      backgroundColor: 0x112233,
    });
    const bg = box.children[0] as unknown as {
      context: {
        instructions: Array<{
          action: string;
          data: { style: { color: number; alpha: number } };
        }>;
      };
    };
    const fills = bg.context.instructions.filter(
      (instruction) => instruction.action === 'fill',
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].data.style.color).toBe(0x112233);
    expect(fills[0].data.style.alpha).toBe(1);
  });

  it('should skip the backdrop when backgroundAlpha is zero', () => {
    const box = new DialogueBox({
      width: 600,
      height: 180,
      backgroundAlpha: 0,
    });
    expect(box.children.some((child) => child instanceof Sprite)).toBe(false);
  });

  it('should left-align subtitle text with a small margin', () => {
    const box = makeBox();
    box.show('Hero', 'Hello world', 100);
    box.complete();
    const body = box.children.find(
      (child) => (child as { text?: string }).text === 'Hello world',
    ) as unknown as { x: number };
    expect(body.x).toBe(DEFAULT_UI_THEME.spacing.s16);
  });

  it('should left-align the speaker name above the subtitle', () => {
    const box = makeBox();
    box.show('Hero', 'Hi', 100);
    box.complete();
    const speaker = box.children.find(
      (child) => (child as { text?: string }).text === 'Hero',
    ) as unknown as { x: number; y: number };
    expect(speaker.x).toBe(DEFAULT_UI_THEME.spacing.s16);
    expect(speaker.y).toBeGreaterThan(0);
  });

  it('should clear and hide via clear()', () => {
    const box = makeBox();
    box.show('Hero', 'Hi', 100);
    box.clear();
    expect(box.visible).toBe(false);
    expect(box.isBusy()).toBe(false);
    expect(box.currentText).toBe('');
  });

  it('should complete when input:skip fires on the event bus', () => {
    const bus = new EventBus<EngineEvents>();
    const box = new DialogueBox({ width: 600, height: 180, eventBus: bus });
    box.show('Hero', 'Skip me', 1);
    bus.emit('input:skip', {});
    expect(box.currentText).toBe('Skip me');
    expect(box.isBusy()).toBe(false);
  });

  it('should use the textSpeed setting as the default typing speed', () => {
    const bus = new EventBus<EngineEvents>();
    const box = new DialogueBox({ width: 600, height: 180, eventBus: bus });
    bus.emit('game:settings', { key: 'textSpeed', value: 100 });

    box.show('Hero', 'Hello world');
    box.update(16);

    // 默认速度 40 时 16ms 不足 1 字，100 时才推进
    expect(box.currentText.length).toBeGreaterThan(0);
  });

  it('should apply a fontSize setting to the speaker and body text', () => {
    const bus = new EventBus<EngineEvents>();
    const box = new DialogueBox({ width: 600, height: 180, eventBus: bus });
    box.show('Hero', 'Resize me', 1);
    box.complete();

    bus.emit('game:settings', { key: 'fontSize', value: 40 });

    const speaker = box.children.find(
      (child) => (child as { text?: string }).text === 'Hero',
    ) as unknown as { style: { fontSize?: number } };
    expect(speaker.style.fontSize).toBe(40);
    const body = box.children.find(
      (child) => (child as { text?: string }).text === 'Resize me',
    ) as unknown as { style: { fontSize?: number } };
    expect(body.style.fontSize).toBe(40);
  });

  it('should ignore non-numeric textSpeed and fontSize settings', () => {
    const bus = new EventBus<EngineEvents>();
    const box = new DialogueBox({ width: 600, height: 180, eventBus: bus });

    expect(() => {
      bus.emit('game:settings', {
        key: 'textSpeed',
        value: 'fast' as unknown as number,
      });
      bus.emit('game:settings', {
        key: 'fontSize',
        value: 'big' as unknown as number,
      });
    }).not.toThrow();
    expect(box.visible).toBe(false);
  });
});
