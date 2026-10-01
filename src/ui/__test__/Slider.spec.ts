import { Slider } from '../controls/Slider';

function makeSlider(
  options: Partial<ConstructorParameters<typeof Slider>[0]> = {},
) {
  return new Slider({ width: 100, min: 0, max: 1, ...options });
}

describe('Slider', () => {
  it('should default to min when no value is given', () => {
    expect(makeSlider().value).toBe(0);
  });

  it('should clamp a value above max', () => {
    const slider = makeSlider();
    slider.setValue(5);
    expect(slider.value).toBe(1);
  });

  it('should clamp a value below min', () => {
    const slider = makeSlider({ min: 0, max: 10, value: 5 });
    slider.setValue(-3);
    expect(slider.value).toBe(0);
  });

  it('should ignore NaN and keep the current value', () => {
    const slider = makeSlider({ value: 0.5 });
    slider.setValue(Number.NaN);
    expect(slider.value).toBe(0.5);
  });

  it('should snap to the nearest step', () => {
    const slider = makeSlider({ min: 0, max: 1, step: 0.25 });
    slider.setValue(0.37);
    expect(slider.value).toBe(0.25);
    slider.setValue(0.9);
    expect(slider.value).toBe(1);
  });

  it('should notify onChange with the new value', () => {
    const onChange = vi.fn();
    const slider = makeSlider({ onChange });
    slider.setValue(0.4);
    expect(onChange).toHaveBeenCalledWith(0.4);
  });

  it('should not notify onChange when the value is unchanged', () => {
    const onChange = vi.fn();
    const slider = makeSlider({ value: 0.4, onChange });
    slider.setValue(0.4);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should map a drag position to a value', () => {
    const slider = makeSlider();
    slider.handlePointerDown(50);
    expect(slider.value).toBeCloseTo(0.5);
    slider.handlePointerMove(100);
    expect(slider.value).toBe(1);
  });

  it('should ignore pointer move before a drag starts', () => {
    const slider = makeSlider({ value: 0.5 });
    slider.handlePointerMove(100);
    expect(slider.value).toBe(0.5);
  });

  it('should stop responding to pointer move after pointer up', () => {
    const slider = makeSlider();
    slider.handlePointerDown(0);
    slider.handlePointerUp();
    slider.handlePointerMove(100);
    expect(slider.value).toBe(0);
  });

  it('should treat an invalid range as a single value', () => {
    const slider = makeSlider({ min: 5, max: 5, value: 9 });
    expect(slider.value).toBe(5);
    slider.handlePointerDown(50);
    expect(slider.value).toBe(5);
  });

  it('should ignore a non-finite drag position', () => {
    const slider = makeSlider({ value: 0.5 });
    slider.handlePointerDown(Number.POSITIVE_INFINITY);
    expect(slider.value).toBe(0.5);
  });
});
