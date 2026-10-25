// 剧本转换脚本：doc/story/*.md（确认用剧本）→ public/script/game.vns。
// 转换规则见 doc/story/README.md 与 doc/story-design.md §9。
// 用法：node scripts/convert-story.mjs
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const storyDir = path.join(projectRoot, 'doc', 'story');
const outPath = path.join(projectRoot, 'public', 'script', 'game.vns');

// ---------- 剧本用语 → 引擎资源名 ----------

// 表情（README 对照表）。value: [sprite 表情名, 脸颊差分]；脸颊差分 null 表示沿用当前。
const EXPRESSIONS = {
  微笑: ['smile', null],
  眯眼笑: ['smile_close', null],
  大笑: ['cachinnation', null],
  张口笑: ['laugh_open', null],
  眨眼: ['wink', null],
  喵嘴: ['cat_mouth', null],
  平静: ['calm', null],
  认真: ['focus', null],
  闭眼: ['eyes_closed', null],
  惊讶但带笑: ['surprised_but', null],
  惊呆: ['astonished', null],
  惊叹: ['oo', null],
  困惑: ['bewilderment', null],
  不妙: ['not_good', null],
  撅嘴: ['pout', null],
  鄙视: ['despise', null],
  黑线: ['black', null],
  叹气: ['sigh', null],
  害羞: ['shy', 'shy'],
  哭: ['cry', 'cry'],
  大红晕: [null, 'blush'],
};

// 立绘标注里的服装/姿态词；未识别的词（如"背对""小声"）忽略。
const CLOTHES = { 魔女装: 'c1', 便服: 'c2' };
const POSES = { 站立: 'f1', 持杖: 'f2', 侧身: 's1' };

// 解析立绘/表情的角色 id 与资源前缀。
const CHAR_ID = 'xingmi';

// 选项元数据：按钮文本、好感度、flag，以及（终章 5-1）直接跳转的结局标签。
const CHOICES = {
  '1-1': [
    { label: '回家教她吃西瓜', affection: 10 },
    { label: '默默放进购物车', affection: 5 },
  ],
  '1-2': [
    { label: '手把手教她', affection: 10 },
    { label: '替她投币', affection: 5 },
    { label: '笑她土气', affection: -5 },
  ],
  '2-1': [
    { label: '追问“几百年？”', affection: 10, flag: 'heard_age' },
    { label: '装作没听见', affection: -5 },
  ],
  '2-2': [
    { label: '“焦香限定”', affection: 10 },
    { label: '抢过来自己吃', affection: 5 },
  ],
  '3-1': [
    { label: '同款的，两份', affection: 10 },
    { label: '小孩子才吃甜筒', affection: 5 },
  ],
  '3-2': [
    { label: '希望明年，也能这样', affection: 10 },
    { label: '希望年终奖多一点', affection: 5 },
    { label: '沉默着看风景', affection: 0 },
  ],
  '3-3': [
    { label: '牵住她的手', affection: 10 },
    { label: '假装看星星', affection: 5 },
  ],
  '4-1': [
    { label: '“要带我去哪？我帮你拎”', affection: 10 },
    { label: '“你要走了？”', affection: -5 },
  ],
  '4-2': [
    { label: '“我不想听再见”', affection: 10 },
    { label: '“我尊重你的决定”', affection: 5 },
  ],
  '5-1': [
    { label: '留下来——我们一年一年地约定下去', goto: 'ending_a' },
    { label: '和我签订契约吧', goto: 'ending_b' },
    { label: '我送你回家', goto: 'ending_c' },
  ],
};

// 结局 section 标题 → 标签名。
const ENDINGS = { A: 'ending_a', B: 'ending_b', C: 'ending_c', D: 'ending_d' };

// ---------- 立绘状态 ----------
const sprite = {
  clothes: 'c1',
  pose: 'f1',
  expr: 'smile',
  skin: 'black',
  visible: false,
};

// @show/@sprite 的 sprite 名不含角色前缀（解析链自动拼 xingmi_）。
function spriteId() {
  return `${sprite.clothes}_${sprite.pose}_${sprite.expr}_${sprite.skin}`;
}

// 剧本 md 里的 BGM 简称 → 实际文件名（去扩展名）。
const BGM_ALIASES = {
  chikokushichau: 'ontama_piano1_chikokushichau',
  fluitsmillefe: 'ontama_piano1_fluitsmillefe',
  fuwaritoamaikyuusoku: 'ontama_piano1_fuwaritoamaikyuusoku',
  harunohi: 'ontama_piano1_harunohi',
  hontopiano: 'ontama_piano1_hontopiano',
  jujitsunojikan: 'ontama_piano1_jujitsunojikan',
  mizuiro: 'ontama_piano1_mizuiro',
  taisetsunayakusoku: 'ontama_piano1_taisetsunayakusoku',
  taikutsuhashiawase: 'ontama_piano2_taikutsuhashiawase',
  ahurera: 'maou_bgm_piano_song_ahurera',
  maou_piano13: 'maou_bgm_piano13',
  maou_piano15: 'maou_bgm_piano15',
  maou_piano31: 'maou_bgm_piano31',
  ontama_nichijonoyume: 'ontama_piano1_nichijonoyume',
  ontama_miagerusora: 'ontama_piano1_miagerusora',
};

function escapeText(text) {
  return text.replace(/"/g, '\\"');
}

/** 应用一段标注 token（服装/姿态/表情词，允许 哭+泪 形式），返回是否有变化。 */
function applyTokens(tokens) {
  let changed = false;
  for (const token of tokens) {
    const [exprWord, skinWord] = token.split('+');
    if (CLOTHES[exprWord] && CLOTHES[exprWord] !== sprite.clothes) {
      sprite.clothes = CLOTHES[exprWord];
      changed = true;
    }
    if (POSES[exprWord] && POSES[exprWord] !== sprite.pose) {
      sprite.pose = POSES[exprWord];
      changed = true;
    }
    const [name, forcedSkin] = EXPRESSIONS[exprWord] ?? [];
    if (name && name !== sprite.expr) {
      sprite.expr = name;
      changed = true;
    }
    const skin = forcedSkin ?? skinWord;
    if (skin && sprite.skin !== skin) {
      sprite.skin = skin;
      changed = true;
    }
  }
  return changed;
}

/** 把星弥的当前状态落到命令上：未显示 → @show，已显示 → @sprite。 */
function syncSprite(out) {
  if (!sprite.visible) {
    sprite.visible = true;
    out.push(
      `@show ${CHAR_ID} center sprite=${spriteId()} transition=fade duration=500ms`,
    );
  } else {
    out.push(`@sprite ${CHAR_ID} ${spriteId()} fade 300ms`);
  }
  forceResync = false;
}

function snapshotSprite() {
  return { ...sprite };
}

function restoreSprite(snap) {
  Object.assign(sprite, snap);
}

/**
 * 解析一条对白 `speaker（token）：text`，输出 @say。
 * 星弥（含？？？时期）附带表情同步；男主的（心声）转为斜体独立说话人。
 */
function emitDialogue(out, line) {
  const match = /^(.+?)(?:（(.+?)）)?：(.*)$/.exec(line);
  if (!match) throw new Error(`Unrecognized dialogue line: ${line}`);
  let [, name, annotation, text] = match;
  text = text.trim().replace(/^\*/, '').replace(/\*$/, ''); // 剥掉 md 强调记号
  if (name === '星弥' || name === '？？？') {
    if (annotation) {
      const tokens = annotation.split(/[・→]/).map((t) => t.trim());
      const known = tokens.filter(
        (t) => CLOTHES[t] || POSES[t] || EXPRESSIONS[t],
      );
      if (known.length > 0 && (applyTokens(tokens) || forceResync)) {
        syncSprite(out);
      }
    }
  }
  if (name === '我' && annotation === '心声') {
    name = '我（心声）';
    text = `[i]${text}[/i]`;
  }
  out.push(`@say "${name}" "${escapeText(text)}"`);
}

/** 输出一个选项体的对白（按 ／ 拆分）。 */
function emitBody(out, body, stripAffection) {
  const cleaned = stripAffection
    ? body.replace(/→\s*好感.*$/, '').trim()
    : body.trim();
  for (const sub of cleaned.split('／')) {
    const t = sub.trim();
    if (t === '') continue;
    emitDialogue(out, t);
  }
}

// ---------- 转换器状态 ----------
const vns = [
  '@title 星星落进我家冰箱',
  '@author VNEngine',
  '@version 1.0',
  '',
  '@label start',
  '@set $affection 0',
  '',
];
let counter = 0;
// 分支合流后强制重新同步一次立绘（运行时状态取决于玩家走的分支）
let forceResync = false;
// 选项 / flag 分支的收集缓冲：
// { kind: 'choice'|'flag', key|flag, options: {body}[], phase: 'wait'|'collect' }
let pending = null;

function flushChoice() {
  if (!pending || pending.kind !== 'choice')
    throw new Error('flushChoice: no pending choice');
  const meta = CHOICES[pending.key];
  if (!meta) throw new Error(`Unknown choice key: ${pending.key}`);
  if (pending.options.length !== meta.length) {
    throw new Error(
      `Choice ${pending.key}: expected ${meta.length} options, got ${pending.options.length}`,
    );
  }
  const base = `c${pending.key.replace('-', '_')}`;
  const direct = meta.every((m) => m.goto); // 5-1：选项直接跳结局
  vns.push('@choice');
  for (let k = 0; k < meta.length; k += 1) {
    vns.push(
      `  -> "${meta[k].label.replace(/"/g, '\\"')}": ${meta[k].goto ?? `${base}_${'abc'[k]}`}`,
    );
  }
  vns.push('@endchoice');
  if (!direct) {
    for (let k = 0; k < meta.length; k += 1) {
      vns.push(`@label ${base}_${'abc'[k]}`);
      if (meta[k].affection) vns.push(`@add $affection ${meta[k].affection}`);
      if (meta[k].flag) vns.push(`@flag ${meta[k].flag}`);
      restoreSprite(pending.snapshot);
      emitBody(vns, pending.options[k].body, true);
      vns.push(`@jump ${base}_end`);
    }
    vns.push(`@label ${base}_end`);
  }
  restoreSprite(pending.snapshot);
  forceResync = true;
  pending = null;
}

function flushFlagBranch() {
  if (!pending || pending.kind !== 'flag')
    throw new Error('flushFlagBranch: no pending branch');
  if (pending.options.length !== 2) {
    throw new Error(`Flag branch ${pending.flag}: expected 2 arms`);
  }
  counter += 1;
  const a = `fb${counter}_a`;
  const b = `fb${counter}_b`;
  vns.push(`@if ?${pending.flag}`);
  vns.push(`  @jump ${a}`);
  vns.push('@else');
  vns.push(`  @jump ${b}`);
  vns.push('@endif');
  vns.push(`@label ${a}`);
  restoreSprite(pending.snapshot);
  emitBody(vns, pending.options[0].body, false);
  vns.push(`@jump fb${counter}_end`);
  vns.push(`@label ${b}`);
  restoreSprite(pending.snapshot);
  emitBody(vns, pending.options[1].body, false);
  vns.push(`@label fb${counter}_end`);
  restoreSprite(pending.snapshot);
  forceResync = true;
  pending = null;
}

/** 处理一个【】标记的内容（去掉括号后的文本）。 */
function processMarker(content) {
  // 【立绘 隐藏】（隐藏写在标记内部）
  if (content === '立绘 隐藏') {
    sprite.visible = false;
    vns.push('@hide all fade 500ms');
    return;
  }
  // 背景
  if (content.startsWith('BG ')) {
    vns.push(`@bg ${content.slice(3).trim()} fade 800ms`);
    return;
  }
  // BGM
  if (content.startsWith('BGM')) {
    const body = content.slice(3).trim();
    if (body === '停') {
      vns.push('@stopBgm fade=800ms');
    } else if (body !== '无' && body !== '') {
      const [, rest] = body.split('｜');
      const [rawId, ...flags] = rest.trim().split(/\s+/);
      const id = BGM_ALIASES[rawId] ?? rawId;
      const parts = ['@playBgm', id];
      if (flags.includes('循环')) parts.push('loop');
      const fadein = flags.find((f) => f.startsWith('fadein='));
      if (fadein) parts.push(fadein);
      vns.push(parts.join(' '));
    }
    return;
  }
  // 特效
  if (content.startsWith('特效')) {
    const body = content.slice(2).trim();
    vns.push(body === '停' ? '@stopEffect' : `@${body}`);
    return;
  }
  // SE：无资源，跳过
  if (content.startsWith('SE')) return;
  // 选项块
  const choiceHead = /^选项 (\d-\d)$/.exec(content);
  if (choiceHead) {
    pending = {
      kind: 'choice',
      key: choiceHead[1],
      options: [],
      phase: 'wait',
      snapshot: snapshotSprite(),
    };
    return;
  }
  if (/^选项 \d-\d 完$/.test(content)) {
    flushChoice();
    return;
  }
  // flag 分支
  const flagHead = /^分支：flag (\w+)$/.exec(content);
  if (flagHead) {
    pending = {
      kind: 'flag',
      flag: flagHead[1],
      options: [],
      phase: 'wait',
      snapshot: snapshotSprite(),
    };
    return;
  }
  if (content === '分支完') {
    flushFlagBranch();
    return;
  }
  // 终章好感度闸门
  if (content.startsWith('分支：好感度')) {
    counter += 1;
    const gate = `gate_${counter}`;
    vns.push('@if $affection >= 50');
    vns.push(`  @jump ${gate}`);
    vns.push('@else');
    vns.push('  @jump ending_d');
    vns.push('@endif');
    vns.push(`@label ${gate}`);
    return;
  }
  // 章末（可能带 flag）
  if (content.startsWith('章末')) {
    const flagMatch = /flag (\w+)/.exec(content);
    if (flagMatch) vns.push(`@flag ${flagMatch[1]}`);
    return;
  }
  // END 标记
  if (content.startsWith('END ')) {
    vns.push(`// 【${content}】`);
    return;
  }
  throw new Error(`Unrecognized marker: 【${content}】`);
}

/** 处理【立绘】的行内载荷：星弥（…） 或 隐藏。 */
function handleSpritePayload(payload) {
  if (payload === '隐藏') {
    sprite.visible = false;
    vns.push('@hide all fade 500ms');
    return;
  }
  const m = /^星弥（(.+)）$/.exec(payload);
  if (!m) throw new Error(`Unexpected 立绘 payload: ${payload}`);
  applyTokens(m[1].split(/[・→]/).map((t) => t.trim()));
  syncSprite(vns);
}

/** 处理一行中的标记序列 + 行尾文本。 */
function processLine(line) {
  let rest = line;
  // 连写的【…】标记；【立绘】的载荷（星弥（…））延伸到行尾
  while (rest.startsWith('【')) {
    const end = rest.indexOf('】');
    if (end === -1) throw new Error(`Unterminated marker: ${line}`);
    const content = rest.slice(1, end);
    if (content === '立绘') {
      handleSpritePayload(rest.slice(end + 1).trim());
      return;
    }
    // SE：无资源，且拟音描述延伸到行尾——整行丢弃
    if (content === 'SE' || content.startsWith('SE ')) return;
    processMarker(content);
    rest = rest.slice(end + 1).trim();
  }
  if (rest === '') return;
  // 选项 / 分支的 A./B./C. 选项体收集
  if (pending) {
    const optMatch = /^([A-Z])\.\s*(.*)$/.exec(rest);
    if (optMatch || pending.phase === 'collect') {
      if (optMatch) {
        pending.phase = 'collect';
        const body =
          pending.kind === 'flag'
            ? optMatch[2].replace(/^（(?:若 \w+|否则)）/, '')
            : optMatch[2];
        pending.options.push({ body });
      } else {
        pending.options[pending.options.length - 1].body += rest;
      }
      return;
    }
  }
  // 普通对白
  emitDialogue(vns, rest);
}

// ---------- 主流程 ----------

const files = (await readdir(storyDir)).filter((f) => /^\d{2}-/.test(f)).sort();
if (files.length !== 6) {
  throw new Error(`Expected 6 chapter files, got: ${files}`);
}

for (const file of files) {
  const lines = (await readFile(path.join(storyDir, file), 'utf-8')).split(
    '\n',
  );
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '---' || trimmed.startsWith('>'))
      continue;
    if (trimmed.startsWith('# ')) {
      // 结局 section 生成跳转目标标签
      const endingMatch = /^#\s*结局\s*([ABCD])/.exec(trimmed);
      if (endingMatch) {
        // 结局段落之间不允许顺流：进入下一段前先终止脚本
        vns.push('@end');
        vns.push(`@label ${ENDINGS[endingMatch[1]]}`);
      }
      vns.push(`// ======== ${trimmed.slice(2)} ========`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      vns.push(`// --- ${trimmed.slice(3)} ---`);
      continue;
    }
    processLine(trimmed);
  }
}
if (pending) throw new Error('Unterminated choice/branch at end of input');

vns.push('');
vns.push('@end');

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${vns.join('\n')}\n`);
console.log(
  `game.vns: ${vns.length} lines -> ${path.relative(projectRoot, outPath)}`,
);
