import type { Command } from '@/types/script';

export interface ParseResult {
  commands: Command[];
  metadata: Record<string, string>;
}

export declare function parse(
  input: string,
  options?: Record<string, unknown>,
): ParseResult;

export declare class SyntaxError extends Error {
  expected: string[];
  found: string | null;
  location: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
    source: unknown;
  };
  format(sources: { source: unknown; text: string }[]): string;
}
