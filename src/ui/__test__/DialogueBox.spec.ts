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
});
