import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from './events';
import type { Application, Container } from 'pixi.js';
import type { VariableStore } from '@/script/VariableStore';
import type ScriptEngine from '@/script/ScriptEngine';
import type { ResourceManager } from './resource';
import type { SaveManager } from './save';

export type Position = 'left' | 'center' | 'right' | { x: number; y: number };

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
  install(engine: VNEngine): void;
  uninstall?(engine: VNEngine): void;
}

export interface PluginManager {
  register(plugin: Plugin): void;
  unregister(name: string): void;
  get(name: string): Plugin | null;
  list(): Plugin[];
}

// 渲染子系统契约（见架构文档 §4）：持有 LayerStack，把 bg/character/effect 事件映射为 pixi 显示对象
export interface Renderer {
  update(dt: number): void;
  getState(): unknown;
  setState(state: unknown): void;
  destroy(): void;
}

// 音频子系统契约（见架构文档 §7）：Web Audio API，多音轨混音与淡入淡出
export interface AudioManager {
  update(dt: number): void;
  pause(): void;
  resume(): void;
  getState(): { id: string; progress: number } | null;
  setState(state: { id: string; progress: number } | null): void;
  destroy(): void;
}

// 输入子系统契约（见架构文档 §8.3）：pixi Federated Pointer Events → EventBus
export interface InputManager {
  setUIRoot(root: Container): void;
  destroy(): void;
}

export interface VNEngine {
  app: Application;
  eventBus: EventBus<EngineEvents>;
  plugins: PluginManager;
  variableStore: VariableStore;
  script: ScriptEngine;
  resource: ResourceManager;
  renderer: Renderer;
  audio: AudioManager;
  input: InputManager;
  save: SaveManager;
  destroy(): void;
  pause(): void;
  resume(): void;
  saveGame(slot: number): void;
  loadGame(slot: number): void;
}
