import type { Command, Script, ScriptContext } from '@/types/script';
import type { VariableStore } from './VariableStore';
import type { CommandRegistry } from './CommandRegistry';
import type { VNEngine } from '@/types/engine';
import type { EngineEvents, EventName } from '@/types/events';
import { evaluateExpression, isTruthy } from './ExpressionEvaluator';

interface IfState {
  hasMatched: boolean;
}

class Interpreter {
  private script: Script;
  private store: VariableStore;
  private registry: CommandRegistry;
  private engine: VNEngine;
  private pc: number;
  private callStack: number[];
  private ifStack: IfState[];
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
    this.ifStack = [];
    this.state = 'idle';
  }

  public getPc(): number {
    return this.pc;
  }

  public load(script: Script, startPc: number = 0): void {
    this.script = script;
    this.pc = startPc;
    this.callStack = [];
    this.ifStack = [];
    this.state = 'running';
  }

  public step(): void {
    if (this.pc >= this.script.commands.length) {
      this.endScript();
      return;
    }
    if (this.state === 'waiting') {
      return;
    }

    const command = this.script.commands[this.pc];

    if (this.handleFlowCommand(command)) {
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

  private handleFlowCommand(command: Command): boolean {
    switch (command.type) {
      case 'label':
        this.pc++;
        return true;
      case 'jump': {
        const label = this.resolveLabel(command.args['0'] as string);
        this.pc = label;
        return true;
      }
      case 'call': {
        const label = this.resolveLabel(command.args['0'] as string);
        this.callStack.push(this.pc + 1);
        this.pc = label;
        return true;
      }
      case 'return': {
        const callerPc = this.callStack.pop();
        if (callerPc === undefined) {
          throw new Error('Call stack is empty. Cannot return from function.');
        }
        this.pc = callerPc;
        return true;
      }
      case 'if': {
        const condition = evaluateExpression(
          command.args.expression,
          this.store,
        );
        const took = isTruthy(condition);
        this.ifStack.push({ hasMatched: took });
        if (took) {
          this.pc++;
        } else {
          this.pc = this.findNextBranchPoint(this.pc);
        }
        return true;
      }
      case 'elseif': {
        const top = this.ifStack[this.ifStack.length - 1];
        if (!top) {
          throw new Error('@elseif without matching @if');
        }
        if (top.hasMatched) {
          this.pc = this.findMatchingEndif(this.pc);
        } else {
          const condition = evaluateExpression(
            command.args.expression,
            this.store,
          );
          const took = isTruthy(condition);
          if (took) {
            top.hasMatched = true;
            this.pc++;
          } else {
            this.pc = this.findNextBranchPoint(this.pc);
          }
        }
        return true;
      }
      case 'else': {
        const top = this.ifStack[this.ifStack.length - 1];
        if (!top) {
          throw new Error('@else without matching @if');
        }
        if (top.hasMatched) {
          this.pc = this.findMatchingEndif(this.pc);
        } else {
          top.hasMatched = true;
          this.pc++;
        }
        return true;
      }
      case 'endif': {
        if (this.ifStack.length === 0) {
          throw new Error('@endif without matching @if');
        }
        this.ifStack.pop();
        this.pc++;
        return true;
      }
      case 'end': {
        this.pc = this.script.commands.length;
        this.endScript();
        return true;
      }
      default:
        return false;
    }
  }

  private findNextBranchPoint(fromPc: number): number {
    let depth = 0;
    const { commands } = this.script;
    for (let i = fromPc + 1; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd.type === 'if') {
        depth++;
      } else if (cmd.type === 'endif') {
        if (depth === 0) return i;
        depth--;
      } else if (
        (cmd.type === 'elseif' || cmd.type === 'else') &&
        depth === 0
      ) {
        return i;
      }
    }
    throw new Error(
      `Unclosed @if block starting at line ${commands[fromPc].line}.`,
    );
  }

  private findMatchingEndif(fromPc: number): number {
    let depth = 1;
    const { commands } = this.script;
    for (let i = fromPc + 1; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd.type === 'if') {
        depth++;
      } else if (cmd.type === 'endif') {
        depth--;
        if (depth === 0) return i;
      }
    }
    throw new Error(
      `Unclosed @if block starting at line ${commands[fromPc].line}.`,
    );
  }

  private endScript(): void {
    this.state = 'idle';
    this.engine.eventBus.emit('script:end', {});
  }

  private resolveLabel(name: string): number {
    const label = this.script.labels.get(name);
    if (label === undefined) {
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
    this.callStack.push(this.pc + 1);
    this.pc = label;
  }

  public return(): void {
    const callerPc = this.callStack.pop();
    if (callerPc !== undefined) {
      this.pc = callerPc;
    } else {
      throw new Error('Call stack is empty. Cannot return from function.');
    }
  }

  public wait<K extends EventName>(
    event: K,
    handler: (payload: EngineEvents[K]) => void,
  ): void {
    this.state = 'waiting';
    this.engine.eventBus.once(event, (payload) => {
      this.state = 'running';
      handler(payload);
    });
  }
}

export type { Interpreter };
export default Interpreter;
