import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import Updater, { MAX_DT, type TickerLike, type Updatable } from '../Updater';

interface FakeTicker {
  ticker: TickerLike;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  /** 手动推进一步，deltaMS 以毫秒计 */
  fire(deltaMS: number): void;
  handler(): ((ticker: TickerLike) => void) | null;
}

function makeTicker(): FakeTicker {
  let handler: ((ticker: TickerLike) => void) | null = null;
  const start = vi.fn();
  const stop = vi.fn();
  const add = vi.fn((fn: (ticker: TickerLike) => void) => {
    handler = fn;
  });
  const remove = vi.fn(() => {
    handler = null;
  });
  const ticker = {
    deltaMS: 1000 / 60,
    maxFPS: 60,
    started: false,
    add,
    remove,
    start,
    stop,
  } as unknown as TickerLike;
  return {
    ticker,
    start,
    stop,
    remove,
    fire: (deltaMS: number) => {
      ticker.deltaMS = deltaMS;
      handler?.(ticker);
    },
    handler: () => handler,
  };
}

function makeUpdater(overrides: { updatables?: Updatable[]; fps?: number }) {
  const { ticker, ...fake } = makeTicker();
  const bus = new EventBus<EngineEvents>();
  const updater = new Updater({
    app: { ticker },
    eventBus: bus,
    updatables: overrides.updatables ?? [],
    fps: overrides.fps,
  });
  return { updater, ticker, fake, bus };
}

describe('Updater', () => {
  it('should register a tick callback on construction without starting', () => {
    const { ticker, fake } = makeUpdater({});
    expect(fake.handler()).not.toBeNull();
    expect(fake.start).not.toHaveBeenCalled();
    expect(ticker.maxFPS).toBe(60);
  });

  it('should default fps to 60 when omitted', () => {
    const { updater } = makeUpdater({});
    expect(updater.fps).toBe(60);
  });

  it('should convert deltaMS to seconds and update each updatable in order', () => {
    const calls: Array<[string, number]> = [];
    const a: Updatable = { update: (dt) => calls.push(['a', dt]) };
    const b: Updatable = { update: (dt) => calls.push(['b', dt]) };
    const { updater, fake } = makeUpdater({ updatables: [a, b] });

    updater.start();
    fake.fire(16.6667);

    expect(calls[0][0]).toBe('a');
    expect(calls[1][0]).toBe('b');
    expect(calls[0][1]).toBeCloseTo(0.0166667, 5);
    expect(calls[1][1]).toBeCloseTo(0.0166667, 5);
  });

  it('should clamp large deltaMS to MAX_DT', () => {
    const seen: number[] = [];
    const u: Updatable = { update: (dt) => seen.push(dt) };
    const { updater, fake } = makeUpdater({ updatables: [u] });

    updater.start();
    fake.fire(5000);

    expect(seen).toEqual([MAX_DT]);
  });

  it('should not update or emit before start', () => {
    const onUpdate = vi.fn();
    const onFrame = vi.fn();
    const { fake, bus } = makeUpdater({ updatables: [{ update: onUpdate }] });
    bus.on('render:frame', onFrame);

    fake.fire(16.6667);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('should emit render:frame every tick at default fps', () => {
    const onFrame = vi.fn();
    const { updater, fake, bus } = makeUpdater({});
    bus.on('render:frame', onFrame);

    updater.start();
    fake.fire(16.6667);
    fake.fire(16.6667);

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenLastCalledWith({ dt: expect.closeTo(0.0166, 3) });
  });

  it('should throttle render:frame but keep updating logic each tick', () => {
    const onUpdate = vi.fn();
    const onFrame = vi.fn();
    const { updater, fake, bus } = makeUpdater({
      updatables: [{ update: onUpdate }],
      fps: 30,
    });
    bus.on('render:frame', onFrame);

    updater.start();
    fake.fire(16.6667);
    fake.fire(16.6667);

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('should emit every tick when fps is not positive', () => {
    const onFrame = vi.fn();
    const { updater, fake, bus } = makeUpdater({ fps: 0 });
    bus.on('render:frame', onFrame);

    updater.start();
    fake.fire(16.6667);
    fake.fire(16.6667);

    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('should accumulate elapsedTime', () => {
    const { updater, fake } = makeUpdater({});
    updater.start();
    fake.fire(100);
    fake.fire(50);

    expect(updater.elapsedTime).toBeCloseTo(0.15, 5);
  });

  it('should set maxFPS and start the ticker on start', () => {
    const { updater, ticker, fake } = makeUpdater({ fps: 30 });
    updater.start();

    expect(ticker.maxFPS).toBe(30);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('should stop updating after pause and resume on resume', () => {
    const onUpdate = vi.fn();
    const { updater, fake } = makeUpdater({
      updatables: [{ update: onUpdate }],
    });

    updater.start();
    fake.fire(16.6667);
    updater.pause();
    fake.fire(16.6667);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(fake.stop).toHaveBeenCalledTimes(1);

    updater.resume();
    fake.fire(16.6667);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(fake.start).toHaveBeenCalledTimes(2);
  });

  it('should stop the ticker on stop', () => {
    const { updater, fake } = makeUpdater({});
    updater.start();
    updater.stop();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('should remove its tick callback on destroy', () => {
    const { updater, fake } = makeUpdater({});
    updater.start();
    updater.destroy();

    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.handler()).toBeNull();
    expect(fake.stop).toHaveBeenCalled();
  });
});
