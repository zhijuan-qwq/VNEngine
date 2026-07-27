import type { Script, ScriptContext } from '@/types/script';
import type { VariableStore } from './VariableStore';
import type { CommandRegistry } from './CommandRegistry';
import type { VNEngine } from '@/types/engine';

class Interpreter {
  private script: Script;
  private store: VariableStore;
  private registry: CommandRegistry;
  private engine: VNEngine;
  private pc: number;
  private callStack: number[];
  private state: 'idle' | 'running' | 'waiting';

  constructor(
    store: VariableStore,
    registry: CommandRegistry,
    engine: VNEngine,
  ) {
    this.script = { name: '', commands: [], labels: new Map(), metadata: {} };
    this.store = store;
    this.registry = registry;
    this.engine = engine;
    this.pc = 0;
    this.callStack = [];
    this.state = 'idle';
  }

  public getPc(): number {
    return this.pc;
  }

  public load(script: Script, startPc: number = 0): void {
    this.script = script;
    this.pc = startPc;
    this.callStack = [];
    this.state = 'running';
  }

  public step(): void {
    if (this.pc >= this.script.commands.length) {
      this.endScript();
      return;
    }
    const command = this.script.commands[this.pc];
    if (this.state === 'waiting') {
      return;
    }
    if (command.type === 'label') {
      this.pc++;
      return;
    }
    const ctx: ScriptContext = {
      engine: this.engine,
      interpreter: this,
      store: this.store,
    };
    this.registry.execute(ctx, command);
    this.pc++;
    if (this.pc >= this.script.commands.length) {
      this.endScript();
    }
  }

  private endScript(): void {
    this.state = 'idle';
    this.engine.eventBus.emit('script:end', this.script.name);
  }

  private resolveLabel(name: string): number {
    const label = this.script.labels.get(name);
    if (!label) {
      throw new Error(
        `Label "${name}" not found in script "${this.script.name}".`,
      );
    }
    return label;
  }

  public jump(name: string): void {
    const label = this.resolveLabel(name);
    this.pc = label;
  }

  public call(name: string): void {
    const label = this.resolveLabel(name);
    this.callStack.push(this.pc);
    this.pc = label;
  }

  public return(): void {
    const callerPc = this.callStack.pop();
    if (callerPc !== undefined) {
      this.pc = callerPc;
    } else {
      throw new Error(`Call stack is empty. Cannot return from function.`);
    }
  }

  public wait(event: string, handler: () => void): void {
    this.state = 'waiting';
    this.engine.eventBus.once(event, () => {
      this.state = 'running';
      handler();
    });
  }
}

export type { Interpreter };
export default Interpreter;
