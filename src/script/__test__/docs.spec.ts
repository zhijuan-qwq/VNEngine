import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from '../Parser';
import { dialogueCommands } from '../commands/dialogue';
import { presentationCommands } from '../commands/presentation';
import { stateCommands } from '../commands/state';
import { FLOW_COMMANDS } from '../Interpreter';

const docDir = fileURLToPath(new URL('../../../doc/dsl/', import.meta.url));
const docs = readdirSync(docDir).filter((name) => name.endsWith('.md'));
const WITH_EXAMPLES = new Set(['guide.md', 'language.md', 'reference.md']);
const METADATA_KEYS = new Set(['title', 'author', 'version']);
const NON_COMMAND_AT_NAMES = new Set(['endchoice']);

const parser = new Parser();

const types = new Set([
  ...FLOW_COMMANDS,
  ...[...stateCommands, ...presentationCommands, ...dialogueCommands].map(
    (handler) => handler.type,
  ),
]);

function readDoc(name: string): string {
  return readFileSync(join(docDir, name), 'utf8');
}

function vnsBlocks(source: string): string[] {
  return [
    ...source.matchAll(/^[ \t]*```vns[^\n]*\n([\s\S]*?)^[ \t]*```/gm),
  ].map((match) => match[1]);
}

describe('DSL docs', () => {
  for (const name of docs) {
    const blocks = vnsBlocks(readDoc(name));

    if (WITH_EXAMPLES.has(name)) {
      it(`should include vns examples in ${name}`, () => {
        expect(blocks.length).toBeGreaterThan(0);
      });
    }

    blocks.forEach((block, index) => {
      it(`should parse vns block ${index + 1} in ${name}`, () => {
        expect(() => parser.parseScript(block)).not.toThrow();
      });
    });
  }

  it('should document every builtin and flow command in reference.md', () => {
    const reference = readDoc('reference.md');
    for (const type of types) {
      // Word boundary so @end does not match @endchoice, @else not @elseif, etc.
      expect(reference, `reference.md should document @${type}`).toMatch(
        new RegExp(`@${type}(?![A-Za-z0-9_-])`),
      );
    }
  });

  it('should only reference known commands in vns blocks', () => {
    for (const name of docs) {
      for (const block of vnsBlocks(readDoc(name))) {
        for (const match of block.matchAll(/@([A-Za-z_][A-Za-z0-9_-]*)/g)) {
          const command = match[1];
          if (METADATA_KEYS.has(command) || NON_COMMAND_AT_NAMES.has(command)) {
            continue;
          }
          expect(types.has(command), `${name} should not use @${command}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('should resolve relative markdown links', () => {
    for (const name of docs) {
      for (const match of readDoc(name).matchAll(
        /\]\(([^)#]+\.md)(?:#[^)]*)?\)/g,
      )) {
        expect(() => readFileSync(join(docDir, match[1]))).not.toThrow();
      }
    }
  });
});
