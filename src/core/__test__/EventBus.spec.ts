import EventBus from '../EventBus';
import type { EngineEvents } from '@/types/events';

describe('EventBus', () => {
  let bus: EventBus<EngineEvents>;

  beforeEach(() => {
    bus = new EventBus<EngineEvents>();
  });

  it('should call handler when event is emitted', () => {
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.emit('script:end', {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should pass payload to handler', () => {
    const handler = vi.fn();
    bus.on('game:save', handler);
    bus.emit('game:save', { slot: 3 });
    expect(handler).toHaveBeenCalledWith({ slot: 3 });
  });

  it('should call multiple handlers for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('script:end', h1);
    bus.on('script:end', h2);
    bus.emit('script:end', {});
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should not call handlers of other events', () => {
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.emit('render:frame', { dt: 0.016 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove handler with off()', () => {
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.off('script:end', handler);
    bus.emit('script:end', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not throw when off() is called for unregistered handler', () => {
    const handler = vi.fn();
    expect(() => bus.off('script:end', handler)).not.toThrow();
  });

  it('should not throw when emit() has no listeners', () => {
    expect(() => bus.emit('script:end', {})).not.toThrow();
  });

  it('should fire once() handler only once', () => {
    const handler = vi.fn();
    bus.once('script:end', handler);
    bus.emit('script:end', {});
    bus.emit('script:end', {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should not fire once() handler after off()', () => {
    const handler = vi.fn();
    bus.once('script:end', handler);
    bus.off('script:end', handler);
    bus.emit('script:end', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove all listeners of an event with removeAllListeners()', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('script:end', h1);
    bus.on('render:frame', h2);
    bus.removeAllListeners('script:end');
    bus.emit('script:end', {});
    bus.emit('render:frame', { dt: 0.016 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should handle same handler registered once via Set dedup', () => {
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.on('script:end', handler);
    bus.emit('script:end', {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should pass payload to once() handler', () => {
    const handler = vi.fn();
    bus.once('input:click', handler);
    bus.emit('input:click', { x: 10, y: 20 });
    expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it('should not affect other handlers for the same event after off()', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('script:end', h1);
    bus.on('script:end', h2);
    bus.off('script:end', h1);
    bus.emit('script:end', {});
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should remove handler from one event without affecting the same handler on another event', () => {
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.on('render:frame', handler);
    bus.off('script:end', handler);
    bus.emit('script:end', {});
    bus.emit('render:frame', { dt: 0.016 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ dt: 0.016 });
  });

  it('should allow new listeners after removeAllListeners()', () => {
    bus.removeAllListeners('script:end');
    const handler = vi.fn();
    bus.on('script:end', handler);
    bus.emit('script:end', {});
    expect(handler).toHaveBeenCalledOnce();
  });
});
