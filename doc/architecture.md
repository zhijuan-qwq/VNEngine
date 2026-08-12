# VNEngine 视觉小说引擎架构设计

## 一、设计目标

- **高性能**：基于 PixiJS v8（WebGL/WebGPU）渲染，利用 GPU 批渲染与纹理缓存替代逐帧 Canvas 2D 绘制，稳定 60fps
- **高可扩展**：命令注册制 + 插件系统 + 中间件管线，新功能以插件形式接入
- **解耦**：事件总线驱动模块间通信，各系统独立可测试
- **易用**：声明式脚本语法，可视化编辑友好

---

## 二、总体架构

```
┌────────────────────────────────────────────────────────────┐
│                 VNEngine Core (纯 TS，框架无关)             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     Game 主控                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │  │
│  │  │  Updater  │  │  EventBus  │  │ PluginManager  │  │  │
│  │  │ (pixi Ticker)│ │ (事件总线) │  │  (插件管理)    │  │  │
│  │  └────────────┘  └────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│ │ Renderer  │  │  Script   │  │   Audio   │  │ Resource  │ │
│ │ (PixiJS)  │  │  (脚本)   │  │  (音频)   │  │  (资源)   │ │
│ │           │  │           │  │           │  │           │ │
│ │ LayerStack│  │ Parser    │  │ BGM/BGS   │  │ Loader    │ │
│ │ (Container│  │ Interpr   │  │ SE/Voice  │  │ Cache     │ │
│ │  zIndex)  │  │ Command   │  │ Fade控制  │  │ Preload   │ │
│ │ Sprite    │  │ VarStore  │  │           │  │           │ │
│ │ Text      │  │ Flow控制  │  │           │  │           │ │
│ │ Effect    │  │           │  │           │  │           │ │
│ └───────────┘  └───────────┘  └───────────┘  └───────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Save/Load System (序列化/反序列化)          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 分层说明

| 层级           | 职责                                                                 | 依赖关系                   |
| -------------- | -------------------------------------------------------------------- | -------------------------- |
| **引擎 Core**  | 游戏循环、渲染、脚本执行、音频、资源、存档                           | 框架无关，可独立运行       |
| **渲染基座**   | PixiJS v8 Application：场景图、批渲染、纹理/资源缓存、Federated 事件 | 由 Core 持有，WebGL/WebGPU |
| **平台适配层** | Canvas DOM 挂载、输入事件绑定、文件系统访问                          | 连接 Core 与浏览器环境     |

---

## 三、核心系统设计

### 3.1 Game（游戏主控）

Game 是引擎的生命周期编排器，负责创建子系统、按依赖顺序初始化、协调启动/暂停/恢复/销毁。子系统间通过 EventBus 通信，Game 不作为通信中介。

```
Game
├── app: Application                 // PixiJS Application（stage/ticker/canvas/screen）
├── updater: Updater                 // 逐帧驱动器（包一层 app.ticker）
├── eventBus: EventBus               // 事件总线
├── renderer: Renderer               // 渲染器（持有 LayerStack，驱动 bg/character/effect）
├── script: ScriptEngine             // 脚本引擎
├── audio: AudioManager              // 音频管理
├── resource: ResourceManager        // 资源管理
├── plugins: PluginManager           // 插件管理
├── variableStore: VariableStore     // 变量与旗标存储
├── saveManager: SaveManager         // 存档管理器
│
├── async init(config: GameConfig): Promise<void>  // 初始化引擎（详见下方 init 流程）
├── start(): void                    // 启动游戏循环（app.ticker.start()）
├── pause(): void                    // 暂停
├── resume(): void                   // 恢复
├── destroy(): void                  // 销毁（清理资源、停止 ticker）
├── loadScript(url: string): void    // 运行时动态加载脚本（章节切换等）
├── save(slot: number): void         // 存档
└── load(slot: number): void         // 读档
```

**生命周期状态机：**

```
uninitialized ──(init)──→ ready ──(start)──→ running
                              ↑                 │
                              │    ┌────────────┘
                              │    │  (pause)
                              │    ↓
                              │   paused ──(resume)──→ running
                              │    │
                              │    │  (destroy)
                              │    ↓
                              └── uninitialized
```

`init` 多次调用非法，需先 `destroy` 再重新 `init`。`start` 可在 `ready` 或 `paused` 状态下调用。

**init 初始化顺序（async，PixiJS v8）：**

```
1. 创建 EventBus
2. 创建 VariableStore
3. 创建 ResourceManager(eventBus, config.assets)
4. new Application() → await app.init({ width, height, resolution, autoDensity, ... })
   并将 app.canvas 挂载到容器；构建 LayerStack（根 Container + 图层 Container）
5. 创建 Renderer(app.stage, eventBus)         // 持有 LayerStack，订阅 bg/character/effect 事件
6. 创建 InputManager(app.stage, eventBus)      // pixi Federated Pointer Events
7. 创建 AudioManager(eventBus)
8. 创建 SaveManager(eventBus)
9. 创建 ScriptEngine(eventBus, variableStore)
10. 创建 PluginManager(eventBus)
11. 注册 config.plugins → PluginManager.loadAll()
12. 创建 Updater([renderer, scriptEngine, audioManager, pluginManager])，内部 app.ticker.add(...)
13. 预加载 config.scripts → resourceManager.loadScript(id) → scriptEngine.load(script)
14. 发射 game:init 事件
```

依赖规则：EventBus 最先创建；VariableStore 在 ScriptEngine 之前创建；`Application.init` 异步完成、`app.*` 就绪后才能构建 LayerStack 与 InputManager；Updater 最后创建，接收 `Updatable[]`。

**GameConfig 结构：**

```ts
interface GameConfig {
  canvas?: HTMLCanvasElement; // 可选；缺省时由 PixiJS 自行创建并挂载
  width: number; // 逻辑宽度 (如 1280)
  height: number; // 逻辑高度 (如 720)
  scaleMode: 'fit' | 'stretch' | 'fixed';
  //   fit   — 保持宽高比缩放至容器内（letterbox）
  //   stretch — 拉伸填充整个容器（可能变形）
  //   fixed — 不缩放，居中显示（原始分辨率）
  fps: number; // 目标帧率，默认 60。低于刷新率时跳帧渲染，逻辑仍以固定频率更新
  scripts: string[]; // 启动时预加载的脚本列表
  assets: AssetManifest; // 资源清单，init 阶段自动加载
  plugins: Plugin[]; // 插件列表
}
```

### 3.2 Updater（游戏循环）

引擎不再自绘 RAF 循环，而是由 PixiJS 的 `Ticker` 统一驱动帧时序。`Updater` 是对 `app.ticker` 的薄封装：注册一批 `Updatable`，每帧按顺序调用其 `update(dt)`，并额外做 dt 上限钳制与 `render:frame` 事件发射。

```ts
interface Updatable {
  update(dt: number): void;
}
```

```
Updater
├── app: Application                 // 持有 pixi Ticker 引用
├── updatables: Updatable[]          // 构造注入的子系统列表
├── fps: number                      // 目标帧率
├── elapsedTime: number              // 累计运行时间
│
├── start(): void                    // app.ticker.start()
├── stop(): void                     // app.ticker.stop()（用于 destroy）
├── pause(): void                    // 暂停更新（ticker.stop()，不销毁）
├── resume(): void                   // 恢复更新（ticker.start()）
│
ticker 回调:
  tick(ticker: Ticker)
    1. dt = ticker.deltaMS / 1000，钳制上限 1/10（100ms），防止标签页切回后跳帧
    2. if running: for (const u of updatables) u.update(dt)
    3. 发射 render:frame 事件
```

**帧率控制：** fps 低于显示器刷新率时采用跳帧策略——两次渲染之间未达到 `1000/fps` 毫秒时跳过渲染，但逻辑仍按 dt 更新。默认 60 表示不跳帧。

**与 Game 的协作：** `start/stop` 用于引擎初始化/销毁，`pause/resume` 用于用户暂停/恢复。Game 的 `pause/resume/destroy` 直接委托给 Updater 对应方法（即 ticker 的 stop/start）。

UI 渲染属于 Renderer 职责（最顶层 Layer），Updater 层面只负责逐帧更新与 `render:frame` 事件。

### 3.3 EventBus（事件总线）

泛型发布/订阅，类型安全。

```ts
type Handler<T = unknown> = (payload: T) => void;

class EventBus<T extends Record<string, unknown>> {
  private listeners: Map<string, Set<Handler<any>>>;

  on<K extends keyof T>(event: K, handler: Handler<T[K]>): void;
  off<K extends keyof T>(event: K, handler: Handler<T[K]>): void;
  once<K extends keyof T>(event: K, handler: Handler<T[K]>): void;
  emit<K extends keyof T>(event: K, payload: T[K]): void;
  removeAllListeners(event: string): void;
}
```

Game 创建时传入 `EngineEvents` 类型参数，所有事件订阅和发布均获得类型检查。

**核心事件定义：**

| 事件名                   | 触发时机       | 载荷                                                                                               |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| `game:init`              | 引擎初始化完成 | `{}`                                                                                               |
| `game:start`             | 游戏循环启动   | `{}`                                                                                               |
| `game:pause`             | 引擎暂停       | `{}`                                                                                               |
| `game:resume`            | 引擎恢复       | `{}`                                                                                               |
| `game:destroy`           | 引擎销毁前     | `{}`                                                                                               |
| `game:save`              | 存档完成       | `{ slot: number }`                                                                                 |
| `game:load`              | 读档完成       | `{ slot: number }`                                                                                 |
| `game:settings`          | 设置变更       | `{ key: string; value: unknown }`                                                                  |
| `script:command`         | 执行每条命令前 | `{ cmd: string; args: Record<string, unknown> }`                                                   |
| `script:say`             | 显示对话       | `{ speaker: string; text: string; voice?; speed?; mode? }`                                         |
| `script:choice`          | 显示选项时     | `{ choices: Choice[]; mode?: 'adv' \| 'nvl' }`                                                     |
| `script:choice:selected` | 用户选中选项后 | `{}`                                                                                               |
| `script:wait:done`       | 等待时长已到   | `{}`                                                                                               |
| `script:clear`           | 清除对话框     | `{}`                                                                                               |
| `script:end`             | 脚本执行完毕   | `{}`                                                                                               |
| `render:frame`           | 每帧渲染后     | `{ dt: number }`                                                                                   |
| `character:show`         | 角色立绘显示   | `{ id: string; position: Position; sprite?; transition?; duration? }`                              |
| `character:hide`         | 角色立绘隐藏   | `{ id: string; transition?; duration? }`                                                           |
| `character:move`         | 角色移动       | `{ id: string; position: Position; duration?; easing? }`                                           |
| `character:sprite`       | 角色立绘切换   | `{ id: string; sprite: string; transition?; duration? }`                                           |
| `bg:change`              | 背景切换       | `{ id: string; transition?; duration? }`                                                           |
| `audio:play`             | 音频播放       | `{ id: string; type: 'bgm' \| 'se' \| 'voice' \| 'ambient'; loop?; loopCount?; fadeIn?; volume? }` |
| `audio:stop`             | 音频停止       | `{ type: 'bgm' \| 'se' \| 'voice' \| 'ambient'; fadeOut? }`                                        |
| `effect:play`            | 画面特效开始   | `{ type: 'shake' \| 'flash' \| 'snow' \| 'rain'; duration?; intensity?; color?; density? }`        |
| `effect:stop`            | 画面特效结束   | `{}`                                                                                               |
| `input:click`            | 画布点击       | `{ x: number; y: number }`（逻辑坐标，由 `toLocal(e.global)` 换算）                                |
| `input:skip`             | 打字中点击     | `{}`（打字机进行中，点击用于跳过/补全当前文本，而非推进脚本）                                      |

---

## 四、渲染系统

### 4.1 整体设计

渲染基于 **PixiJS v8**。Renderer 实现 `Updatable` 接口（见 §3.2），由 Updater（`app.ticker`）统一驱动。渲染对象树由 pixi 场景图承担：Renderer 只负责组织图层、订阅引擎事件，并把领域概念（背景/角色/特效）映射为 pixi 显示对象。

```
Renderer
├── app: Application                 // pixi Application（stage/ticker）
├── eventBus: EventBus               // 订阅 bg/character/effect 事件
├── layerStack: LayerStack           // 根 Container + 图层 Container（zIndex 排序）
├── characters: CharacterRegistry    // 角色 → pixi Sprite 生命周期
├── backgrounds: BackgroundManager   // 背景切换（淡入淡出）
├── effects: EffectManager           // shake/flash/snow/rain
├── tween: TweenEngine               // 基于 ticker 的补间
│
├── init(stage: Container, eventBus): void   // 构建 LayerStack、订阅事件
├── update(dt): void                 // 驱动 tween/特效/角色动画
├── getState(): RendererState        // 供存档
└── setState(state): void            // 供读档
```

### 4.2 图层架构（LayerStack）

图层按 `zIndex` 排序，对应 pixi `Container`（`sortableChildren = true`）。常用约定如下（供工厂方法使用）：

```
zIndex 约定 (从底到顶):
┌────────────────────┐
│  BG       (0)      │  背景层
├────────────────────┤
│  CG      (100)     │  CG层（全屏插画，遮挡背景）
├────────────────────┤
│  Middle  (200)     │  中间景层（远景人物/物体）
├────────────────────┤
│  Chara   (300)     │  角色层（所有角色共享；前后遮挡通过同一层内 Sprite 排序）
├────────────────────┤
│  Fore    (400)     │  前景层（近景遮挡物）
├────────────────────┤
│  Effect  (500)     │  特效层（粒子、全屏转场）
├────────────────────┤
│  UI      (600)     │  UI层（对话框、选项、菜单）
└────────────────────┘
```

这些值只是约定，可通过 `addLayer()` 传入任意 `zIndex`。`reorderLayer(id, newZIndex)` 修改后 pixi 自动按 `zIndex` 重排。

```ts
import { Container } from 'pixi.js';

class LayerStack extends Container {
  readonly layers: Map<string, Container>;

  constructor() {
    super({ sortableChildren: true }); // 子节点按 zIndex 排序
  }
  addLayer(id: string, zIndex: number): Container;
  removeLayer(id: string): void;
  reorderLayer(id: string, newZIndex: number): void;
}
```

**注意（pixi v8 叶子节点规则）：** `Sprite`/`Text`/`Graphics` 是叶子节点，不能作为子节点容器；图层与分组一律用 `Container`。

### 4.3 精灵（Sprite）

直接用 pixi `Sprite`，不另设平行抽象。纹理来自 pixi `Texture`（见 §4.4/§6）。`moveTo`/`fadeTo` 等动画由引擎 tween 工具实现（见 §4.6）。

```ts
import { Sprite } from 'pixi.js';

const sprite = new Sprite(texture); // texture: Texture
sprite.x / sprite.y; // 位置
sprite.scale.set(sx, sy); // 缩放
sprite.rotation; // 旋转（弧度）
sprite.alpha; // 不透明度 0-1
sprite.anchor.set(0.5, 0.5); // 锚点 0-1
sprite.width / sprite.height; // 显示尺寸
sprite.eventMode = 'static'; // 需要接收交互事件时
```

**尺寸公式：** 最终显示宽高由 pixi 按 `width/height/scale` 计算。图集子纹理用 `new Texture({ source, frame })` 裁出源区域。

**精灵动画：** `moveTo(x, y, duration, easing)`、`fadeTo(alpha, duration)` 由引擎 tween 驱动（见 §4.6），作用于 `sprite.x`/`sprite.y`/`sprite.alpha` 等属性。

### 4.4 纹理管理（pixi Assets）

不再自维护 TextureManager。pixi `Assets` 负责纹理的加载与缓存，ResourceManager（见 §6）是加载门面。

```
pixi Assets
├── Assets.init({ manifest })        // 可选：注册资源清单别名
├── Assets.load(alias)               // 加载并缓存，返回 Texture；重复调用命中缓存
├── Assets.cache                     // 缓存表（Texture.from() 只读缓存，不发请求）
│
├── new Texture({ source, frame })   // 从大图裁出图集子纹理
└── Assets.loadBundle(name)          // 按 bundle 批量加载
```

**性能策略（pixi 内置，无需手写）：**

- **批渲染**：相同纹理的精灵合并为一次 GPU draw call
- **纹理缓存**：`Assets.load` 按 key 缓存，重复加载不重复解码/上传
- **纹理图集**：`new Texture({ source, frame })` 从一张大图裁出多个子纹理，减少上传与切换
- 无需手写脏矩形 / 离屏缓存 / ImageBitmap 手动解码——pixi 的 GPU 渲染与纹理缓存已覆盖这些优化

### 4.5 渲染管线

pixi 的渲染由 `Application` 内部自动完成（`app.ticker` 驱动的 `app.renderer.render({ container: app.stage })`），引擎**无需手写逐帧 draw 逻辑**。

```
每帧（由 app.ticker 驱动）:
  1. 逻辑更新：Updater 逐个调用 update(dt)
     → Renderer.update(dt)：驱动 tween / 特效 / 角色动画 / UI
  2. pixi 渲染器自动重绘 app.stage 全部内容
     → 批渲染 + 纹理缓存优化（无需脏矩形）
  3. 发射 render:frame 事件
```

### 4.6 转场/过渡系统（tween）

过渡不再用 `Transition.apply(ctx, sprite)` 手绘，而是由引擎 **tween 工具**驱动 pixi 显示对象的属性（`alpha`/`x`/`y`/`scale`）。tween 基于 `app.ticker` 逐帧推进，纯数学、可在 node 单测。

```ts
type EasingFn = (t: number) => number; // t ∈ [0, 1]

function tween<T extends object>(
  target: T,
  prop: keyof T,
  to: number,
  duration: number, // 毫秒
  easing: EasingFn,
  ticker: Ticker,
): { cancel(): void };
```

**示例：** 角色入场 = `tween(sprite, 'alpha', 1, 500, easeOut, ticker)`；退场 = 反向。背景淡入 = 新 `Sprite` 覆盖旧 `Sprite`，再 tween 旧 `alpha → 0` 后移除。

**内置转场效果（映射为对 pixi 属性的 tween 组合）：**

| 类型       | 说明                            |
| ---------- | ------------------------------- |
| `fade`     | 淡入淡出（`alpha`）             |
| `slide`    | 滑动（`x`/`y`）                 |
| `zoom`     | 缩放切换（`scale`）             |
| `wipe`     | 擦除转场，后续迭代（滤镜/遮罩） |
| `pixelate` | 像素化溶解，后续迭代（滤镜）    |
| `custom`   | 自定义回调                      |

### 4.7 文字渲染

文字渲染是 VN 中最频繁的操作之一。采用帧驱动状态机，渲染走 pixi `Text`。

**方案（已确认）：** pixi `Text`（canvas 同步渲染）+ 引擎侧把 DSL 富文本标签解析成带样式分段；打字机仅在字符边界更新可见字数。

```
DialogueBox（pixi Container）
├── segments: Array<{ text: Text; start: number }>  // 每个富文本样式段一个 pixi Text（叶子节点）
├── typewriter: TypewriterState                       // 纯状态机：totalChars/revealed/speed/complete
│
├── show(speaker: string, text: string): void
├── update(dt): void       // 推进 typewriter；仅当 revealed 变化时更新各段 Text.text
├── complete(): void       // 跳过动画显示全文
└── isBusy(): boolean      // 打字机进行中（输入层据此分流 input:skip）
```

**富文本解析（pure，可单测）：** `[color=#rrggbb]` `[b]` `[i]` `[size=N]` `[speed=N]` `[pause=N]` 与 `{$var}` 插值 → `Array<{ text; style }>`；`[speed]`/`[pause]` 由打字机处理；`[ruby]`/`[shake]` 标注为后续迭代。

**文字性能注意：** pixi 官方建议**不要逐帧修改 `Text.text`**（每次都会重绘到 canvas 并上传 GPU）。打字机只在字符边界（计数变化）时更新 `.text`；高频动态文本（如计时器）考虑 `BitmapText`。

### 4.8 缩放适配（ScaleManager）

`GameConfig.scaleMode`（§3.1）决定逻辑分辨率到画布的映射，由 `ScaleManager` 统一换算，供渲染与输入共用同一坐标基准。

| 模式      | 行为                                |
| --------- | ----------------------------------- |
| `fit`     | 保持宽高比缩放至容器内（letterbox） |
| `stretch` | 拉伸填充整个容器（可能变形）        |
| `fixed`   | 不缩放，居中显示（原始分辨率）      |

```
ScaleManager
├── mode: 'fit' | 'stretch' | 'fixed'
├── logical: { width, height }           // GameConfig 指定的逻辑分辨率
├── update(containerSize): void          // 容器尺寸变化时重算 app.stage.scale / 偏移
└── toLogical(global: Point): Point      // 屏幕坐标 → 逻辑坐标（供输入层）
```

实现要点：`app.stage.scale` 统一缩放 + 居中偏移（letterbox），`app.screen` 取实际容器尺寸；输入层用 `app.stage.toLocal(e.global)` 得到逻辑坐标，逻辑与渲染共享同一换算。

---

## 五、脚本系统

### 5.1 设计理念

采用"编译 + 解释执行"的两阶段设计：

1. **解析阶段**：将 `.vns` 脚本文件解析为 AST 命令序列（初始化时完成）
2. **执行阶段**：解释器逐条执行命令（运行时）

### 5.2 脚本格式（.vns 文件）

```
// VNScript 示例
@label start

@bg classroom day
@playBgm school_theme loop

@show ch_hero center
Hero "早上好，各位同学！"

@show ch_heroine left
Heroine "早...早上好..."

@choice
  → "回应他": respond
  → "无视他": ignore

@label respond
Heroine "早上好..."
@jump afterChoice

@label ignore
Heroine "......"
@jump afterChoice

@label afterChoice
@hide ch_hero fade
@hide ch_heroine fade
@stopBgm fade=2s
@end
```

### 5.3 Parser（解析器）

采用 Peggy 5.x 文法生成 + 薄封装层的两段设计：

**语法定义层** — `src/script/grammar.pegjs` 是 VNScript 语法的权威定义。
编译命令 `peggy --format es src/script/grammar.pegjs`，输出 `src/script/parser.js`（自动生成，不手动修改）。
配套类型声明 `src/script/parser.d.ts`，暴露 `parse(input: string, options?): ParseResult`。

**薄封装层** — `Parser.ts` 封装底层生成的 parser，对外暴露类型友好的接口：

```
Parser
├── parse(source: string): Script       // 文本 → Script 对象
│
内部流程:
  1. 委托 parser.parse(source) 完成语法分析
  2. 将 ParseResult（commands + metadata）包装为 Script 对象
  3. 收集 @label → LabelMap，验证跳转目标存在性
```

Parser 不负责文件加载（由 ResourceManager 处理），保持单一职责：`string → Script`。ScriptEngine 仅执行，接收已解析的 Script 对象。

```ts
interface Script {
  name: string;
  commands: Command[];
  labels: Map<string, number>; // 标签名 → 命令索引
  metadata: ScriptMetadata;
}

interface Command {
  type: string; // 命令类型
  args: Record<string, any>; // 参数
  line: number; // 源文件行号
}
```

### 5.4 VariableStore（变量与旗标存储）

变量和旗标是跨脚本持久存在的运行时状态。`VariableStore` 统一管理两者（旗标本质上是值为 boolean 的变量），同时提供序列化接口供存档系统使用。

```
VariableStore
├── variables: Map<string, unknown>    // 变量表
├── flags: Set<string>                 // 旗标集合
│
├── has(name: string): boolean
├── get(name: string): unknown
├── set(name: string, value: unknown): void
├── delete(name: string): void
├── hasFlag(name: string): boolean
├── setFlag(name: string): void
├── clearFlag(name: string): void
├── toggleFlag(name: string): void
├── clearAllFlags(): void
├── dump(): VariableStoreData
└── restore(data: VariableStoreData): void
```

**生命周期：**

- 由 `Game` 创建并持有所有权
- `Game` 将同一实例传递给 `ScriptEngine`，后者传递给 `Interpreter`
- `ScriptContext` 中暴露 `store: VariableStore`，command handler 通过它读写变量和旗标
- 存档时 `SaveManager` 从 `Game` 获取 `VariableStore` 引用，调用 `dump()` 拿到快照

**与 Interpreter 的关系：**

Interpreter 通过 `ScriptContext` 将 VariableStore 分发给各命令执行器，同时 Interpreter 自身也持有 VariableStore 引用用于条件评估（如 `@if` / `@elseif` 中读取当前变量值）。

### 5.5 Interpreter（解释器）

```
Interpreter
├── script: Script              // 当前脚本
├── store: VariableStore        // 变量与旗标存储（构造注入）
├── registry: CommandRegistry   // 命令注册表（构造注入）
├── engine: VNEngine             // 引擎引用（构造注入，用于构建 ScriptContext）
├── pc: number                  // 程序计数器（命令索引）
├── callStack: number[]         // 调用栈（用于 @call/@return）
├── state: 'idle' | 'running' | 'waiting' | 'paused'
│
├── getPc(): number // pc在外部只读
├── load(script: Script, startPc?: number): void
├── step(): void                // 执行下一条命令
├── jump(name: string): void
├── call(name: string): void
├── return(): void
└── wait(event: string, handler: () => void): void  // 暂停等待事件
```

**命令执行流程：**

```
step():
  1. 获取 commands[pc]
  2. 若 state === 'waiting' → 跳过
  3. 流程命令（@label/@jump/@call/@return/@if/@elseif/@else/@endif/@end）由
     Interpreter 内部直接处理，不经过 CommandRegistry
  4. 其余命令 → 执行 CommandRegistry.execute(cmd, context)
  5. pc++
  6. 若 pc >= commands.length → 触发 script:end

等待类命令（@say, @choice, @wait, @pause）执行后:
  state → 'waiting'
  等待用户点击/选择/计时结束 → state → 'running' → 继续 step()
```

### 5.6 CommandRegistry（命令注册表）

```ts
interface CommandHandler {
  type: string;
  execute(ctx: ScriptContext, args: Record<string, any>): void | Promise<void>;
  undo?(ctx: ScriptContext): void; // 用于回滚
}

class CommandRegistry {
  private commands: Map<string, CommandHandler>;

  register(handler: CommandHandler): void;
  unregister(type: string): void;
  execute(ctx: ScriptContext, cmd: Command): void | Promise<void>;
}
```

**内置命令清单：**

| 分类 | 命令                                                                            | 说明                   |
| ---- | ------------------------------------------------------------------------------- | ---------------------- |
| 背景 | `@bg`                                                                           | 切换背景（支持转场）   |
| 角色 | `@show`, `@hide`, `@move`                                                       | 角色显示/隐藏/移动     |
| 立绘 | `@sprite`                                                                       | 切换角色立绘表情/服装  |
| 对话 | `@say` 或直接 `角色名 "文本"`                                                   | 显示对话，等待点击继续 |
| 选项 | `@choice` … `@endchoice`                                                        | 显示选项分支，等待选择 |
| 音频 | `@playBgm`, `@stopBgm`, `@playSe`, `@playVoice`, `@playAmbient`, `@stopAmbient` | 音频控制               |
| 变量 | `@set`, `@add`, `@sub`, `@mul`, `@div`, `@mod`, `@random`                       | 变量操作               |
| 旗标 | `@flag`, `@unflag`, `@toggle`, `@clearFlags`                                    | 旗标操作               |
| 特效 | `@shake`, `@flash`, `@snow`, `@rain`, `@stopEffect`                             | 画面特效               |
| 系统 | `@wait`, `@pause`, `@click`, `@clear`, `@end`                                   | 系统命令               |

内置命令实现位于 `src/script/commands/`（`state.ts` 变量/旗标、`presentation.ts` 表现、`dialogue.ts` 对话/阻塞），通过 `registerBuiltinCommands(registry)` 统一注册到 `CommandRegistry`。handler 通过 `ScriptContext` 读写 `VariableStore`、向 `eventBus` 发射事件，并调用 `interpreter.wait()` 阻塞等待用户输入（见 §5.5）。

### 5.7 自定义命令扩展示例

```ts
// 在插件中注册自定义命令
const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  install(game) {
    game.script.commandRegistry.register({
      type: '@shaketext',
      execute(ctx, args) {
        const duration = args.duration ?? 500;
        game.renderer.addEffect(new ShakeEffect(duration));
      },
    });
  },
};
```

---

## 六、资源管理系统

### 6.1 整体架构

ResourceManager 是资源加载的门面，协调 pixi `Assets`（纹理加载与缓存）、fetch（音频/脚本网络获取）、Parser（脚本解析）和 EventBus（进度通知）。

```
ResourceManager
├── eventBus: EventBus               // 事件总线（发射 resource:progress / resource:ready）
├── assetLoader: AssetLoader         // 加载适配器（见 §6.2）
├── cache: ResourceCache             // 二级缓存：已解码 AudioBuffer 和已解析 Script 对象
├── manifest: AssetManifest          // 资源清单
├── preloader: Preloader             // 场景/分组预加载器
│
├── loadImage(id: string): Promise<Texture>      // pixi Texture
├── loadAudio(id: string): Promise<AudioBuffer>
├── loadScript(id: string): Promise<Script>
├── loadGroup(group: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void>
├── preloadScene(label: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void>
└── clear(): void
```

**内部加载流程：**

```
loadImage(id):
  1. url = manifest.images[id]
  2. texture = assetLoader.loadImage(url)        // 内部委托 pixi Assets.load（缓存命中直接返回）
  3. 发射 resource:progress

loadAudio(id):
  1. url = manifest.audio[id]
  2. arrayBuffer = assetLoader.loadAudio(url)    // fetch → arrayBuffer
  3. audioBuffer = audioContext.decodeAudioData(arrayBuffer)
  4. cache.set(id, audioBuffer)
  5. 发射 resource:progress

loadScript(id):
  1. url = manifest.scripts[id]
  2. source = assetLoader.loadScript(url)    // 返回脚本文本
  3. script = parser.parse(source)
  4. cache.set(id, script)
  5. 发射 resource:progress
```

Texture 由 pixi `Assets` 缓存（不再自维护一级缓存）；`ResourceCache`（§6.3）只缓存 AudioBuffer 与 Script。

**Preloader（预加载器）：**

```
Preloader
├── loadScene(manifest: AssetManifest, sceneLabel: string,
│             onProgress?: ProgressCallback): Promise<void>
├── loadGroup(manifest: AssetManifest, groupLabel: string,
│             onProgress?: ProgressCallback): Promise<void>
└── unloadScene(sceneLabel: string): void       // 卸载场景专属资源，保留共享资源
```

`preloadScene` 和 `loadGroup` 分别从 manifest 的 `scenes` 和 `groups` 字段读取资源列表，按图→音→脚本的顺序加载。

### 6.2 AssetLoader（资源加载器）

AssetLoader 是对底层加载能力的薄适配，不重复实现并发/重试/解码逻辑（由 pixi `Assets` 与浏览器处理）。

```
AssetLoader
│
├── loadImage(url: string): Promise<Texture>       // pixi Assets.load(url)，返回并缓存 Texture
├── loadAudio(url: string): Promise<ArrayBuffer>   // fetch(url) → arrayBuffer
└── loadScript(url: string): Promise<string>       // fetch(url) → text
```

**图片加载：** 委托 pixi `Assets.load`，自动获得解码（支持 ImageBitmap/WebGL 纹理）、去重与缓存，无需手动选大图/小图解码路径。

### 6.3 ResourceCache（LRU 缓存）

二级缓存，存放已解码的 AudioBuffer 和已解析的 Script 对象（Texture 由 pixi `Assets` 缓存，不在此处）。

```ts
class ResourceCache<T> {
  private maxEntries: number;
  private cache: Map<string, CacheEntry<T>>;

  get(id: string): T | null;
  set(id: string, value: T): void; // 超出 maxEntries 时自动淘汰
  has(id: string): boolean;
  delete(id: string): void;
  clear(): void;
}

interface CacheEntry<T> {
  value: T;
  lastAccess: number; // 用于 LRU 排序
}
```

淘汰策略：按条目数限制（`maxEntries`），`set` 时若 `cache.size >= maxEntries` 自动淘汰 `lastAccess` 最早的条目。

### 6.4 资源清单格式

```json
{
  "images": {
    "bg_classroom_day": "assets/bg/classroom_day.png",
    "ch_hero_default": "assets/char/hero/default.png",
    "ch_hero_smile": "assets/char/hero/smile.png"
  },
  "audio": {
    "bgm_school": "assets/audio/bgm/school_theme.ogg",
    "se_click": "assets/audio/se/click.ogg"
  },
  "scripts": {
    "chapter1": "scripts/chapter1.vns"
  },
  "spritesheets": {
    "ch_hero": {
      "url": "assets/char/hero/spritesheet.png",
      "frames": {
        "default": { "x": 0, "y": 0, "w": 512, "h": 720 },
        "smile": { "x": 512, "y": 0, "w": 512, "h": 720 }
      }
    }
  },
  "scenes": {
    "start": {
      "images": ["bg_classroom_day", "ch_hero_default"],
      "audio": ["bgm_school"],
      "scripts": ["chapter1"]
    },
    "choice1": {
      "images": ["ch_hero_smile"]
    }
  },
  "groups": {
    "chapter1_all": {
      "images": ["bg_classroom_day", "ch_hero_default", "ch_hero_smile"],
      "audio": ["bgm_school"]
    }
  }
}
```

`spritesheets` 的 `frames` 字段与 `Texture.frame` (`{ x, y, w, h }`) 保持一致，无需格式转换。

---

## 七、音频系统

### 7.1 整体架构

```
AudioManager  (实现 Updatable)
├── context: AudioContext              // Web Audio API 上下文
├── masterGain: GainNode              // 主音量控制
├── bgmBus: GainNode                  // BGM 总线音量
├── seBus: GainNode                   // SE 总线音量
├── voiceBus: GainNode                // 语音总线音量
├── bgmTrack: AudioTrack              // BGM轨道（独占）
├── sePool: AudioTrackPool            // 音效轨道池
├── voiceTrack: AudioTrack            // 语音轨道（独占，同时只能播放一条）
├── eventBus: EventBus                // 事件总线（构造注入）
│
├── playBgm(id: string, buffer: AudioBuffer, options?: { loop?: boolean; fadeIn?: number }): void
├── stopBgm(options?: { fadeOut?: number }): void
├── playSe(id: string, buffer: AudioBuffer): void
├── playVoice(id: string, buffer: AudioBuffer): void
├── setMasterVolume(v: number): void  // 0-1，设 masterGain.gain.value
├── setBgmVolume(v: number): void     // 0-1，设 bgmBus.gain.value
├── setSeVolume(v: number): void      // 0-1，设 seBus.gain.value
├── setVoiceVolume(v: number): void   // 0-1，设 voiceBus.gain.value
├── update(dt: number): void          // 驱动所有活跃 track 的 fade 渐变
├── pause(): void                     // context.suspend()
└── resume(): void                    // context.resume()
```

**音频路由图：**

```
AudioTrack.buffer → sourceNode → trackGain → busGain → masterGain → destination
                                    (独立)    (类型总线)  (总控)

bgmTrack.trackGain   → bgmBus   ─┐
sePool 各 trackGain   → seBus    ─┼→ masterGain → context.destination
voiceTrack.trackGain  → voiceBus ─┘
```

`setBgmVolume/setSeVolume/setVoiceVolume` 控制总线级别音量，不覆盖 track 自身 gain（后者用于 fade 过程中的中间值）。

### 7.2 AudioTrack（音轨）

```ts
class AudioTrack {
  type: 'bgm' | 'se' | 'voice';
  gain: GainNode; // 独立音量节点（fade 时修改此值）
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  state: 'stopped' | 'playing' | 'paused' | 'fading';

  play(
    buffer: AudioBuffer,
    options?: { loop?: boolean; fadeIn?: number },
  ): void;
  stop(options?: { fadeOut?: number }): void;
  pause(): void;
  resume(): void;
  setVolume(v: number): void; // 0-1，直接设 gain.gain.value
}
```

**状态转换：**

```
stopped ──play(fadeIn)──→ fading ──fadeIn 完成──→ playing
stopped ──play(fadeIn=0)──→ playing

playing ──stop(fadeOut)──→ fading ──fadeOut 完成──→ stopped
playing ──stop(fadeOut=0)──→ stopped
playing ──pause()──→ paused ──resume()──→ playing
```

`fading` 状态下 `update(dt)` 每帧计算 fade 进度、修改 `gain.gain.value`，完成后切到目标状态并触发事件。

### 7.3 音频池（SE轨道复用）

```ts
class AudioTrackPool {
  private maxTracks: number; // 池容量，如 8
  private pool: AudioTrack[]; // 空闲轨道
  private active: Map<string, AudioTrack>; // 音频 id → 占用轨道

  acquire(id: string): AudioTrack | null; // 获取空闲轨道；无空闲时返回 null 或复用最早 active
  release(id: string): void; // 停止并归还轨道到池
  update(dt: number): void; // 更新所有 active 轨道的 fade
  stopAll(): void; // 停止所有活跃 SE
}
```

同一音效 id 再次播放时，若 `active.has(id)` 则复用已有轨道（从头重新播放），避免同一声叠加。池容量满时，停止并复用最早激活的轨道。

---

## 八、UI 系统（pixi Container + @pixi/ui）

### 8.1 设计思路

UI 全部由 pixi 显示对象绘制，不依赖 DOM。UI 组件是 pixi `Container`（子类或持有 Container），挂载在 UI Layer（§4.2，zIndex=600）上。**VN 专属组件**（对话框/选项/存读档/设置/历史）用自定义 pixi Container 实现；**通用交互控件**（按钮/滑动条/列表/滚动视图）复用 `@pixi/ui`。

```ts
import { Container } from 'pixi.js';

class UIComponent extends Container {
  id: string;
  // pixi Container 已提供 x/y/width/height/visible/children/alpha
  update(dt: number): void;
}
```

**坐标体系：** 沿用 pixi 场景图——父子 Container 的相对坐标由 pixi 变换系统自动累积，无需手写 `getAbsoluteX/Y`。**命中测试**由 pixi Federated Pointer Events 承担（`eventMode` + `hitArea`），无需手写递归 `hitTest`。

**共享逻辑：** 自定义组件的公共逻辑（如富文本分段布局）放工具函数模块（`renderer/textLayout.ts` 等），各组件直接调用函数，不依赖基类继承。

### 8.2 内置 UI 组件

核心组件（自定义 pixi Container）：

| 组件            | 说明                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `DialogueBox`   | 对话框：pixi Text 分段 + 打字机（见 §4.7）；`show/hide/isBusy/complete` |
| `ChoicePanel`   | 选项面板：`script:choice` → 按钮列表 → 发射 `script:choice:selected`    |
| `SaveLoadMenu`  | 存读档菜单：槽位列表（`@pixi/ui` ScrollBox/List + FancyButton）         |
| `SettingsMenu`  | 设置菜单：音量/文字速度（`@pixi/ui` Slider）、开关（`@pixi/ui` Toggle） |
| `HistoryView`   | 对话历史：`@pixi/ui` ScrollBox                                          |
| `ConfirmDialog` | 确认弹窗：`@pixi/ui` FancyButton 确认/取消                              |

通用控件（来自 `@pixi/ui`，`@pixi/ui@^2.3` 兼容 pixi v8）：

| 控件                      | 说明                               |
| ------------------------- | ---------------------------------- |
| `FancyButton` / `Button`  | 文本/图片按钮（hover/click/press） |
| `Slider` / `DoubleSlider` | 滑动条（音量/速度调节）            |
| `CheckBox` / `Switcher`   | 开关 / 单选                        |
| `ScrollBox` / `List`      | 滚动视图（含遮罩裁剪与滚动偏移）   |
| `Input`                   | 文本输入框                         |
| `ProgressBar`             | 进度条（资源加载）                 |

### 8.3 输入事件分发

InputManager 由 Game 持有，在 init 时创建（Renderer 之后、AudioManager 之前）。事件源为 **pixi Federated Pointer Events**。

```
pixi Federated Events → InputManager 路由
  → 全屏命中层（eventMode='static'）收到 pointerdown
  → toLogical(e.global)                 // 逻辑坐标：ScaleManager.toLogical（app.stage.toLocal）
  → 打字机进行中?
      → 是：发射 input:skip（补全当前文本）
      → 否：命中 UI 组件 → 组件内部处理（按钮 onClick 等）
           未命中 → 发射 input:click（全局命令：点击继续对话）
  → pointermove → 发射 input:hover
```

```ts
class InputManager {
  eventBus: EventBus;
  uiRoot: Container | null; // UI Layer 就绪后设置

  setUIRoot(root: Container): void;
  // 交互组件自身 eventMode='static'，由 pixi 负责命中测试，无需全局监听 MouseEvent
}
```

坐标转换统一依赖 `ScaleManager.toLogical`（见 §4.8），逻辑坐标与渲染共享同一换算，不做手写 CSS 像素数学。

---

## 九、状态管理与存档系统

### 9.1 游戏状态设计

引擎不维护集中式 `GameState` 运行时对象——各子系统自有状态（ScriptEngine.pc、Renderer 的角色/背景、AudioManager 的 BGM、VariableStore 的变量/旗标等），Game 仅持有 `variableStore` 和 `saveManager`。

存档时 `SaveManager` 遍历各子系统收集数据，组装为 `GameStateSnapshot`（类型定义见 §14.3）：

| 来源          | 收集内容          | 方法               |
| ------------- | ----------------- | ------------------ |
| ScriptEngine  | 当前脚本名、pc    | `getState()`       |
| Renderer      | 背景 id、角色列表 | `getState()`       |
| AudioManager  | BGM id、播放进度  | `getState()`       |
| VariableStore | variables、flags  | `dump()`           |
| Updater       | 累计游玩时间      | `elapsedTime` 字段 |

各子系统提供 `getState()`（或等效方法）返回各自领域的可序列化快照片段，`SaveManager` 在 capture() 中拼接为完整的 `GameStateSnapshot`。

**Settings（用户设置）：**

```ts
interface Settings {
  masterVolume: number; // 0-1
  bgmVolume: number; // 0-1
  seVolume: number; // 0-1
  voiceVolume: number; // 0-1
  textSpeed: number; // 毫秒/字
  autoSpeed: number; // 自动模式下等待毫秒数
  skipMode: 'all' | 'read';
  fullscreen: boolean;
  language: string;
  fontSize: number;
}
```

Settings 独立持久化（全局一份），不嵌入每个存档槽中。类型定义见 §14.3 `SettingsSnapshot`。

### 9.2 Save/Load 数据格式

`SaveData` 和 `GameStateSnapshot` 的权威类型定义见 §14.3。

### 9.3 存档流程（SaveManager）

```
Game.save(slot)
  → eventBus.emit('game:save', { slot })

SaveManager.capture(engine, slot):
  1. engine.pause()
  2. 生成缩略图：`app.renderer.extract.texture({ target: app.stage })` → canvas.toBlob()（Blob 直接存，无需 base64）
  3. 收集各子系统快照 → 组装 GameStateSnapshot
  4. 获取当前对话文本截取（≤30字）作为 slotLabel
  5. 构建 SaveData { version, timestamp, thumbnail, slotLabel, gameState }
  6. storage.setItem(`save_${slot}`, saveData)  // IndexedDB 优先，降级 localStorage
  7. engine.resume()
  8. eventBus.emit('game:saved', { slot })

SaveManager.restore(engine, slot):
  1. engine.pause()
  2. saveData = storage.getItem(`save_${slot}`)
  3. 版本迁移（如有需要）：逐版升级 saveData.gameState 结构
  4. 恢复各子系统状态：
     a. variableStore.restore(snapshot.variables, snapshot.flags)
     b. resourceManager.preloadScene(snapshot.currentScript)  // 预加载依赖资源
     c. renderer.setState(snapshot.bgImage, snapshot.characters)
     d. audioManager.setState(snapshot.bgm)
     e. scriptEngine.load(await resourceManager.loadScript(snapshot.currentScript), snapshot.scriptPC)
  5. engine.resume()
  6. eventBus.emit('game:loaded', { slot })
```

读档的资源预加载优先走 pixi `Assets` 缓存（`Assets.cache`）与 `ResourceManager.cache`，命中则跳过网络请求。版本迁移由 `migrate(saveData)` 工具函数处理，按版本号逐级转换数据格式。

---

## 十、插件系统

### 10.1 插件接口

```ts
interface Plugin {
  name: string;
  version: string;
  dependencies?: string[]; // 依赖的其他插件 name 列表
  install(game: Game): void;
  uninstall?(game: Game): void;
  update?(dt: number): void; // 可选逐帧更新
}
```

### 10.2 PluginManager

PluginManager 实现 `Updatable` 并注册进 `Updater`（§3.2），pixi `ticker` 每帧驱动其 `update(dt)`，在遍历已安装插件并调用 `plugin.update?()`。

```ts
class PluginManager {
  private plugins: Map<string, Plugin>;
  private installed: Plugin[]; // 已调用 install() 的插件（拓扑排序后）
  private game: Game;

  register(plugin: Plugin): void; // 仅记录元信息，不调用 install
  unregister(name: string): void; // 调用 uninstall() + 移除
  get(name: string): Plugin | null;
  list(): Plugin[];

  // 注册所有插件后按依赖拓扑排序，依次调用 install(game)
  loadAll(plugins: Plugin[]): void;

  update(dt: number): void; // 遍历 installed，调用 plugin.update?.(dt)
}
```

**两阶段初始化：**

```
1. register 阶段（仅记录）：
   pluginManager.register(plugin1)
   pluginManager.register(plugin2)
   ... 或直接用 pluginManager.loadAll(config.plugins)

2. loadAll 阶段（安装）：
   解析 dependencies → 拓扑排序
   → 循环依赖检测、缺失依赖报错
   → 依次调用 plugin.install(game)
```

`Game.init()` 中调用 `loadAll(config.plugins)` 完成全部注册+安装。`register` 保留给运行时动态加载场景。

### 10.3 扩展点一览

| 扩展点   | 接入方式                                                     | 用途           |
| -------- | ------------------------------------------------------------ | -------------- |
| 命令     | `CommandRegistry.register()`                                 | 自定义脚本命令 |
| 转场     | 传入 `tween()` 的缓动参数 / 自定义 `EasingFn`                | 自定义转场效果 |
| 特效     | 自定义 pixi `Container`（挂到 Effect 图层）/ 着色器 `Filter` | 自定义画面特效 |
| UI组件   | 继承 pixi `Container` 并实现 `UIComponent` 约定              | 自定义 UI 控件 |
| 事件监听 | `EventBus.on()`                                              | 监听引擎事件   |
| 逐帧更新 | Plugin 实现 `update(dt)`（由 Updater 驱动）                  | 插件逐帧逻辑   |

---

## 十一、性能优化策略汇总

| 策略                  | 说明                                                        | 适用场景              |
| --------------------- | ----------------------------------------------------------- | --------------------- |
| **GPU 批渲染**        | pixi 自动合批 Sprite/Text/Graphics 绘制调用，减少 draw call | 立绘、粒子、大量对象  |
| **纹理图集 / 共享帧** | 多个 `Texture` 共享同一 `TextureSource`，单张大图取 frame   | 立绘表情、spritesheet |
| **对象池**            | 复用 SE 音轨、粒子对象                                      | 高频创建/销毁         |
| **LRU 缓存**          | `Assets.cache` + `ResourceCache` 限制纹理/音频内存占用      | 长剧本、多资源        |
| **pixi ticker**       | 内部用 RAF 与浏览器刷新率同步，`ticker.maxFPS` 可限帧       | 游戏循环              |
| **deltaTime 上限**    | dt 按 1/10s 截断，防止标签页返回后跳帧                      | 所有帧逻辑            |
| **按需/批量加载**     | `Assets.loadBundle` 按章节/场景预加载，不一次性加载全部     | 初始化/场景切换       |
| **异步解码**          | 图片由 GPU 纹理异步上传，音频 `decodeAudioData` 异步解码    | 大尺寸 CG、长音频     |
| **后台自停**          | 页面隐藏自动 `ticker.stop()`，恢复即续，无需手动重绘        | 页面隐藏/恢复         |

---

## 十二、目录结构

```
src/
├── core/                          # 核心系统
│   ├── Game.ts                    # 游戏主类（持有 pixi Application）
│   ├── Updater.ts                 # 游戏循环（pixi Ticker 封装）
│   ├── EventBus.ts                # 事件总线
│   └── PluginManager.ts           # 插件管理器
│
├── renderer/                      # 渲染系统（pixi）
│   ├── Renderer.ts                # 渲染器（LayerStack + 角色/背景/特效/tween）
│   ├── LayerStack.ts              # 图层栈（zIndex 排序的 pixi Container）
│   ├── ScaleManager.ts            # 缩放适配（fit|stretch|fixed）
│   ├── TextRenderer.ts            # 富文本分段 + 打字机
│   ├── tween.ts                   # 基于 ticker 的补间（转场/移动）
│   └── effects/                   # 画面特效（自定义 pixi Container）
│       ├── ShakeEffect.ts
│       ├── FlashEffect.ts
│       └── ParticleEffect.ts
│
├── script/                        # 脚本系统
│   ├── grammar.pegjs              # Peggy 文法定义（VNScript 语法权威来源）
│   ├── parser.js                  # 自动生成（Peggy 编译 grammar.pegjs 输出）
│   ├── parser.d.ts                # 生成解析器的 TypeScript 类型声明
│   ├── Parser.ts                  # 薄封装层，调用 parser.parse() 返回 Script
│   ├── ScriptEngine.ts            # 脚本引擎（Interpreter 门面，脚本由资源系统解析并缓存）
│   ├── VariableStore.ts            # 变量与旗标存储
│   ├── Interpreter.ts             # 脚本解释器
│   ├── CommandRegistry.ts         # 命令注册表
│   └── commands/                  # 内置命令实现
│       ├── index.ts               # 注册入口（registerBuiltinCommands）
│       ├── utils.ts               # 共享参数解析工具（时长/位置参数/字面量）
│       ├── state.ts               # 变量与旗标命令
│       ├── presentation.ts        # 背景/角色/音频/画面特效命令
│       └── dialogue.ts            # 对话/选项/等待/系统命令
│
├── audio/                         # 音频系统
│   ├── AudioManager.ts            # 音频管理器
│   ├── AudioTrack.ts              # 音轨
│   └── AudioTrackPool.ts          # 音轨池
│
├── resource/                      # 资源管理
│   ├── ResourceManager.ts         # 资源管理器（pixi Assets 门面）
│   ├── AssetLoader.ts             # 加载适配器（image→Texture / audio→ArrayBuffer / script→string）
│   ├── ResourceCache.ts           # LRU缓存
│   └── Preloader.ts               # 预加载器
│
├── ui/                            # UI 组件（pixi Container + @pixi/ui）
│   ├── UIComponent.ts             # UI组件基类（extends pixi Container）
│   ├── DialogueBox.ts             # 对话框（富文本分段 + 打字机）
│   ├── ChoicePanel.ts             # 选项面板
│   ├── SaveLoadMenu.ts            # 存档/读档菜单
│   ├── SettingsMenu.ts            # 设置菜单
│   ├── HistoryView.ts             # 对话历史
│   └── ConfirmDialog.ts           # 确认弹窗
│   # 通用控件（按钮/滑动条/滚动列表）由 @pixi/ui 提供
│
├── input/                         # 输入管理
│   └── InputManager.ts            # 输入事件分发（pixi Federated Events）
│
├── save/                          # 存档系统
│   ├── SaveManager.ts             # 存档管理器
│   └── SaveData.ts                # 存档数据结构
│
├── types/                         # 共享类型定义
│   ├── engine.ts                  # 引擎核心类型
│   ├── script.ts                  # 脚本相关类型
│   ├── resource.ts                # 资源相关类型
│   ├── save.ts                    # 存档相关类型
│   └── events.ts                  # 事件类型定义
│
├── utils/                         # 工具函数
│   ├── easing.ts                  # 缓动函数集
│   ├── objectPool.ts              # 通用对象池
│   ├── lruCache.ts                # 通用LRU缓存
│   └── asyncQueue.ts              # 异步队列（并发控制）
│
├── main.ts                        # 入口
```

---

## 十三、数据流

### 13.1 脚本执行流

```
用户点击继续
  → InputManager 分发 click 事件
  → EventBus 发送 'input:click'
  → Interpreter.state: 'waiting' → 'running'
  → Interpreter.step()
    → CommandRegistry.execute(cmd, ctx)
      → 例如 SayCommand:
        → renderer.ui.dialogueBox.show(text)
        → EventBus 发送 'script:say'
        → 逐字显示动画 → 完成后 state → 'waiting'
  → 循环...
```

### 13.2 渲染流

```
pixi app.ticker（内部用浏览器 RAF 驱动）
  → ticker 回调 tick(ticker)
    → Updater.update(dt)          // dt = ticker.deltaMS/1000，clamp 1/10s
      → Renderer.update(dt)
        → 各图层 Container 内 Sprite/Text/Effect 更新
        → tween() 补间推进
        → UI 组件更新
      → AudioManager.update(dt)   // 淡入淡出
      → PluginManager 各插件 update
    → pixi 自动渲染 app.stage（GPU 批渲染，无需手写 draw）
    → EventBus 发送 'render:frame'
```

### 13.3 资源加载流

```
Game.init(config)
  → ResourceManager.loadManifest(config.assets)
  → Preloader.preloadScene('start')
    → AssetLoader 并发加载图片/音频/脚本
    → 每完成一项 → 更新进度
    → EventBus 发送 'resource:progress'
  → 全部完成 → EventBus 发送 'resource:ready'
  → Game.start()
```

### 13.4 存档/读档流

```
存档:
  UI点击存档槽
    → SaveLoadSlot.onClick()
    → Game.save(slot)
    → SaveManager.capture(engine, slot)
      → engine.pause()
      → 生成缩略图（app.renderer.extract.texture → canvas.toBlob()）
      → 遍历各子系统收集快照 → 组装 GameStateSnapshot
      → 构建 SaveData
      → IndexedDB 持久化
      → engine.resume()
      → EventBus 发送 'game:saved'

读档:
  UI点击读档槽
    → SaveLoadSlot.onClick()
    → Game.load(slot)
    → SaveManager.restore(engine, slot)
      → engine.pause()
      → 从 IndexedDB 读取 SaveData
      → 版本迁移（如有）
      → variableStore.restore(snapshot.variables, snapshot.flags)
      → resourceManager.preloadScene(snapshot.currentScript)
      → renderer.setState(snapshot.bgImage, snapshot.characters)
      → audioManager.setState(snapshot.bgm)
      → scriptEngine.load(await resourceManager.loadScript(snapshot.currentScript), snapshot.scriptPC)
      → engine.resume()
      → EventBus 发送 'game:loaded'
```

---

## 十四、关键类型定义

### 14.1 引擎核心类型

```ts
// types/engine.ts
// 注：src/types/*.ts 已按本目标形态实现；以 pixi 类型替换原有 Canvas 专用接口
//（Layer/Sprite/Texture/SpriteEffect/Transition 等）。

interface GameConfig {
  canvas?: HTMLCanvasElement; // 可选：缺省时由 pixi Application 自建 canvas
  width: number;
  height: number;
  scaleMode: 'fit' | 'stretch' | 'fixed';
  fps: number; // 映射到 app.ticker.maxFPS
  assets: AssetManifest;
  plugins?: Plugin[];
}

interface AssetManifest {
  images: Record<string, string>;
  audio: Record<string, string>;
  scripts: Record<string, string>;
  spritesheets: Record<string, SpritesheetConfig>;
}

interface SpritesheetConfig {
  url: string;
  frames: Record<string, [number, number, number, number]>;
}

// 事件类型（string → 泛型映射）
interface EngineEvents {
  'script:command': { cmd: string; args: Record<string, any> };
  'script:choice': { choices: Choice[]; mode?: 'adv' | 'nvl' };
  'script:say': {
    speaker: string;
    text: string;
    voice?: string;
    speed?: number;
    mode?: 'adv' | 'nvl';
  };
  'script:clear': {};
  'script:choice:selected': {};
  'script:wait:done': {};
  'script:end': {};
  'render:frame': { dt: number };
  'character:show': {
    id: string;
    position: Position;
    sprite?: string;
    transition?: string;
    duration?: number;
  };
  'character:hide': { id: string; transition?: string; duration?: number };
  'character:move': {
    id: string;
    position: Position;
    duration?: number;
    easing?: string;
  };
  'character:sprite': {
    id: string;
    sprite: string;
    transition?: string;
    duration?: number;
  };
  'bg:change': { id: string; transition?: string; duration?: number };
  'audio:play': {
    id: string;
    type: 'bgm' | 'se' | 'voice' | 'ambient';
    loop?: boolean;
    loopCount?: number;
    fadeIn?: number;
    volume?: number;
  };
  'audio:stop': {
    type: 'bgm' | 'se' | 'voice' | 'ambient';
    fadeOut?: number;
  };
  'effect:play': {
    type: 'shake' | 'flash' | 'snow' | 'rain';
    duration?: number;
    intensity?: number;
    color?: string;
    density?: number;
  };
  'effect:stop': {};
  'game:save': { slot: number };
  'game:load': { slot: number };
  'game:pause': {};
  'game:resume': {};
  'input:click': { x: number; y: number };
  'input:hover': { x: number; y: number };
  'input:skip': {}; // 打字机进行中点击：跳过/完成当前打字，而非推进对话
  'resource:progress': { loaded: number; total: number; percent: number };
  'resource:ready': {};
}
```

### 14.2 脚本类型

```ts
// types/script.ts

interface Script {
  name: string;
  commands: Command[];
  labels: Map<string, number>;
  metadata: { author?: string; version?: string };
}

interface Command {
  type: string;
  args: Record<string, any>;
  line: number;
}

interface ScriptContext {
  engine: import('./engine').VNEngine;
  interpreter: import('../script/Interpreter').Interpreter;
  store: import('../script/VariableStore').VariableStore;
}

interface Choice {
  text: string;
  label: string; // 跳转标签
  condition?: string; // 条件表达式（如 "flags.has('met_hero')"）
  enabled?: boolean;
}
```

### 14.3 存档类型

```ts
// types/save.ts

interface SaveData {
  version: number; // 存档格式版本（用于迁移）
  timestamp: number; // 存档时间戳
  thumbnail: Blob | string; // 缩略图，IndexedDB 存 Blob，localStorage 降级 base64
  slotLabel: string; // 存档标签（当前对话文本截取 ≤30 字）
  gameState: GameStateSnapshot;
}

interface GameStateSnapshot {
  currentScript: string;
  scriptPC: number;
  variables: Record<string, unknown>;
  flags: string[];
  bgImage: string | null;
  characters: Array<{
    id: string;
    spriteId: string;
    position: { x: number; y: number };
    opacity: number;
  }>;
  bgm: { id: string; progress: number } | null;
  history: DialogueEntry[];
  playTime: number; // 累计游玩时间（毫秒）
}
```

---

## 十五、扩展与演进方向

### 16.1 第一阶段（MVP）

- [x] PixiJS v8 渲染管线（图层栈 + 精灵 + 纹理）
- [x] 脚本解析与解释执行
- [x] 基础命令集（bg/show/hide/say/choice/jump）
- [x] 对话框与选项 UI
- [x] BGM/SE 音频播放
- [x] 资源加载与缓存
- [x] 存档/读档（localStorage）

### 16.2 第二阶段

- [ ] 转场特效系统
- [ ] 画面特效（震动、闪光、粒子）
- [ ] 自动/快进模式
- [ ] 对话历史/回看
- [ ] 设置菜单（音量、文字速度等）
- [ ] 多语言支持
- [ ] IndexedDB 存档

### 16.3 第三阶段

- [ ] 视觉编辑器（Electron / Web）
- [ ] Live2D / Spine 骨骼动画支持
- [ ] 视频播放（背景/事件CG）
- [ ] 自定义着色器特效（pixi Filter / Shader）
- [ ] 脚本热重载（HMR）
- [ ] 性能分析面板（DevTools）

---

## 十六、设计决策记录

| 决策      | 选择                                      | 原因                                            |
| --------- | ----------------------------------------- | ----------------------------------------------- |
| 渲染方案  | PixiJS v8（WebGL/WebGPU）                 | 场景图/批渲染/纹理缓存成熟，替代手写 Canvas 2D  |
| 文字方案  | pixi `Text` + 引擎侧富文本分段            | Canvas 同步渲染，避免 DOM-vs-WebGL 分层同步问题 |
| UI 方案   | pixi `Container` 组件 + @pixi/ui          | 帧同步一致，无 DOM 布局抖动；通用控件直接复用   |
| 音频方案  | Web Audio API                             | 精确控制，多音轨混音                            |
| 脚本格式  | 自定义 `.vns`                             | 简洁，面向 VN 场景优化                          |
| 状态管理  | 引擎内置 GameState                        | 框架无关，可直接序列化                          |
| 资源加载  | pixi `Assets`（`AssetManifest` 为真源）   | 统一纹理缓存/图集/加载进度，Audio 走 fetch+解码 |
| 转场/特效 | 基于 ticker 的 tween + 自定义 `Container` | 无需额外动画库，对齐现有 `EasingFn`             |
| 通信方式  | EventBus                                  | 模块解耦，可测试                                |
| 资源解码  | pixi `Assets` 异步上传为 GPU 纹理         | 图片异步解码，不阻塞主线程                      |
| 存档格式  | JSON + IndexedDB                          | 可读可迁移，容量大                              |
| 模块化    | 引擎纯 TS                                 | 可测试，可移植                                  |

---

_本文档为 VNEngine 架构设计初始版本，随开发迭代持续更新。_
