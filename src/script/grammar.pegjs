// VNScript PEG Grammar — VNEngine 视觉小说脚本语言
// 编译: peggy --format es src/engine/script/grammar.pegjs
// 目标: TypeScript (Peggy 5.x)
// 这是 VNScript DSL 的权威语法定义，替代 docs/script-dsl.md 中的 EBNF。

// ============================================================
// 顶层结构
// ============================================================

Script
  = lines:Line*
  {
    const seen = new Set();
    let metaDone = false;
    const commands = [];
    const metadata = {};

    for (const ln of lines) {
      if (ln.type === 'meta') {
        if (metaDone) {
          throw new Error(
            `@${ln.key} must appear before all other content`
          );
        }
        if (seen.has(ln.key)) {
          throw new Error(`Duplicate metadata: @${ln.key}`);
        }
        seen.add(ln.key);
        metadata[ln.key] = ln.value;
      } else if (ln.type === 'command') {
        metaDone = true;
        commands.push(ln.command);
      }
            // blank / comment 跳过
    }

    return { commands, metadata };
  }

Line
  = ChoiceBlock
  / IfLine
  / SayLine
  / LabelDeclaration
  / MetadataLine
  / DialogLine
  / VariableCommandLine
  / GenericCommandLine
  / CommentLine
  / BlankLine

// ============================================================
// 空白与基础词法（scannerless — 直接逐字符匹配）
// ============================================================

_ "inline whitespace"
  = [ \t]*

__ "mandatory whitespace"
  = [ \t]+

_lineEnd "line end"
  = "\r\n" / "\n" / "\r"

TrailingComment "trailing comment"
  = "//" [^\r\n]*

EndOfLine "end of line"
  = _ TrailingComment? _lineEnd

// ============================================================
// 标识符与字面量
// ============================================================

Identifier "identifier"
  = [a-zA-Z_][a-zA-Z0-9_-]* { return text(); }

IdentifierChar "identifier char"
  = [a-zA-Z0-9_-]

StringLiteral "string literal"
  = '"' chars:DoubleStringChar* '"' { return chars.join(''); }

DoubleStringChar
  = "\\" esc:EscapeChar { return esc; }
  / [^"\\\n\r]

EscapeChar
  = "n"  { return '\n'; }
  / "t"  { return '\t'; }
  / "\\" { return '\\'; }
  / '"'  { return '"'; }

NumberLiteral "number literal"
  = "-"? [0-9]+ ("." [0-9]+)? { return parseFloat(text()); }

DurationLiteral "duration literal"
  = value:NumberLiteral unit:("ms" / "s")
  { return { value, unit }; }

BooleanLiteral "boolean literal"
  = "true"  { return true; }
  / "false" { return false; }

VariableRef "variable reference"
  = "$" id:Identifier { return { type: 'var', name: id }; }

FlagCheckExpr "flag check"
  = "?" id:Identifier { return { type: 'flag', name: id }; }

Literal
  = DurationLiteral
  / StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / VariableRef
  / FlagCheckExpr
  / Identifier

// ============================================================
// 表达式 — 按优先级分层，使用重复 + reduce 实现左结合
//
// 优先级 (低 → 高):
//   or → and → == != > >= < <= → + - → * / % → ! - (一元) → primary
// ============================================================

OrExpr "logical OR"
  = head:AndExpr tail:(__ "or" !IdentifierChar __ @AndExpr)*
  {
    return tail.reduce(
      (left, right) => ({ type: 'binary', op: 'or', left, right }),
      head,
    );
  }

AndExpr "logical AND"
  = head:CompExpr tail:(__ "and" !IdentifierChar __ @CompExpr)*
  {
    return tail.reduce(
      (left, right) => ({ type: 'binary', op: 'and', left, right }),
      head,
    );
  }

CompExpr "comparison"
  = left:ArithExpr
    rhs:(__ op:CompOp __ right:ArithExpr { return { op, right }; })?
  {
    if (!rhs) return left;
    return { type: 'binary', op: rhs.op, left, right: rhs.right };
  }

CompOp "comparison operator"
  = ">=" / "<=" / "!=" / "==" / ">" / "<"

ArithExpr "arithmetic"
  = head:Term tail:(__ op:AddOp __ t:Term { return { op, term: t }; })*
  {
    return tail.reduce(
      (left, r) => ({ type: 'binary', op: r.op, left, right: r.term }),
      head,
    );
  }

AddOp "additive operator"
  = "+" / "-"

Term "term"
  = head:Unary tail:(__ op:MulOp __ u:Unary { return { op, term: u }; })*
  {
    return tail.reduce(
      (left, r) => ({ type: 'binary', op: r.op, left, right: r.term }),
      head,
    );
  }

MulOp "multiplicative operator"
  = "*" / "/" / "%"

Unary "unary expression"
  = op:UnaryOp _ expr:Unary
  { return { type: 'unary', op, expr }; }
  / Primary

UnaryOp "unary operator"
  = "!" / "-"

Primary "primary expression"
  = "(" _ expr:OrExpr _ ")" { return expr; }
  / Literal

// ============================================================
// 元数据行
// 必须出现在脚本最前面（语义谓词在 Script 的 action 中检查）。
// ============================================================

MetadataKey
  = "author" / "version" / "title"

MetadataLine "metadata line"
  = _ "@" key:MetadataKey __ value:StringLiteral EndOfLine
  { return { type: 'meta', key, value }; }
  / _ "@" key:MetadataKey _ rest:$((!TrailingComment [^\r\n])*) EndOfLine
  { return { type: 'meta', key, value: rest.trim() }; }

// ============================================================
// 标签
// ============================================================

LabelDeclaration "label declaration"
  = _ "@label" __ id:Identifier EndOfLine
  {
    return {
      type: 'command',
      command: {
        type: 'label',
        args: { name: id },
        line: location().start.line,
      },
    };
  }

// ============================================================
// 流程控制 — @if / @elseif
// @else 和 @endif 无特殊语法，由 GenericCommandLine 匹配
// ============================================================

IfLine "if/elseif line"
  = _ "@if" !IdentifierChar __ expr:OrExpr EndOfLine
  {
    return {
      type: 'command',
      command: {
        type: 'if',
        args: { expression: expr },
        line: location().start.line,
      },
    };
  }
  / _ "@elseif" !IdentifierChar __ expr:OrExpr EndOfLine
  {
    return {
      type: 'command',
      command: {
        type: 'elseif',
        args: { expression: expr },
        line: location().start.line,
      },
    };
  }

// ============================================================
// 对话
// ============================================================

SayLine "say command"
  = _ "@say" __ speaker:(StringLiteral / Identifier)
    __ text:StringLiteral options:(__ @SayOption)* EndOfLine
  {
    const args = { speaker, text };
    for (const opt of options) {
      Object.assign(args, opt);
    }
    return {
      type: 'command',
      command: { type: 'say', args, line: location().start.line },
    };
  }

DialogLine "inline dialogue (语法糖)"
  = _ speaker:Identifier __ text:StringLiteral
    options:(__ @SayOption)* EndOfLine
  {
    const args = { speaker, text };
    for (const opt of options) {
      Object.assign(args, opt);
    }
    return {
      type: 'command',
      command: { type: 'say', args, line: location().start.line },
    };
  }

SayOption "say option"
  = "voice=" id:Identifier { return { voice: id }; }
  / "speed=" num:NumberLiteral { return { speed: num }; }
  / "adv" { return { mode: 'adv' }; }
  / "nvl" { return { mode: 'nvl' }; }

// ============================================================
// @choice … @endchoice 块
// 多行语法，解析为单条 choice 类型的 Command
// ============================================================

ChoiceBlock "choice block"
  = _ "@choice" _ mode:ChoiceMode? EndOfLine
    choices:ChoiceOptionLine*
    _ "@endchoice" _ EndOfLine
  {
    return {
      type: 'command',
      command: {
        type: 'choice',
        args: {
          mode: mode ?? 'adv',
          choices,
        },
        line: location().start.line,
      },
    };
  }

ChoiceMode "choice mode"
  = "mode=" m:("adv" / "nvl") { return m; }

ChoiceOptionLine "choice option"
  = _ "->" __ text:StringLiteral _ ":" _ label:Identifier
    condition:(__ "if" __ expr:OrExpr { return expr; })?
    EndOfLine
  {
    const choice = { text, label };
    if (condition !== null) {
      choice.condition = condition;
    }
    return choice;
  }

// ============================================================
// 变量指令 — 右值允许完整表达式
// 这些命令的 handler 会对 args['1']…（以及 @random 的 args['2']）求值，
// 因此语法层必须放行表达式，而不是只接受单个字面量。
// ============================================================

VariableCommandName "variable command name"
  = "set" / "add" / "sub" / "mul" / "div" / "mod" / "random"

VariableCommandLine "variable command"
  = _ "@" name:VariableCommandName __ target:VariableRef
    values:(__ @OrExpr)* EndOfLine
  {
    const args = { '0': target };
    values.forEach((value, index) => {
      args[String(index + 1)] = value;
    });
    return {
      type: 'command',
      command: { type: name, args, line: location().start.line },
    };
  }

// ============================================================
// 通用指令（回退）
// 匹配所有未特殊处理的 @command
// ============================================================

GenericCommandLine "generic @command"
  = _ "@" name:Identifier args:(__ @Arg)* EndOfLine
  {
    const argsObj = {};
    let posIndex = 0;
    for (const arg of args) {
      if (arg.type === 'kv') {
        argsObj[arg.key] = arg.value;
      } else {
        argsObj[String(posIndex++)] = arg.value;
      }
    }
    return {
      type: 'command',
      command: { type: name, args: argsObj, line: location().start.line },
    };
  }

Arg "command argument"
  = KeyValueArg / PositionalArg

KeyValueArg "key=value"
  = key:Identifier "=" value:Literal
  { return { type: 'kv', key, value }; }

PositionalArg "positional arg"
  = value:Literal
  { return { type: 'pos', value }; }

// ============================================================
// 注释与空行
// ============================================================

CommentLine "comment"
  = _ "//" [^\r\n]* _lineEnd
  { return { type: 'comment' }; }

BlankLine "blank line"
  = _ _lineEnd
  { return { type: 'blank' }; }
