// game.vns 静态校验：
// 1) 用引擎的 Parser 解析 public/script/game.vns
// 2) 校验 @jump/@choice 目标标签存在
// 3) 校验存档安全规则：@if 块内不允许阻塞命令（@say/@choice/@wait/@pause/@click）
// 4) 校验 @bg / @show/@sprite / @playBgm 引用的资源 id 与 public/ 下实际文件一致
// 用法：node scripts/validate-game.mjs
import { parse } from '../src/script/parser.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(projectRoot, 'public', 'script', 'game.vns');
const publicDir = path.join(projectRoot, 'public');

const source = await readFile(scriptPath, 'utf-8');
const errors = [];

// ---- 解析 ----
let commands;
try {
  ({ commands } = parse(source));
} catch (error) {
  console.error('Parse failed:', error.message);
  process.exit(1);
}
console.log(`parsed: ${commands.length} commands`);

// ---- 资源 id 集合（以 public/ 下实际文件为准） ----
async function idsFrom(dir, stripExt) {
  const out = new Set();
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const id = stripExt
      ? path.basename(entry.name, path.extname(entry.name))
      : entry.name;
    out.add(id);
  }
  return out;
}
const bgIds = await idsFrom(path.join(publicDir, 'bg'), true);
const spriteIds = new Set(
  await idsFrom(path.join(publicDir, 'char', 'xingmi'), true),
);
const bgmIds = await idsFrom(path.join(publicDir, 'bgm'), true);

// ---- 标签表 ----
const labels = new Set(
  commands.filter((c) => c.type === 'label').map((c) => c.args.name),
);

// ---- 逐命令校验 ----
const BLOCKING = new Set(['say', 'choice', 'wait', 'pause', 'click']);
let ifDepth = 0;
for (const cmd of commands) {
  const line = cmd.line;
  switch (cmd.type) {
    case 'if':
      ifDepth += 1;
      break;
    case 'endif':
      ifDepth -= 1;
      break;
    case 'label':
      break;
    case 'jump':
    case 'call': {
      const target = cmd.args['0'];
      if (!labels.has(target))
        errors.push(
          `line ${line}: @${cmd.type} target "${target}" has no @label`,
        );
      break;
    }
    case 'bg': {
      const id = cmd.args['0'];
      if (!bgIds.has(id))
        errors.push(`line ${line}: @bg id "${id}" not found in public/bg`);
      break;
    }
    case 'playBgm': {
      const id = cmd.args['0'];
      if (!bgmIds.has(id))
        errors.push(
          `line ${line}: @playBgm id "${id}" not found in public/bgm`,
        );
      break;
    }
    case 'show':
    case 'sprite': {
      const charId = cmd.args['0'];
      const spriteName =
        cmd.type === 'show' ? (cmd.args.sprite ?? 'default') : cmd.args['1'];
      if (charId !== 'xingmi')
        errors.push(`line ${line}: unknown character "${charId}"`);
      const id = `${charId}_${spriteName}`;
      if (!spriteIds.has(id))
        errors.push(
          `line ${line}: sprite "${id}" not found in public/char/xingmi`,
        );
      break;
    }
    default:
      if (BLOCKING.has(cmd.type) && ifDepth > 0) {
        errors.push(
          `line ${line}: blocking command "@${cmd.type}" inside @if block (save/load unsafe)`,
        );
      }
  }
}
if (ifDepth !== 0) errors.push(`Unclosed @if blocks: depth ${ifDepth} at end`);

// ---- 选项目标 ----
for (const cmd of commands) {
  if (cmd.type !== 'choice') continue;
  for (const choice of cmd.args.choices) {
    if (!labels.has(choice.label)) {
      errors.push(
        `line ${cmd.line}: choice "${choice.text}" targets missing label "${choice.label}"`,
      );
    }
  }
}

// ---- 汇总 ----
if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validation passed: labels, save-safety, resource ids all OK');
