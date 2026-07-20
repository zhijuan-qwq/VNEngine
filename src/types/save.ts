import type { Settings } from './engine';

export interface SaveData {
  version: number;
  timestamp: number;
  thumbnail: string;
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
}

export interface DialogueEntrySnapshot {
  speaker: string;
  text: string;
  timestamp: number;
}
