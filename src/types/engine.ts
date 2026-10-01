import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from './events';
import type { Application, Container, PointData } from 'pixi.js';
import type { VariableStore } from '@/script/VariableStore';
import type ScriptEngine from '@/script/ScriptEngine';
import type { IResourceManager } from './resource';
import type { ISaveManager } from './save';
import type { UIManager } from '@/ui/UIManager';

/** 立绘位置关键字（`doc/script-dsl.md` §5.3 的 PositionSpec） */
export type PositionKeyword =
  'farLeft' | 'left' | 'center' | 'right' | 'farRight' | 'offLeft' | 'offRight';

export type Position = PositionKeyword | { x: number; y: number };

export type ScaleMode = 'fit' | 'stretch' | 'fixed';

export type EasingFn = (t: number) => number;

export interface GameConfig {
  canvas?: HTMLCanvasElement; // 可选：缺省时由 pixi Application 自建 canvas
  width: number;
  height: number;
  scaleMode: ScaleMode;
  fps: number; // 映射到 app.ticker.maxFPS
  scripts: string[];
  assets: AssetManifest;
  plugins?: Plugin[];
}

export interface AssetManifest {
  images: Record<string, string>;
  audio: Record<string, string>;
  scripts: Record<string, string>;
  spritesheets: Record<string, SpritesheetConfig>;
  // 场景/分组预加载配置（见架构文档 §6.4），供 preloadScene / loadGroup 使用
  scenes?: Record<string, ResourceGroupConfig>;
  groups?: Record<string, ResourceGroupConfig>;
}

export interface ResourceGroupConfig {
  images?: string[];
  audio?: string[];
  scripts?: string[];
}

export interface SpritesheetConfig {
  url: string;
  frames: Record<string, [number, number, number, number]>;
}

export interface GameState {
  currentScript: string;
  scriptPC: number;
  variables: Record<string, unknown>;
  flags: string[];
  bgImage: string | null;
  characters: CharacterState[];
  bgmId: string | null;
  bgmProgress: number;
  history: DialogueEntry[];
  playTime: number;
}

export interface CharacterState {
  id: string;
  spriteId: string;
  position: Position;
  opacity: number;
}

export interface DialogueEntry {
  speaker: string;
  text: string;
  timestamp: number;
}

export interface Settings {
  masterVolume: number;
  bgmVolume: number;
  seVolume: number;
  voiceVolume: number;
  textSpeed: number;
  autoSpeed: number;
  skipMode: 'all' | 'read';
  fullscreen: boolean;
  language: string;
  fontSize: number;
}

export interface Plugin {
  name: string;
  version: string;
  /** 依赖的其他插件 name 列表（安装前拓扑排序用） */
  dependencies?: string[];
  install(engine: VNEngine): void;
  uninstall?(engine: VNEngine): void;
  /** 可选逐帧更新，由 PluginManager.update 分发 */
  update?(dt: number): void;
}

export interface IPluginManager {
  register(plugin: Plugin): void;
  unregister(name: string): void;
  get(name: string): Plugin | null;
  list(): Plugin[];
  /** 注册并拓扑排序后依次 install(engine) */
  loadAll(plugins: Plugin[]): void;
  /** 由 Updater 驱动，遍历已安装插件调用 update?(dt) */
  update(dt: number): void;
}

/** 渲染子系统状态（存档/读档快照，见架构文档 §9.3/§14.1） */
export interface RendererState {
  bgImage: string | null;
  characters: CharacterState[];
}

// 渲染子系统契约（见架构文档 §4）：持有 LayerStack，把 bg/character/effect 事件映射为 pixi 显示对象
export interface IRenderer {
  update(dt: number): void;
  getState(): RendererState;
  setState(state: RendererState): void;
  /** 画布尺寸变化时由 Game 调用，内部转发给 ScaleManager（见架构文档 §4.8） */
  resize(size: { width: number; height: number }): void;
  /** UI 层容器，供 §8 的 UI 子系统挂载（Renderer 预建，可能为 null） */
  getUILayer(): Container | null;
  /** 屏幕坐标 → 逻辑坐标，供输入层复用渲染的同一换算（见架构文档 §4.8） */
  toLogical(point: PointData): { x: number; y: number };
  destroy(): void;
}

// 音频子系统契约（见架构文档 §7）：Web Audio API，多音轨混音与淡入淡出
export interface IAudioManager {
  update(dt: number): void;
  pause(): void;
  resume(): void;
  getState(): { id: string; progress: number } | null;
  setState(state: { id: string; progress: number } | null): void;
  destroy(): void;
}

// 输入子系统契约（见架构文档 §8.3）：pixi Federated Pointer Events → EventBus
export interface IInputManager {
  setUIRoot(root: Container): void;
  destroy(): void;
}

export interface VNEngine {
  app: Application;
  eventBus: EventBus<EngineEvents>;
  plugins: IPluginManager;
  variableStore: VariableStore;
  script: ScriptEngine;
  resource: IResourceManager;
  renderer: IRenderer;
  audio: IAudioManager;
  input: IInputManager;
  save: ISaveManager;
  /** UI 门面；尚未实现时为 null */
  ui: UIManager | null;
  destroy(): void;
  pause(): void;
  resume(): void;
  saveGame(slot: number): void;
  loadGame(slot: number): void;
}
