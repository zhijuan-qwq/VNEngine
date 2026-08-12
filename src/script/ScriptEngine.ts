import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';
import VariableStore from './VariableStore';
import Interpreter from './Interpreter';
import CommandRegistry from './CommandRegistry';
import { registerBuiltinCommands } from './commands';

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

  public load(script: Script, startPc: number = 0): void {
    this.currentScript = script.name;
    this.interpreter.load(script, startPc);
  }

  public getState(): { currentScript: string; pc: number } {
    return {
      currentScript: this.currentScript,
      pc: this.interpreter.getPc(),
    };
  }
}

export default ScriptEngine;
