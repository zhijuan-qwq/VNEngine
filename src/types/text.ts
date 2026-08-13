export interface TextStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
}

export interface TextSegment {
  text: string;
  style: TextStyle;
  start: number;
}

export interface TypewriterHint {
  pos: number;
  speed?: number;
  pauseMs?: number;
}

export interface ParsedText {
  segments: TextSegment[];
  hints: TypewriterHint[];
  plain: string;
}

export type VarResolver = (name: string) => unknown;

export type MeasureText = (text: string, style: TextStyle) => number;
