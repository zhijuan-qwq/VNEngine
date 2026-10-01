import { TypewriterState } from '../typewriter';

describe('TypewriterState', () => {
  it('should start with zero revealed characters', () => {
    const tw = new TypewriterState({ totalChars: 10, hints: [], speed: 10 });
    expect(tw.revealed).toBe(0);
    expect(tw.isComplete).toBe(false);
    expect(tw.isPaused).toBe(false);
  });

  it('should reveal characters proportionally to dt and speed', () => {
    const tw = new TypewriterState({ totalChars: 100, hints: [], speed: 10 });
    tw.update(100);
    expect(tw.revealed).toBe(1);
    tw.update(250);
    expect(tw.revealed).toBe(3);
  });

  it('should complete when all characters are revealed', () => {
    const tw = new TypewriterState({ totalChars: 5, hints: [], speed: 10 });
    tw.update(1000);
    expect(tw.revealed).toBe(5);
    expect(tw.isComplete).toBe(true);
  });

  it('should not advance once complete', () => {
    const tw = new TypewriterState({ totalChars: 3, hints: [], speed: 10 });
    tw.update(1000);
    tw.update(1000);
    expect(tw.revealed).toBe(3);
  });

  it('should ignore non-positive dt', () => {
    const tw = new TypewriterState({ totalChars: 10, hints: [], speed: 10 });
    tw.update(0);
    tw.update(-100);
    expect(tw.revealed).toBe(0);
  });

  it('should apply speed hints once their position is reached', () => {
    const tw = new TypewriterState({
      totalChars: 100,
      hints: [{ pos: 5, speed: 50 }],
      speed: 10,
    });
    tw.update(500);
    expect(tw.revealed).toBe(5);
    tw.update(100);
    expect(tw.revealed).toBe(10);
  });

  it('should pause at a pause hint and resume after the pause', () => {
    const tw = new TypewriterState({
      totalChars: 10,
      hints: [{ pos: 3, pauseMs: 100 }],
      speed: 10,
    });
    tw.update(400);
    expect(tw.revealed).toBe(3);
    expect(tw.isPaused).toBe(true);
    tw.update(60);
    expect(tw.revealed).toBe(3);
    expect(tw.isPaused).toBe(true);
    tw.update(40);
    expect(tw.isPaused).toBe(false);
    tw.update(100);
    expect(tw.revealed).toBe(4);
  });

  it('should combine speed and pause hints at the same position', () => {
    const tw = new TypewriterState({
      totalChars: 100,
      hints: [
        { pos: 4, speed: 20 },
        { pos: 4, pauseMs: 50 },
      ],
      speed: 10,
    });
    tw.update(500);
    expect(tw.revealed).toBe(4);
    expect(tw.isPaused).toBe(true);
    tw.update(50);
    expect(tw.isPaused).toBe(false);
    tw.update(100);
    expect(tw.revealed).toBe(6);
  });

  it('should pause immediately when the pause hint sits at the very start', () => {
    const tw = new TypewriterState({
      totalChars: 3,
      hints: [{ pos: 0, pauseMs: 100 }],
      speed: 10,
    });
    tw.update(100);
    expect(tw.revealed).toBe(0);
    expect(tw.isPaused).toBe(true);
    tw.update(100);
    expect(tw.isPaused).toBe(false);
    tw.update(100);
    expect(tw.revealed).toBe(1);
  });

  it('should reveal all characters via revealAll', () => {
    const tw = new TypewriterState({
      totalChars: 10,
      hints: [{ pos: 3, pauseMs: 5000 }],
      speed: 5,
    });
    tw.revealAll();
    expect(tw.revealed).toBe(10);
    expect(tw.isComplete).toBe(true);
    expect(tw.isPaused).toBe(false);
  });
});
