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

单行注释以 `//` 开头，**必须独占一行**（`//` 之前只允许空白字符）。不支持多行注释，也不支持行尾注释。

```
// 这是注释
@bg classroom day
```

> ⚠️ **已知缺陷**：行尾注释（如 `@bg classroom day  // 说明`）当前会**解析失败**，因为 `grammar.pegjs`
> 的 `CommentLine` 只能匹配整行注释。详见 §十三。

### 2.3 标识符

用于标签名、变量名、资源 ID、旗标名等：

- 以字母或下划线开头
- 后接字母、数字、下划线、连字符
- 区分大小写
- 正则：`[a-zA-Z_][a-zA-Z0-9_-]*`

### 2.4 字面量

| 类型     | 格式                                 | 示例                   |
| -------- | ------------------------------------ | ---------------------- |
| 字符串   | 双引号包围，支持 `\n` `\t` `\\` `\"` | `"你好"`, `"行1\n行2"` |
| 整数     | 十进制数字，可选负号                 | `42`, `-7`             |
| 浮点数   | 含小数点，可选负号                   | `3.14`, `-0.5`         |
| 布尔值   | `true` / `false`                     | —                      |
| 持续时间 | 带单位后缀的数字                     | `2s`, `500ms`, `1.5s`  |

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
MetadataValue   = StringLiteral | BareText    (* 裸文本：整行 trim 后原样取用 *)
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

| 指令       | 参数           | 说明               |
| ---------- | -------------- | ------------------ |
| `@author`  | 字符串或裸文本 | 脚本作者           |
| `@version` | 字符串或裸文本 | 脚本版本号         |
| `@title`   | 字符串或裸文本 | 脚本标题（显示用） |

元数据指令必须出现在任何其他命令和标签之前，且只能出现一次；重复出现会抛出错误。

值的写法有两种，二者等价：加双引号（`@title "第一章"`）或不加引号按裸文本取用（`@title 第一章`）。
注意裸文本会一直取到行尾并去除首尾空白，因此裸文本中不能包含换行。

---

## 四、权威语法定义（PEG）

VNScript 的权威 PEG 语法定义位于：

**`src/script/grammar.pegjs`**

使用 Peggy 5.x 编译为可执行解析器：

```bash
npx peggy --format es src/script/grammar.pegjs -o src/script/parser.js
```

该文件采用 scannerless PEG 描述，是语法规范的唯一权威来源。以下为历史 EBNF 参考（仅供对比，可能滞后于实际实现）。

<details>
<summary>历史 EBNF 参考（展开查看）</summary>

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

CommandName         = Identifier

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

VariableRef         = "$" Identifier
FlagCheckExpr       = "?" Identifier

Identifier          = LetterOrUnderscore { LetterOrUnderscore | Digit | "-" }
LetterOrUnderscore  = "a".."z" | "A".."Z" | "_"
Digit               = "0".."9"
Space               = " " | "\t"
LineEnd             = "\n" | "\r\n"
```

</details>

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
// 无名字的说话者
@say "???" "......"
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

`script:say` — `{ speaker: string; text: string; voice?: string; speed?: number; mode?: 'adv' | 'nvl' }`

---

### 5.2 背景（Background）

```
"@bg" Space Identifier [ Space TransitionSpec ]
TransitionSpec     = TransitionName [ Space DurationLiteral ]
TransitionName     = Identifier
```

| 参数       | 说明                                   |
| ---------- | -------------------------------------- |
| `id`       | 背景资源 ID（必填，第一个位置参数）    |
| transition | 转场效果名（可选），如 `fade` `slideL` |
| duration   | 转场持续时间（可选），默认值由引擎决定 |

```
// 立即切换
@bg classroom day
// 1.5 秒淡入
@bg corridor fade 1.5s
// 从左侧滑入
@bg rooftop slideL
```

#### 对应事件

`bg:change` — `{ id: string; transition?: string; duration?: number }`

---

### 5.3 角色（Character）

#### 显示角色

```
"@show" Space Identifier [ Space PositionSpec ] [ Space TransitionSpec ] [ Space ShowOption { Space ShowOption } ]

PositionSpec       = "left" | "center" | "right"
                   | "farLeft" | "farRight"
                   | "offLeft" | "offRight"

TransitionSpec     = TransitionName [ Space DurationLiteral ]   (* 位置参数写法 *)
ShowOption         = "sprite=" Identifier
                   | "transition=" TransitionName               (* 键值写法 *)
                   | "duration=" DurationLiteral
```

```
// 默认立绘，居中
@show ch_hero center
// 微笑立绘，左侧
@show ch_hero left sprite=smile
@show ch_heroine right sprite=embarrassed transition=fade duration=500ms
// 位置参数写转场与时长
@show ch_hero center fade 500ms
```

- `position` 省略时默认为 `center`
- 转场与时长既可用位置参数（`fade 500ms`）也可用键值（`transition=fade duration=500ms`），两种等价
- ⚠️ **位置参数按序读取**：`@show` 先取 `pos[0]` 作 id、再取 `pos[1]` 作 position，之后才把剩余参数
  中的字符串当转场、数字当时长。因此**省略 position 直接写转场**（如 `@show ch fade 500ms`）会把
  `fade` 当作 position。想省略 position 又要用位置参数写转场时，请显式写 `center`，或改用键值写法

> ⚠️ **未实现**：`PositionSpec` 的坐标形式 `NumberLiteral "@" NumberLiteral`（示例 `@show ch_cat 800@600`）
> 当前**无法解析**。事件里的 `Position` 类型虽允许 `{ x: number; y: number }`，但当前没有任何命令能产生它。
> 详见 §十三。

#### 隐藏角色

```
"@hide" [ Space Identifier ] [ Space TransitionSpec ] [ Space HideOption { Space HideOption } ]

HideOption         = "transition=" TransitionName
                   | "duration=" DurationLiteral
```

```
// 位置参数写转场
@hide ch_hero fade
// 键值写时长
@hide all fade duration=1s
```

- `id` 省略（即 `@hide` 后不跟任何位置参数）时默认为 `all`（隐藏所有角色）
- 转场/时长支持位置参数与键值两种写法，与 `@show` 一致
- ⚠️ 同样**按序读取**：`@hide fade` 会把 `fade` 当成 id（而非「省略 id + 转场 fade」）。要隐藏全部
  并带转场，请写 `@hide all fade`

#### 移动角色

```
"@move" Space Identifier [ Space PositionSpec ] [ Space DurationLiteral [ Space EasingFn ] ]

EasingFn           = "ease" | "linear" | "easeIn" | "easeOut" | "easeInOut"
```

```
@move ch_hero center 1s easeOut
@move ch_heroine right 500ms linear
```

- `position` 省略时默认为 `center`

#### 对应事件

`character:show` — `{ id: string; position: Position; sprite?: string; transition?: string; duration?: number }`
`character:hide` — `{ id: string; transition?: string; duration?: number }`
`character:move` — `{ id: string; position: Position; duration?: number; easing?: string }`

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

#### 对应事件

`character:sprite` — `{ id: string; sprite: string; transition?: string; duration?: number }`

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

`@playAmbient` 当前忽略 `loop=` 计数，仅识别 `loop` / `once`。

#### 对应事件

`audio:play` — `{ id: string; type: 'bgm' | 'se' | 'voice' | 'ambient'; loop?: boolean; loopCount?: number; fadeIn?: number; volume?: number }`
`audio:stop` — `{ type: 'bgm' | 'se' | 'voice' | 'ambient'; id?: string; fadeOut?: number }`

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
// 无条件跳转
@jump chapter2_start

// 子程序调用，压入调用栈
@call explore_scene
// ... 子场景 ...
// 返回调用点下一行
@return
```

#### 条件分支

```
"@if"     Space Expression
"@elseif" Space Expression    (* 可选，可多个 *)
"@else"                       (* 可选 *)
"@endif"
```

> `Expression` 的完整产生式见 §七。`@if` / `@elseif` 是当前版本**唯一**能使用完整表达式的地方。

```
@if $affection >= 80
    Heroine "我...喜欢你。"
@elseif $affection >= 50
    Heroine "你是个好人。"
@else
    Heroine "再见。"
@endif
```

> ⚠️ **未实现**：早期版本定义过 `@switch` / `@case` / `@default` / `@endswitch` 多路分支，但代码从未实现。
> 请改用 `@if` / `@elseif` / `@else` 链。注意这些命令（以及任何未注册的命令）会被**静默忽略**
> （仅 `console.warn`），不会报错——见 §十三。

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
- `if` 后的表达式**本意**是控制该选项是否可见/可用，但**当前版本未求值**（见 §十三）：它会被解析并存入
  `Choice.condition`，引擎却从不读取，因此所有选项始终可见

#### 对应事件

`script:choice` — `{ choices: Choice[]; mode?: 'adv' | 'nvl' }`
`script:choice:selected` — `{ label: string }`

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

Operand = Literal                                 (* 单个字面量或 $var；不支持表达式 *)
```

```
@set $score 0
@add $affection 10
@sub $hp 5
@mul $damage 2
@div $ratio 2
@mod $remainder 3
// $dice = [1, 6] 随机整数
@random $dice 1 6
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
// 设置旗标
@flag met_hero
// 清除旗标
@unflag secret_revealed
// 切换
@toggle auto_mode
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
"@click"                                  (* 与 @pause 同义，显式等待一次点击 *)
```

```
@pause
// 用户点击后继续
@bg next_scene
```

`@pause` 与 `@click` 实现相同：将解释器状态设为 `'waiting'`，等待 `input:click` 后恢复。
注意它们**不是**「等 0 毫秒」—— `@wait` 才是等定时器（`@wait 0ms` 会立即继续，不等点击）。

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

| 标签                    | 说明             | 示例                                |
| ----------------------- | ---------------- | ----------------------------------- |
| `[color=#rrggbb]`       | 文字颜色         | `"这是[color=#ff0000]红色[/color]"` |
| `[b]...[/b]`            | 加粗             | `"[b]重要[/b]消息"`                 |
| `[i]...[/i]`            | 斜体             | `"[i]内心独白[/i]"`                 |
| `[size=N]...[/size]`    | 字号             | `"[size=32]标题[/size]"`            |
| `[shake]...[/shake]`    | 抖动文字         | `"[shake]啊——[/shake]"`             |
| `[speed=N]`             | 局部打字速度     | `"[speed=30]慢速文字[/speed]"`      |
| `[pause=N]`             | 内联暂停（毫秒） | `"然后...[pause=1000]他离开了。"`   |
| `[ruby=注音]...[/ruby]` | 注音             | `"[ruby=つぎ]次[/ruby]"`            |
| `{$name}`               | 内联变量插值     | `"好感度：{$affection}"`            |

**富文本渲染方案（基于 PixiJS v8）：**

- `[color]` `[b]` `[i]` `[size]` 与 `{$var}` 插值：引擎侧解析为带样式的分段，每段一个 pixi `Text`（叶子节点），打字机仅在字符边界更新可见字数（详见架构文档 §4.7）
- `[speed=N]` / `[pause=N]`：不参与样式分段，由打字机状态机（TypewriterState）按局部速度/内联暂停推进
- `[ruby]` / `[shake]`：标注为后续迭代，当前版本不解析（按纯文本或忽略处理）

---

## 七、表达式语法补充

> **注意**: 以下为历史 EBNF 参考。权威表达式语法定义见 `src/script/grammar.pegjs` 中的 `OrExpr` / `AndExpr` / `CompExpr` / `ArithExpr` / `Term` / `Unary` 规则链。

**当前版本中，表达式的唯一使用位置是 `@if` / `@elseif` 的条件。** 早期规范声称表达式也可用于
`@choice` 的条件与变量指令的右值，但这两处均未接通：

- `@choice` 的 `if` 条件会被解析但从不求值（见 §5.7）；
- 变量指令（`@set` / `@add` …）的右值只接受**单个字面量或 `$var`**，无法写 `@set $x 1 + 2` 或
  `@set $hp $hp - 1`。命令实现本身已调用求值器，缺的是 grammar 允许表达式进入位置参数；
  算术请直接用 `@add` / `@sub` / `@mul` / `@div` / `@mod`。

详见 §十三。

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

| 优先级 | 运算符                      |
| ------ | --------------------------- |
| 1      | `!` `-`（一元）             |
| 2      | `*` `/` `%`                 |
| 3      | `+` `-`（二元）             |
| 4      | `>` `>=` `<` `<=` `==` `!=` |
| 5      | `and`                       |
| 6      | `or`                        |

---

## 八、完整指令速查表

| 分类   | 指令           | 语法                                                                   |
| ------ | -------------- | ---------------------------------------------------------------------- |
| 元数据 | `@author`      | `@author 作者名`（引号可选）                                           |
| —      | `@version`     | `@version 1.0`                                                         |
| —      | `@title`       | `@title 脚本标题`                                                      |
| 对话   | `@say`         | `@say 角色名 "文本" [voice=id] [adv\|nvl]`                             |
| —      | 内联对话       | `角色名 "文本" [voice=id]`                                             |
| 背景   | `@bg`          | `@bg 资源id [转场名] [时长]`                                           |
| 角色   | `@show`        | `@show 角色id [位置] [转场名] [时长] [sprite=id]`                      |
| —      | `@hide`        | `@hide [角色id] [转场名] [时长]`（无任何参数表示 all）                 |
| —      | `@move`        | `@move 角色id 位置 [时长] [缓动]`                                      |
| 立绘   | `@sprite`      | `@sprite 角色id 立绘id [转场名] [时长]`                                |
| 音频   | `@playBgm`     | `@playBgm 资源id [loop\|once] [fadein=时长] [volume=N]`                |
| —      | `@stopBgm`     | `@stopBgm [fade=时长]`                                                 |
| —      | `@playSe`      | `@playSe 资源id [volume=N]`                                            |
| —      | `@playVoice`   | `@playVoice 资源id`                                                    |
| —      | `@playAmbient` | `@playAmbient 资源id [loop] [fadein=时长] [volume=N]`                  |
| —      | `@stopAmbient` | `@stopAmbient [fade=时长]`                                             |
| 流程   | `@label`       | `@label 标签名`                                                        |
| —      | `@jump`        | `@jump 标签名`                                                         |
| —      | `@call`        | `@call 标签名`                                                         |
| —      | `@return`      | `@return`                                                              |
| —      | `@if`          | `@if 表达式`                                                           |
| —      | `@elseif`      | `@elseif 表达式`                                                       |
| —      | `@else`        | `@else`                                                                |
| —      | `@endif`       | `@endif`                                                               |
| 选项   | `@choice`      | `@choice [mode=adv\|nvl]` + `-> "文本": 标签 [if 条件]` + `@endchoice` |
| 变量   | `@set`         | `@set $变量 (字面量 \| $变量)`                                         |
| —      | `@add`         | `@add $变量 值`                                                        |
| —      | `@sub`         | `@sub $变量 值`                                                        |
| —      | `@mul`         | `@mul $变量 值`                                                        |
| —      | `@div`         | `@div $变量 值`                                                        |
| —      | `@mod`         | `@mod $变量 值`                                                        |
| —      | `@random`      | `@random $变量 最小 最大`                                              |
| 旗标   | `@flag`        | `@flag 旗标名`                                                         |
| —      | `@unflag`      | `@unflag 旗标名`                                                       |
| —      | `@toggle`      | `@toggle 旗标名`                                                       |
| —      | `@clearFlags`  | `@clearFlags`                                                          |
| 特效   | `@shake`       | `@shake [时长] [intensity=N]`                                          |
| —      | `@flash`       | `@flash [color=#xxx] [duration=时长]`                                  |
| —      | `@snow`        | `@snow [时长] [density=N]`                                             |
| —      | `@rain`        | `@rain [时长] [density=N]`                                             |
| —      | `@stopEffect`  | `@stopEffect`                                                          |
| 系统   | `@wait`        | `@wait 时长`                                                           |
| —      | `@pause`       | `@pause`                                                               |
| —      | `@click`       | `@click`（等待一次点击）                                               |
| —      | `@end`         | `@end`                                                                 |
| —      | `@clear`       | `@clear`                                                               |

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
```

---

## 十、解析到 AST 的映射

每个 `CommandLine` 解析为一个 `Command` 节点，DialogLine 展开为 `@say` 的 `Command` 节点。

```ts
interface Command {
  type: string; // 指令名，不带 @（如 "bg"、"say"、"set"）
  args: Record<string, unknown>;
  line: number; // 1-based 源码行号
}
```

| 源文本                      | AST Command                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@bg classroom day fade 1s` | `{ type: "bg", args: { "0": "classroom", "1": "day", "2": "fade", "3": { value: 1, unit: "s" } }, line: 3 }`                    |
| `Hero "你好！"`             | `{ type: "say", args: { speaker: "Hero", text: "你好！" }, line: 5 }`                                                           |
| `@say Hero "你好！" nvl`    | `{ type: "say", args: { speaker: "Hero", text: "你好！", mode: "nvl" }, line: 5 }`                                              |
| `@label start`              | `{ type: "label", args: { name: "start" }, line: 7 }`                                                                           |
| `@set $score 10`            | `{ type: "set", args: { "0": { type: "var", name: "score" }, "1": 10 }, line: 9 }`                                              |
| `@if $score >= 50`          | `{ type: "if", args: { expression: { type: "binary", op: ">=", left: { type: "var", name: "score" }, right: 50 } }, line: 11 }` |
| `@choice` ... `@endchoice`  | `{ type: "choice", args: { mode: "adv", choices: Choice[] }, line: 13 }`                                                        |

**要点：**

- **`type` 不含 `@`**：`@bg` 解析为 `type: "bg"`。注册自定义命令时键名同样不带 `@`（见 §十一）。
- **通用指令的 `args` 按下标键存位置参数**：`@bg a b c` 得到 `{ "0": "a", "1": "b", "2": "c" }`，
  `key=value` 形式的参数则以键名为键（如 `sprite=neutral` → `args.sprite`）。
- **`expression` 是节点树，不是字符串**：`@if` / `@elseif` 的条件解析为
  `{ type: "binary" | "unary", op, left?, right?, expr? }` 与叶节点（数字、字符串、布尔、
  `{ type: "var", name }`、`{ type: "flag", name }`）组成的树。语法见 §七。
- **`duration` 是 `{ value, unit }`**：`1s` → `{ value: 1, unit: "s" }`，`500ms` → `{ value: 500, unit: "ms" }`。
  命令实现内部再经 `toMs()` 归一为毫秒数。
- **`@choice` 块折叠为单条 Command**：块内的 `->` 行转换为 `Choice[]` 存入 `args.choices`。
  注意 `mode` 缺省时由 grammar 填入默认值 `"adv"`。

### Parser 合成的 `Script` 对象

`Parser.parseScript()` 把语法产物的 `{ commands, metadata }` 包装为 `Script`：

```ts
interface Script {
  name: string; // 由 Parser 填为 ""（当前版本不从元数据取名）
  commands: Command[];
  labels: Map<string, number>; // 由 Parser 扫描 label 指令建立：标签名 → commands 下标
  metadata: Record<string, string>; // @author / @version / @title
}
```

`labels` 的下标是 `commands` 数组中的位置，供 `@jump` / `@call` 直接定位。

---

## 十一、扩展指南

### 注册自定义命令

`CommandRegistry` 以 `handler.type` 为键注册，`type` **不带 `@`**，且必须与脚本文本中的指令名一致
（脚本里写 `@shaketext …`，注册的是 `type: "shaketext"`）：

```ts
engine.script.commandRegistry.register({
  type: 'shaketext',
  execute(ctx, args) {
    const duration = (args.duration as number) ?? 500;
    ctx.engine.eventBus.emit('effect:play', { type: 'shake', duration });
  },
});
```

自定义指令走通用 `GenericCommandLine`（见 §四），因此其位置参数同样以 `"0"`、`"1"` … 为键，
`key=value` 参数以键名为键；`execute` 收到的 `args` 形状即 §十 中描述的 `Record<string, unknown>`。

> **当前版本不支持解析前中间件**：早期规范设想的 `parser.use(source => …)` 预处理钩子并未实现。
> 若要支持非标准语法（如缩进块），只能修改 grammar 并重新生成解析器。

---

## 十二、文件扩展名约定

| 扩展名 | 说明            |
| ------ | --------------- |
| `.vns` | VNScript 源文件 |

---

## 十三、当前版本未实现 / 已知限制

本节是**单一事实来源**，集中收录上文各处标注的「规范已描述、代码尚未接通」项与几处容易踩坑的行为。
写脚本前请先核对本表，避免照早期规范写出跑不通的脚本。

### 13.1 已描述但未实现

| 功能                        | 规范出处 | 现状                                                                                                                                                                                     |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 行尾注释 `@bg x // 注释`    | §2.2     | grammar 仅支持整行注释（`//` 必须独占一行）；带行尾 `//` 的行通常**直接解析失败**（`SyntaxError`）；个别位置（如 choice 的 `if 条件`）会把 `//` 之后的文本原样吞进右侧，也不会当注释处理 |
| 变量指令右值写表达式        | §7       | `@set $x 1 + 2` 无法解析。右值只接受**单个字面量或 `$var`**；命令实现本身已调用求值器，缺的是 grammar 放行。算术请用 `@add`/`@sub`/`@mul`/`@div`/`@mod`                                  |
| `@choice` 的 `if 条件`      | §5.7     | 条件会被解析进 `Choice.condition`，但**从不求值**；`ChoicePanel` 读的是从未被赋值的 `enabled`                                                                                            |
| 坐标位置 `@show ch 800@600` | §5.3     | `Position` 类型虽含 `{x,y}`，但 grammar 与 handler 均不支持 `x@y` 写法                                                                                                                   |
| 解析前中间件 `parser.use`   | §11      | 无此 API，不存在的接口                                                                                                                                                                   |

### 13.2 已知缺陷（会照常执行，但结果可能出乎意料）

| 行为                     | 说明                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 未知指令被**静默忽略**   | 未注册的指令（如 `@foo bar`）不会报错，仅 `console.warn` 一条，脚本继续执行。拼写错误不会立刻暴露                                             |
| `@switch` 系列**未实现** | `@switch` / `@case` / `@default` / `@endswitch` 均未实现，且会被当作普通指令处理，导致每个 case 顺序执行。请改用 `@if` / `@elseif`（见 §5.6） |
| `@playAmbient … loop=N`  | `loop=` 的**计数**形式不被支持（仅裸 `loop` 表示无限循环）；传入 `loop=3` 会被忽略                                                            |

> 另有两条**运行时缺陷**记录在案，属代码任务、不在本次文档修订范围：脚本结束后 `script:end` 事件会逐帧重复触发；
> 最后一句台词尚未结束（仍在等待点击）时脚本就可能被判定为结束。详见架构文档与之相关的已知问题条目。
