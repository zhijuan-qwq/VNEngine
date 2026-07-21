# VNScript DSL 设计规范

## 一、概述

VNScript 是 VNEngine 专用的声明式领域特定语言（DSL），以 `.vns` 为扩展名。采用"编译 + 解释执行"两阶段设计：解析器将源文件编译为 AST（`Script` 命令序列），解释器在运行时逐条执行。

### 设计原则

- **可读性优先**：语法接近自然语言，面向剧本作者而非程序员
- **可扩展**：命令注册制，插件可通过 `CommandRegistry.register()` 添加自定义指令
- **确定性**：每行一条指令，执行顺序自顶向下，跳转目标通过标签明确指定

---

## 二、词法约定

### 2.1 空白与换行

- **指令**：一行一条，以换行符 `\n` 或 `\r\n` 分隔
- **缩进**：无语义意义，仅用于美化可读性
- **空行**：被忽略

### 2.2 注释

单行注释以 `//` 开头，至行尾结束。不支持多行注释。

```
// 这是注释
@bg classroom day  // 行尾注释
```

### 2.3 标识符

用于标签名、变量名、资源 ID、旗标名等：

- 以字母或下划线开头
- 后接字母、数字、下划线、连字符
- 区分大小写
- 正则：`[a-zA-Z_][a-zA-Z0-9_-]*`

### 2.4 字面量

| 类型   | 格式                                | 示例                          |
| ------ | ----------------------------------- | ----------------------------- |
| 字符串 | 双引号包围，支持 `\n` `\t` `\\` `\"` | `"你好"`, `"行1\n行2"`        |
| 整数   | 十进制数字，可选负号                | `42`, `-7`                    |
| 浮点数 | 含小数点，可选负号                  | `3.14`, `-0.5`                |
| 布尔值 | `true` / `false`                    | —                             |
| 持续时间 | 带单位后缀的数字                 | `2s`, `500ms`, `1.5s`         |

### 2.5 参数分隔

同一指令的多个参数以空格分隔。等号参数（key=value）内不可含空格。

---

## 三、脚本结构

一个 `.vns` 文件由三部分组成：

```
Script          = MetadataBlock? Block+
Block           = LabelDeclaration | CommandLine | BlankLine | Comment
MetadataBlock   = MetadataLine+
MetadataLine    = "@" MetadataKey Space MetadataValue
MetadataKey     = "author" | "version" | "title"
MetadataValue   = StringLiteral | Identifier
```

示例：

```
@title 第一章
@author Alice
@version 1.0

@label start

@bg classroom day
Hero "早上好。"
@end
```

### 3.1 元数据指令

| 指令       | 参数     | 说明             |
| ---------- | -------- | ---------------- |
| `@author`  | 字符串   | 脚本作者         |
| `@version` | 字符串   | 脚本版本号       |
| `@title`   | 字符串   | 脚本标题（显示用）|

元数据指令必须出现在任何其他命令和标签之前，且只能出现一次。

---

## 四、完整 EBNF 语法

```
(* ===== 顶层结构 ===== *)

Script              = MetadataBlock? StatementBlock
MetadataBlock       = { MetadataLine }
MetadataLine        = ( "@author"  | "@version" | "@title" ) Space StringLiteral LineEnd
StatementBlock      = { Line }                   (* 剩余行允许任意语句 *)

Line                = BlankLine | LabelDeclaration | CommandLine | Comment | DialogLine
BlankLine           = { Space } LineEnd
Comment             = { Space } "//" { AnyChar } LineEnd
LabelDeclaration    = { Space } "@label" Space Identifier LineEnd
DialogLine          = { Space } Identifier Space StringLiteral LineEnd
CommandLine         = { Space } "@" CommandName [ Space ArgList ] LineEnd

CommandName         = Identifier                  (* 不含 "@" 前缀，由 CommandRegistry 匹配 *)

ArgList             = Arg { Space Arg }
Arg                 = PositionalArg | KeyValueArg
PositionalArg       = Literal
KeyValueArg         = Identifier "=" Literal

Literal             = StringLiteral
                    | NumberLiteral
                    | DurationLiteral
                    | BooleanLiteral
                    | VariableRef
                    | FlagCheckExpr

StringLiteral       = '"' { CharNoQuote | EscapeSeq } '"'
NumberLiteral       = [ "-" ] Digit { Digit } [ "." Digit { Digit } ]
DurationLiteral     = NumberLiteral ( "ms" | "s" )
BooleanLiteral      = "true" | "false"

(* ===== 变量引用与表达式 ===== *)

VariableRef         = "$" Identifier              (* 读取变量 *)
FlagCheckExpr       = "?" Identifier              (* 检查旗标是否存在 *)

(* ===== 词法定义 ===== *)

Identifier          = LetterOrUnderscore { LetterOrUnderscore | Digit | "-" }
LetterOrUnderscore  = "a".."z" | "A".."Z" | "_"
Digit               = "0".."9"
Space               = " " | "\t"
LineEnd             = "\n" | "\r\n"
AnyChar             = ? 除换行外的任意字符 ?
CharNoQuote         = ? 除双引号和反斜杠外的任意字符 ?
EscapeSeq           = "\\" ( "n" | "t" | "\\" | '"' )

(* ===== 文件扩展名 ===== *)
(* VNScript 源文件: *.vns *)
```

---

## 五、指令详解

### 5.1 对话（Dialogue）

对话是 VN 中最频繁的操作，支持两种语法形式。

#### 语法

```
(* 形式一：指令式 *)
"@say" Space SpeakerExpr Space StringLiteral [ Space SayOption { Space SayOption } ]

(* 形式二：内联式（语法糖） *)
Identifier Space StringLiteral [ Space SayOption { Space SayOption } ]

SpeakerExpr        = Identifier | StringLiteral
SayOption          = "voice=" Identifier
                   | "adv" | "nvl"
                   | "speed=" NumberLiteral
```

#### 示例

```
@say Hero "早上好，各位同学！"
@say "???" "......"             // 无名字的说话者
Hero "这是一句内联对话。"  voice=hero_001

// NVL 模式对话
Narrator "那天下午，一切都变了。"  nvl
```

#### 说明

- `@say`：指令式，显式指定说话者和文本
- 内联式：`角色名 "文本"`，是 `@say` 的语法糖，解析器将其展开为 `@say` 指令
- 空白角色名用 `""` 表示
- `voice`：指定语音资源 ID
- `adv`/`nvl`：指定对话模式（默认 ADV）
- `speed`：覆盖默认打字速度（字/秒）

#### 对应事件

`script:say` — `{ speaker: string; text: string }`

---

### 5.2 背景（Background）

```
"@bg" Space Identifier [ Space TransitionSpec ]
TransitionSpec     = TransitionName [ Space DurationLiteral ]
TransitionName     = Identifier
```

| 参数       | 说明                                    |
| ---------- | --------------------------------------- |
| `id`       | 背景资源 ID（必填，第一个位置参数）     |
| transition | 转场效果名（可选），如 `fade` `slideL` |
| duration   | 转场持续时间（可选），默认值由引擎决定  |

```
@bg classroom day                    // 立即切换
@bg corridor fade 1.5s              // 1.5秒淡入
@bg rooftop slideL                  // 从左侧滑入
```

#### 对应事件

`bg:change` — `{ id: string; transition?: string }`

---

### 5.3 角色（Character）

#### 显示角色

```
"@show" Space Identifier Space PositionSpec [ Space ShowOption { Space ShowOption } ]

PositionSpec       = "left" | "center" | "right"
                   | "farLeft" | "farRight"
                   | "offLeft" | "offRight"
                   | NumberLiteral "@" NumberLiteral

ShowOption         = "sprite=" Identifier
                   | "transition=" TransitionName
                   | "duration=" DurationLiteral
                   | "behind=" Identifier       (* 放在指定角色后方 *)
                   | "opacity=" NumberLiteral
```

```
@show ch_hero center                               // 默认立绘，居中
@show ch_hero left sprite=smile                    // 微笑立绘，左侧
@show ch_heroine right sprite=embarrassed transition=fade duration=500ms
@show ch_cat 800@600                                // 自定义坐标
```

#### 隐藏角色

```
"@hide" Space Identifier [ Space HideOption { Space HideOption } ]

HideOption         = "transition=" TransitionName
                   | "duration=" DurationLiteral
                   | "all"                          (* 隐藏所有角色 *)
```

```
@hide ch_hero fade
@hide all fade duration=1s
```

#### 移动角色

```
"@move" Space Identifier Space PositionSpec [ Space DurationLiteral [ Space EasingFn ] ]

EasingFn           = "ease" | "linear" | "easeIn" | "easeOut" | "easeInOut"
```

```
@move ch_hero center 1s easeOut
@move ch_heroine right 500ms linear
```

#### 对应事件

`character:show` — `{ id: string; position: string }`
`character:hide` — `{ id: string }`

---

### 5.4 立绘切换（Sprite）

在不改变位置的情况下切换角色的立绘/表情：

```
"@sprite" Space Identifier Space Identifier [ Space TransitionSpec ]
```

```
@sprite ch_hero smile
@sprite ch_hero angry fade 300ms
```

---

### 5.5 音频（Audio）

#### BGM

```
"@playBgm" Space Identifier [ Space AudioOption { Space AudioOption } ]
"@stopBgm"  [ Space "fade=" DurationLiteral ]

AudioOption        = "loop" | "once" | "loop=" NumberLiteral
                   | "fadein=" DurationLiteral
                   | "volume=" NumberLiteral
```

```
@playBgm school_theme loop fadein=2s
@playBgm tense_bgm once volume=0.5
@stopBgm fade=2s
```

#### 音效（SE）

```
"@playSe" Space Identifier [ Space "volume=" NumberLiteral ]
```

```
@playSe door_open
@playSe explosion volume=0.8
```

#### 语音（Voice）

```
"@playVoice" Space Identifier
```

```
@playVoice hero_001
```

#### 环境音（Ambient）

```
"@playAmbient" Space Identifier [ Space AudioOption { Space AudioOption } ]
"@stopAmbient" [ Space "fade=" DurationLiteral ]
```

#### 对应事件

`audio:play` — `{ id: string; type: 'bgm' | 'se' | 'voice' | 'ambient' }`
`audio:stop` — `{ type: 'bgm' | 'se' | 'voice' | 'ambient' }`

---

### 5.6 流程控制（Flow Control）

#### 标签与跳转

```
"@label"  Space Identifier
"@jump"   Space Identifier
"@call"   Space Identifier
"@return"
```

```
@label start
@jump chapter2_start        // 无条件跳转

@call explore_scene          // 子程序调用，压入调用栈
// ... 子场景 ...
@return                      // 返回调用点下一行
```

#### 条件分支

```
"@if"    Space Expression
"@elseif" Space Expression    (* 可选，可多个 *)
"@else"                       (* 可选 *)
"@endif"

Expression         = ComparisonExpr | CheckExpr | "(" Expression ")"
                   | Expression LogicalOp Expression
                   | "!" Expression                    (* 逻辑非 *)

ComparisonExpr     = Operand CompOp Operand
CheckExpr          = Operand                          (* 非零/非空为真 *)

Operand            = Literal | VariableRef
CompOp             = "==" | "!=" | ">" | ">=" | "<" | "<="
LogicalOp          = "and" | "or"
```

```
@if $affection >= 80
    Heroine "我...喜欢你。"
@elseif $affection >= 50
    Heroine "你是个好人。"
@else
    Heroine "再见。"
@endif
```

#### 多路分支

```
"@switch" Space Operand
"@case"   Space Literal
"@default"
"@endswitch"
```

```
@switch $route
@case "hero"
    @jump hero_ending
@case "heroine"
    @jump heroine_ending
@default
    @jump normal_ending
@endswitch
```

---

### 5.7 选项（Choice）

```
"@choice" Space "mode=" ("adv" | "nvl")    (* 可选，默认 adv *)
{ ChoiceOption }
"@endchoice"

ChoiceOption       = SpaceSpace "->" Space StringLiteral ":" Identifier [ Space "if" Expression ] LineEnd
SpaceSpace         = Space Space             (* 语义缩进，两个空格，无硬性要求 *)
```

```
@choice
  -> "回应他": respond
  -> "无视他": ignore if $courage >= 30
  -> "逃走":   run     if ?unlocked_run
@endchoice
```

- `->` 是选项标记符
- `:` 后是跳转标签
- `if` 后的表达式控制该选项是否可见/可用

#### 对应事件

`script:choice` — `{ choices: Choice[] }`

---

### 5.8 变量（Variable）

```
"@set"    Space VariableRef Space Operand         (* 赋值 *)
"@add"    Space VariableRef Space Operand         (* 加 *)
"@sub"    Space VariableRef Space Operand         (* 减 *)
"@mul"    Space VariableRef Space Operand         (* 乘 *)
"@div"    Space VariableRef Space Operand         (* 除 *)
"@mod"    Space VariableRef Space Operand         (* 取模 *)
"@random" Space VariableRef Space NumberLiteral Space NumberLiteral  (* 随机 *)
```

```
@set $score 0
@add $affection 10
@sub $hp 5
@mul $damage 2
@div $ratio 2
@mod $remainder 3
@random $dice 1 6                       // $dice = [1, 6] 随机整数
```

---

### 5.9 旗标（Flag）

```
"@flag"     Space Identifier            (* 设置旗标 *)
"@unflag"   Space Identifier            (* 清除旗标 *)
"@toggle"   Space Identifier            (* 切换旗标状态 *)
"@clearFlags"                            (* 清除所有旗标 *)
```

```
@flag met_hero                          // 设置旗标
@unflag secret_revealed                 // 清除旗标
@toggle auto_mode                       // 切换
```

---

### 5.10 画面特效（Screen Effect）

```
"@shake"    [ Space DurationLiteral ]   [ Space "intensity=" NumberLiteral ]
"@flash"    [ Space DurationLiteral ]   [ Space "color=" StringLiteral ]
"@snow"     [ Space DurationLiteral ]   [ Space "density=" NumberLiteral ]
"@rain"     [ Space DurationLiteral ]   [ Space "density=" NumberLiteral ]
"@stopEffect"                            (* 停止所有画面特效 *)
```

```
@shake intensity=0.5
@shake 1s intensity=0.8
@flash color="#FFFFFF" duration=200ms
@snow density=0.6
@rain
@stopEffect
```

---

### 5.11 系统指令（System）

#### 等待

```
"@wait" Space DurationLiteral            (* 暂停指定时间后继续 *)
```

```
@wait 1.5s
@wait 500ms
```

#### 暂停与继续

```
"@pause"                                  (* 暂停脚本，等待用户交互 *)
"@click"                                  (* 等价于 @wait 0ms，显式等待点击 *)
```

```
@pause
// 用户点击后继续
@bg next_scene
```

`@pause` 将解释器状态设为 `'waiting'`，等待用户输入（点击/按键）后恢复。

#### 结束

```
"@end"                                    (* 终止当前脚本 *)
```

#### 清除对话框

```
"@clear"                                  (* 清除当前显示的对话文字 *)
```

---

## 六、内联文本格式（Rich Text）

对话文本支持内联标签用于富文本渲染。标签不涉及脚本逻辑，仅影响渲染。

| 标签               | 说明             | 示例                                 |
| ------------------ | ---------------- | ------------------------------------ |
| `[color=#rrggbb]`  | 文字颜色         | `"这是[color=#ff0000]红色[/color]"`  |
| `[b]...[/b]`       | 加粗             | `"[b]重要[/b]消息"`                  |
| `[i]...[/i]`       | 斜体             | `"[i]内心独白[/i]"`                  |
| `[size=N]...[/size]` | 字号           | `"[size=32]标题[/size]"`             |
| `[shake]...[/shake]` | 抖动文字       | `"[shake]啊——[/shake]"`              |
| `[speed=N]`        | 局部打字速度     | `"[speed=30]慢速文字[/speed]"`       |
| `[pause=N]`        | 内联暂停（毫秒） | `"然后...[pause=1000]他离开了。"`     |
| `[ruby=注音]...[/ruby]` | 注音       | `"[ruby=つぎ]次[/ruby]"`             |
| `{var:name}`       | 内联变量插值     | `"好感度：{$affection}"`             |

---

## 七、表达式语法补充

用于 `@if`、`@elseif`、`@choice` 的条件以及变量指令的右值。

```
Expression         = LogicalExpr
LogicalExpr        = ComparisonExpr { LogicalOp ComparisonExpr }
LogicalOp          = "and" | "or"
ComparisonExpr     = [ "!" ] ArithmeticExpr [ CompOp ArithmeticExpr ]
ArithmeticExpr     = Term { AddOp Term }
Term               = Unary { MulOp Unary }
Unary              = [ "-" | "!" ] Primary
Primary            = StringLiteral | NumberLiteral | BooleanLiteral
                   | VariableRef | FlagCheckExpr
                   | "(" Expression ")"

CompOp             = "==" | "!=" | ">" | ">=" | "<" | "<="
AddOp              = "+" | "-"
MulOp              = "*" | "/" | "%"
```

### 运算符优先级（从高到低）

| 优先级 | 运算符                              |
| ------ | ----------------------------------- |
| 1      | `!` `-`（一元）                     |
| 2      | `*` `/` `%`                         |
| 3      | `+` `-`（二元）                     |
| 4      | `>` `>=` `<` `<=` `==` `!=`        |
| 5      | `and`                               |
| 6      | `or`                                |

---

## 八、完整指令速查表

| 分类     | 指令           | 语法                                                                 |
| -------- | -------------- | -------------------------------------------------------------------- |
| 元数据   | `@author`      | `@author "作者名"`                                                    |
| —        | `@version`     | `@version "1.0"`                                                      |
| —        | `@title`       | `@title "脚本标题"`                                                   |
| 对话     | `@say`         | `@say 角色名 "文本" [voice=id] [adv\|nvl]`                          |
| —        | 内联对话       | `角色名 "文本" [voice=id]`                                           |
| 背景     | `@bg`          | `@bg 资源id [转场名] [时长]`                                        |
| 角色     | `@show`        | `@show 角色id 位置 [sprite=id] [transition=名] [duration=时长]`     |
| —        | `@hide`        | `@hide 角色id [transition=名] [duration=时长]`                       |
| —        | `@move`        | `@move 角色id 位置 [时长] [缓动]`                                   |
| 立绘     | `@sprite`      | `@sprite 角色id 立绘id [转场名] [时长]`                             |
| 音频     | `@playBgm`     | `@playBgm 资源id [loop\|once] [fadein=时长] [volume=N]`            |
| —        | `@stopBgm`     | `@stopBgm [fade=时长]`                                               |
| —        | `@playSe`      | `@playSe 资源id [volume=N]`                                          |
| —        | `@playVoice`   | `@playVoice 资源id`                                                   |
| —        | `@playAmbient` | `@playAmbient 资源id [loop] [fadein=时长] [volume=N]`               |
| —        | `@stopAmbient` | `@stopAmbient [fade=时长]`                                           |
| 流程     | `@label`       | `@label 标签名`                                                       |
| —        | `@jump`        | `@jump 标签名`                                                        |
| —        | `@call`        | `@call 标签名`                                                        |
| —        | `@return`      | `@return`                                                             |
| —        | `@if`          | `@if 表达式`                                                          |
| —        | `@elseif`      | `@elseif 表达式`                                                      |
| —        | `@else`        | `@else`                                                               |
| —        | `@endif`       | `@endif`                                                              |
| —        | `@switch`      | `@switch 表达式`                                                      |
| —        | `@case`        | `@case 字面量`                                                        |
| —        | `@default`     | `@default`                                                            |
| —        | `@endswitch`   | `@endswitch`                                                          |
| 选项     | `@choice`      | `@choice [mode=adv\|nvl]` + `-> "文本": 标签 [if 条件]` + `@endchoice` |
| 变量     | `@set`         | `@set $变量 值`                                                       |
| —        | `@add`         | `@add $变量 值`                                                       |
| —        | `@sub`         | `@sub $变量 值`                                                       |
| —        | `@mul`         | `@mul $变量 值`                                                       |
| —        | `@div`         | `@div $变量 值`                                                       |
| —        | `@mod`         | `@mod $变量 值`                                                       |
| —        | `@random`      | `@random $变量 最小 最大`                                            |
| 旗标     | `@flag`        | `@flag 旗标名`                                                        |
| —        | `@unflag`      | `@unflag 旗标名`                                                      |
| —        | `@toggle`      | `@toggle 旗标名`                                                      |
| —        | `@clearFlags`  | `@clearFlags`                                                         |
| 特效     | `@shake`       | `@shake [时长] [intensity=N]`                                        |
| —        | `@flash`       | `@flash [color=#xxx] [duration=时长]`                                |
| —        | `@snow`        | `@snow [时长] [density=N]`                                           |
| —        | `@rain`        | `@rain [时长] [density=N]`                                           |
| —        | `@stopEffect`  | `@stopEffect`                                                         |
| 系统     | `@wait`        | `@wait 时长`                                                          |
| —        | `@pause`       | `@pause`                                                              |
| —        | `@end`         | `@end`                                                                |
| —        | `@clear`       | `@clear`                                                              |

---

## 九、完整示例

```
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
```

---

## 十、解析到 AST 的映射

每个 `CommandLine` 解析为一个 `Command` 节点，DialogLine 展开为 `@say` 的 `Command` 节点。

| 源文本                             | AST Command                              |
| ---------------------------------- | ---------------------------------------- |
| `@bg classroom day fade 1s`       | `{ type: "bg", args: { id: "classroom day", transition: "fade", duration: "1s" }, line: 3 }` |
| `Hero "你好！"`                   | `{ type: "say", args: { speaker: "Hero", text: "你好！" }, line: 5 }` |
| `@set $score 10`                  | `{ type: "set", args: { var: "$score", value: 10 }, line: 7 }` |
| `@if $score >= 50`                | `{ type: "if", args: { expression: "$score >= 50" }, line: 9 }` |
| `@choice` ... `@endchoice`        | 一个 `type: "choice"` 的 Command，`args.choices` 为 `Choice[]` |

`@choice` 块会被折叠为单条 Command，其内部的 `->` 行转换为 `Choice[]` 数组存入 `args.choices`。

---

## 十一、扩展指南

### 注册自定义命令

```ts
engine.script.commandRegistry.register({
  name: '@shaketext',
  execute(ctx, args) {
    const duration = (args.duration as number) ?? 500;
    engine.renderer.addEffect(new ShakeEffect(duration));
  },
});
```

### 添加语法糖

如需支持非标准语法（如 Python 风格缩进块），可在 Parser 前加一个预处理中间件：

```ts
parser.use((source: string) => {
  // 将自定义语法转换为标准 @ 指令格式
  return transformedSource;
});
```

---

## 十二、文件扩展名约定

| 扩展名  | 说明                     |
| ------- | ------------------------ |
| `.vns`  | VNScript 源文件          |
| `.vnsc` | 编译后的 AST 缓存（可选） |
