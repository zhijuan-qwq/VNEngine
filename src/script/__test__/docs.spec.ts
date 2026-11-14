import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../parser.js';
import { dialogueCommands } from '../commands/dialogue';
import { presentationCommands } from '../commands/presentation';
import { stateCommands } from '../commands/state';
import { FLOW_COMMANDS } from '../Interpreter';

const docDir = fileURLToPath(new URL('../../../doc/dsl/', import.meta.url));
const docs = readdirSync(docDir).filter((name) => name.endsWith('.md'));
const WITH_EXAMPLES = new Set(['guide.md', 'language.md', 'reference.md']);

function readDoc(name: string): string {
  return readFileSync(join(docDir, name), 'utf8');
}

function vnsBlocks(source: string): string[] {
  return [...source.matchAll(/```vns\r?\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

describe('DSL docs', () => {
  for (const name of docs) {
    const blocks = vnsBlocks(readDoc(name));

    if (WITH_EXAMPLES.has(name)) {
      it(`${name} contains vns examples`, () => {
        expect(blocks.length).toBeGreaterThan(0);
      });
    }

    blocks.forEach((block, index) => {
      it(`${name} vns block ${index + 1} parses`, () => {
        expect(() => parse(block)).not.toThrow();
      });
    });
  }

  it('reference.md documents every builtin and flow command', () => {
    const reference = readDoc('reference.md');
    const types = new Set([
      ...FLOW_COMMANDS,
      ...[...stateCommands, ...presentationCommands, ...dialogueCommands].map(
        (handler) => handler.type,
      ),
    ]);

    for (const type of types) {
      // Word boundary so @end does not match @endchoice, @else not @elseif, etc.
      expect(reference).toMatch(new RegExp(`@${type}(?![A-Za-z0-9_-])`));
    }
  });

  it('relative markdown links resolve', () => {
    for (const name of docs) {
      for (const match of readDoc(name).matchAll(
        /\]\(([^)#]+\.md)(?:#[^)]*)?\)/g,
      )) {
        expect(() => readFileSync(join(docDir, match[1]))).not.toThrow();
      }
    }
  });
});
