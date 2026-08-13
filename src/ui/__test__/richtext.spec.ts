import { parseRichText } from '../richtext';

describe('parseRichText', () => {
  it('should return a single plain segment for plain text', () => {
    const result = parseRichText('hello');
    expect(result.segments).toEqual([{ text: 'hello', style: {}, start: 0 }]);
    expect(result.plain).toBe('hello');
  });

  it('should split segments around style tags', () => {
    const result = parseRichText('a[b]bold[/b]c');
    expect(result.segments).toEqual([
      { text: 'a', style: {}, start: 0 },
      { text: 'bold', style: { bold: true }, start: 1 },
      { text: 'c', style: {}, start: 5 },
    ]);
  });

  it('should merge adjacent segments with identical style', () => {
    const result = parseRichText('a[b]bold[/b][b]more[/b]tail');
    expect(result.segments).toEqual([
      { text: 'a', style: {}, start: 0 },
      { text: 'boldmore', style: { bold: true }, start: 1 },
      { text: 'tail', style: {}, start: 9 },
    ]);
  });

  it('should not merge segments with different styles', () => {
    const result = parseRichText('a[b]bold[i]both[/i][/b]tail');
    expect(result.segments).toEqual([
      { text: 'a', style: {}, start: 0 },
      { text: 'bold', style: { bold: true }, start: 1 },
      { text: 'both', style: { bold: true, italic: true }, start: 5 },
      { text: 'tail', style: {}, start: 9 },
    ]);
  });

  it('should support italic and nested styles', () => {
    const result = parseRichText('[i][b]x[/b][/i]y');
    expect(result.segments).toEqual([
      { text: 'x', style: { italic: true, bold: true }, start: 0 },
      { text: 'y', style: {}, start: 1 },
    ]);
  });

  it('should apply color and size style tags', () => {
    const result = parseRichText(
      '[color=#ff0000][size=20]big[/size][/color]ok',
    );
    expect(result.segments).toEqual([
      { text: 'big', style: { color: '#ff0000', size: 20 }, start: 0 },
      { text: 'ok', style: {}, start: 3 },
    ]);
  });

  it('should tolerate unclosed style tags by applying style to the end', () => {
    const result = parseRichText('a[b]b');
    expect(result.segments).toEqual([
      { text: 'a', style: {}, start: 0 },
      { text: 'b', style: { bold: true }, start: 1 },
    ]);
  });

  it('should emit speed and pause hints at their character position', () => {
    const result = parseRichText('ab[speed=30]cd[pause=500]ef');
    expect(result.hints).toEqual([
      { pos: 2, speed: 30 },
      { pos: 4, pauseMs: 500 },
    ]);
    expect(result.plain).toBe('abcdef');
  });

  it('should ignore invalid speed and pause values', () => {
    const result = parseRichText('a[speed=0][pause=-1]b');
    expect(result.hints).toEqual([]);
  });

  it('should interpolate variables via resolver', () => {
    const resolve = (name: string): string => (name === 'name' ? 'Hero' : '?');
    const result = parseRichText('Hi {$name}!', resolve);
    expect(result.plain).toBe('Hi Hero!');
    expect(result.segments).toEqual([
      { text: 'Hi Hero!', style: {}, start: 0 },
    ]);
  });

  it('should resolve unknown variables to empty string', () => {
    const result = parseRichText('a{$missing}b', () => undefined);
    expect(result.plain).toBe('ab');
  });

  it('should strip ruby and shake tags but keep inner text', () => {
    const result = parseRichText('a[ruby]汉[/ruby][shake]![/shake]b');
    expect(result.plain).toBe('a汉!b');
    expect(result.segments).toEqual([{ text: 'a汉!b', style: {}, start: 0 }]);
  });

  it('should treat unknown tags as plain text', () => {
    const result = parseRichText('a[foo]b');
    expect(result.plain).toBe('a[foo]b');
  });

  it('should handle an unclosed bracket as literal text', () => {
    const result = parseRichText('a[b');
    expect(result.plain).toBe('a[b');
  });
});
