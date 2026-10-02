import type { EventBus } from '@/core/EventBus';
import type { Settings } from '@/types/engine';
import type { EngineEvents } from '@/types/events';
import type { StorageProvider } from '@/save/SaveStorage';

/** 设置持久化的独立键（架构文档 §9.1：全局一份，不嵌入存档槽） */
export const SETTINGS_STORAGE_KEY = 'settings';

/** 设置子系统缺省值 */
export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1,
  bgmVolume: 1,
  seVolume: 1,
  voiceVolume: 1,
  textSpeed: 25,
  autoSpeed: 1500,
  skipMode: 'read',
  fullscreen: false,
  language: 'zh-CN',
  fontSize: 28,
};

/** 单个设置键的校验器：返回校验/钳制后的值，非法则返回 undefined（保留原值） */
type Sanitizer<K extends keyof Settings> = (
  value: unknown,
) => Settings[K] | undefined;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function clampRange(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const n = finiteNumber(value);
  if (n === undefined) return undefined;
  return Math.min(max, Math.max(min, n));
}

function positive(value: unknown): number | undefined {
  const n = finiteNumber(value);
  if (n === undefined || n <= 0) return undefined;
  return n;
}

const sanitizers: { [K in keyof Settings]: Sanitizer<K> } = {
  masterVolume: (v) => clampRange(v, 0, 1),
  bgmVolume: (v) => clampRange(v, 0, 1),
  seVolume: (v) => clampRange(v, 0, 1),
  voiceVolume: (v) => clampRange(v, 0, 1),
  textSpeed: (v) => clampRange(v, 5, 100),
  autoSpeed: (v) => positive(v),
  skipMode: (v) => (v === 'all' || v === 'read' ? v : undefined),
  fullscreen: (v) => (typeof v === 'boolean' ? v : undefined),
  language: (v) => (typeof v === 'string' && v.length > 0 ? v : undefined),
  fontSize: (v) => positive(v),
};

function isSettingKey(key: string): key is keyof Settings {
  return Object.prototype.hasOwnProperty.call(sanitizers, key);
}

function applyEntry<K extends keyof Settings>(
  settings: Settings,
  key: K,
  value: unknown,
): boolean {
  const sanitized = sanitizers[key](value);
  if (sanitized === undefined) return false;
  settings[key] = sanitized;
  return true;
}

export interface SettingsManagerOptions {
  bus: EventBus<EngineEvents>;
  /** 缺省仅内存生效，不持久化（node / 隐私模式下由调用方决定是否提供） */
  storage?: StorageProvider;
  /** 覆盖缺省值，便于测试 */
  defaults?: Settings;
}

/**
 * 设置子系统：全局持久化 + 变更广播。
 *
 * 契约上结构性地满足 `SettingsMenu` 的 `SettingsController`（不 `implements`，
 * 避免 settings → ui 的依赖方向）。变更时按**逐键**派发 `game:settings`，由各
 * 子系统自行订阅应用（见架构文档 §3.3）。
 */
export class SettingsManager {
  private readonly bus: EventBus<EngineEvents>;
  private readonly storage: StorageProvider | null;
  private settings: Settings;

  constructor(options: SettingsManagerOptions) {
    this.bus = options.bus;
    this.storage = options.storage ?? null;
    this.settings = { ...(options.defaults ?? DEFAULT_SETTINGS) };
    this.load();
  }

  /** 返回当前设置的副本 */
  public get(): Settings {
    return { ...this.settings };
  }

  /** 校验并合并补丁，持久化后逐键广播 `game:settings` */
  public onChange(patch: Partial<Settings>): void {
    const changed = this.apply(patch as Record<string, unknown>);
    if (changed.length === 0) return;
    this.persist();
    for (const key of changed) {
      this.bus.emit('game:settings', { key, value: this.settings[key] });
    }
  }

  /** 广播当前全部设置，供 `Game.init` 末尾推送初始态 */
  public emitAll(): void {
    for (const key of Object.keys(this.settings) as (keyof Settings)[]) {
      this.bus.emit('game:settings', { key, value: this.settings[key] });
    }
  }

  /** 从存储恢复；无存档 / 坏 JSON 一律静默回落缺省值，绝不抛 */
  private load(): void {
    const raw = this.storage?.getItem(SETTINGS_STORAGE_KEY);
    if (raw == null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    this.apply(parsed as Record<string, unknown>);
  }

  /** 校验并写入内存；返回实际生效的键（未知 / 非法键被剔除） */
  private apply(patch: Record<string, unknown>): (keyof Settings)[] {
    const changed: (keyof Settings)[] = [];
    const next: Settings = { ...this.settings };
    for (const key of Object.keys(patch)) {
      if (!isSettingKey(key)) continue;
      if (applyEntry(next, key, patch[key])) changed.push(key);
    }
    this.settings = next;
    return changed;
  }

  private persist(): void {
    this.storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
  }
}

export default SettingsManager;
