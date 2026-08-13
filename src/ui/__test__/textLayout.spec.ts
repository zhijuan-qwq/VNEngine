import type { ParsedText } from '@/types/text';
import { computeTextLayout } from '../textLayout';

const measure = (text: string, style: { size?: number }): number =>
  text.length * (style.size ?? 16) * 0.6;

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
      { width: 1000, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([{ segmentIndex: 0, text: 'hello', x: 0, y: 0 }]);
  });

  it('should wrap text that exceeds the container width', () => {
    // width 100 px, each char ~9.6px → 10 chars per line
    const layout = computeTextLayout(
      parsed([{ text: '12345678901234567890', style: {}, start: 0 }]),
      20,
      { width: 96, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([
      { segmentIndex: 0, text: '1234567890', x: 0, y: 0 },
      { segmentIndex: 0, text: '1234567890', x: 0, y: 30 },
    ]);
  });

  it('should continue x across adjacent segments on the same line', () => {
    const layout = computeTextLayout(
      parsed([
        { text: 'ab', style: {}, start: 0 },
        { text: 'cd', style: {}, start: 2 },
      ]),
      4,
      { width: 1000, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([
      { segmentIndex: 0, text: 'ab', x: 0, y: 0 },
      { segmentIndex: 1, text: 'cd', x: 19.2, y: 0 },
    ]);
  });

  it('should honor the revealed character count', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'hello', style: {}, start: 0 }]),
      3,
      { width: 1000, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([{ segmentIndex: 0, text: 'hel', x: 0, y: 0 }]);
  });

  it('should skip segments beyond the revealed count', () => {
    const layout = computeTextLayout(
      parsed([
        { text: 'ab', style: {}, start: 0 },
        { text: 'cd', style: {}, start: 2 },
      ]),
      2,
      { width: 1000, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([{ segmentIndex: 0, text: 'ab', x: 0, y: 0 }]);
  });

  it('should return no items when nothing is revealed', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'hello', style: {}, start: 0 }]),
      0,
      { width: 1000, lineHeight: 30 },
      measure,
    );
    expect(layout).toEqual([]);
  });

  it('should force a single character onto a new line when the line is too narrow', () => {
    const layout = computeTextLayout(
      parsed([{ text: 'ab', style: {}, start: 0 }]),
      2,
      { width: 10, lineHeight: 30 },
      measure,
    );
    // each char ~9.6px, first char fits, second wraps to a new line
    expect(layout).toEqual([
      { segmentIndex: 0, text: 'a', x: 0, y: 0 },
      { segmentIndex: 0, text: 'b', x: 0, y: 30 },
    ]);
  });
});
