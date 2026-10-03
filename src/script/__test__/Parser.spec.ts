import Parser from '../Parser';
import { SyntaxError } from '../parser.js';

const COMPLETE_SCRIPT = `
@title 第一章 — 转校生
@author Alice
@version 1.0

@label start

@bg classroom_day fade 1s
@playBgm school_theme loop fadein=2s

@show ch_hero center sprite=neutral fade 500ms
Hero "又是新的一天。"

@show ch_heroine right sprite=shy fade 500ms
Heroine "早上好..."

@choice
  -> "回应她": respond
  -> "无视她": ignore
  -> "恶作剧": prank if $confidence >= 50
@endchoice

@label respond
@set $affection 10
Hero "早上好！"
@jump after_greeting

@label ignore
Heroine "......"
@pause
@jump after_greeting

@label prank
@add $affection -5
Hero "哇！"
@shake 500ms intensity=0.5
Heroine "[shake]呀！[/shake]"
@jump after_greeting

@label after_greeting
@if $affection >= 5
    @sprite ch_heroine smile fade 300ms
    Heroine "今天天气真好呢。"
@else
    @sprite ch_heroine sad fade 300ms
    Heroine "......"
@endif

@bg hallway fade 1s
@move ch_hero left 500ms easeOut
@move ch_heroine right 500ms easeOut

@bg black fade 2s
@stopBgm fade=2s
@end
`;

describe('Parser', () => {
  let parser: Parser;

  beforeEach(() => {
    parser = new Parser();
  });

  it('should parse complete example into a Script object', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    expect(script).toBeDefined();
    expect(script.name).toBe('');
    expect(script.metadata).toEqual({
      title: '第一章 — 转校生',
      author: 'Alice',
      version: '1.0',
    });
    expect(script.commands.length).toBeGreaterThan(0);
  });

  it('should parse metadata correctly', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    expect(script.metadata).toHaveProperty('title', '第一章 — 转校生');
    expect(script.metadata).toHaveProperty('author', 'Alice');
    expect(script.metadata).toHaveProperty('version', '1.0');
  });

  it('should build label index from @label declarations', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    expect(script.labels.size).toBe(5);
    expect(script.labels.has('start')).toBe(true);
    expect(script.labels.has('respond')).toBe(true);
    expect(script.labels.has('ignore')).toBe(true);
    expect(script.labels.has('prank')).toBe(true);
    expect(script.labels.has('after_greeting')).toBe(true);
  });

  it('should have correct label positions', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);
    const labelCommands = script.commands.filter((c) => c.type === 'label');

    for (const label of labelCommands) {
      const name = label.args.name as string;
      expect(script.labels.get(name)).toBe(script.commands.indexOf(label));
    }
  });

  it('should parse choice block into a single command', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    const choiceCommand = script.commands.find((c) => c.type === 'choice');
    expect(choiceCommand).toBeDefined();
    expect(choiceCommand!.args.mode).toBe('adv');
    const choices = choiceCommand!.args.choices as {
      text: string;
      label: string;
      condition?: string;
    }[];
    expect(choices).toHaveLength(3);
    expect(choices[0]).toMatchObject({ text: '回应她', label: 'respond' });
    expect(choices[2]).toMatchObject({
      text: '恶作剧',
      label: 'prank',
      condition: {
        type: 'binary',
        op: '>=',
        left: { type: 'var', name: 'confidence' },
        right: 50,
      },
    });
  });

  it('should parse dialog lines into say commands', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    const sayCommands = script.commands.filter((c) => c.type === 'say');
    expect(sayCommands.length).toBe(8);
    expect(sayCommands[0].args.speaker).toBe('Hero');
    expect(sayCommands[0].args.text).toBe('又是新的一天。');
    expect(sayCommands[1].args.speaker).toBe('Heroine');
    expect(sayCommands[1].args.text).toBe('早上好...');
  });

  it('should parse if command with expression', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    const ifCommand = script.commands.find((c) => c.type === 'if');
    expect(ifCommand).toBeDefined();
    expect(ifCommand!.args.expression).toMatchObject({
      type: 'binary',
      op: '>=',
      left: { type: 'var', name: 'affection' },
      right: 5,
    });
  });

  it('should parse generic commands with positional and key-value args', () => {
    const script = parser.parseScript(COMPLETE_SCRIPT);

    const bgCommand = script.commands.find((c) => c.type === 'bg');
    expect(bgCommand).toBeDefined();
    expect(bgCommand!.args['0']).toBe('classroom_day');
    expect(bgCommand!.args['1']).toBe('fade');
    expect(bgCommand!.args['2']).toMatchObject({ value: 1, unit: 's' });

    const setCommand = script.commands.find((c) => c.type === 'set');
    expect(setCommand).toBeDefined();
    expect(setCommand!.args['0']).toMatchObject({
      type: 'var',
      name: 'affection',
    });
    expect(setCommand!.args['1']).toBe(10);
  });

  it('should parse expressions as variable command values', () => {
    const script = parser.parseScript(
      '@set $x 1 + 2\n' + '@add $y $base - 1\n' + '@random $d 1 6\n',
    );

    expect(script.commands[0]).toMatchObject({
      type: 'set',
      args: {
        '0': { type: 'var', name: 'x' },
        '1': {
          type: 'binary',
          op: '+',
          left: 1,
          right: 2,
        },
      },
    });
    expect(script.commands[1]).toMatchObject({
      type: 'add',
      args: {
        '0': { type: 'var', name: 'y' },
        '1': {
          type: 'binary',
          op: '-',
          left: { type: 'var', name: 'base' },
          right: 1,
        },
      },
    });
    expect(script.commands[2]).toMatchObject({
      type: 'random',
      args: { '0': { type: 'var', name: 'd' }, '1': 1, '2': 6 },
    });
  });

  it('should parse a unary minus value in variable commands', () => {
    const script = parser.parseScript('@add $x - 1\n');

    expect(script.commands[0]).toMatchObject({
      type: 'add',
      args: {
        '0': { type: 'var', name: 'x' },
        '1': { type: 'unary', op: '-', expr: 1 },
      },
    });
  });

  it('should parse trailing comments on metadata and command lines', () => {
    const script = parser.parseScript(
      '@title My Game // the title\n' +
        '@author Alice\n' +
        '\n' +
        '@label start // entry\n' +
        '@bg classroom day // scene // note\n' +
        '@set $x 1 // set x\n' +
        'Hero "Hi" // greet\n',
    );

    expect(script.metadata).toEqual({ title: 'My Game', author: 'Alice' });
    expect(script.labels.get('start')).toBe(0);
    expect(script.commands[1]).toMatchObject({
      type: 'bg',
      args: { '0': 'classroom', '1': 'day' },
    });
    expect(script.commands[2]).toMatchObject({
      type: 'set',
      args: { '0': { type: 'var', name: 'x' }, '1': 1 },
    });
    expect(script.commands[3]).toMatchObject({
      type: 'say',
      args: { speaker: 'Hero', text: 'Hi' },
    });
  });

  it('should keep quoted metadata intact when a trailing comment follows', () => {
    const script = parser.parseScript('@title "A // B" // real comment\n');
    expect(script.metadata.title).toBe('A // B');
  });

  it('should still parse whole-line comments', () => {
    const script = parser.parseScript('// a comment\n@set $x 1\n');
    expect(script.commands).toHaveLength(1);
    expect(script.commands[0].type).toBe('set');
  });

  it('should throw TypeError for non-string input', () => {
    expect(() => parser.parseScript(123 as unknown as string)).toThrow(
      TypeError,
    );
    expect(() => parser.parseScript(null as unknown as string)).toThrow(
      TypeError,
    );
    expect(() => parser.parseScript(undefined as unknown as string)).toThrow(
      TypeError,
    );
    expect(() => parser.parseScript({} as unknown as string)).toThrow(
      TypeError,
    );
  });

  it('should throw SyntaxError for invalid script syntax', () => {
    expect(() => parser.parseScript('@@')).toThrow(SyntaxError);
    expect(() => parser.parseScript('{{{')).toThrow(SyntaxError);
  });
});
