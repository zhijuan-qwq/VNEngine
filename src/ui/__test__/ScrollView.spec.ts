import type { FederatedWheelEvent } from 'pixi.js';
import { ScrollView } from '../controls/ScrollView';

function makeView(contentHeight = 0): ScrollView {
  const view = new ScrollView({ width: 200, height: 100, step: 25 });
  view.setContentHeight(contentHeight);
  return view;
}

/** 派发 pixi 实际使用的滚轮事件名（`wheel`，非 `pointerwheel`） */
function wheel(view: ScrollView, deltaY: number): void {
  view.emit('wheel', {
    deltaY,
    stopPropagation: vi.fn(),
  } as unknown as FederatedWheelEvent);
}

describe('ScrollView', () => {
  it('should start at the top', () => {
    expect(makeView(500).scrollTop).toBe(0);
  });

  it('should report maxScroll from content height', () => {
    expect(makeView(500).maxScroll).toBe(400);
  });

  it('should not scroll when content fits', () => {
    const view = makeView(50);
    expect(view.maxScroll).toBe(0);
    view.scrollBy(50);
    expect(view.scrollTop).toBe(0);
  });

  it('should clamp scrollBy to the content bounds', () => {
    const view = makeView(500);
    view.scrollBy(1000);
    expect(view.scrollTop).toBe(400);
    view.scrollBy(-1000);
    expect(view.scrollTop).toBe(0);
  });

  it('should clamp a negative setScroll to zero', () => {
    const view = makeView(500);
    view.setScroll(-50);
    expect(view.scrollTop).toBe(0);
  });

  it('should treat a non-finite setScroll as zero', () => {
    const view = makeView(500);
    view.setScroll(Number.NaN);
    expect(view.scrollTop).toBe(0);
  });

  it('should ignore a non-finite scrollBy', () => {
    const view = makeView(500);
    view.setScroll(100);
    view.scrollBy(Number.NaN);
    expect(view.scrollTop).toBe(100);
  });

  it('should re-clamp the offset when content shrinks', () => {
    const view = makeView(500);
    view.setScroll(400);
    view.setContentHeight(120);
    expect(view.maxScroll).toBe(20);
    expect(view.scrollTop).toBe(20);
  });

  it('should ignore a non-finite content height', () => {
    const view = makeView(500);
    view.setContentHeight(Number.NaN);
    expect(view.maxScroll).toBe(0);
  });

  it('should move content opposite to the scroll offset', () => {
    const view = makeView(500);
    view.setScroll(120);
    expect(view.content.y).toBe(-120);
  });

  it('should scroll down on the pixi wheel event', () => {
    const view = makeView(500);
    wheel(view, 100);
    expect(view.scrollTop).toBe(25);
  });

  it('should scroll up on a negative wheel delta', () => {
    const view = makeView(500);
    view.setScroll(100);
    wheel(view, -100);
    expect(view.scrollTop).toBe(75);
  });

  it('should ignore a wheel event with no delta', () => {
    const view = makeView(500);
    wheel(view, 0);
    expect(view.scrollTop).toBe(0);
  });
});
