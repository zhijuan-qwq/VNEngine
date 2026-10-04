import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';
import VariableStore from './VariableStore';
import Interpreter from './Interpreter';
import CommandRegistry from './CommandRegistry';
import { registerBuiltinCommands } from './commands';

// 由 Interpreter.handleFlowCommand 直接处理的流程指令，不经过 CommandRegistry。
const FLOW_COMMANDS = new Set([
  'label',
  'jump',
  'call',
  'return',
  'if',
  'elseif',
  'else',
  'endif',
  'end',
]);

class ScriptEngine {
  public readonly commandRegistry: CommandRegistry;
  private interpreter: Interpreter;
  private currentScript: string;

  constructor(eventBus: EventBus<EngineEvents>, variableStore: VariableStore) {
    this.commandRegistry = new CommandRegistry();
    registerBuiltinCommands(this.commandRegistry);
    this.interpreter = new Interpreter(variableStore, this.commandRegistry, {
      eventBus,
    } as VNEngine);
    this.currentScript = '';
  }

  public update(): void {
    this.interpreter.step();
  }

  public load(id: string, script: Script, startPc: number = 0): void {
    if (
      !Number.isInteger(startPc) ||
      startPc < 0 ||
      startPc > script.commands.length
    ) {
      throw new Error(
        `Invalid startPc ${startPc} for script "${id}" ` +
          `(expected an integer in 0..${script.commands.length}).`,
      );
    }
    for (const command of script.commands) {
      if (
        !FLOW_COMMANDS.has(command.type) &&
        !this.commandRegistry.has(command.type)
      ) {
        throw new Error(
          `Unknown command "@${command.type}" in script "${id}" ` +
            `at line ${command.line}.`,
        );
      }
    }
    this.currentScript = id;
    this.interpreter.load(script, startPc, id);
  }

  public getState(): { currentScript: string; pc: number } {
    return {
      currentScript: this.currentScript,
      pc: this.interpreter.getPc(),
    };
  }
}

export default ScriptEngine;
