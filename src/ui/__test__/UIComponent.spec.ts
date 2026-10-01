import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import { UIComponent } from '../UIComponent';

class TestComponent extends UIComponent {
  public bindClear(bus: EventBus<EngineEvents>, handler: () => void): void {
    this.bind(bus, 'script:clear', handler);
  }
}

describe('UIComponent', () => {
  it('should default id to empty string', () => {
    const comp = new UIComponent();
    expect(comp.id).toBe('');
  });

  it('should accept a custom id', () => {
    const comp = new UIComponent({ id: 'dialogue' });
    expect(comp.id).toBe('dialogue');
  });

  it('should start visible', () => {
    const comp = new UIComponent();
    expect(comp.visible).toBe(true);
  });

  it('should toggle visibility with show and hide', () => {
    const comp = new UIComponent();
    comp.hide();
    expect(comp.visible).toBe(false);
    comp.show();
    expect(comp.visible).toBe(true);
  });

  it('should expose a no-op update that does not throw', () => {
    const comp = new UIComponent();
    expect(() => comp.update(16)).not.toThrow();
  });

  it('should remove event subscriptions on destroy', () => {
    const bus = new EventBus<EngineEvents>();
    const comp = new TestComponent();
    const handler = vi.fn();
    comp.bindClear(bus, handler);
    bus.emit('script:clear', {});
    expect(handler).toHaveBeenCalledOnce();

    comp.destroy();
    handler.mockClear();
    bus.emit('script:clear', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should destroy without throwing when no subscriptions exist', () => {
    const comp = new UIComponent();
    expect(() => comp.destroy()).not.toThrow();
  });
});
