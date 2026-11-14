# 指令参考

每条指令按「写法、参数、示例、默认值」列出。所有指令共用的注释、字面量、表达式和参数规则见 [language.md](language.md)；容易踩坑的现状见 [limitations.md](limitations.md)。

## 通用约定

- **位置参数**按出现顺序编号，但每个位置的含义由指令自己决定，没有统一规则。具体读法见各指令的说明。
- **键值参数**写成 `名字=值`，例如 `sprite=smile`、`volume=0.5`。
- 指令**不会自动校验参数**：未知的键值参数多半被忽略，但多余的位置参数可能覆盖转场或缓动；`@say` 拼错键名会退回通用解析并在运行时出错，`@choice` 拼错 `mode=` 会让选项块失去归属、通常在解析阶段报错。数字型键值要写不带引号的数字，写成 `volume="0.5"` 通常相当于没写。
- 裸数字在需要时长的地方按**毫秒**处理：`500` 就是 `500ms`。推荐统一写单位。
- 以 `#` 开头的值必须加引号，例如 `color="#ffffff"`。
- 位置参数和键值参数同时给出时，多数指令让位置参数优先，不会报冲突。

各指令触发的事件以及事件字段，统一列在 [internals.md](internals.md) 的「事件一览」。

## 元数据

```vns
@title 第一章 — 转校生
@author Alice
@version 1.0
```

| 键         | 值           |
| ---------- | ------------ |
| `@title`   | 标题，显示用 |
| `@author`  | 作者         |
| `@version` | 版本号       |

三个键都必须排在所有指令和标签之前，每个只能出现一次，重复或顺序不对会在解析阶段报错。

值可以整段加双引号，也可以写裸文本。只有「整段就是一个引号字符串」时才会去掉引号；混写时引号会保留：`@title "A" 外传` 的值是 `"A" 外传`。键名目前不是完整匹配，`@titlefoo` 会被当成 `@title`。

## 对话

### 内联对话

```vns
Hero "早上好。"
@say Hero "早上好。"
```

内联式的写法是 `角色名 "文本"`。它的说话者只能是不带引号的 ASCII 名字；`@say` 则支持带引号、中文和空说话者。

| 参数     | 必填 | 说明                                                       |
| -------- | ---- | ---------------------------------------------------------- |
| 角色名   | 是   | 内联式只能写不带引号的 ASCII 名字                          |
| 文本     | 是   | 双引号字符串；富文本样式目前尚未接通，见 limitations.md    |
| `voice=` | 否   | 语音资源 ID；只记录，不播放（[暂未生效](limitations.md)）  |
| `speed=` | 否   | 打字速度，单位是字/秒                                      |
| `adv`    | 否   | 对话模式；不写时事件里的 `mode` 是 `undefined`             |
| `nvl`    | 否   | 对话模式；只记录，不影响画面（[暂未生效](limitations.md)） |

### `@say`

```vns
@say Hero "早上好，各位同学！"
@say "???" "......"
@say Narrator "那天下午，一切都变了。" nvl
```

参数与内联对话相同，但说话者可以写带引号的字符串、中文或空字符串。

`adv` / `nvl` 与 `voice=` 的当前状态见 [limitations.md](limitations.md) 的「对话与语音」。要播放语音请用 `@playVoice`。

## 背景、角色与立绘

### `@bg`

```vns
@bg classroom
@bg corridor fade 1.5s
@bg rooftop slideL
@bg hallway 1.5s
```

| 参数   | 必填 | 说明                                                               |
| ------ | ---- | ------------------------------------------------------------------ |
| 资源id | 是   | 背景资源 ID，第一个位置参数                                        |
| 转场名 | 否   | 位置参数；可写 `fade`、`slide`、`slideL`、`slideR`、`zoom`、`none` |
| 时长   | 否   | 位置参数；转场持续时间                                             |

默认转场是 `fade`，默认时长 300ms。所以 `@bg classroom` 是一次 300ms 的淡入，不是瞬间切换；`@bg hallway 1.5s` 是 1.5 秒淡入。未知的转场名按直切处理，不会报错。

`@bg` 只读位置参数，写 `transition=` / `duration=` 不会生效。

### `@show`

```vns
@show ch_hero center
@show ch_hero left sprite=smile
@show ch_heroine right sprite=embarrassed transition=fade duration=500ms
@show ch_hero center fade 500ms
```

| 参数      | 必填 | 说明                                                |
| --------- | ---- | --------------------------------------------------- |
| 角色id    | 是   | 角色资源 ID，第一个位置参数                         |
| 位置      | 否   | 第二个位置参数**固定按位置解析**；省略时为 `center` |
| 转场名    | 否   | 第三段位置参数，或用 `transition=`                  |
| 时长      | 否   | 跟在转场名后面的位置参数，或用 `duration=`          |
| `sprite=` | 否   | 立绘或表情 ID                                       |

位置可写 `farLeft`、`left`、`center`、`right`、`farRight`、`offLeft`、`offRight`。默认位置 `center`，默认转场 `fade`，默认时长 300ms。

第二个位置参数永远被当作位置。如果省掉位置直接写转场名，例如 `@show ch_hero slideL 500ms`，`slideL` 会被当成位置识别失败、回退 `center`，转场丢失。直接写时长也一样会被吞掉：`@show ch_hero 500ms` 的 500ms 不会生效。要省略位置，请把转场和时长写成键值：`@show ch_hero transition=slideL duration=500ms`。

位置参数和键值参数同时给出时，位置参数优先，不会报冲突。

### `@hide`

```vns
@hide ch_hero fade
@hide all fade duration=1s
@hide
```

| 参数          | 必填 | 说明                                             |
| ------------- | ---- | ------------------------------------------------ |
| 角色id        | 否   | 第一个位置参数；省略时默认为 `all`，隐藏所有角色 |
| 转场名 / 时长 | 否   | 跟在角色 id 后面的位置参数                       |
| `transition=` | 否   | 转场的键值写法                                   |
| `duration=`   | 否   | 时长的键值写法                                   |

第一个位置参数永远被当作角色 id，所以 `@hide fade` 会尝试隐藏 id 为 `fade` 的角色，而不是「带淡出隐藏全部」。想隐藏全部并带转场，写 `@hide all fade`。默认转场 `fade`，默认时长 300ms。

### `@move`

```vns
@move ch_hero center 1s easeOut
@move ch_heroine right 500ms linear
@move ch_hero duration=500ms easing=easeOut
@move ch_hero 500ms easeOut
```

| 参数   | 必填 | 说明                                                                          |
| ------ | ---- | ----------------------------------------------------------------------------- |
| 角色id | 是   | 角色资源 ID，第一个位置参数                                                   |
| 位置   | 否   | 第二个位置参数；只有写成合法位置名时才按位置解析，默认 `center`               |
| 时长   | 否   | 位置参数或 `duration=`                                                        |
| 缓动名 | 否   | 位置参数或 `easing=`；可写 `linear`、`ease`、`easeIn`、`easeOut`、`easeInOut` |

默认位置 `center`，默认时长 300ms，默认缓动 `easeOut`。省略位置时可以直接写时长和缓动，例如 `@move ch_hero 500ms easeOut`。时长和缓动的先后顺序不限。未知缓动名不会报错，会回退 `linear`。

### `@sprite`

```vns
@sprite ch_hero smile
@sprite ch_hero angry fade 300ms
```

| 参数   | 必填 | 说明                          |
| ------ | ---- | ----------------------------- |
| 角色id | 是   | 角色资源 ID，第一个位置参数   |
| 立绘id | 是   | 立绘或表情 ID，第二个位置参数 |
| 转场名 | 否   | 第三段位置参数                |
| 时长   | 否   | 跟在转场名后面的位置参数      |

默认转场 `fade`，默认时长 300ms。`@sprite` 只读位置参数，写 `transition=` / `duration=` 不会生效。

## 音频

### `@playBgm`

```vns
@playBgm school_theme loop fadein=2s
@playBgm tense_bgm once volume=0.5
@playBgm theme volume=0.5 loop
@playBgm theme loop=3
```

| 参数      | 必填 | 说明                                         |
| --------- | ---- | -------------------------------------------- |
| 资源id    | 是   | 音乐资源 ID，第一个位置参数                  |
| `loop`    | 否   | 无限循环；必须是资源 id 后的第一个位置参数   |
| `once`    | 否   | 只播放一次；必须是资源 id 后的第一个位置参数 |
| `loop=N`  | 否   | 总共播放 N 次，播放完自动停止                |
| `fadein=` | 否   | 淡入时长                                     |
| `volume=` | 否   | 音量，通常写 0 到 1；超出范围不报错          |

`loop` / `once` 只认资源 id 后的第一个位置参数（键值参数不占位置），写成 `@playBgm loop theme` 会把 `loop` 当资源 id。`loop`、`once`、`loop=N` 建议只写一种。淡入键名是 `fadein=`，不是 `fade=`；`fade=` 是停止指令用的。

### `@stopBgm`

```vns
@stopBgm
@stopBgm fade=2s
```

| 参数    | 必填 | 说明     |
| ------- | ---- | -------- |
| `fade=` | 否   | 淡出时长 |

### `@playSe`

```vns
@playSe door_open
@playSe explosion volume=0.8
```

| 参数      | 必填 | 说明                                |
| --------- | ---- | ----------------------------------- |
| 资源id    | 是   | 音效资源 ID                         |
| `volume=` | 否   | 音量，通常写 0 到 1；超出范围不报错 |

### `@playVoice`

```vns
@playVoice hero_001
```

只接受一个资源 ID，多写的参数会被忽略。

### `@playAmbient`

```vns
@playAmbient rain_city loop volume=0.4
@playAmbient birds loop fadein=1s
```

| 参数      | 必填 | 说明                                         |
| --------- | ---- | -------------------------------------------- |
| 资源id    | 是   | 环境音资源 ID，第一个位置参数                |
| `loop`    | 否   | 无限循环；必须是资源 id 后的第一个位置参数   |
| `once`    | 否   | 只播放一次；必须是资源 id 后的第一个位置参数 |
| `fadein=` | 否   | 淡入时长                                     |
| `volume=` | 否   | 音量，通常写 0 到 1；超出范围不报错          |

`@playAmbient loop=N` 目前会被忽略，只支持 `loop` / `once`。

### `@stopAmbient`

```vns
@stopAmbient
@stopAmbient fade=1s
```

| 参数    | 必填 | 说明     |
| ------- | ---- | -------- |
| `fade=` | 否   | 淡出时长 |

## 流程

### `@label`

```vns
@label start
```

声明一个跳转目标。标签名不能重复，重复会在解析阶段报错。

### `@jump`

```vns
@jump chapter2_start
```

无条件跳到标签处，不记录返回位置。标签不存在或没写标签名会在**运行时**报错。在 `@if` 块里跳到块外是允许的。

### `@call`

```vns
@call explore_scene
```

调用一段子流程，并记下返回位置，需要配合 `@return` 使用。可以嵌套调用。标签不存在或没写标签名会在运行时报告。

### `@return`

```vns
@return
```

回到最近一次 `@call` 的下一条指令，不接受参数。调用栈为空时（没有对应的 `@call`）会在运行时报告 `Call stack is empty.`。

### `@if` / `@elseif` / `@else` / `@endif`

```vns
@if $affection >= 80
  Heroine "我...喜欢你。"
@elseif $affection >= 50
  Heroine "你是个好人。"
@else
  Heroine "再见。"
@endif
```

| 指令      | 参数               |
| --------- | ------------------ |
| `@if`     | 条件表达式         |
| `@elseif` | 条件表达式，可多个 |
| `@else`   | 无                 |
| `@endif`  | 无                 |

`@if` 可以嵌套。结构错误在运行时才检查：`@if` 没有配对的 `@endif` 会在执行到 `@if` 时报错；多余的 `@endif`、`@elseif`、`@else` 会在执行到该行时报错。`@else` 写在 `@elseif` 之前不会报错，第一个成立的分支先执行。

### `@end`

```vns
@end
```

结束当前剧本，不接受参数。脚本自然走完也会结束。

## 选项

### `@choice`

```vns
@choice
  -> "回应他": respond
  -> "无视他": ignore if $courage >= 30
  -> "逃走": run if ?unlocked_run
@endchoice
```

```vns
@choice mode=nvl
  -> "继续": continue_story
@endchoice
```

选项行写法是 `-> "文本": 标签 [if 条件]`。

| 参数      | 必填     | 说明                                                             |
| --------- | -------- | ---------------------------------------------------------------- |
| `mode=`   | 否       | `adv` 或 `nvl`，默认 `adv`；只记录（[暂未生效](limitations.md)） |
| 选项 `->` | 至少一个 | `->` 后至少一个空格，然后是文本、冒号、跳转标签                  |
| `if` 条件 | 否       | 条件为假时选项仍显示，但变灰、不可点击                           |

选项行可以写行尾注释。选项块内部**不能**写空行或整行注释，否则解析失败。一个选项都没有的选项块能通过解析，但执行到它时会报错。所有选项的条件都为假时，玩家会卡在选择界面。

## 变量与旗标

### `@set`

```vns
@set $score 0
@set $total $base + $bonus
```

| 参数   | 必填 | 说明             |
| ------ | ---- | ---------------- |
| 变量   | 是   | 写成 `$名字`     |
| 表达式 | 是   | 可以是完整表达式 |

没写表达式时会在运行时报错。表达式求值结果是未定义变量时，变量会被设为未定义值。

### `@add` / `@sub` / `@mul` / `@div` / `@mod`

```vns
@add $affection 10
@sub $hp 5
@mul $damage 2
@div $ratio 2
@mod $remainder 3
```

| 参数   | 必填 | 说明                                   |
| ------ | ---- | -------------------------------------- |
| 变量   | 是   | 写成 `$名字`                           |
| 表达式 | 是   | 求值后必须是数字，或能转成数字的字符串 |

变量之前没有值或值为 `null` 时按 0 处理。操作数不是数字（例如 `"abc"`）会在运行时报「不是数字」。除以 0 不报错，得到 `Infinity`、`-Infinity` 或 `NaN`；这些值存档后会变成 `null`。

### `@random`

```vns
@random $dice 1 6
```

| 参数 | 必填 | 说明                 |
| ---- | ---- | -------------------- |
| 变量 | 是   | 写成 `$名字`         |
| 下界 | 是   | 整数                 |
| 上界 | 是   | 整数，必须不小于下界 |

结果包含上下界。边界不是整数或上界小于下界会在运行时报错。

### 旗标指令

```vns
@flag met_hero
@unflag secret_revealed
@toggle auto_mode
@clearFlags
```

| 指令          | 参数   | 说明         |
| ------------- | ------ | ------------ |
| `@flag`       | 旗标名 | 设置旗标     |
| `@unflag`     | 旗标名 | 清除旗标     |
| `@toggle`     | 旗标名 | 切换旗标状态 |
| `@clearFlags` | 无     | 清除所有旗标 |

## 特效与系统

### `@shake`

```vns
@shake
@shake 1s intensity=0.8
```

| 参数         | 必填 | 说明                                   |
| ------------ | ---- | -------------------------------------- |
| 时长         | 否   | 默认 500ms；裸数字按毫秒处理           |
| `intensity=` | 否   | 强度倍数，默认 1；1 对应约 20 像素振幅 |

强度不做范围校验。

### `@flash`

```vns
@flash
@flash 200ms color="#ffffff"
@flash color="#ffcc00" duration=300ms
```

| 参数        | 必填 | 说明                                               |
| ----------- | ---- | -------------------------------------------------- |
| 时长        | 否   | 默认 300ms；裸数字按毫秒处理                       |
| `color=`    | 否   | 渲染层认识的颜色写法，默认白色；认不出来也回退白色 |
| `duration=` | 否   | 时长的键值写法                                     |

位置时长和 `duration=` 同时出现时，位置时长优先，不会报错，只写一处更清楚。

### `@snow` / `@rain`

```vns
@snow density=0.6
@rain 5s density=1.5
```

| 参数       | 必填 | 说明                                                |
| ---------- | ---- | --------------------------------------------------- |
| 时长       | 否   | 省略或小于等于 0 时一直持续到 `@stopEffect`         |
| `density=` | 否   | 密度，默认 1；粒子数约为 `100 × density`，最少 1 个 |

### `@stopEffect`

```vns
@stopEffect
```

停止所有画面特效，不接受参数。

### `@wait`

```vns
@wait 1.5s
@wait 500ms
```

| 参数 | 必填 | 说明                                |
| ---- | ---- | ----------------------------------- |
| 时长 | 否   | 裸数字按毫秒处理；省略时等待 0 毫秒 |

### `@pause` / `@click`

```vns
@pause
@click
```

等待玩家点一下，不接受参数。两者行为完全相同。要定时等待请用 `@wait`。

### `@clear`

```vns
@clear
```

清除当前显示的对话文字，不接受参数。
