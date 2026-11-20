import type { VNEngine } from './engine';
import type { VariableStore } from '../script/VariableStore';
import type { Interpreter } from '../script/Interpreter';
import type { ExpressionNode } from '../script/ExpressionEvaluator';

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
  condition?: ExpressionNode;
  enabled?: boolean;
}

export interface CommandHandler {
  type: string;
  execute(ctx: ScriptContext, args: Record<string, unknown>): void;
  undo?(ctx: ScriptContext): void;
}

/** 脚本错误发生在哪个阶段；解析、加载、运行时的错误共用这套字段 */
export type ScriptErrorPhase = 'parse' | 'load' | 'runtime';
