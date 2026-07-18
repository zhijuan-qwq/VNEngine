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
│ │ Effect    │  │ Variable  │  │           │  │           │ │
│ │ UI绘制    │  │ Flow控制  │  │           │  │           │ │
│ └───────────┘  └───────────┘  └───────────┘  └───────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Save/Load System (序列化/反序列化)          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 分层说明

| 层级 | 职责 | 依赖关系 |
|------|------|----------|
| **引擎 Core** | 游戏循环、渲染、脚本执行、音频、资源、存档 | 框架无关，可独立运行 |
| **平台适配层** | Canvas DOM 挂载、输入事件绑定、文件系统访问 | 连接 Core 与浏览器环境 |

---

## 三、核心系统设计

### 3.1 Game（游戏主控）

```
Game
├── canvas: HTMLCanvasElement        // 主画布
├── ctx: CanvasRenderingContext2D    // 2D 上下文
├── loop: GameLoop                   // 游戏循环
├── eventBus: EventBus               // 事件总线
├── renderer: Renderer               // 渲染器
├── script: ScriptEngine             // 脚本引擎
├── audio: AudioManager              // 音频管理
├── resource: ResourceManager        // 资源管理
├── plugins: PluginManager           // 插件管理
├── state: GameState                 // 游戏状态快照
│
├── init(config: GameConfig): void   // 初始化引擎
├── start(): void                    // 启动游戏循环
├── pause(): void                    // 暂停
├── resume(): void                   // 恢复
├── destroy(): void                  // 销毁
├── loadScript(url: string): void    // 加载脚本
├── save(slot: number): SaveData     // 存档
└── load(slot: number): void         // 读档
```

**GameConfig 结构：**

```ts
interface GameConfig {
  canvas: HTMLCanvasElement
  width: number          // 逻辑宽度 (如 1280)
  height: number         // 逻辑高度 (如 720)
  scaleMode: 'fit' | 'stretch' | 'fixed'
  fps: number            // 目标帧率，默认 60
  scripts: string[]      // 预加载脚本列表
  assets: AssetManifest  // 资源清单
  plugins: Plugin[]      // 插件列表
}
```

### 3.2 GameLoop（游戏循环）

```
GameLoop
├── fps: number                     // 目标帧率
├── deltaTime: number               // 帧间隔(秒)
├── elapsedTime: number             // 累计时间
├── running: boolean                // 运行状态
│
├── start(): void                   // 启动 RAF 循环
├── stop(): void                    // 停止循环
│
内部循环流程:
  tick(timestamp):
    1. 计算 deltaTime（限制最大值防止跳帧）
    2. update(deltaTime)            // 逻辑更新
       ├── script.update(dt)        // 脚本步进
       ├── renderer.update(dt)      // 动画/过渡更新
       ├── audio.update(dt)         // 音频淡入淡出
       └── plugins.update(dt)       // 插件更新
    3. render()                     // 渲染帧
       └── renderer.draw(ctx)
    4. requestAnimationFrame(tick)
```

**性能要点：**
- `deltaTime` 上限设为 `1/15`（约 66ms），避免标签页切回后跳帧
- `update` 和 `render` 解耦：渲染跟不上时可以降帧但不影响逻辑

### 3.3 EventBus（事件总线）

```
EventBus（发布/订阅模式）
├── listeners: Map<string, Set<Handler>>
│
├── on(event, handler): void
├── off(event, handler): void
├── once(event, handler): void
├── emit(event, ...args): void
└── clear(): void
```

**核心事件定义：**

| 事件名 | 触发时机 | 载荷 |
|--------|----------|------|
| `script:command` | 执行每条命令前 | `{ cmd, args }` |
| `script:choice` | 显示选项时 | `{ choices[] }` |
| `script:end` | 脚本执行完毕 | — |
| `render:frame` | 每帧渲染后 | `{ deltaTime }` |
| `character:show` | 角色立绘显示 | `{ id, position }` |
| `character:hide` | 角色立绘隐藏 | `{ id }` |
| `bg:change` | 背景切换 | `{ id, transition }` |
| `audio:play` | 音频播放 | `{ track, type }` |
| `audio:stop` | 音频停止 | `{ track }` |
| `game:save` | 存档 | `{ slot, data }` |
| `game:load` | 读档 | `{ slot, data }` |
| `game:settings` | 设置变更 | `{ key, value }` |

---

## 四、渲染系统

### 4.1 整体设计

```
Renderer
├── layers: Layer[]                 // 图层栈（从底到顶）
├── textureManager: TextureManager  // 纹理管理
├── effectQueue: Effect[]           // 特效队列
├── dirtyRects: Rect[]              // 脏矩形列表
│
├── addLayer(layer): void
├── removeLayer(id): void
├── reorderLayer(id, index): void
├── update(dt): void                // 更新动画/过渡
├── draw(ctx): void                 // 绘制全部图层
└── markDirty(rect): void           // 标记脏区域
```

### 4.2 图层架构

```
图层渲染顺序（从底到顶）:
┌────────────────────┐
│  Layer 0: BG       │  背景层（静态离屏Canvas缓存）
├────────────────────┤
│  Layer 1: CG       │  CG层（全屏插画，遮挡背景）
├────────────────────┤
│  Layer 2: Middle   │  中间景层（远景人物/物体）
├────────────────────┤
│  Layer 3: Chara L  │  角色层-左
├────────────────────┤
│  Layer 4: Chara C  │  角色层-中
├────────────────────┤
│  Layer 5: Chara R  │  角色层-右
├────────────────────┤
│  Layer 6: Fore     │  前景层（近景遮挡物）
├────────────────────┤
│  Layer 7: Effect   │  特效层（粒子、转场）
├────────────────────┤
│  Layer 8: UI       │  UI层（对话框、选项、菜单）
└────────────────────┘
```

```ts
interface Layer {
  id: string
  zIndex: number
  visible: boolean
  opacity: number          // 0-1
  offscreen: OffscreenCanvas | null  // 静态缓存
  dirty: boolean           // 是否需要重绘
  sprites: Sprite[]        // 该层精灵列表

  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
}
```

### 4.3 Sprite（精灵）

```ts
class Sprite {
  id: string
  texture: Texture              // 纹理引用
  x: number                     // 位置
  y: number
  width: number
  height: number
  opacity: number               // 0-1
  scale: { x: number; y: number }
  rotation: number
  anchor: { x: number; y: number }  // 锚点（0-1）
  effects: SpriteEffect[]       // 精灵特效（抖动、呼吸等）
  transition: Transition | null // 过渡动画

  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  setTexture(texture: Texture, transition?: Transition): void
  moveTo(x: number, y: number, duration: number, easing: EasingFn): void
  fadeTo(opacity: number, duration: number): void
}
```

### 4.4 TextureManager（纹理管理）

```
TextureManager
├── cache: Map<string, Texture>   // 纹理缓存
├── atlas: TextureAtlas | null    // 纹理图集
│
├── load(src: string): Promise<Texture>
├── get(id: string): Texture | null
├── unload(id: string): void
├── preload(urls: string[]): Promise<void>
└── createAtlas(images: ImageInfo[]): TextureAtlas
```

```ts
interface Texture {
  id: string
  source: HTMLImageElement | ImageBitmap
  width: number
  height: number
  // 图集子区域（如果是图集中的一部分）
  frame?: { x: number; y: number; w: number; h: number }
}
```

**性能策略：**
- 使用 `ImageBitmap` + `createImageBitmap()` 异步解码，避免主线程阻塞
- 纹理图集（Texture Atlas）：将多张小图合并为一张大图，减少绘制调用
- LRU 缓存淘汰：限制内存占用上限（如 512MB），超出时卸载最久未用的纹理

### 4.5 渲染管线

```
每帧渲染流程:
  renderer.draw(ctx):
    1. ctx.clearRect(0, 0, width, height)
    2. if 背景层 dirty:
         → 绘制到离屏Canvas
         → 标记 clean
    3. 遍历 layers (zIndex 升序):
       if layer.visible:
         if layer.offscreen && !layer.dirty:
           → 直接 drawImage(offscreen)   // 缓存命中
         else:
           → layer.draw(ctx)             // 重绘
    4. 遍历 effectQueue:
       → effect.draw(ctx)                // 叠加特效
    5. 触发 render:frame 事件
```

### 4.6 转场/过渡系统

```ts
type EasingFn = (t: number) => number   // t ∈ [0, 1]

interface Transition {
  type: 'fade' | 'slide' | 'zoom' | 'wipe' | 'pixelate' | 'custom'
  duration: number                       // 毫秒
  easing: EasingFn
  progress: number                       // 0-1
  direction?: 'left' | 'right' | 'up' | 'down'
  onComplete?: () => void

  update(dt: number): void
  apply(ctx: CanvasRenderingContext2D, from: Sprite, to: Sprite): void
}
```

**内置转场效果：**
| 类型 | 说明 |
|------|------|
| `fade` | 淡入淡出 |
| `slide` | 滑动（上下左右） |
| `zoom` | 缩放切换 |
| `wipe` | 擦除（直线/圆形/百叶窗） |
| `pixelate` | 像素化溶解 |
| `custom` | 自定义着色器 |

### 4.7 脏矩形优化

```
渲染优化 — 仅重绘变化区域:
  renderer 维护 dirtyRects 列表
  update 阶段:
    sprite 移动/变化 → 标记包围盒为脏
  draw 阶段:
    1. 合并重叠脏矩形
    2. ctx.save() → 裁剪到脏区域 → 绘制 → ctx.restore()
    3. 清空脏矩形列表

适用场景:
  - 对话框文字逐字显示（仅刷新对话框区域）
  - 角色微动动画（仅刷新角色区域）
```

### 4.8 文字渲染

文字渲染是视觉小说中最频繁的操作之一，需要专门优化。

```ts
class TextRenderer {
  // 逐字显示
  static async typewriter(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number, y: number,
    maxWidth: number,
    lineHeight: number,
    speed: number,           // 毫秒/字
    onComplete?: () => void
  ): Promise<void>

  // 富文本支持（颜色、加粗、振动、ruby注音等标签）
  static parseRichText(text: string): RichTextToken[]
}
```

**文字性能优化：**
- 预测量：提前计算文字宽度，避免逐字测量
- 离屏缓存：已显示完的静态文字绘制到离屏 Canvas
- 字间距/行间距预设，减少计算

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

```
Parser
├── parse(source: string): Script       // 文本 → AST
├── parseFile(url: string): Promise<Script>
│
内部流程:
  1. Tokenizer: 词法分析，按行分割 → Token流
  2. 语法分析: Token流 → Command AST节点
  3. 标签解析: 收集 @label → LabelMap
  4. 验证: 检查跳转目标存在性
```

```ts
interface Script {
  name: string
  commands: Command[]
  labels: Map<string, number>   // 标签名 → 命令索引
  metadata: ScriptMetadata
}

interface Command {
  type: string                  // 命令类型
  args: Record<string, any>     // 参数
  line: number                  // 源文件行号
}
```

### 5.4 Interpreter（解释器）

```
Interpreter
├── script: Script              // 当前脚本
├── pc: number                  // 程序计数器（命令索引）
├── variables: Map<string, any> // 变量表
├── flags: Set<string>          // 旗标集合
├── callStack: number[]         // 调用栈（用于 @call/@return）
├── state: 'idle' | 'running' | 'waiting' | 'paused'
│
├── load(script: Script): void
├── step(): void                // 执行下一条命令
├── jump(label: string): void
├── call(label: string): void
├── return(): void
├── setVar(name: string, value: any): void
├── getVar(name: string): any
├── checkFlag(name: string): boolean
└── on(event, handler): void    // 等待事件（如点击继续）
```

**命令执行流程：**

```
step():
  1. 获取 commands[pc]
  2. 若 state === 'waiting' 且未收到继续信号 → 跳过
  3. 执行 CommandRegistry.execute(cmd, context)
  4. pc++
  5. 若 pc >= commands.length → 触发 script:end

等待类命令（@say, @choice）执行后:
  state → 'waiting'
  等待用户点击/选择 → state → 'running' → 继续 step()
```

### 5.5 CommandRegistry（命令注册表）

```ts
interface CommandHandler {
  name: string
  execute(ctx: ScriptContext, args: Record<string, any>): void | Promise<void>
  undo?(ctx: ScriptContext): void       // 用于回滚
}

class CommandRegistry {
  private commands: Map<string, CommandHandler>

  register(handler: CommandHandler): void
  unregister(name: string): void
  execute(ctx: ScriptContext, cmd: Command): void | Promise<void>
}
```

**内置命令清单：**

| 分类 | 命令 | 说明 |
|------|------|------|
| 背景 | `@bg` | 切换背景（支持转场） |
| 角色 | `@show`, `@hide`, `@move` | 角色显示/隐藏/移动 |
| 立绘 | `@sprite` | 切换角色立绘表情/服装 |
| 对话 | `@say` 或直接 `角色名 "文本"` | 显示对话 |
| 音频 | `@playBgm`, `@stopBgm`, `@playSe`, `@playVoice` | 音频控制 |
| 选项 | `@choice` | 显示选项分支 |
| 流程 | `@jump`, `@call`, `@return`, `@if`, `@else`, `@endif` | 流程控制 |
| 变量 | `@set`, `@add`, `@mul`, `@random` | 变量操作 |
| 旗标 | `@flag`, `@unflag` | 旗标操作 |
| 特效 | `@shake`, `@flash`, `@snow`, `@rain` | 画面特效 |
| 系统 | `@wait`, `@end`, `@label`, `@comment` | 系统命令 |

### 5.6 自定义命令扩展示例

```ts
// 在插件中注册新命令
game.plugins.register('my-plugin', {
  install(engine) {
    engine.script.commandRegistry.register({
      name: '@shaketext',
      execute(ctx, args) {
        const duration = args.duration ?? 500
        engine.renderer.addEffect(new ShakeEffect(duration))
      }
    })
  }
})
```

---

## 六、资源管理系统

### 6.1 整体架构

```
ResourceManager
├── loader: AssetLoader          // 资源加载器
├── cache: ResourceCache         // LRU 缓存
├── preloader: Preloader         // 预加载器
├── manifest: AssetManifest      // 资源清单
│
├── loadImage(id: string): Promise<Texture>
├── loadAudio(id: string): Promise<AudioBuffer>
├── loadScript(id: string): Promise<Script>
├── loadGroup(group: string): Promise<void>     // 按包加载
├── preloadScene(label: string): Promise<void>  // 按场景预加载
├── getProgress(): { loaded: number; total: number; percent: number }
└── clear(): void
```

### 6.2 AssetLoader（资源加载器）

```
AssetLoader
├── loadImage(url: string): Promise<HTMLImageElement>
├── loadImageBitmap(url: string): Promise<ImageBitmap>  // 异步解码
├── loadAudio(url: string): Promise<ArrayBuffer>
├── loadScript(url: string): Promise<string>
│
并发控制:
  - 最大并发数: 6 (浏览器HTTP/2推荐)
  - 失败重试: 3次，指数退避
  - 超时: 30秒
```

**ImageBitmap 优势：**
- 在 Worker 线程中解码，不阻塞主线程
- 零拷贝传输（Transferable）
- 适合大尺寸 CG/背景图

### 6.3 ResourceCache（LRU 缓存）

```ts
class ResourceCache<T> {
  private maxSize: number          // 字节上限
  private currentSize: number
  private cache: Map<string, CacheEntry<T>>

  get(id: string): T | null
  set(id: string, value: T, size: number): void
  has(id: string): boolean
  delete(id: string): void
  clear(): void
  // 淘汰最久未使用的条目直到低于 maxSize
  private evict(): void
}
```

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
        "default": [0, 0, 512, 720],
        "smile": [512, 0, 512, 720]
      }
    }
  }
}
```

---

## 七、音频系统

### 7.1 整体架构

```
AudioManager
├── context: AudioContext              // Web Audio API
├── masterGain: GainNode              // 主音量控制
├── bgmTrack: AudioTrack              // BGM轨道
├── seTracks: AudioTrack[]            // 音效轨道（池化）
├── voiceTrack: AudioTrack            // 语音轨道
│
├── playBgm(id: string, loop?: boolean, fadeIn?: number): void
├── stopBgm(fadeOut?: number): void
├── playSe(id: string): void
├── playVoice(id: string): void
├── setMasterVolume(v: number): void
├── setBgmVolume(v: number): void
├── setSeVolume(v: number): void
└── setVoiceVolume(v: number): void
```

### 7.2 AudioTrack（音轨）

```ts
class AudioTrack {
  type: 'bgm' | 'se' | 'voice'
  gain: GainNode
  source: AudioBufferSourceNode | null
  buffer: AudioBuffer | null
  volume: number                     // 0-1
  state: 'stopped' | 'playing' | 'paused' | 'fading'

  play(buffer: AudioBuffer, loop: boolean, fadeIn: number): void
  stop(fadeOut: number): void
  pause(): void
  resume(): void
  setVolume(v: number): void
}
```

### 7.3 音频池（SE轨道复用）

音效同时播放数量受限，采用对象池模式：

```ts
class AudioTrackPool {
  private pool: AudioTrack[]
  private active: Map<string, AudioTrack>

  acquire(): AudioTrack         // 获取空闲轨道
  release(track: AudioTrack): void  // 归还轨道
}
```

---

## 八、UI 系统（Canvas 绘制）

### 8.1 设计思路

UI 完全由 Canvas 绘制，不依赖 DOM 元素。提供组件化抽象：

```ts
abstract class UIComponent {
  x: number; y: number; width: number; height: number
  visible: boolean
  children: UIComponent[]

  abstract update(dt: number): void
  abstract draw(ctx: CanvasRenderingContext2D): void

  // 事件命中测试
  hitTest(px: number, py: number): UIComponent | null
  onClick(px: number, py: number): void
  onHover(px: number, py: number): void
}
```

### 8.2 内置 UI 组件

| 组件 | 说明 |
|------|------|
| `DialogueBox` | 对话框（角色名 + 文本 + 继续指示器） |
| `ChoicePanel` | 选项面板（2-N个选项按钮） |
| `TextButton` | 文本按钮（hover/click/press状态） |
| `ImageButton` | 图片按钮 |
| `Slider` | 滑动条（音量/速度调节） |
| `Toggle` | 开关（全屏/自动模式等） |
| `ScrollView` | 滚动视图（历史记录） |
| `SaveLoadSlot` | 存档/读档槽位 |
| `ConfirmDialog` | 确认弹窗 |

### 8.3 输入事件分发

```
Canvas DOM 事件 → Game.input.dispatch() → 命中测试 → UI组件回调
                                     → 无命中 → 全局命令（如点击继续）
```

```ts
class InputManager {
  canvas: HTMLCanvasElement
  handlers: Map<string, Handler[]>

  // 绑定事件
  private onMouseMove(e: MouseEvent): void
  private onMouseDown(e: MouseEvent): void
  private onMouseUp(e: MouseEvent): void
  private onTouchStart(e: TouchEvent): void

  // 坐标转换（CSS像素 → 逻辑像素）
  private toLogicalCoords(clientX: number, clientY: number): { x: number; y: number }

  // 分发
  dispatch(event: InputEvent): void
}
```

---

## 九、状态管理与存档系统

### 9.1 游戏状态设计

**GameState（游戏运行时状态）：**

```ts
interface GameState {
  currentScript: string      // 当前脚本名
  scriptPC: number           // 脚本程序计数器
  variables: Record<string, any>
  flags: string[]
  bgImage: string | null
  characters: CharacterState[]
  bgmId: string | null
  bgmProgress: number        // BGM播放进度(秒)
  history: DialogueEntry[]   // 对话历史
  playTime: number           // 累计游玩时间
}

interface CharacterState {
  id: string
  spriteId: string
  position: 'left' | 'center' | 'right' | { x: number; y: number }
  opacity: number
}
```

**Settings（用户设置）：**

```ts
interface Settings {
  masterVolume: number
  bgmVolume: number
  seVolume: number
  voiceVolume: number
  textSpeed: number          // 字/秒
  autoSpeed: number          // 自动模式下等待秒数
  skipMode: 'all' | 'read'   // 跳过模式
  fullscreen: boolean
  language: string
  fontSize: number
}
```

### 9.2 Save/Load 数据格式

```ts
interface SaveData {
  version: number             // 存档格式版本（用于迁移）
  timestamp: number           // 存档时间戳
  thumbnail: string           // 缩略图（base64）
  slotLabel: string           // 存档标签（当前对话文本截取）
  gameState: GameState        // 游戏状态快照
  settings: Settings          // 存档时的设置
}
```

### 9.3 存档流程

```
存档:
  1. 引擎暂停
  2. 生成缩略图：renderer.drawToImage() → toDataURL()
  3. 序列化 GameState（变量、旗标、PC、角色状态、音频进度）
  4. 构建 SaveData
  5. 写入 localStorage / IndexedDB
  6. 引擎恢复

读档:
  1. 引擎暂停
  2. 读取 SaveData
  3. 恢复 GameState 到引擎各子系统
  4. 重新加载对应资源（利用缓存加速）
  5. 跳转到存档时的脚本位置
  6. 引擎恢复
```

---

## 十、插件系统

### 10.1 插件接口

```ts
interface Plugin {
  name: string
  version: string
  install(engine: VNEngine): void
  uninstall?(engine: VNEngine): void
}
```

### 10.2 PluginManager

```ts
class PluginManager {
  private plugins: Map<string, Plugin>
  private engine: VNEngine

  register(plugin: Plugin): void
  unregister(name: string): void
  get(name: string): Plugin | null
  list(): Plugin[]
  // 按依赖顺序加载
  loadAll(plugins: Plugin[]): void
}
```

### 10.3 扩展点一览

| 扩展点 | 接口 | 用途 |
|--------|------|------|
| 命令 | `CommandRegistry.register()` | 自定义脚本命令 |
| 转场 | `Transition` 接口 | 自定义转场效果 |
| 特效 | `Effect` 接口 | 自定义画面特效 |
| UI组件 | `UIComponent` 基类 | 自定义UI |
| 资源加载器 | `AssetLoader` 中间件 | 自定义资源来源（如加密包） |
| 脚本解析器 | `Parser` 中间件 | 自定义脚本语法糖 |
| 事件 | `EventBus.on()` | 监听任意事件 |

---

## 十一、性能优化策略汇总

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **离屏Canvas缓存** | 静态图层绘制到 OffscreenCanvas，帧间直接 blit | 背景、静止角色 |
| **脏矩形刷新** | 仅重绘变化区域 | 对话框打字、小范围动画 |
| **ImageBitmap** | Worker 线程异步解码图片 | 大尺寸 CG 加载 |
| **纹理图集** | 合并小图减少 drawImage 调用 | 立绘表情切换 |
| **对象池** | 复用 SE 音轨、粒子对象 | 高频创建/销毁 |
| **LRU 缓存** | 限制纹理/音频内存占用 | 长剧本、多资源 |
| **requestAnimationFrame** | 与浏览器刷新率同步 | 游戏循环 |
| **deltaTime 上限** | 防止标签页返回后跳帧 | 所有帧逻辑 |
| **Web Worker** | 脚本解析、资源批量加载在 Worker 执行 | 初始化/场景切换 |
| **懒加载** | 按章节/场景预加载，不一次性加载全部 | 大型项目 |

---

## 十二、目录结构

```
src/
├── engine/                        # 引擎核心（框架无关）
│   ├── core/                      # 核心系统
│   │   ├── Game.ts                # 游戏主类
│   │   ├── GameLoop.ts            # 游戏循环
│   │   ├── EventBus.ts            # 事件总线
│   │   └── PluginManager.ts       # 插件管理器
│   │
│   ├── renderer/                  # 渲染系统
│   │   ├── Renderer.ts            # 渲染器（图层管理）
│   │   ├── Layer.ts               # 图层
│   │   ├── Sprite.ts              # 精灵
│   │   ├── TextureManager.ts      # 纹理管理
│   │   ├── Texture.ts             # 纹理封装
│   │   ├── TextRenderer.ts        # 文字渲染（逐字显示）
│   │   ├── transitions/           # 转场效果
│   │   │   ├── Transition.ts      # 转场基类
│   │   │   ├── FadeTransition.ts
│   │   │   ├── SlideTransition.ts
│   │   │   └── WipeTransition.ts
│   │   └── effects/               # 画面特效
│   │       ├── Effect.ts          # 特效基类
│   │       ├── ShakeEffect.ts
│   │       ├── FlashEffect.ts
│   │       └── ParticleEffect.ts
│   │
│   ├── script/                    # 脚本系统
│   │   ├── ScriptEngine.ts        # 脚本引擎（Parser + Interpreter 门面）
│   │   ├── Parser.ts              # 脚本解析器
│   │   ├── Interpreter.ts         # 脚本解释器
│   │   ├── CommandRegistry.ts     # 命令注册表
│   │   └── commands/              # 内置命令实现
│   │       ├── CommandBase.ts     # 命令基类
│   │       ├── BgCommand.ts
│   │       ├── ShowCommand.ts
│   │       ├── HideCommand.ts
│   │       ├── SayCommand.ts
│   │       ├── ChoiceCommand.ts
│   │       ├── AudioCommand.ts
│   │       ├── FlowCommand.ts
│   │       └── VariableCommand.ts
│   │
│   ├── audio/                     # 音频系统
│   │   ├── AudioManager.ts        # 音频管理器
│   │   ├── AudioTrack.ts          # 音轨
│   │   └── AudioTrackPool.ts      # 音轨池
│   │
│   ├── resource/                  # 资源管理
│   │   ├── ResourceManager.ts     # 资源管理器
│   │   ├── AssetLoader.ts         # 资源加载器
│   │   ├── ResourceCache.ts       # LRU缓存
│   │   └── Preloader.ts           # 预加载器
│   │
│   ├── ui/                        # Canvas UI组件
│   │   ├── UIComponent.ts         # UI组件基类
│   │   ├── DialogueBox.ts         # 对话框
│   │   ├── ChoicePanel.ts         # 选项面板
│   │   ├── SaveLoadMenu.ts        # 存档/读档菜单
│   │   ├── SettingsMenu.ts        # 设置菜单
│   │   ├── HistoryView.ts         # 对话历史
│   │   ├── TextButton.ts          # 文本按钮
│   │   ├── Slider.ts              # 滑动条
│   │   └── ConfirmDialog.ts       # 确认弹窗
│   │
│   ├── input/                     # 输入管理
│   │   └── InputManager.ts        # 输入事件分发
│   │
│   └── save/                      # 存档系统
│       ├── SaveManager.ts         # 存档管理器
│       └── SaveData.ts            # 存档数据结构
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
  UI点击存档
    → EventBus 发送 'ui:save'
    → SaveManager.capture(engine)
      → 生成缩略图
      → 序列化 engine.state
      → 构建 SaveData
      → IndexedDB 持久化
      → EventBus 发送 'game:saved'

读档:
  UI点击读档
    → SaveManager.restore(engine, slot)
      → 从 IndexedDB 读取 SaveData
      → ResourceManager.preloadRequired(data)  // 预加载需要资源
      → 恢复 engine.state
      → Interpreter.pc = data.gameState.scriptPC
      → Renderer 恢复角色/背景状态
      → AudioManager 恢复音频
      → EventBus 发送 'game:loaded'
```

---

## 十四、关键类型定义

### 14.1 引擎核心类型

```ts
// types/engine.ts

interface GameConfig {
  canvas: HTMLCanvasElement
  width: number
  height: number
  scaleMode: 'fit' | 'stretch' | 'fixed'
  fps: number
  assets: AssetManifest
  plugins?: Plugin[]
}

interface AssetManifest {
  images: Record<string, string>
  audio: Record<string, string>
  scripts: Record<string, string>
  spritesheets: Record<string, SpritesheetConfig>
}

interface SpritesheetConfig {
  url: string
  frames: Record<string, [number, number, number, number]>
}

// 事件类型（string → 泛型映射）
interface EngineEvents {
  'script:command': { cmd: string; args: Record<string, any> }
  'script:choice': { choices: Choice[] }
  'script:say': { speaker: string; text: string }
  'script:end': {}
  'render:frame': { dt: number }
  'character:show': { id: string; position: Position }
  'character:hide': { id: string }
  'bg:change': { id: string; transition?: string }
  'audio:play': { id: string; type: 'bgm' | 'se' | 'voice' }
  'audio:stop': { type: 'bgm' | 'se' | 'voice' }
  'game:save': { slot: number }
  'game:load': { slot: number }
  'game:pause': {}
  'game:resume': {}
  'input:click': { x: number; y: number }
  'input:hover': { x: number; y: number }
  'resource:progress': { loaded: number; total: number; percent: number }
  'resource:ready': {}
}
```

### 14.2 脚本类型

```ts
// types/script.ts

interface Script {
  name: string
  commands: Command[]
  labels: Map<string, number>
  metadata: { author?: string; version?: string }
}

interface Command {
  type: string
  args: Record<string, any>
  line: number
}

interface ScriptContext {
  engine: import('./engine').VNEngine
  interpreter: import('../engine/script/Interpreter').Interpreter
  variables: Map<string, any>
  flags: Set<string>
}

interface Choice {
  text: string
  label: string           // 跳转标签
  condition?: string      // 条件表达式（如 "flags.has('met_hero')"）
  enabled?: boolean
}
```

### 14.3 存档类型

```ts
// types/save.ts

interface SaveData {
  version: number
  timestamp: number
  thumbnail: string
  slotLabel: string
  gameState: GameStateSnapshot
  settings: SettingsSnapshot
}

interface GameStateSnapshot {
  currentScript: string
  scriptPC: number
  variables: Record<string, any>
  flags: string[]
  bgImage: string | null
  characters: Array<{
    id: string
    spriteId: string
    position: string | { x: number; y: number }
    opacity: number
  }>
  bgm: { id: string; progress: number } | null
  history: DialogueEntry[]
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

| 决策 | 选择 | 原因 |
|------|------|------|
| 渲染方案 | Canvas 2D | 兼容性好，API 成熟；后续可升级 WebGL |
| 文字方案 | Canvas fillText | 避免 DOM-vs-Canvas 分层同步问题 |
| UI 方案 | Canvas 自绘 | 帧同步一致，无 DOM 布局抖动 |
| 音频方案 | Web Audio API | 精确控制，多音轨混音 |
| 脚本格式 | 自定义 `.vns` | 简洁，面向 VN 场景优化 |
| 状态管理 | 引擎内置 GameState | 框架无关，可直接序列化 |
| 通信方式 | EventBus | 模块解耦，可测试 |
| 资源解码 | ImageBitmap | 异步，不阻塞主线程 |
| 存档格式 | JSON + IndexedDB | 可读可迁移，容量大 |
| 模块化 | 引擎纯 TS | 可测试，可移植 |

---

*本文档为 VNEngine 架构设计初始版本，随开发迭代持续更新。*
