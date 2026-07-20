import type { Position } from './engine';
import type { Choice } from './script';

export interface EngineEvents {
  'script:command': { cmd: string; args: Record<string, unknown> };
  'script:choice': { choices: Choice[] };
  'script:say': { speaker: string; text: string };
  'script:end': Record<string, never>;
  'render:frame': { dt: number };
  'character:show': { id: string; position: Position };
  'character:hide': { id: string };
  'bg:change': { id: string; transition?: string };
  'audio:play': { id: string; type: 'bgm' | 'se' | 'voice' };
  'audio:stop': { type: 'bgm' | 'se' | 'voice' };
  'game:save': { slot: number };
  'game:load': { slot: number };
  'game:pause': Record<string, never>;
  'game:resume': Record<string, never>;
  'input:click': { x: number; y: number };
  'input:hover': { x: number; y: number };
  'resource:progress': { loaded: number; total: number; percent: number };
  'resource:ready': Record<string, never>;
}

export type EventName = keyof EngineEvents;

export type EventPayload<E extends EventName> = EngineEvents[E];
