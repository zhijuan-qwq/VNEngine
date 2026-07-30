# VNEngine 视觉小说引擎架构设计

## 一、设计目标

- **高性能**：纯 Canvas 渲染，避免 DOM 重排重绘；脏矩形局部刷新 + 离屏缓存，稳定 60fps
- **高可扩展**：命令注册制 + 插件系统 + 中间件管线，新功能以插件形式接入
- **解耦**：事件总线驱动模块间通信，各系统独立可测试
- **易用**：声明式脚本语法，可视化编辑友好
- **跨平台潜力**：核心引擎不依赖 Vue/DOM，可迁移至 Node.js 或其他运行时

---

## 二、总体架构

```
┌────────────────────────────────────────────────────────────┐
│                 VNEngine Core (纯 TS，框架无关)             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     Game 主控                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │  │
│  │  │  GameLoop  │  │  EventBus  │  │ PluginManager  │  │  │
│  │  │ (RAF循环)  │  │ (事件总线) │  │  (插件管理)    │  │  │
│  │  └────────────┘  └────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│ │ Renderer  │  │  Script   │  │   Audio   │  │ Resource  │ │
│ │ (渲染)    │  │  (脚本)   │  │  (音频)   │  │  (资源)   │ │
│ │           │  │           │  │           │  │           │ │
│ │ Layer栈   │  │ Parser    │  │ BGM/BGS   │  │ Loader    │ │
│ │ Texture   │  │ Interpr   │  │ SE/Voice  │  │ Cache     │ │
│ │ Sprite    │  │ Command   │  │ Fade控制  │  │ Preload   │ │
│ │ Effect    │  │ VarStore  │  │           │  │           │ │
│ │ UI绘制    │  │ Flow控制  │  │           │  │           │ │
│ └───────────┘  └───────────┘  └───────────┘  └───────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Save/Load System (序列化/反序列化)          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 分层说明

| 层级           | 职责                                        | 依赖关系               |
| -------------- | ------------------------------------------- | ---------------------- |
| **引擎 Core**  | 游戏循环、渲染、脚本执行、音频、资源、存档  | 框架无关，可独立运行   |
| **平台适配层** | Canvas DOM 挂载、输入事件绑定、文件系统访问 | 连接 Core 与浏览器环境 |

---

## 三、核心系统设计

### 3.1 Game（游戏主控）

Game 是引擎的生命周期编排器，负责创建子系统、按依赖顺序初始化、协调启动/暂停/恢复/销毁。子系统间通过 EventBus 通信，Game 不作为通信中介。

```
Game
├── canvas: HTMLCanvasElement        // 主画布
├── loop: GameLoop                   // 游戏循环
├── eventBus: EventBus               // 事件总线
├── renderer: Renderer               // 渲染器（独占 ctx）
├── script: ScriptEngine             // 脚本引擎
├── audio: AudioManager              // 音频管理
├── resource: ResourceManager        // 资源管理
├── plugins: PluginManager           // 插件管理
├── variableStore: VariableStore     // 变量与旗标存储
├── saveManager: SaveManager         // 存档管理器
│
├── init(config: GameConfig): void   // 初始化引擎（详见下方 init 流程）
├── start(): void                    // 启动游戏循环
├── pause(): void                    // 暂停
├── resume(): void                   // 恢复
├── destroy(): void                  // 销毁（清理资源、取消 RAF）
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

**init 初始化顺序：**

```
1. 创建 EventBus
2. 创建 VariableStore
3. 创建 ResourceManager(eventBus, config.assets)
4. 创建 Renderer(config.canvas, eventBus)      // ctx 由 Renderer 从 canvas 获取
5. 创建 InputManager(config.canvas, eventBus)   // 绑定 DOM 事件监听
6. 创建 AudioManager(eventBus)
7. 创建 SaveManager(eventBus)
8. 创建 ScriptEngine(eventBus, variableStore)
9. 创建 PluginManager(eventBus)
10. 注册 config.plugins → PluginManager.loadAll()
11. 创建 GameLoop([renderer, scriptEngine, audioManager, pluginManager])
12. 预加载 config.scripts → ScriptEngine.load()
13. 发射 game:init 事件
```

依赖规则：EventBus 最先创建；VariableStore 在 ScriptEngine 之前创建；GameLoop 最后创建，接收 `Updatable[]`。

**GameConfig 结构：**

```ts
interface GameConfig {
  canvas: HTMLCanvasElement;
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

### 3.2 GameLoop（游戏循环）

GameLoop 只管理帧时序，通过 `Updatable` 接口统一驱动各子系统。

```ts
interface Updatable {
  update(dt: number): void;
}
```

```
GameLoop
├── updatables: Updatable[]          // 构造注入的子系统列表
├── fps: number                      // 目标帧率
├── dt: number                       // 当前帧间隔（秒）
├── elapsedTime: number              // 累计运行时间
├── running: boolean                 // 暂停标志（pause 设 false，不取消 RAF）
├── rafId: number | null             // 当前 RAF 句柄
│
├── start(): void                    // 绑定 RAF，开始循环
├── stop(): void                     // 取消 RAF，重置计时器（用于 destroy）
├── pause(): void                    // 暂停更新（设置 running=false，保留 RAF）
├── resume(): void                   // 恢复更新
│
私有方法:
  private tick(timestamp: number): void
    1. 计算 dt = (timestamp - lastTimestamp) / 1000
       限制 dt 上限为 1/10（100ms），防止标签页切回后跳帧
    2. if running:
         for (const u of updatables) u.update(dt)
    3. renderer.draw()
    4. 发射 render:frame 事件
    5. rafId = requestAnimationFrame(tick)
```

**帧率控制：** fps 低于显示器刷新率时采用跳帧策略——两次渲染之间未达到 `1000/fps` 毫秒时跳过渲染，但逻辑仍按 dt 更新。默认 60 表示不跳帧。

**与 Game 的协作：** `start/stop` 用于引擎初始化/销毁，`pause/resume` 用于用户暂停/恢复。Game 的 `pause/resume/destroy` 直接委托给 GameLoop 对应方法。

UI 渲染属于 Renderer 职责（最顶层 Layer），GameLoop 层面只调用 `renderer.draw()` 即可。

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

| 事件名           | 触发时机       | 载荷                                                |
| ---------------- | -------------- | --------------------------------------------------- |
| `game:init`      | 引擎初始化完成 | `{}`                                                |
| `game:start`     | 游戏循环启动   | `{}`                                                |
| `game:pause`     | 引擎暂停       | `{}`                                                |
| `game:resume`    | 引擎恢复       | `{}`                                                |
| `game:destroy`   | 引擎销毁前     | `{}`                                                |
| `game:save`      | 存档完成       | `{ slot: number }`                                  |
| `game:load`      | 读档完成       | `{ slot: number }`                                  |
| `game:settings`  | 设置变更       | `{ key: string; value: unknown }`                   |
| `script:command` | 执行每条命令前 | `{ cmd: string; args: Record<string, unknown> }`    |
| `script:choice`  | 显示选项时     | `{ choices: Choice[] }`                             |
| `script:end`     | 脚本执行完毕   | `{}`                                                |
| `render:frame`   | 每帧渲染后     | `{ dt: number }`                                    |
| `character:show` | 角色立绘显示   | `{ id: string; position: Position }`                |
| `character:hide` | 角色立绘隐藏   | `{ id: string }`                                    |
| `bg:change`      | 背景切换       | `{ id: string; transition?: string }`               |
| `audio:play`     | 音频播放       | `{ track: string; type: 'bgm' \| 'se' \| 'voice' }` |
| `audio:stop`     | 音频停止       | `{ track: string }`                                 |

---

## 四、渲染系统

### 4.1 整体设计

Renderer 实现 `Updatable` 接口（见 §3.2），由 GameLoop 统一驱动。

```
Renderer
├── canvas: HTMLCanvasElement        // 主画布（用于获取 ctx 和尺寸）
├── ctx: CanvasRenderingContext2D    // 2D 上下文（构造时从 canvas 获取，独占管理）
├── width: number                    // 逻辑宽度（来自 GameConfig）
├── height: number                   // 逻辑高度（来自 GameConfig）
├── layers: Layer[]                  // 图层栈（按 zIndex 升序维护）
├── textureManager: TextureManager   // 纹理管理
├── effectQueue: Effect[]            // 全屏特效队列
├── dirtyRects: Rect[]               // 脏矩形列表
│
├── addLayer(layer): void
├── removeLayer(id): void
├── reorderLayer(id, newZIndex): void
├── update(dt): void                 // 更新动画/过渡/特效
├── draw(): void                     // 绘制全部图层（ctx 内部持有，无需外部传入）
└── markDirty(rect): void            // 标记脏区域
```

### 4.2 图层架构

图层不按固定编号分配，而是按 `zIndex` 排序。常用约定如下（供工厂方法使用）：

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

这些值只是约定，可通过 `addLayer()` 传入任意 `zIndex`。`reorderLayer(id, newZIndex)` 修改后数组自动重排序。

```ts
interface Layer {
  id: string;
  zIndex: number;
  visible: boolean;
  opacity: number; // 0-1
  offscreen: OffscreenCanvas | null; // 静态缓存（对于静态层可预先创建）
  dirty: boolean; // 是否需要重绘到 offscreen

  addSprite(sprite: Sprite): void;
  removeSprite(id: string): void;

  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}
```

`addSprite`/`removeSprite` 内部自动标记 `dirty = true` 并触发缓存失效，外部不直接操作 sprite 数组。

### 4.3 Sprite（精灵）

```ts
interface Sprite {
  id: string;
  texture: Texture;
  x: number;
  y: number;
  width: number; // 画布上基准宽度（首次 setTexture 时默认赋值为纹理宽度）
  height: number; // 画布上基准高度
  opacity: number;
  scale: { x: number; y: number }; // 额外缩放系数
  rotation: number;
  anchor: { x: number; y: number }; // 锚点 0-1，原点在左上角
  effects: Effect[]; // 精灵级特效（抖动、呼吸等）
  transition: Transition | null; // 入场/退场过渡

  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  setTexture(texture: Texture): void;
  moveTo(x: number, y: number, duration: number, easing: EasingFn): void;
  fadeTo(opacity: number, duration: number): void;
}
```

**尺寸公式：** 最终绘制宽高 = `width × scale.x`、`height × scale.y`。当纹理来自图集时，根据 `Texture.frame` 裁剪源区域；`width`/`height` 默认等于 `frame.w`/`frame.h` 或纹理本身尺寸。

**精灵特效：** 与 Renderer 的全屏特效共用同一 `Effect` 接口（`update(dt)` + `draw(ctx)`），只是挂载位置不同——挂在 Sprite.effects 上的作用域为该精灵，挂在 Renderer.effectQueue 上的为全画面。

### 4.4 TextureManager（纹理管理）

纹理缓存只有一份，存放于 TextureManager。ResourceManager（见 §6）是加载调度门面，`ResourceManager.loadImage()` 内部委托 AssetLoader 加载 → 创建 Texture → 存入 TextureManager.cache，自身不冗余缓存已解码纹理。

```
TextureManager
├── cache: Map<string, Texture>   // 一级缓存：可渲染的纹理对象（LRU 淘汰）
│
├── get(id: string): Texture | null
├── set(id: string, texture: Texture): void
├── unload(id: string): void
└── createAtlas(images: ImageInfo[]): TextureAtlas
```

ResourceManager 的 `ResourceCache`（§6.3）是二级缓存，仅缓存原始二进制数据（ArrayBuffer），不缓存 Texture 对象。

```ts
interface Texture {
  id: string;
  source: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
  // 图集子区域（如果是图集中的一部分）
  frame?: { x: number; y: number; w: number; h: number };
}
```

**性能策略：**

- 使用 `ImageBitmap` + `createImageBitmap()` 异步解码，避免主线程阻塞
- 纹理图集（Texture Atlas）：将多张小图合并为一张大图，减少绘制调用
- LRU 缓存淘汰：限制内存占用上限（如 512MB），超出时卸载最久未用的纹理

### 4.5 渲染管线

Renderer 支持两种渲染模式，根据是否有脏矩形自动切换：

**模式 A — 全帧模式**（`dirtyRects.length === 0`，适用于动态场景）：

```
draw():
  1. ctx.clearRect(0, 0, width, height)
  2. 遍历 layers (zIndex 升序):
     if layer.visible:
       if layer.offscreen && !layer.dirty:
         → ctx.drawImage(layer.offscreen, 0, 0)   // 缓存命中
       else:
         → layer.draw(ctx)                          // 重绘，并可选更新 offscreen
  3. 遍历 effectQueue:
     → effect.draw(ctx)                             // 叠加全屏特效
  4. 发射 render:frame 事件
```

**模式 B — 脏矩形模式**（`dirtyRects.length > 0`，适用于静态对话/微动场景）：

```
draw():
  1. 合并重叠脏矩形
  2. ctx.save()
  3. 裁剪到合并后的脏区域
  4. 同模式 A 的步骤 2-3（仅绘制与脏区域相交的 Layer/Effect）
  5. ctx.restore()
  6. 清空 dirtyRects
  7. 发射 render:frame 事件
```

模式 B 不执行 `clearRect`——上一帧内容保留在画布上，只重绘变化区域。

### 4.6 转场/过渡系统

过渡作用在单个 Sprite 上，通过 `progress` 驱动渲染属性变化。

```ts
type EasingFn = (t: number) => number; // t ∈ [0, 1]

interface Transition {
  type: 'fade' | 'slide' | 'zoom' | 'wipe' | 'pixelate' | 'custom';
  duration: number; // 毫秒
  easing: EasingFn;
  direction?: 'left' | 'right' | 'up' | 'down';
  onComplete?: () => void;

  update(dt: number): void; // 内部累加 progress
  isComplete(): boolean;
  apply(ctx: CanvasRenderingContext2D, sprite: Sprite): void;
}
```

`progress` 由 `update(dt)` 内部维护私有字段，不公开。外部通过 `isComplete()` 判断是否结束。`apply(ctx, sprite)` 根据 `type` 和 `progress` 修改 sprite 的渲染属性（opacity、x、y、scale）后绘制。

**示例：** 角色入场时 Sprite 挂载一个 `fade` Transition（opacity: 0→1）；退场时挂载 `fade`（1→0）。入退场各用一个 Transition，不共享 from/to。

**内置转场效果：**

| 类型       | 说明                          |
| ---------- | ----------------------------- |
| `fade`     | 淡入淡出                      |
| `slide`    | 滑动（上下左右）              |
| `zoom`     | 缩放切换                      |
| `wipe`     | 擦除（直线/圆形/百叶窗）      |
| `pixelate` | 像素化溶解                    |
| `custom`   | 自定义绘制函数（drawFn 回调） |

### 4.7 脏矩形优化

```
标记脏区域:
  Sprite.moveTo / fadeTo / setTexture 调用时
    → 计算 Sprite 在画布上的包围盒
    → 调用 Renderer.markDirty(rect)

  Layer.addSprite / removeSprite 时
    → 调用 Renderer.markDirty(spriteRect)
```

脏矩形仅在模式 B 生效（见 §4.5）。

### 4.8 文字渲染

文字渲染是视觉小说中最频繁的操作之一。采用帧驱动状态机，而非 Promise/await。

```ts
class TextRenderer {
  fullText: string;
  speed: number; // 毫秒/字
  currentCharCount: number; // 当前已显示字数
  elapsed: number; // 累计毫秒
  isComplete: boolean;

  constructor(text: string, speed: number);

  update(dt: number): void; // elapsed += dt; currentCharCount = min(fullText.length, floor(elapsed / speed))
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void; // 只绘制 fullText.slice(0, currentCharCount)

  complete(): void; // 直接跳到全量（跳过打字动画）
  // 静态工具
  static parseRichText(text: string): RichTextToken[];
}
```

DialogueBox 组件持有 TextRenderer 实例，每帧调用 `update(dt)` → `draw(ctx)`。完成时 `isComplete === true`，此时用户点击继续。

**文字性能优化：**

- 预测量：首次 `draw()` 时计算所有字的位置并缓存到 `glyphPositions: Array<{x, y}>`，避免逐帧重复测量
- 离屏缓存：已完成显示的行绘制到离屏 Canvas，每次只绘制新增加的字符
- 字间距/行间距预设，减少运行时计算

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

Parser 不负责文件加载（由 ResourceManager / ScriptEngine 处理），保持单一职责：`string → Script`。

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
  3. 流程命令（@if/@switch/@jump/@call/@return）由 Interpreter 内部直接处理，
     不经过 CommandRegistry
  4. 其余命令 → 执行 CommandRegistry.execute(cmd, context)
  5. pc++
  6. 若 pc >= commands.length → 触发 script:end

等待类命令（@say, @choice）执行后:
  state → 'waiting'
  等待用户点击/选择 → state → 'running' → 继续 step()
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

| 分类 | 命令                                            | 说明                  |
| ---- | ----------------------------------------------- | --------------------- |
| 背景 | `@bg`                                           | 切换背景（支持转场）  |
| 角色 | `@show`, `@hide`, `@move`                       | 角色显示/隐藏/移动    |
| 立绘 | `@sprite`                                       | 切换角色立绘表情/服装 |
| 对话 | `@say` 或直接 `角色名 "文本"`                   | 显示对话              |
| 音频 | `@playBgm`, `@stopBgm`, `@playSe`, `@playVoice` | 音频控制              |
| 选项 | `@choice`                                       | 显示选项分支          |
| 变量 | `@set`, `@add`, `@mul`, `@random`               | 变量操作              |
| 旗标 | `@flag`, `@unflag`                              | 旗标操作              |
| 特效 | `@shake`, `@flash`, `@snow`, `@rain`            | 画面特效              |
| 系统 | `@wait`, `@end`, `@label`, `@comment`           | 系统命令              |

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

ResourceManager 是资源加载的门面，协调 AssetLoader（网络加载）、TextureManager（纹理缓存）、Parser（脚本解析）和 EventBus（进度通知）。

```
ResourceManager
├── eventBus: EventBus               // 事件总线（发射 resource:progress / resource:ready）
├── assetLoader: AssetLoader         // 网络加载器
├── textureManager: TextureManager   // 纹理一级缓存（构造注入）
├── cache: ResourceCache             // 二级缓存：原始 AudioBuffer 和 Script 对象
├── manifest: AssetManifest          // 资源清单
├── preloader: Preloader             // 场景/分组预加载器
│
├── loadImage(id: string): Promise<Texture>
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
  2. 大图（>2048px 任一维度）→ assetLoader.loadImageBitmap(url)
     小图 → assetLoader.loadImage(url)
  3. 创建 Texture { id, source, width, height }
  4. textureManager.set(id, texture)
  5. 发射 resource:progress

loadAudio(id):
  1. url = manifest.audio[id]
  2. arrayBuffer = assetLoader.loadAudio(url)
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

```
AssetLoader
├── maxConcurrency: number   // 最大并发数，默认 6
├── maxRetries: number       // 失败重试次数，默认 3
├── timeoutMs: number        // 超时毫秒，默认 30000
│
├── loadImage(url: string): Promise<HTMLImageElement>
├── loadImageBitmap(url: string): Promise<ImageBitmap>  // 异步解码
├── loadAudio(url: string): Promise<ArrayBuffer>
├── loadScript(url: string): Promise<string>
│
并发控制:
  - 最大并发数: 6（浏览器 HTTP/2 推荐值）
  - 超出并发上限的请求进入等待队列，先进先出
  - 失败重试: 3 次，指数退避
  - 超时: 30 秒
```

构造时接受 `AssetLoaderConfig`（`{ maxConcurrency?, maxRetries?, timeoutMs? }`），由 ResourceManager 初始化时传入或使用默认值。

**ImageBitmap 优势：**

- 在 Worker 线程中解码，不阻塞主线程
- 零拷贝传输（Transferable）
- 适合大尺寸 CG/背景图（>2048px 任一维度自动选用）

### 6.3 ResourceCache（LRU 缓存）

二级缓存，存放已解码的 AudioBuffer 和已解析的 Script 对象（Texture 由 TextureManager 缓存，不在此处）。

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

## 八、UI 系统（Canvas 绘制）

### 8.1 设计思路

UI 完全由 Canvas 绘制，不依赖 DOM 元素。UI 组件树挂载在 UI Layer（§4.2，zIndex=600）上，Layer 的 `update(dt)` / `draw(ctx)` 递归遍历组件树。

```ts
interface UIComponent {
  id: string;
  x: number; // 相对父组件原点的坐标
  y: number;
  width: number;
  height: number;
  visible: boolean;
  children: UIComponent[];

  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;

  // 命中测试：将绝对画布坐标转为相对坐标后递归检测
  hitTest(px: number, py: number): UIComponent | null;
  onClick(px: number, py: number): void;
  onHover(px: number, py: number): void;

  // 工具方法（由工具函数模块提供实现，不在 interface 内要求 class 实现）
  getAbsoluteX(): number; // 递归累加：this.x + parent.getAbsoluteX()
  getAbsoluteY(): number;
}
```

**坐标体系：** 绝对坐标 = 自身 x/y + 父组件绝对坐标。`draw(ctx)` 中通过 `ctx.translate(this.x, this.y)` 建立相对坐标系，子组件在父组件原点内绘制。`hitTest(px, py)` 传入绝对画布坐标，内部转为相对坐标后递归遍历 children 从顶到底（z 序）检测。

**共享逻辑：** children 递归遍历、绝对坐标计算等公共逻辑放入工具函数模块（如 `ui/utils.ts`），各组件直接调用函数，不依赖基类继承。

### 8.2 内置 UI 组件

核心组件接口：

```ts
interface DialogueBox extends UIComponent {
  show(speaker: string, text: string): void; // 开始逐字显示
  hide(): void;
  isAnimating(): boolean; // 打字动画是否进行中
  complete(): void; // 跳过动画，显示全文
  textRenderer: TextRenderer; // §4.8 的打字机实例
}

interface ChoicePanel extends UIComponent {
  showChoices(choices: Choice[]): void; // §5.6 的 Choice 类型
  hide(): void;
  onSelect: (index: number, choice: Choice) => void;
}

interface SaveLoadSlot extends UIComponent {
  slot: number;
  isEmpty: boolean;
  thumbnail: string | null; // base64 缩略图
  slotLabel: string;
  timestamp: number | null;
  onClick(): void; // 触发存档/读档
}

interface ConfirmDialog extends UIComponent {
  show(message: string, onConfirm: () => void, onCancel?: () => void): void;
  hide(): void;
}
```

其他通用控件（列表说明）：

| 组件          | 说明                                 |
| ------------- | ------------------------------------ |
| `TextButton`  | 文本按钮（hover/click/press 状态）   |
| `ImageButton` | 图片按钮                             |
| `Slider`      | 滑动条（音量/速度调节）              |
| `Toggle`      | 开关（全屏/自动模式等）              |
| `ScrollView`  | 滚动视图容器（含遮罩裁剪和滚动偏移） |

### 8.3 输入事件分发

InputManager 由 Game 持有，在 init 时创建（Renderer 之后、AudioManager 之前）。

```
Canvas DOM 事件 → InputManager.dispatch(event)
  → toLogicalCoords(clientX, clientY)   // CSS像素 → 逻辑像素
  → uiRoot.hitTest(logicalX, logicalY)  // 递归命中测试（从顶到底）
    → 命中 → 调用 component.onClick(relX, relY)
    → 未命中 → 发射 input:click 事件（全局命令：如点击继续对话）
  → 发射 input:hover 事件
```

```ts
class InputManager {
  canvas: HTMLCanvasElement;
  eventBus: EventBus;
  uiRoot: UIComponent | null; // UI Layer 初始化后设置

  setUIRoot(root: UIComponent): void; // 由 Game 在 UI Layer 就绪后调用

  private onMouseMove(e: MouseEvent): void;
  private onMouseDown(e: MouseEvent): void;
  private onMouseUp(e: MouseEvent): void;
  private onTouchStart(e: TouchEvent): void;

  // CSS像素 → 逻辑像素（需根据 scaleMode 和容器尺寸换算）
  private toLogicalCoords(
    clientX: number,
    clientY: number,
  ): { x: number; y: number };
}
```

`toLogicalCoords` 依赖 `scaleMode` 和 canvas 的 CSS 尺寸 vs 逻辑尺寸的比值。坐标转换逻辑与 Renderer 共享同一换算参数，避免重复计算。

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
| GameLoop      | 累计游玩时间      | `elapsedTime` 字段 |

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
  2. 生成缩略图：renderer.draw() → canvas.toBlob()（Blob 直接存，无需 base64）
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
     e. scriptEngine.load(snapshot.currentScript, snapshot.scriptPC)
  5. engine.resume()
  6. eventBus.emit('game:loaded', { slot })
```

读档的资源预加载优先走缓存（TextureManager. cache, ResourceManager.cache），命中则跳过网络请求。版本迁移由 `migrate(saveData)` 工具函数处理，按版本号逐级转换数据格式。

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

PluginManager 实现 `Updatable`，在 `update(dt)` 中遍历已安装插件并调用其 `update?()`。

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

| 扩展点   | 接入方式                     | 用途           |
| -------- | ---------------------------- | -------------- |
| 命令     | `CommandRegistry.register()` | 自定义脚本命令 |
| 转场     | 实现 `Transition` 接口       | 自定义转场效果 |
| 特效     | 实现 `Effect` 接口           | 自定义画面特效 |
| UI组件   | 实现 `UIComponent` 接口      | 自定义 UI 控件 |
| 事件监听 | `EventBus.on()`              | 监听引擎事件   |
| 逐帧更新 | Plugin 实现 `update(dt)`     | 插件逐帧逻辑   |

---

## 十一、性能优化策略汇总

| 策略                      | 说明                                          | 适用场景               |
| ------------------------- | --------------------------------------------- | ---------------------- |
| **离屏Canvas缓存**        | 静态图层绘制到 OffscreenCanvas，帧间直接 blit | 背景、静止角色         |
| **脏矩形刷新**            | 仅重绘变化区域                                | 对话框打字、小范围动画 |
| **ImageBitmap**           | Worker 线程异步解码图片                       | 大尺寸 CG 加载         |
| **纹理图集**              | 合并小图减少 drawImage 调用                   | 立绘表情切换           |
| **对象池**                | 复用 SE 音轨、粒子对象                        | 高频创建/销毁          |
| **LRU 缓存**              | 限制纹理/音频内存占用                         | 长剧本、多资源         |
| **requestAnimationFrame** | 与浏览器刷新率同步                            | 游戏循环               |
| **deltaTime 上限**        | 防止标签页返回后跳帧                          | 所有帧逻辑             |
| **Web Worker**            | 脚本解析、资源批量加载在 Worker 执行          | 初始化/场景切换        |
| **懒加载**                | 按章节/场景预加载，不一次性加载全部           | 大型项目               |

---

## 十二、目录结构

```
src/
├── core/                          # 核心系统
│   ├── Game.ts                    # 游戏主类
│   ├── GameLoop.ts                # 游戏循环
│   ├── EventBus.ts                # 事件总线
│   └── PluginManager.ts           # 插件管理器
│
├── renderer/                      # 渲染系统
│   ├── Renderer.ts                # 渲染器（图层管理）
│   ├── Layer.ts                   # 图层
│   ├── Sprite.ts                  # 精灵
│   ├── TextureManager.ts          # 纹理管理
│   ├── Texture.ts                 # 纹理封装
│   ├── TextRenderer.ts            # 文字渲染（逐字显示）
│   ├── transitions/               # 转场效果
│   │   ├── Transition.ts          # 转场基类
│   │   ├── FadeTransition.ts
│   │   ├── SlideTransition.ts
│   │   └── WipeTransition.ts
│   └── effects/                   # 画面特效
│       ├── Effect.ts              # 特效基类
│       ├── ShakeEffect.ts
│       ├── FlashEffect.ts
│       └── ParticleEffect.ts
│
├── script/                        # 脚本系统
│   ├── grammar.pegjs              # Peggy 文法定义（VNScript 语法权威来源）
│   ├── parser.js                  # 自动生成（Peggy 编译 grammar.pegjs 输出）
│   ├── parser.d.ts                # 生成解析器的 TypeScript 类型声明
│   ├── Parser.ts                  # 薄封装层，调用 parser.parse() 返回 Script
│   ├── ScriptEngine.ts            # 脚本引擎（Parser + Interpreter 门面）
│   ├── VariableStore.ts            # 变量与旗标存储
│   ├── Interpreter.ts             # 脚本解释器
│   ├── CommandRegistry.ts         # 命令注册表
│   └── commands/                  # 内置命令实现
│       ├── CommandBase.ts         # 命令基类
│       ├── BgCommand.ts
│       ├── ShowCommand.ts
│       ├── HideCommand.ts
│       ├── SayCommand.ts
│       ├── ChoiceCommand.ts
│       ├── AudioCommand.ts
│       └── VariableCommand.ts
│
├── audio/                         # 音频系统
│   ├── AudioManager.ts            # 音频管理器
│   ├── AudioTrack.ts              # 音轨
│   └── AudioTrackPool.ts          # 音轨池
│
├── resource/                      # 资源管理
│   ├── ResourceManager.ts         # 资源管理器
│   ├── AssetLoader.ts             # 资源加载器
│   ├── ResourceCache.ts           # LRU缓存
│   └── Preloader.ts               # 预加载器
│
├── ui/                            # Canvas UI组件
│   ├── UIComponent.ts             # UI组件基类
│   ├── DialogueBox.ts             # 对话框
│   ├── ChoicePanel.ts             # 选项面板
│   ├── SaveLoadMenu.ts            # 存档/读档菜单
│   ├── SettingsMenu.ts            # 设置菜单
│   ├── HistoryView.ts             # 对话历史
│   ├── TextButton.ts              # 文本按钮
│   ├── Slider.ts                  # 滑动条
│   └── ConfirmDialog.ts           # 确认弹窗
│
├── input/                         # 输入管理
│   └── InputManager.ts            # 输入事件分发
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
│   ├── rect.ts                    # 矩形工具（合并/相交）
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
requestAnimationFrame(tick)
  → GameLoop.update(dt)
    → Renderer.update(dt)
      → 各 Layer 的 Sprite/Transition/Effect 更新
      → UI 组件更新
    → AudioManager.update(dt)    // 淡入淡出
    → PluginManager 各插件 update
  → GameLoop.render()
    → Renderer.draw(ctx)
      → 图层遍历绘制
      → UI 遍历绘制
      → 特效叠加
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
      → 生成缩略图（canvas.toBlob()）
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
      → scriptEngine.load(snapshot.currentScript, snapshot.scriptPC)
      → engine.resume()
      → EventBus 发送 'game:loaded'
```

---

## 十四、关键类型定义

### 14.1 引擎核心类型

```ts
// types/engine.ts

interface GameConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  scaleMode: 'fit' | 'stretch' | 'fixed';
  fps: number;
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
  'script:choice': { choices: Choice[] };
  'script:say': { speaker: string; text: string };
  'script:end': {};
  'render:frame': { dt: number };
  'character:show': { id: string; position: Position };
  'character:hide': { id: string };
  'bg:change': { id: string; transition?: string };
  'audio:play': { id: string; type: 'bgm' | 'se' | 'voice' };
  'audio:stop': { type: 'bgm' | 'se' | 'voice' };
  'game:save': { slot: number };
  'game:load': { slot: number };
  'game:pause': {};
  'game:resume': {};
  'input:click': { x: number; y: number };
  'input:hover': { x: number; y: number };
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

- [x] Canvas 渲染管线（图层 + 精灵 + 纹理）
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
- [ ] WebGL 渲染后端（着色器特效）
- [ ] 脚本热重载（HMR）
- [ ] 性能分析面板（DevTools）

---

## 十六、设计决策记录

| 决策     | 选择               | 原因                                 |
| -------- | ------------------ | ------------------------------------ |
| 渲染方案 | Canvas 2D          | 兼容性好，API 成熟；后续可升级 WebGL |
| 文字方案 | Canvas fillText    | 避免 DOM-vs-Canvas 分层同步问题      |
| UI 方案  | Canvas 自绘        | 帧同步一致，无 DOM 布局抖动          |
| 音频方案 | Web Audio API      | 精确控制，多音轨混音                 |
| 脚本格式 | 自定义 `.vns`      | 简洁，面向 VN 场景优化               |
| 状态管理 | 引擎内置 GameState | 框架无关，可直接序列化               |
| 通信方式 | EventBus           | 模块解耦，可测试                     |
| 资源解码 | ImageBitmap        | 异步，不阻塞主线程                   |
| 存档格式 | JSON + IndexedDB   | 可读可迁移，容量大                   |
| 模块化   | 引擎纯 TS          | 可测试，可移植                       |

---

_本文档为 VNEngine 架构设计初始版本，随开发迭代持续更新。_
