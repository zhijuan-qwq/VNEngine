import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { DialogueBox } from '../DialogueBox';

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

  it('should draw no background panel by default (subtitle style)', () => {
    const box = makeBox();
    const bg = box.children[0] as unknown as {
      context: { instructions: unknown[] };
    };
    expect(bg.context.instructions).toHaveLength(0);
  });

  it('should draw a background panel when a backgroundColor is given', () => {
    const box = new DialogueBox({
      width: 600,
      height: 180,
      backgroundColor: 0x112233,
    });
    const bg = box.children[0] as unknown as {
      context: {
        instructions: Array<{
          action: string;
          data: { style: { color: number } };
        }>;
      };
    };
    const fill = bg.context.instructions.find(
      (instruction) => instruction.action === 'fill',
    );
    expect(fill?.data.style.color).toBe(0x112233);
  });

  it('should center each subtitle line horizontally', () => {
    const box = makeBox();
    box.show('Hero', 'Hello world', 100);
    box.complete();
    // 字号 28 → 每字 16.8px；"Hello world" 宽 184.8，正文区宽 552
    const body = box.children.find(
      (child) => (child as { text?: string }).text === 'Hello world',
    ) as unknown as { x: number };
    expect(body.x).toBeCloseTo(24 + (552 - 184.8) / 2);
  });

  it('should center the speaker name above the subtitle', () => {
    const box = makeBox();
    box.show('Hero', 'Hi', 100);
    box.complete();
    const speaker = box.children.find(
      (child) => (child as { text?: string }).text === 'Hero',
    ) as unknown as { x: number; y: number };
    // "Hero" 宽 4 × 28 × 0.6 = 67.2
    expect(speaker.x).toBeCloseTo((600 - 67.2) / 2);
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
