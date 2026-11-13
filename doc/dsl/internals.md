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
- 时长写成 `{ value, unit }`，例如 `500ms` 是 `{ value: 500, unit: "ms" }`；
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

- **语法错误**：不符合语法规则，例如选项块忘了 `@endchoice`、时长没写单位、二元运算符两边没空格。
- **元数据重复或位置不对**：三个元数据键各自只能出现一次，且必须排在所有指令和标签之前。
- **标签重复**：同一个标签名声明两次。
- **空选项块**：`@choice` 和 `@endchoice` 之间一个选项都没有。

这些错误会带着出错行号抛出，脚本不会进入加载阶段。

## 4. 加载阶段会报的错

`ScriptEngine.load()` 遍历所有指令，检查 `type` 是否在命令注册表里，或者是否属于流程指令白名单：

```text
label / jump / call / return / if / elseif / else / endif / end
```

不认识的指令会报错，例如：

```text
Unknown command "@swtich" in script "demo" at line 12.
```

所以拼错指令名会在加载阶段立刻暴露，而不是运行到那一行才出问题。

## 5. 执行阶段

`Interpreter` 维护：

- 程序计数器 `pc`，指向下一条要执行的指令；
- 调用栈，记录 `@call` 的返回位置；
- 条件分支栈，记录 `@if` 的匹配状态；
- 当前等待的事件，例如点击、选项选中、等待计时结束。

执行一条指令前，先发 `script:command`。流程指令（标签、跳转、条件）由解释器直接处理；其余指令交给 `CommandRegistry` 里注册的处理器。

`@jump` 跳出当前 `@if` 块时会退出这个块，但不会低于最内层 `@call` 的边界；`@return` 会把条件分支栈截断回调用发生时的深度。这样后续孤立的 `@endif` 不会被误报为错误。

处理器抛出的异常不会逃到帧循环里。解释器会发 `script:error`，然后结束当前脚本，`script:end` 照常收尾。

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

自定义指令也需要声明自己接受哪些参数。命令层会按声明校验，未知参数、多余参数或类型不对都会报错，不会悄悄忽略。

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

指令产生的子系统事件：

| 指令                                                   | 事件                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `@bg`                                                  | `bg:change`                                                                 |
| `@show` / `@hide` / `@move` / `@sprite`                | `character:show` / `character:hide` / `character:move` / `character:sprite` |
| `@playBgm` / `@playSe` / `@playVoice` / `@playAmbient` | `audio:play`                                                                |
| `@stopBgm` / `@stopAmbient`                            | `audio:stop`                                                                |
| `@shake` / `@flash` / `@snow` / `@rain`                | `effect:play`                                                               |
| `@stopEffect`                                          | `effect:stop`                                                               |

`@pause` / `@click` 不直接发事件，而是等待 `input:click`。`@wait` 自身也不发对外事件，只在计时结束时发内部的 `script:wait:done`。

## 9. 文件与构建

| 项目       | 说明                       |
| ---------- | -------------------------- |
| 源文件     | `.vns`                     |
| 语法定义   | `src/script/grammar.pegjs` |
| 生成解析器 | `npm run build:parser`     |
| 解析器产物 | `src/script/parser.js`     |
