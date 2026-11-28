import { Container } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
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

function pointer(
  view: ScrollView,
  type: string,
  y: number,
  target: unknown = view,
): { stopPropagation: ReturnType<typeof vi.fn> } {
  const event = {
    target,
    pointerId: 1,
    global: { x: 0, y },
    stopPropagation: vi.fn(),
  };
  view.emit(type, event as unknown as FederatedPointerEvent);
  return event;
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

  it('should resize the viewport and re-clamp the offset', () => {
    const view = makeView(500);
    view.setScroll(400);

    view.resize(300, 200);
    expect(view.maxScroll).toBe(300);
    expect(view.scrollTop).toBe(300);

    view.resize(300, 600);
    expect(view.maxScroll).toBe(0);
    expect(view.scrollTop).toBe(0);
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

  it('should drag-scroll after the pointer moves past the threshold', () => {
    const view = makeView(500);
    pointer(view, 'pointerdown', 50);
    const move = pointer(view, 'pointermove', 30);

    expect(view.scrollTop).toBe(20);
    expect(move.stopPropagation).toHaveBeenCalledOnce();

    pointer(view, 'pointerup', 30);
  });

  it('should not scroll for a movement under the threshold', () => {
    const view = makeView(500);
    pointer(view, 'pointerdown', 50);
    pointer(view, 'pointermove', 47);

    expect(view.scrollTop).toBe(0);
  });

  it('should convert the drag distance through the parent scale', () => {
    const view = makeView(500);
    const parent = new Container();
    parent.scale.set(0.8);
    parent.addChild(view);

    pointer(view, 'pointerdown', 50);
    pointer(view, 'pointermove', 10);

    // 屏幕位移 40 CSS px ÷ 0.8 = 50 虚拟 px
    expect(view.scrollTop).toBe(50);
  });

  it('should leave drags that start on a child to the child', () => {
    const view = makeView(500);
    pointer(view, 'pointerdown', 50, {});
    pointer(view, 'pointermove', 20);

    expect(view.scrollTop).toBe(0);
  });

  it('should ignore invalid sizes on resize', () => {
    const view = makeView(500);
    view.resize(300, 200);
    view.setScroll(300);

    view.resize(Number.NaN, Number.POSITIVE_INFINITY);

    expect(view.maxScroll).toBe(300);
    expect(view.scrollTop).toBe(300);
  });
});
