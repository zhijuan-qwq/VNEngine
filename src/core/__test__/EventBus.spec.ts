import EventBus from '../EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should call handler when event is emitted', () => {
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.emit('test:event');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should pass arguments to handler', () => {
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.emit('test:event', 'a', 42);
    expect(handler).toHaveBeenCalledWith('a', 42);
  });

  it('should call multiple handlers for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test:event', h1);
    bus.on('test:event', h2);
    bus.emit('test:event');
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should not call handlers of other events', () => {
    const handler = vi.fn();
    bus.on('test:a', handler);
    bus.emit('test:b');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove handler with off()', () => {
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.off('test:event', handler);
    bus.emit('test:event');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not throw when off() is called for unregistered handler', () => {
    const handler = vi.fn();
    expect(() => bus.off('test:event', handler)).not.toThrow();
  });

  it('should not throw when emit() has no listeners', () => {
    expect(() => bus.emit('test:event')).not.toThrow();
  });

  it('once() should fire only once', () => {
    const handler = vi.fn();
    bus.once('test:event', handler);
    bus.emit('test:event');
    bus.emit('test:event');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('once() handler should not fire after off()', () => {
    const handler = vi.fn();
    bus.once('test:event', handler);
    bus.off('test:event', handler);
    bus.emit('test:event');
    expect(handler).not.toHaveBeenCalled();
  });

  it('clear() should remove all listeners', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test:a', h1);
    bus.on('test:b', h2);
    bus.clear();
    bus.emit('test:a');
    bus.emit('test:b');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should handle same handler registered once via Set dedup', () => {
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.on('test:event', handler);
    bus.emit('test:event');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('once() should receive arguments', () => {
    const handler = vi.fn();
    bus.once('test:event', handler);
    bus.emit('test:event', 'arg1', 42);
    expect(handler).toHaveBeenCalledWith('arg1', 42);
  });

  it('off() should not affect other handlers for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test:event', h1);
    bus.on('test:event', h2);
    bus.off('test:event', h1);
    bus.emit('test:event');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should remove handler from one event without affecting the same handler on another event', () => {
    const handler = vi.fn();
    bus.on('test:a', handler);
    bus.on('test:b', handler);
    bus.off('test:a', handler);
    bus.emit('test:a');
    bus.emit('test:b');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith();
  });

  it('should allow new listeners after clear()', () => {
    bus.clear();
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.emit('test:event');
    expect(handler).toHaveBeenCalledOnce();
  });
});
