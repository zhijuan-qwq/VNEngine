# 十分钟写出第一个剧本

一份 VNScript 剧本就是按顺序执行的一串指令。大多数时候一行写一条指令：以 `@` 开头的是指令，不带 `@`、写成 `角色名 "台词"` 的是内联对话。

这份文档只讲语言本身。读完能写出一个能跑通的剧本；每条指令的完整参数见 [reference.md](reference.md)，通用规则见 [language.md](language.md)，实现上的坑见 [limitations.md](limitations.md)。

## 1. 给剧本起个名字

把下面三行放在文件最前面：

```vns
@title 第一章 — 转校生
@author Alice
@version 1.0
```

- `@title` 是标题，`@author` 是作者，`@version` 是版本号。
- 值可以直接写，也可以整段加双引号：`@title "第一章"` 和 `@title 第一章` 等价。
- 每个只能出现一次，而且必须排在所有指令和标签之前。

如果引号和普通文字混写，引号会保留：`@title "第一章" 外传` 的值包含引号本身。要么整段加引号，要么完全不加。

## 2. 让人说话

最省事的是内联对话：角色名后面直接跟台词。

```vns
Hero "又是新的一天。"
Heroine "早上好..."
```

想显式写指令，可以用 `@say`：

```vns
@say Hero "又是新的一天。"
@say "???" "......"
```

内联式的说话者只能是不带引号的 ASCII 名字，所以 `"???"`、空名和中文名只能用 `@say`，而且必须加引号：`@say "旁白" "……"`。除此之外，两种写法效果一样。

台词里可以用 `{$变量名}` 插入变量值，也可以写 `[b]`、`[color=#ff6666]` 这类富文本标签。目前只有速度、停顿和变量插值真正生效，粗体、颜色等视觉样式尚未接通；完整规则见 [language.md](language.md) 的「内联富文本」。

## 3. 换背景、让角色出场

```vns
@bg classroom fade 1s
@show ch_hero center sprite=neutral fade 500ms
Hero "今天来得真早。"
```

- `@bg 资源id [转场] [时长]` 切换背景。省略转场时默认 `fade`，默认时长 300ms，不是瞬间切换。
- `@show 角色id [位置] [转场] [时长] [sprite=立绘]` 让角色出现在画面上。
- 位置可以写 `farLeft`、`left`、`center`、`right`、`farRight`、`offLeft`、`offRight`，省略时默认 `center`。`offLeft` / `offRight` 在屏幕外，适合让角色探身或移出画面。
- 换表情用 `@sprite 角色id 立绘id`；让角色离开用 `@hide 角色id`，不带角色 id 表示全部离开。
- 移动角色用 `@move 角色id 位置 时长 缓动`，例如 `@move ch_hero left 500ms easeOut`。

时长推荐带单位：`500ms`、`1s`、`1.5s`。裸数字也能用，会被当作毫秒，`500` 等于 `500ms`。

`@show` 的第二个位置参数固定按位置解析。想省略位置、直接写转场，请改用键值：

```vns
@show ch_hero transition=slideL duration=500ms
```

## 4. 让玩家做选择

选项要写成一对多行结构：

```vns
@choice
  -> "回应她": respond
  -> "无视她": ignore
  -> "恶作剧": prank if $confidence >= 50
@endchoice
```

- `->` 后面是选项文字，冒号后面是选中后要跳到的标签。
- `if` 后面是显示条件。条件不成立的选项仍然会显示，只是变灰、点不了。
- 缩进只是为了好看，不是必须的，但 `->` 后面至少要有一个空格。
- 选项块里可以写行尾注释，但**不能写空行或整行注释**，否则会解析失败。
- 一个选项都没有的 `@choice` 能通过解析，但执行到它时会报错。

## 5. 按条件走不同分支

```vns
@if $affection >= 5
  @sprite ch_heroine smile fade 300ms
  Heroine "今天天气真好呢。"
@elseif $affection >= 0
  Heroine "嗯……"
@else
  Heroine "......"
@endif
```

`@if` 需要一个条件，`@elseif` 可以有多个，`@else` 和 `@endif` 各写一个。条件为真时执行到下一个分支标记为止。漏写条件不会报错，只会被当成「假」，所以务必记得写。

## 6. 记住玩家的选择

变量用 `$` 开头，旗标用 `?` 开头。

```vns
@set $affection 10
@add $affection 5
@sub $affection 3

@flag met_hero
@unflag met_hero
@toggle auto_mode
```

`@set` 是赋值，`@add` / `@sub` / `@mul` / `@div` / `@mod` 是在原值上运算。变量可以直接参与条件和表达式：

```vns
@if $affection >= 20 and ?met_hero
  Hero "我们已经是朋友了吧。"
@endif
```

注意连字符是名字的一部分：`$affection-1` 会被当成名为 `affection-1` 的变量，减法要写 `$affection - 1`。

旗标只有「有」和「没有」两种状态，适合记录「见过某人」「解锁了某条路线」这类事。

## 7. 声音、等待与结束

```vns
@playBgm school_theme loop fadein=2s
@playSe door_open
@playVoice hero_001

@wait 500ms
@pause

@stopBgm fade=2s
@end
```

- `@playBgm` 播放背景音乐，`loop` 表示循环，`once` 表示只放一次；它们要写在资源 id 后的第一个位置参数。
- `@playSe` 播放一次性音效，`@playVoice` 播放语音。
- `@wait 500ms` 等一段时间后继续；`@pause` 或 `@click` 等玩家点一下。
- `@end` 结束剧本。脚本自然走完也会结束。

## 8. 完整剧本

把上面的内容串起来，就是一个小剧本：

```vns
@title 第一章 — 转校生
@author Alice
@version 1.0

@label start

@bg classroom fade 1s
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

## 下一步

- 想查某条指令能写哪些参数：[reference.md](reference.md)
- 想弄懂注释、表达式、参数校验这些通用规则：[language.md](language.md)
- 遇到实际行为与预期不符：[limitations.md](limitations.md)
- 想给引擎加自己的指令：[internals.md](internals.md)
