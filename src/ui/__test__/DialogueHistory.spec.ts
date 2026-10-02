import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { DialogueEntry } from '@/types/engine';
import { DialogueHistory } from '../DialogueHistory';

function makeHistory(limit?: number): {
  bus: EventBus<EngineEvents>;
  history: DialogueHistory;
} {
  const bus = new EventBus<EngineEvents>();
  const history = new DialogueHistory(bus, limit);
  return { bus, history };
}

function entry(speaker: string, text: string, timestamp = 0): DialogueEntry {
  return { speaker, text, timestamp };
}

describe('DialogueHistory', () => {
  it('should record a script:say entry with speaker, text and timestamp', () => {
    const { bus, history } = makeHistory();

    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });

    expect(history.entries()).toHaveLength(1);
    expect(history.entries()[0]).toMatchObject({ speaker: 'Hero', text: 'Hi' });
    expect(history.entries()[0].timestamp).toBeTypeOf('number');
  });

  it('should append entries in order', () => {
    const { bus, history } = makeHistory();

    bus.emit('script:say', { speaker: 'Hero', text: 'One' });
    bus.emit('script:say', { speaker: 'Npc', text: 'Two' });

    expect(history.entries().map((item) => item.text)).toEqual(['One', 'Two']);
  });

  it('should drop the oldest entries past the limit', () => {
    const { bus, history } = makeHistory(2);

    bus.emit('script:say', { speaker: 'A', text: '1' });
    bus.emit('script:say', { speaker: 'B', text: '2' });
    bus.emit('script:say', { speaker: 'C', text: '3' });

    expect(history.entries().map((item) => item.text)).toEqual(['2', '3']);
  });

  it('should replace the buffer on restore', () => {
    const { history } = makeHistory();
    history.record(entry('Old', 'gone'));

    history.restore([entry('Hero', 'Hi', 5), entry('Npc', 'Hello', 6)]);

    expect(history.entries()).toEqual([
      entry('Hero', 'Hi', 5),
      entry('Npc', 'Hello', 6),
    ]);
  });

  it('should cap restored entries to the limit', () => {
    const { history } = makeHistory(1);

    history.restore([entry('A', '1'), entry('B', '2')]);

    expect(history.entries()).toEqual([entry('B', '2')]);
  });

  it('should keep no entries when the limit is non-positive', () => {
    const { bus, history } = makeHistory(0);

    bus.emit('script:say', { speaker: 'A', text: '1' });
    history.restore([entry('B', '2')]);

    expect(history.entries()).toEqual([]);
  });

  it('should clear the buffer', () => {
    const { bus, history } = makeHistory();
    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });

    history.clear();

    expect(history.entries()).toEqual([]);
  });

  it('should stop recording after destroy', () => {
    const { bus, history } = makeHistory();
    history.destroy();

    bus.emit('script:say', { speaker: 'Hero', text: 'Hi' });

    expect(history.entries()).toEqual([]);
  });
});
