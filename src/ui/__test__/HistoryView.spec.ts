import type { DialogueEntry } from '@/types/engine';
import { HistoryView } from '../HistoryView';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function entry(speaker: string, text: string): DialogueEntry {
  return { speaker, text, timestamp: 0 };
}

describe('HistoryView', () => {
  it('should start hidden', () => {
    const view = new HistoryView({ width: 800, height: 600 });
    expect(view.visible).toBe(false);
  });

  it('should render one row per entry on show', () => {
    const view = new HistoryView({
      width: 800,
      height: 600,
      getEntries: () => [entry('Hero', 'Hi'), entry('Npc', 'Hello')],
    });
    view.show();
    expect(view.rowCount).toBe(2);
  });

  it('should render a placeholder when there are no entries', () => {
    const view = new HistoryView({
      width: 800,
      height: 600,
      getEntries: () => [],
    });
    view.show();
    expect(view.rowTexts).toEqual(['（暂无对话记录）']);
  });

  it('should render an empty list without a provider', () => {
    const view = new HistoryView({ width: 800, height: 600 });
    view.show();
    expect(view.rowTexts).toEqual(['（暂无对话记录）']);
  });

  it('should prefix the speaker when one is present', () => {
    const view = new HistoryView({
      width: 800,
      height: 600,
      getEntries: () => [entry('Hero', 'Hi'), entry('', '独白')],
    });
    view.show();
    expect(view.rowTexts).toEqual(['Hero：Hi', '独白']);
  });

  it('should rebuild rows on every show', () => {
    const entries: DialogueEntry[] = [entry('Hero', 'Hi')];
    const view = new HistoryView({
      width: 800,
      height: 600,
      getEntries: () => entries,
    });
    view.show();
    expect(view.rowCount).toBe(1);
    entries.push(entry('Npc', 'Hello'));
    view.show();
    expect(view.rowCount).toBe(2);
  });

  it('should hide on demand', () => {
    const view = new HistoryView({ width: 800, height: 600 });
    view.show();
    view.hide();
    expect(view.visible).toBe(false);
  });
});
