# 引擎内部

这份文档面向要改引擎或写自定义指令的人。只写剧本不需要读它。

## 1. 从源文件到执行

一份 `.vns` 脚本经过三个阶段：

1. **解析**：`src/script/grammar.pegjs` 生成的解析器把源码变成 `{ commands, metadata }`，`Parser` 再把它包装成 `Script` 对象，并扫描出所有标签。
2. **加载**：`ScriptEngine.load()` 检查 `commands` 里的指令是否都认识。不认识的指令在这里报错。
3. **执行**：`Interpreter` 用一个程序计数器逐条执行，遇到跳转、条件、对话、等待等指令时改变执行位置或暂停。

语法只有一处权威定义：`src/script/grammar.pegjs`。改完语法后重新生成解析器：

```bash
npm run build:parser
```

## 2. 解析后的数据形状

```ts
interface Script {
  name: string; // 当前由 Parser 填为 ""
  commands: Command[];
  labels: Map<string, number>; // 标签名 → commands 下标
  metadata: Record<string, string>; // @title / @author / @version 的原始值
}

interface Command {
  type: string; // 指令名，不带 @
  args: Record<string, unknown>;
  line: number; // 1-based 源码行号
}
```

`args` 里：

- 位置参数以 `"0"`、`"1"` …… 为键；
- 键值参数以参数名为键；
- 时长写成 `{ value, unit }`，例如 `500ms` 是 `{ value: 500, unit: "ms" }`；裸数字仍是数字，由指令按毫秒解释；
- 表达式是节点树，不是字符串；
- `@choice` 整块折叠成一条 `choice` 指令，选项放在 `args.choices`。

几个例子：

| 源文本                   | AST Command                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `@bg classroom fade 1s`  | `{ type: "bg", args: { "0": "classroom", "1": "fade", "2": { value: 1, unit: "s" } }, line: 3 }`                                |
| `Hero "你好！"`          | `{ type: "say", args: { speaker: "Hero", text: "你好！" }, line: 5 }`                                                           |
| `@say Hero "你好！" nvl` | `{ type: "say", args: { speaker: "Hero", text: "你好！", mode: "nvl" }, line: 5 }`                                              |
| `@label start`           | `{ type: "label", args: { name: "start" }, line: 7 }`                                                                           |
| `@set $score 10`         | `{ type: "set", args: { "0": { type: "var", name: "score" }, "1": 10 }, line: 9 }`                                              |
| `@if $score >= 50`       | `{ type: "if", args: { expression: { type: "binary", op: ">=", left: { type: "var", name: "score" }, right: 50 } }, line: 11 }` |
| `@choice` … `@endchoice` | `{ type: "choice", args: { mode: "adv", choices: Choice[] }, line: 13 }`                                                        |

表达式节点有以下几种：

- 二元：`{ type: "binary", op, left, right }`；
- 一元：`{ type: "unary", op, expr }`；
- 变量：`{ type: "var", name }`；
- 旗标：`{ type: "flag", name }`；
- 叶子值：数字、字符串、布尔值。

选项对象是 `{ text, label, condition?, enabled? }`。`condition` 由解析器填入，`enabled` 由 `choice` 指令在发事件前求值填入。

## 3. 解析阶段会报的错

- **语法错误**：不符合语法规则，例如选项块忘了 `@endchoice`、选项块里写了空行或整行注释、二元运算符两边没空格、以 `#` 开头的裸值。
- **元数据重复或位置不对**：三个元数据键各自只能出现一次，且必须排在所有指令和标签之前。
- **标签重复**：同一个标签名声明两次。这一项由 `Parser` 扫描时检查，不在语法文件里。

语法错误和重复标签会带行号；元数据重复或顺序错误只有消息，没有行号。这些情况下脚本都不会进入加载阶段。

注意几个**不**在解析阶段报错的情况：空选项块、`@wait` 没写时长、`@if` 没闭合、`@titlefoo`。它们要么能正常解析，要么在运行阶段才暴露。

## 4. 加载阶段会报的错

`ScriptEngine.load()` 遍历所有指令，检查 `type` 是否在命令注册表里，或者是否属于流程指令白名单：

```text
label / jump / call / return / if / elseif / else / endif / end
```

不认识的指令会报错，例如：

```text
Unknown command "@swtich" in script "demo" at line 12.
```

所以拼错指令名会在加载阶段立刻暴露，而不是运行到那一行才出问题。目前加载阶段**不检查参数**，多余参数、未知参数、`@if` 结构问题都不在这里报错。

## 5. 执行阶段

`Interpreter` 维护：

- 程序计数器 `pc`，指向下一条要执行的指令；
- 调用栈，记录 `@call` 的返回位置和调用点的条件栈深度；
- 条件分支栈，记录 `@if` 的匹配状态；
- 当前等待的事件，例如点击、选项选中、等待计时结束。

执行一条指令前，先发 `script:command`。流程指令（标签、跳转、条件）由解释器直接处理；其余指令交给 `CommandRegistry` 里注册的处理器。

条件分支在运行时按指令位置扫描：`@if` 执行时先向后找配对的 `@endif`，找不到就抛 `Unclosed @if block`；`@elseif` / `@else` 在没有活动 `@if` 时抛错。`@else` 出现在 `@elseif` 之前不会被结构检查拦下，运行时按「第一个成立的分支先执行」处理。

`@jump` 跳出当前 `@if` 块时会退出这个块，但不会低于最内层 `@call` 的边界；`@return` 会把条件分支栈截断回调用发生时的深度。这样后续孤立的 `@endif` 不会被误报为错误。

请求等待时，`pc` 停在阻塞指令上，`getPc()` 也返回这条指令，便于存档后重新执行；处理器抛出的异常不会逃到帧循环里，解释器会发 `script:error`，然后结束当前脚本，`script:end` 照常收尾。

### 表达式求值

`ExpressionEvaluator` 用普通递归求值：

- 变量节点返回 `store.get(name)`，没定义时是 `undefined`；
- 旗标节点返回 `store.hasFlag(name)`；
- 二元节点**先求左右两边，再合并**，没有短路；
- `and` / `or` 直接使用 JavaScript 的 `&&` / `||`，返回操作数本身而不是布尔值；
- `==` / `!=` 使用严格相等；大小比较和算术沿用 JavaScript 的隐式转换；
- 条件判断用 `isTruthy`：`false`、`0`、`NaN`、空字符串、`null`、`undefined` 为假，其余为真。

命令处理器读取参数时使用 `commands/utils.ts` 里的辅助函数：`toMs` 把裸数字当作毫秒、把 `{ value, unit }` 换算成毫秒；`toNumber` 接受数字或能转成数字的字符串，否则抛 `TypeError`。

## 6. 错误形式

解析、加载、运行时三处的错误使用同一组核心字段：

| 字段      | 含义                   |
| --------- | ---------------------- |
| `message` | 给人看的错误说明       |
| `script`  | 脚本 id，能确定时填    |
| `line`    | 源码行号，能确定时填   |
| `command` | 出错指令名，能确定时填 |

解析和加载阶段的错误直接抛出；运行阶段的错误变成 `script:error` 事件，并结束当前脚本。这样监听方只需要处理一种错误形状。

## 7. 自定义指令

用 `CommandRegistry.register()` 注册。键名是 `handler.type`，**不带 `@`**，必须和脚本里写的指令名一致：

```ts
engine.script.commandRegistry.register({
  type: 'shaketext',
  execute(ctx, args) {
    const raw = args.duration as { value: number; unit: string } | undefined;
    const duration = raw
      ? raw.unit === 's'
        ? raw.value * 1000
        : raw.value
      : 500;
    ctx.engine.eventBus.emit('effect:play', { type: 'shake', duration });
  },
});
```

脚本里写 `@shaketext ...`，注册的就是 `type: "shaketext"`。

`execute(ctx, args)` 的两个参数：

- `args` 是解析器产出的原始参数，形状与第 2 节一致；
- `ctx.engine` 是引擎门面，可以访问 `resource`、`audio`、`renderer`、`ui` 等子系统；
- `ctx.store` 是变量与旗标存储；
- `ctx.interpreter` 提供 `wait()`、`jump()` 等执行控制接口。

命令层**不会**替自定义指令校验参数：未知参数、多余参数都会原样传进来，需要自己检查。内置指令也只是按需读取自己认识的参数，未知键大多忽略，但多余的位置参数可能被当成转场或缓动。

解析前没有预处理钩子。要支持新的写法，只能修改 `grammar.pegjs` 并重新生成解析器。

## 8. 事件一览

脚本子系统相关的全局事件：

| 事件                     | 何时发出                     | 字段                                       |
| ------------------------ | ---------------------------- | ------------------------------------------ |
| `script:command`         | 每条指令执行前，包括流程指令 | `{ cmd, args }`                            |
| `script:say`             | 显示一句对话                 | `{ speaker, text, voice?, speed?, mode? }` |
| `script:clear`           | 执行 `@clear`                | 无                                         |
| `script:choice`          | 显示选项                     | `{ choices, mode }`                        |
| `script:choice:selected` | 玩家选中某个选项             | `{ label }`                                |
| `script:wait:done`       | `@wait` 计时结束             | 无                                         |
| `script:end`             | `@end` 或脚本自然结束        | 无                                         |
| `script:error`           | 运行时出错                   | `{ message, script, line?, command? }`     |

各指令产生的子系统事件：

| 指令                                                   | 事件                                             | 字段                                                |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| `@bg`                                                  | `bg:change`                                      | `{ id, transition?, duration? }`                    |
| `@show`                                                | `character:show`                                 | `{ id, position, sprite?, transition?, duration? }` |
| `@hide`                                                | `character:hide`                                 | `{ id, transition?, duration? }`                    |
| `@move`                                                | `character:move`                                 | `{ id, position, duration?, easing? }`              |
| `@sprite`                                              | `character:sprite`                               | `{ id, sprite, transition?, duration? }`            |
| `@playBgm` / `@playSe` / `@playVoice` / `@playAmbient` | `audio:play`                                     | `{ id, type, loop?, loopCount?, fadeIn?, volume? }` |
| `@stopBgm` / `@stopAmbient`                            | `audio:stop`                                     | `{ type, fadeOut? }`                                |
| `@shake` / `@flash` / `@snow` / `@rain`                | `effect:play`                                    | `{ type, duration?, intensity?, color?, density? }` |
| `@stopEffect`                                          | `effect:stop`                                    | 无                                                  |
| `@choice`                                              | `script:choice`，选中后 `script:choice:selected` | 见上表                                              |

`@pause` / `@click` 不直接发事件，而是等待 `input:click`。`@wait` 自身也不发对外事件，只在计时结束时发内部的 `script:wait:done`。

## 9. 文档与测试

`doc/dsl` 下的 `vns` 代码块会被 `src/script/__test__/docs.spec.ts` 逐个解析；`text` 代码块是伪代码或反例，不参与解析。同一个测试还会检查命令注册表里的每条指令在 [reference.md](reference.md) 中都有对应说明。

## 10. 文件与构建

| 项目       | 说明                       |
| ---------- | -------------------------- |
| 源文件     | `.vns`                     |
| 语法定义   | `src/script/grammar.pegjs` |
| 生成解析器 | `npm run build:parser`     |
| 解析器产物 | `src/script/parser.js`     |
