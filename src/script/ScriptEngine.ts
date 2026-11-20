import type { VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';
import VariableStore from './VariableStore';
import Interpreter, { FLOW_COMMANDS, assertValidStartPc } from './Interpreter';
import CommandRegistry from './CommandRegistry';
import { registerBuiltinCommands } from './commands';
import { VNScriptError } from './errors';

class ScriptEngine {
  public readonly commandRegistry: CommandRegistry;
  private interpreter: Interpreter;
  private currentScript: string;

  constructor(engine: VNEngine, variableStore: VariableStore) {
    this.commandRegistry = new CommandRegistry();
    registerBuiltinCommands(this.commandRegistry);
    this.interpreter = new Interpreter(
      variableStore,
      this.commandRegistry,
      engine,
    );
    this.currentScript = '';
  }

  public update(): void {
    this.interpreter.step();
  }

  public load(id: string, script: Script, startPc: number = 0): void {
    assertValidStartPc(startPc, script.commands.length, id);
    for (const command of script.commands) {
      if (
        !FLOW_COMMANDS.has(command.type) &&
        !this.commandRegistry.has(command.type)
      ) {
        throw new VNScriptError(
          `Unknown command "@${command.type}" in script "${id}" ` +
            `at line ${command.line}.`,
          {
            phase: 'load',
            script: id,
            line: command.line,
            command: command.type,
          },
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

  /** 等待中返回阻塞指令的类型（用于存档捕获；其余时候为 null） */
  public getBlockedCommandType(): string | null {
    return this.interpreter.getBlockedCommandType();
  }
}

export default ScriptEngine;
