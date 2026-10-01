import type { ParsedText, TextStyle, VarResolver } from '@/types/text';

const PAIRED_TAGS = new Set(['b', 'i', 'color', 'size', 'ruby', 'shake']);
const STYLE_FLAGS: Record<string, keyof TextStyle> = { b: 'bold', i: 'italic' };

function sameStyle(a: TextStyle, b: TextStyle): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.size === b.size
  );
}

export function parseRichText(
  input: string,
  resolveVar?: VarResolver,
): ParsedText {
  const segments: ParsedText['segments'] = [];
  const hints: ParsedText['hints'] = [];
  let plain = '';
  const styleStack: TextStyle[] = [{}];

  const currentStyle = (): TextStyle => styleStack[styleStack.length - 1];

  const pushSegment = (text: string): void => {
    if (text.length === 0) {
      return;
    }
    const style = { ...currentStyle() };
    const last = segments[segments.length - 1];
    if (last && sameStyle(last.style, style)) {
      last.text += text;
    } else {
      segments.push({ text, style, start: plain.length });
    }
    plain += text;
  };

  const applyTag = (raw: string): void => {
    const tag = raw.trim();
    const styleFlag = STYLE_FLAGS[tag];
    if (styleFlag) {
      styleStack.push({ ...currentStyle(), [styleFlag]: true });
      return;
    }
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (PAIRED_TAGS.has(name) && styleStack.length > 1) {
        styleStack.pop();
      } else {
        pushSegment(`[${tag}]`);
      }
      return;
    }
    const eq = tag.indexOf('=');
    if (eq !== -1) {
      const name = tag.slice(0, eq).trim();
      const value = tag.slice(eq + 1).trim();
      if (name === 'color') {
        styleStack.push({ ...currentStyle(), color: value });
        return;
      }
      if (name === 'size') {
        const size = Number(value);
        if (Number.isFinite(size) && size > 0) {
          styleStack.push({ ...currentStyle(), size });
          return;
        }
        return;
      }
      if (name === 'speed') {
        const speed = Number(value);
        if (Number.isFinite(speed) && speed > 0) {
          hints.push({ pos: plain.length, speed });
        }
        return;
      }
      if (name === 'pause') {
        const pauseMs = Number(value);
        if (Number.isFinite(pauseMs) && pauseMs >= 0) {
          hints.push({ pos: plain.length, pauseMs });
        }
        return;
      }
      if (name === 'ruby' || name === 'shake') {
        styleStack.push({ ...currentStyle() });
        return;
      }
    }
    if (PAIRED_TAGS.has(tag)) {
      styleStack.push({ ...currentStyle() });
      return;
    }
    pushSegment(`[${tag}]`);
  };

  let i = 0;
  let buffer = '';
  while (i < input.length) {
    const ch = input[i];
    if (ch === '[') {
      const end = input.indexOf(']', i + 1);
      if (end === -1) {
        buffer += input.slice(i);
        break;
      }
      pushSegment(buffer);
      buffer = '';
      applyTag(input.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (ch === '{' && input[i + 1] === '$') {
      const end = input.indexOf('}', i + 2);
      if (end === -1) {
        buffer += input.slice(i);
        break;
      }
      pushSegment(buffer);
      buffer = '';
      const name = input.slice(i + 2, end).trim();
      const value = resolveVar ? resolveVar(name) : undefined;
      pushSegment(value == null ? '' : String(value));
      i = end + 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  pushSegment(buffer);

  return { segments, hints, plain };
}
