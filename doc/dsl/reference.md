# 指令参考

每条指令按「写法、参数、示例、事件」列出。所有指令共用的注释、字面量、表达式和参数规则见 [language.md](language.md)。

## 通用约定

- **位置参数**按顺序读取，写法是空格分隔的普通值。
- **键值参数**写成 `名字=值`，例如 `sprite=smile`、`volume=0.5`。
- **时长必须带单位**：`500ms`、`1s`、`1.5s`。
- 指令只接受下面列出的参数。参数数量不对、名字不认识、类型不对、同一个参数写两次或两种写法冲突，都会报错。
- 数字型键值要写不带引号的数字：`volume=0.5`，不是 `volume="0.5"`。

所有指令执行前都会发 `script:command`；`@end` 和脚本自然走完都会发 `script:end`；运行时出错会发 `script:error` 并结束当前脚本。这些全局事件在 [internals.md](internals.md) 里有统一说明。

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

值可以直接写，也可以加双引号，两种写法等价。三个键都必须排在所有指令和标签之前，每个只能出现一次。

**事件**：无。

## 对话

### 内联对话

```vns
Hero "早上好。"
@say Hero "早上好。"
```

内联式的写法是 `角色名 "文本"`，等价于 `@say 角色名 "文本"`。

| 参数     | 必填 | 说明                                      |
| -------- | ---- | ----------------------------------------- |
| 角色名   | 是   | 普通名字，或带引号的字符串；空名字写 `""` |
| 文本     | 是   | 双引号字符串，可使用富文本标签            |
| `voice=` | 否   | 语音资源 ID，目前只记录、不播放           |
| `speed=` | 否   | 打字速度，单位是字/秒                     |
| `adv`    | 否   | 对话模式，默认值                          |
| `nvl`    | 否   | 对话模式，目前不影响画面                  |

**事件**：`script:say`，字段为 `{ speaker, text, voice?, speed?, mode? }`。不写模式时 `mode` 为 `adv`。

### `@say`

```vns
@say Hero "早上好，各位同学！"
@say "???" "......"
@say Narrator "那天下午，一切都变了。" nvl
```

参数与内联对话相同。说话者可以写带引号的字符串，空说话者写 `""`。

**事件**：`script:say`。

> `adv` / `nvl` 目前只写进事件，不会改变画面；`voice=` 也不会播放语音。见 [language.md](language.md) 第 12 节。

## 背景、角色与立绘

### `@bg`

```vns
@bg classroom
@bg corridor fade 1.5s
@bg rooftop slideL
```

| 参数   | 必填 | 说明                                  |
| ------ | ---- | ------------------------------------- |
| 资源id | 是   | 背景资源 ID                           |
| 转场名 | 否   | 例如 `fade`、`slideL`；省略时直接切换 |
| 时长   | 否   | 转场持续时间                          |

**事件**：`bg:change`，字段为 `{ id, transition?, duration? }`。

### `@show`

```vns
@show ch_hero center
@show ch_hero left sprite=smile
@show ch_heroine right sprite=embarrassed transition=fade duration=500ms
@show ch_hero center fade 500ms
```

| 参数          | 必填 | 说明                                                                                   |
| ------------- | ---- | -------------------------------------------------------------------------------------- |
| 角色id        | 是   | 角色资源 ID                                                                            |
| 位置          | 否   | `farLeft`、`left`、`center`、`right`、`farRight`、`offLeft`、`offRight`，默认 `center` |
| 转场名        | 否   | 位置写法，例如 `fade`                                                                  |
| 时长          | 否   | 位置写法，紧跟在转场名后面                                                             |
| `sprite=`     | 否   | 立绘或表情 ID                                                                          |
| `transition=` | 否   | 转场的键值写法                                                                         |
| `duration=`   | 否   | 时长的键值写法                                                                         |

转场和时长可以写位置参数，也可以写键值参数，两种等价，选一种即可。即使省略位置，`@show ch_hero fade 500ms` 也能正确识别出转场 `fade`。

**事件**：`character:show`，字段为 `{ id, position, sprite?, transition?, duration? }`。

### `@hide`

```vns
@hide ch_hero fade
@hide all fade duration=1s
@hide
```

| 参数          | 必填 | 说明                             |
| ------------- | ---- | -------------------------------- |
| 角色id        | 否   | 省略时默认为 `all`，隐藏所有角色 |
| 转场名 / 时长 | 否   | 位置写法                         |
| `transition=` | 否   | 转场的键值写法                   |
| `duration=`   | 否   | 时长的键值写法                   |

注意 `@hide fade` 会把 `fade` 当成角色 id。想隐藏全部并带转场，写 `@hide all fade`。

**事件**：`character:hide`，字段为 `{ id, transition?, duration? }`。

### `@move`

```vns
@move ch_hero center 1s easeOut
@move ch_heroine right 500ms linear
@move ch_hero duration=500ms easing=easeOut
```

| 参数        | 必填 | 说明                                                    |
| ----------- | ---- | ------------------------------------------------------- |
| 角色id      | 是   | 角色资源 ID                                             |
| 位置        | 否   | 与 `@show` 相同，默认 `center`                          |
| 时长        | 否   | 移动所需时间                                            |
| 缓动名      | 否   | 例如 `linear`、`ease`、`easeIn`、`easeOut`、`easeInOut` |
| `duration=` | 否   | 时长的键值写法                                          |
| `easing=`   | 否   | 缓动名的键值写法                                        |

位置与缓动分开识别。写错位置名会报错，不会把同一个词再当成缓动名。

**事件**：`character:move`，字段为 `{ id, position, duration?, easing? }`。

### `@sprite`

```vns
@sprite ch_hero smile
@sprite ch_hero angry fade 300ms
```

| 参数   | 必填 | 说明                     |
| ------ | ---- | ------------------------ |
| 角色id | 是   | 角色资源 ID              |
| 立绘id | 是   | 立绘或表情 ID            |
| 转场名 | 否   | 位置写法                 |
| 时长   | 否   | 位置写法，跟在转场名后面 |

**事件**：`character:sprite`，字段为 `{ id, sprite, transition?, duration? }`。

## 音频

### `@playBgm`

```vns
@playBgm school_theme loop fadein=2s
@playBgm tense_bgm once volume=0.5
@playBgm theme volume=0.5 loop
@playBgm theme loop=3
```

| 参数      | 必填 | 说明                          |
| --------- | ---- | ----------------------------- |
| 资源id    | 是   | 音乐资源 ID                   |
| `loop`    | 否   | 无限循环，位置不限            |
| `once`    | 否   | 只播放一次，位置不限          |
| `loop=N`  | 否   | 总共播放 N 次，播放完自动停止 |
| `fadein=` | 否   | 淡入时长                      |
| `volume=` | 否   | 音量，0 到 1 的数字           |

`loop`、`once`、`loop=N` 三选一。

**事件**：`audio:play`，`type` 为 `bgm`，其余字段为 `{ id, loop?, loopCount?, fadeIn?, volume? }`。

### `@stopBgm`

```vns
@stopBgm
@stopBgm fade=2s
```

| 参数    | 必填 | 说明     |
| ------- | ---- | -------- |
| `fade=` | 否   | 淡出时长 |

**事件**：`audio:stop`，`type` 为 `bgm`，字段为 `{ fadeOut? }`。

### `@playSe`

```vns
@playSe door_open
@playSe explosion volume=0.8
```

| 参数      | 必填 | 说明                |
| --------- | ---- | ------------------- |
| 资源id    | 是   | 音效资源 ID         |
| `volume=` | 否   | 音量，0 到 1 的数字 |

**事件**：`audio:play`，`type` 为 `se`。

### `@playVoice`

```vns
@playVoice hero_001
```

只接受一个资源 ID。

**事件**：`audio:play`，`type` 为 `voice`。

### `@playAmbient`

```vns
@playAmbient rain_city loop volume=0.4
@playAmbient birds loop=2 fadein=1s
```

| 参数      | 必填 | 说明                 |
| --------- | ---- | -------------------- |
| 资源id    | 是   | 环境音资源 ID        |
| `loop`    | 否   | 无限循环，位置不限   |
| `once`    | 否   | 只播放一次，位置不限 |
| `loop=N`  | 否   | 总共播放 N 次        |
| `fadein=` | 否   | 淡入时长             |
| `volume=` | 否   | 音量，0 到 1 的数字  |

**事件**：`audio:play`，`type` 为 `ambient`。

### `@stopAmbient`

```vns
@stopAmbient
@stopAmbient fade=1s
```

| 参数    | 必填 | 说明     |
| ------- | ---- | -------- |
| `fade=` | 否   | 淡出时长 |

**事件**：`audio:stop`，`type` 为 `ambient`。

## 流程

### `@label`

```vns
@label start
```

声明一个跳转目标。标签名不能重复，重复会在解析阶段报错。

**事件**：无专属事件。

### `@jump`

```vns
@jump chapter2_start
```

无条件跳到标签处，不记录返回位置。标签不存在或没写标签名会在运行时报错。

**事件**：无专属事件。

### `@call`

```vns
@call explore_scene
```

调用一段子流程，并记下返回位置。需要配合 `@return` 使用。

**事件**：无专属事件。

### `@return`

```vns
@return
```

回到最近一次 `@call` 的下一条指令。不接受参数。

**事件**：无专属事件。

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

**事件**：无专属事件。

### `@end`

```vns
@end
```

结束当前剧本，不接受参数。

**事件**：`script:end`。

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

| 参数      | 必填     | 说明                                               |
| --------- | -------- | -------------------------------------------------- |
| `mode=`   | 否       | `adv` 或 `nvl`，默认 `adv`；目前只记录，不影响画面 |
| 选项 `->` | 至少一个 | `->` 后至少一个空格，然后是文本、冒号、跳转标签    |
| `if` 条件 | 否       | 条件为假时选项仍显示，但变灰、不可点击             |

选项块内可以有空行和整行注释；缩进可有可无。一个选项都没有的选项块会在解析阶段报错。

**事件**：显示时发 `script:choice`，字段为 `{ choices, mode }`；选中后发 `script:choice:selected`，字段为 `{ label }`，然后跳到对应标签。

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

**事件**：无。

### `@add` / `@sub` / `@mul` / `@div` / `@mod`

```vns
@add $affection 10
@sub $hp 5
@mul $damage 2
@div $ratio 2
@mod $remainder 3
```

| 参数   | 必填 | 说明             |
| ------ | ---- | ---------------- |
| 变量   | 是   | 写成 `$名字`     |
| 表达式 | 是   | 求值后必须是数字 |

变量之前没有值或值为空时按 0 处理。

**事件**：无。

### `@random`

```vns
@random $dice 1 6
```

| 参数 | 必填 | 说明                 |
| ---- | ---- | -------------------- |
| 变量 | 是   | 写成 `$名字`         |
| 下界 | 是   | 整数                 |
| 上界 | 是   | 整数，必须不小于下界 |

结果包含上下界。边界不是整数或上界小于下界会报错。

**事件**：无。

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

**事件**：无。

## 特效与系统

### `@shake`

```vns
@shake
@shake 1s intensity=0.8
```

| 参数         | 必填 | 说明       |
| ------------ | ---- | ---------- |
| 时长         | 否   | 默认 500ms |
| `intensity=` | 否   | 强度       |

**事件**：`effect:play`，`type` 为 `shake`。

### `@flash`

```vns
@flash
@flash 200ms color="#ffffff"
@flash color="#ffcc00" duration=300ms
```

| 参数        | 必填 | 说明                              |
| ----------- | ---- | --------------------------------- |
| 时长        | 否   | 默认 300ms                        |
| `color=`    | 否   | 形状为 `#rrggbb` 的颜色，默认白色 |
| `duration=` | 否   | 时长的键值写法                    |

位置时长和 `duration=` 同时出现会报错，只写一处。

**事件**：`effect:play`，`type` 为 `flash`。

### `@snow` / `@rain`

```vns
@snow density=0.6
@rain 5s density=1.5
```

| 参数       | 必填 | 说明                           |
| ---------- | ---- | ------------------------------ |
| 时长       | 否   | 省略时一直持续到 `@stopEffect` |
| `density=` | 否   | 密度，默认 1                   |

**事件**：`effect:play`，`type` 为 `snow` 或 `rain`。

### `@stopEffect`

```vns
@stopEffect
```

停止所有画面特效，不接受参数。

**事件**：`effect:stop`。

### `@wait`

```vns
@wait 1.5s
@wait 500ms
```

| 参数 | 必填 | 说明       |
| ---- | ---- | ---------- |
| 时长 | 是   | 必须带单位 |

**事件**：内部等待结束后发 `script:wait:done`。

### `@pause` / `@click`

```vns
@pause
@click
```

等待玩家点一下，不接受参数。两者行为相同，都不是「等 0 毫秒」；要定时等待请用 `@wait`。

**事件**：等待 `input:click`。

### `@clear`

```vns
@clear
```

清除当前显示的对话文字，不接受参数。

**事件**：`script:clear`。
