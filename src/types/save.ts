import type { CharacterState, VNEngine } from './engine';

export interface SaveData {
  version: number;
  timestamp: number;
  thumbnail: Blob | string; // IndexedDB 存 Blob，localStorage 降级 base64
  slotLabel: string;
  gameState: GameStateSnapshot;
}

export interface GameStateSnapshot {
  currentScript: string;
  scriptPC: number;
  variables: Record<string, unknown>;
  flags: string[];
  bgImage: string | null;
  characters: CharacterState[];
  bgm: { id: string; progress: number } | null;
  history: DialogueEntrySnapshot[];
  playTime: number; // 累计游玩时间（毫秒）
}

export interface DialogueEntrySnapshot {
  speaker: string;
  text: string;
  timestamp: number;
}

/** 存读档页与 SaveManager 共用的槽位元数据 */
export interface SaveSlotInfo {
  slot: number;
  label?: string;
  timestamp?: number;
  /** data URL 缩略图；旧存档或捕获失败时缺省 */
  thumbnail?: string;
}

// 存档子系统契约（见架构文档 §9.3）
export interface ISaveManager {
  capture(
    engine: VNEngine,
    slot: number,
    thumbnail?: string,
  ): Promise<SaveData>;
  restore(engine: VNEngine, slot: number): Promise<void>;
  /** 槽位列表（同步），供 SaveLoadMenu 的 getSlots 使用 */
  list(): SaveSlotInfo[];
}
