import type { ParsedText } from '@/types/text';
import { computeTextLayout } from '../textLayout';

const measure = (text: string, style: { size?: number }): number =>
  text.length * (style.size ?? 16) * 0.6;

const options = (width: number) => ({ width, lineHeight: 30, fontSize: 16 });

function parsed(segments: ParsedText['segments']): ParsedText {
  let plain = '';
  for (const seg of segments) {
    plain += seg.text;
  }
  return { segments, hints: [], plain };
}

describe('computeTextLayout', () => {
  it('should lay out a single short line', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'hello', style: {}, start: 0 }]),
      5,
      options(1000),
      measure,
    );
    expect(layout.items).toEqual([
      { segmentIndex: 0, text: 'hello', x: 0, y: 0 },
    ]);
    expect(layout.height).toBe(30);
  });

  it('should wrap text that exceeds the container width', () => {
    // width 100 px, each char ~9.6px → 10 chars per line
    const layout = computeTextLayout(
      parsed([{ text: '12345678901234567890', style: {}, start: 0 }]),
      20,
      options(96),
      measure,
    );
    expect(layout.items).toEqual([
      { segmentIndex: 0, text: '1234567890', x: 0, y: 0 },
      { segmentIndex: 0, text: '1234567890', x: 0, y: 30 },
    ]);
    expect(layout.height).toBe(60);
  });

  it('should continue x across adjacent segments on the same line', () => {
    const layout = computeTextLayout(
      parsed([
        { text: 'ab', style: {}, start: 0 },
        { text: 'cd', style: {}, start: 2 },
      ]),
      4,
      options(1000),
      measure,
    );
    expect(layout.items).toEqual([
      { segmentIndex: 0, text: 'ab', x: 0, y: 0 },
      { segmentIndex: 1, text: 'cd', x: 19.2, y: 0 },
    ]);
  });

  it('should honor the revealed character count', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'hello', style: {}, start: 0 }]),
      3,
      options(1000),
      measure,
    );
    expect(layout.items).toEqual([
      { segmentIndex: 0, text: 'hel', x: 0, y: 0 },
    ]);
  });

  it('should skip segments beyond the revealed count', () => {
    const layout = computeTextLayout(
      parsed([
        { text: 'ab', style: {}, start: 0 },
        { text: 'cd', style: {}, start: 2 },
      ]),
      2,
      options(1000),
      measure,
    );
    expect(layout.items).toEqual([{ segmentIndex: 0, text: 'ab', x: 0, y: 0 }]);
  });

  it('should return no items when nothing is revealed', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'hello', style: {}, start: 0 }]),
      0,
      options(1000),
      measure,
    );
    expect(layout.items).toEqual([]);
    expect(layout.height).toBe(0);
  });

  it('should force a single character onto a new line when the line is too narrow', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'ab', style: {}, start: 0 }]),
      2,
      options(10),
      measure,
    );
    // each char ~9.6px, first char fits, second wraps to a new line
    expect(layout.items).toEqual([
      { segmentIndex: 0, text: 'a', x: 0, y: 0 },
      { segmentIndex: 0, text: 'b', x: 0, y: 30 },
    ]);
  });

  it('should grow a line to fit the largest font on it', () => {
    const layout = computeTextLayout(
      parsed([
        { text: 'big', style: { size: 40 }, start: 0 },
        { text: 'x', style: {}, start: 3 },
      ]),
      4,
      options(1000),
      measure,
    );
    expect([...new Set(layout.items.map((item) => item.y))]).toEqual([0]);
    // 40 × 30 / 16 = 75
    expect(layout.height).toBe(75);
  });

  it('should space wrapped lines by the largest font on each line', () => {
    const layout = computeTextLayout(
      parsed([{ text: '1234', style: { size: 40 }, start: 0 }]),
      4,
      options(60),
      measure,
    );
    // each char 24px → 2 chars per line; line height 75 > font size 40
    expect(layout.items.map((item) => item.y)).toEqual([0, 75]);
    expect(layout.height).toBe(150);
    expect(layout.items[1].y - layout.items[0].y).toBeGreaterThanOrEqual(40);
  });
});
