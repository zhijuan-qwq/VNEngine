import type { VNEngine } from './engine';

export interface Script {
  name: string;
  commands: Command[];
  labels: Map<string, number>;
  metadata: { author?: string; version?: string };
}

export interface Command {
  type: string;
  args: Record<string, unknown>;
  line: number;
}

export interface ScriptContext {
  engine: VNEngine;
  variables: Map<string, unknown>;
  flags: Set<string>;
}

export interface Choice {
  text: string;
  label: string;
  condition?: string;
  enabled?: boolean;
}

export interface CommandHandler {
  name: string;
  execute(
    ctx: ScriptContext,
    args: Record<string, unknown>,
  ): void | Promise<void>;
  undo?(ctx: ScriptContext): void;
}
