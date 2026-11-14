import { parse, SyntaxError } from './parser.js';
import type { ParseResult } from './parser.js';
import type { Script } from '@/types/script';
import { VNScriptError } from './errors';

class Parser {
  public parseScript(source: string): Script {
    if (typeof source !== 'string') {
      throw new TypeError('Source must be a string');
    }
    const normalized = source.endsWith('\n') ? source : source + '\n';
    let parseResult: ParseResult;
    try {
      parseResult = parse(normalized);
    } catch (error: unknown) {
      const line =
        error instanceof SyntaxError
          ? error.location?.start.line
          : typeof (error as { line?: unknown }).line === 'number'
            ? (error as { line: number }).line
            : undefined;
      throw new VNScriptError(
        error instanceof Error ? error.message : String(error),
        { phase: 'parse', line },
        { cause: error },
      );
    }
    const script: Script = {
      name: '',
      commands: parseResult.commands,
      labels: new Map<string, number>(),
      metadata: parseResult.metadata,
    };
    parseResult.commands.forEach((command, index) => {
      if (command.type === 'label' && typeof command.args.name === 'string') {
        const name = command.args.name;
        if (script.labels.has(name)) {
          throw new VNScriptError(
            `Duplicate label "${name}" at line ${command.line}.`,
            { phase: 'parse', line: command.line },
          );
        }
        script.labels.set(name, index);
      }
    });
    return script;
  }
}

export default Parser;
