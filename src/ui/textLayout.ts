import type { MeasureText, ParsedText } from '@/types/text';

export interface LayoutOptions {
  width: number;
  lineHeight: number;
}

export interface TextLayoutItem {
  segmentIndex: number;
  text: string;
  x: number;
  y: number;
}

export function computeTextLayout(
  parsed: ParsedText,
  revealed: number,
  options: LayoutOptions,
  measure: MeasureText,
): TextLayoutItem[] {
  const items: TextLayoutItem[] = [];
  let x = 0;
  let y = 0;

  for (let si = 0; si < parsed.segments.length; si += 1) {
    const segment = parsed.segments[si];
    const visibleLength = Math.min(
      segment.text.length,
      Math.max(0, revealed - segment.start),
    );
    if (visibleLength <= 0) {
      continue;
    }
    let remaining = segment.text.slice(0, visibleLength);
    while (remaining.length > 0) {
      let fit = remaining;
      while (
        fit.length > 0 &&
        x + measure(fit, segment.style) > options.width
      ) {
        fit = fit.slice(0, fit.length - 1);
      }
      if (fit.length === 0) {
        fit = remaining[0];
      }
      items.push({ segmentIndex: si, text: fit, x, y });
      x += measure(fit, segment.style);
      remaining = remaining.slice(fit.length);
      if (remaining.length > 0) {
        x = 0;
        y += options.lineHeight;
      }
    }
  }

  return items;
}
