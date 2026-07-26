import type { VNEngine } from './engine';
import type { VariableStore } from '../script/VariableStore';
import type { Interpreter } from '../script/Interpreter';

export interface Script {
  name: string;
  commands: Command[];
  labels: Map<string, number>;
  metadata: Record<string, string>;
}

export interface Command {
  type: string;
  args: Record<string, unknown>;
  line: number;
}

export interface ScriptContext {
  engine: VNEngine;
  interpreter: Interpreter;
  store: VariableStore;
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
