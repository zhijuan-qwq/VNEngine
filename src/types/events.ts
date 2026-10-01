import type { Position } from './engine';
import type { Choice } from './script';

/** 可被打开/关闭的 UI 面板（§8.2 的内置组件） */
export type UiPanel = 'settings' | 'history' | 'save' | 'load';

export type EngineEvents = {
  'script:command': { cmd: string; args: Record<string, unknown> };
  'script:choice': { choices: Choice[]; mode?: 'adv' | 'nvl' };
  'script:say': {
    speaker: string;
    text: string;
    voice?: string;
    speed?: number;
    mode?: 'adv' | 'nvl';
  };
  'script:clear': Record<string, never>;
  'script:choice:selected': { label: string };
  'script:wait:done': Record<string, never>;
  'script:end': Record<string, never>;
  'render:frame': { dt: number };
  'character:show': {
    id: string;
    position: Position;
    sprite?: string;
    transition?: string;
    duration?: number;
  };
  'character:hide': { id: string; transition?: string; duration?: number };
  'character:move': {
    id: string;
    position: Position;
    duration?: number;
    easing?: string;
  };
  'character:sprite': {
    id: string;
    sprite: string;
    transition?: string;
    duration?: number;
  };
  'bg:change': { id: string; transition?: string; duration?: number };
  'audio:play': {
    id: string;
    type: 'bgm' | 'se' | 'voice' | 'ambient';
    loop?: boolean;
    loopCount?: number;
    fadeIn?: number;
    volume?: number;
  };
  'audio:stop': {
    id?: string;
    type: 'bgm' | 'se' | 'voice' | 'ambient';
    fadeOut?: number;
  };
  'effect:play': {
    type: 'shake' | 'flash' | 'snow' | 'rain';
    duration?: number;
    intensity?: number;
    color?: string;
    density?: number;
  };
  'effect:stop': Record<string, never>;
  'game:save': { slot: number };
  'game:load': { slot: number };
  'game:init': Record<string, never>;
  'game:start': Record<string, never>;
  'game:destroy': Record<string, never>;
  'game:pause': Record<string, never>;
  'game:resume': Record<string, never>;
  'input:click': { x: number; y: number };
  'input:hover': { x: number; y: number };
  'input:skip': Record<string, never>;
  'ui:open': { panel: UiPanel };
  'ui:close': { panel?: UiPanel };
  'resource:progress': { loaded: number; total: number; percent: number };
  'resource:ready': Record<string, never>;
};

export type EventName = keyof EngineEvents;

export type EventPayload<E extends EventName> = EngineEvents[E];
