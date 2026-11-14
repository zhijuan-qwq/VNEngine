import type { ParsedText, TextStyle, VarResolver } from '@/types/text';

const PAIRED_TAGS = new Set(['b', 'i', 'color', 'size']);
const STYLE_FLAGS: Record<string, keyof TextStyle> = { b: 'bold', i: 'italic' };
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

interface StyleFrame {
  tag: string | null;
  style: TextStyle;
}

function sameStyle(a: TextStyle, b: TextStyle): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.size === b.size
  );
}

function invalidValue(name: string, value: string, expected: string): never {
  throw new Error(`Invalid [${name}=${value}] value: expected ${expected}.`);
}

function parseNumberTag(
  name: 'size' | 'speed' | 'pause',
  value: string,
): number {
  if (value === '') invalidValue(name, value, 'a number');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) invalidValue(name, value, 'a number');
  if (name === 'pause') {
    if (parsed < 0) invalidValue(name, value, 'a number >= 0');
  } else if (!(parsed > 0)) {
    invalidValue(name, value, 'a positive number');
  }
  return parsed;
}

export function parseRichText(
  input: string,
  resolveVar?: VarResolver,
): ParsedText {
  const segments: ParsedText['segments'] = [];
  const hints: ParsedText['hints'] = [];
  let plain = '';
  const styleStack: StyleFrame[] = [{ tag: null, style: {} }];

  const currentStyle = (): TextStyle => styleStack[styleStack.length - 1].style;

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
      styleStack.push({
        tag,
        style: { ...currentStyle(), [styleFlag]: true },
      });
      return;
    }
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const top = styleStack[styleStack.length - 1];
      if (PAIRED_TAGS.has(name) && styleStack.length > 1 && top.tag === name) {
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
        if (!HEX_COLOR.test(value)) {
          invalidValue(name, value, '#rgb, #rrggbb or #rrggbbaa');
        }
        styleStack.push({
          tag: name,
          style: { ...currentStyle(), color: value },
        });
        return;
      }
      if (name === 'size') {
        const size = parseNumberTag('size', value);
        styleStack.push({ tag: name, style: { ...currentStyle(), size } });
        return;
      }
      if (name === 'speed') {
        hints.push({
          pos: plain.length,
          speed: parseNumberTag('speed', value),
        });
        return;
      }
      if (name === 'pause') {
        hints.push({
          pos: plain.length,
          pauseMs: parseNumberTag('pause', value),
        });
        return;
      }
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
