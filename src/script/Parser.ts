import { parse, SyntaxError } from './parser.js';
import type { ParseResult } from './parser.js';
import type { Script } from '../types/script.js';

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
      if (error instanceof SyntaxError) {
        throw error;
      }
      throw new Error(
        `Failed to parse script: ${error instanceof Error ? error.message : String(error)}`,
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
        script.labels.set(command.args.name, index);
      }
    });
    return script;
  }
}

export default Parser;
