import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { VNEngine } from '@/types/engine';
import type { Script } from '@/types/script';
import VariableStore from './VariableStore';
import Interpreter from './Interpreter';
import CommandRegistry from './CommandRegistry';
import Parser from './Parser';
import { registerBuiltinCommands } from './commands';

class ScriptEngine {
  public readonly commandRegistry: CommandRegistry;
  private parser: Parser;
  private interpreter: Interpreter;
  private currentScript: string;
  private scriptCache: Map<string, Script>;

  constructor(eventBus: EventBus<EngineEvents>, variableStore: VariableStore) {
    this.parser = new Parser();
    this.commandRegistry = new CommandRegistry();
    registerBuiltinCommands(this.commandRegistry);
    this.interpreter = new Interpreter(variableStore, this.commandRegistry, {
      eventBus,
    } as VNEngine);
    this.currentScript = '';
    this.scriptCache = new Map();
  }

  public update(): void {
    this.interpreter.step();
  }

  public load(source: string, name: string, startPc: number = 0): void {
    let script = this.scriptCache.get(name);
    if (!script) {
      script = this.parser.parseScript(source);
      script.name = name;
      this.scriptCache.set(name, script);
    }
    this.currentScript = name;
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
