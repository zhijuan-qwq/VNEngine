import type { FederatedPointerEvent } from 'pixi.js';
import { Toggle } from '../controls/Toggle';

function makeToggle(
  options: Partial<ConstructorParameters<typeof Toggle>[0]> = {},
): Toggle {
  return new Toggle({ width: 60, ...options });
}

function tapEvent(): FederatedPointerEvent {
  return { stopPropagation: vi.fn() } as unknown as FederatedPointerEvent;
}

describe('Toggle', () => {
  it('should default to off', () => {
    expect(makeToggle().value).toBe(false);
  });

  it('should flip the value on tap', () => {
    const toggle = makeToggle();
    const event = tapEvent();
    toggle.emit('pointertap', event);
    expect(toggle.value).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should not flip when disabled', () => {
    const toggle = makeToggle({ disabled: true });
    toggle.toggle();
    expect(toggle.value).toBe(false);
    expect(toggle.disabled).toBe(true);
  });

  it('should reflect a value set programmatically', () => {
    const toggle = makeToggle({ value: true });
    expect(toggle.value).toBe(true);
    toggle.setValue(false);
    expect(toggle.value).toBe(false);
  });

  it('should notify onChange when the value changes', () => {
    const onChange = vi.fn();
    const toggle = makeToggle({ onChange });
    toggle.setValue(true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should not notify onChange when the value is unchanged', () => {
    const onChange = vi.fn();
    const toggle = makeToggle({ value: true, onChange });
    toggle.setValue(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
