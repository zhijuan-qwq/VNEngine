import type { Settings } from './engine';
import type { VNEngine } from './engine';

export interface SaveData {
  version: number;
  timestamp: number;
  thumbnail: Blob | string; // IndexedDB 存 Blob，localStorage 降级 base64
  slotLabel: string;
  gameState: GameStateSnapshot;
  settings: Settings;
}

export interface GameStateSnapshot {
  currentScript: string;
  scriptPC: number;
  variables: Record<string, unknown>;
  flags: string[];
  bgImage: string | null;
  characters: Array<{
    id: string;
    spriteId: string;
    position: string | { x: number; y: number };
    opacity: number;
  }>;
  bgm: { id: string; progress: number } | null;
  history: DialogueEntrySnapshot[];
  playTime: number; // 累计游玩时间（毫秒）
}

export interface DialogueEntrySnapshot {
  speaker: string;
  text: string;
  timestamp: number;
}

// 存档子系统契约（见架构文档 §9.3）
export interface SaveManager {
  capture(engine: VNEngine, slot: number): Promise<SaveData>;
  restore(engine: VNEngine, slot: number): Promise<void>;
}
