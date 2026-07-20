export type Position = 'left' | 'center' | 'right' | { x: number; y: number };

export type ScaleMode = 'fit' | 'stretch' | 'fixed';

export type EasingFn = (t: number) => number;

export interface GameConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  scaleMode: ScaleMode;
  fps: number;
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

export interface Layer {
  id: string;
  zIndex: number;
  visible: boolean;
  opacity: number;
  offscreen: OffscreenCanvas | null;
  dirty: boolean;
  sprites: Sprite[];
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface Sprite {
  id: string;
  texture: Texture;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: { x: number; y: number };
  rotation: number;
  anchor: { x: number; y: number };
  effects: SpriteEffect[];
  transition: Transition | null;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  setTexture(texture: Texture, transition?: Transition): void;
  moveTo(x: number, y: number, duration: number, easing: EasingFn): void;
  fadeTo(opacity: number, duration: number): void;
}

export interface Texture {
  id: string;
  source: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
  frame?: { x: number; y: number; w: number; h: number };
}

export interface SpriteEffect {
  type: string;
  update(dt: number): void;
  apply(ctx: CanvasRenderingContext2D, sprite: Sprite): void;
}

export interface Transition {
  type: 'fade' | 'slide' | 'zoom' | 'wipe' | 'pixelate' | 'custom';
  duration: number;
  easing: EasingFn;
  progress: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  onComplete?: () => void;
  update(dt: number): void;
  apply(ctx: CanvasRenderingContext2D, from: Sprite, to: Sprite): void;
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

export interface VNEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  plugins: PluginManager;
  destroy(): void;
}
