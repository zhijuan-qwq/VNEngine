import type { Command, Script, ScriptContext } from '@/types/script';
import type { VariableStore } from './VariableStore';
import type { CommandRegistry } from './CommandRegistry';
import type { VNEngine } from '@/types/engine';
import type { EngineEvents, EventName } from '@/types/events';
import { evaluateExpression, isTruthy } from './ExpressionEvaluator';

interface IfState {
  hasMatched: boolean;
}

interface PendingWait {
  event: EventName;
  cancel: () => void;
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
  private scriptId: string;
  private pendingWait: PendingWait | null;
  private blockedPc: number;

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
    this.scriptId = '';
    this.pendingWait = null;
    this.blockedPc = 0;
  }

  // While waiting the pc already points past the blocking command, so exposing
  // the raw pc would make a save resume *after* the command and skip it. Report
  // the blocking command itself so restoring replays it.
  public getPc(): number {
    return this.state === 'waiting' ? this.blockedPc : this.pc;
  }

  public getBlockedCommandType(): string | null {
    return this.state === 'waiting'
      ? (this.script.commands[this.blockedPc]?.type ?? null)
      : null;
  }

  public load(
    script: Script,
    startPc: number = 0,
    scriptId: string = script.name,
  ): void {
    if (
      !Number.isInteger(startPc) ||
      startPc < 0 ||
      startPc > script.commands.length
    ) {
      throw new Error(
        `Invalid startPc ${startPc} for script "${scriptId}" ` +
          `(expected an integer in 0..${script.commands.length}).`,
      );
    }
    if (this.pendingWait) {
      const pending = this.pendingWait;
      this.pendingWait = null;
      pending.cancel();
    }
    this.script = script;
    this.scriptId = scriptId;
    this.pc = startPc;
    this.blockedPc = startPc;
    this.callStack = [];
    this.ifStack = [];
    this.state = 'running';
  }

  public step(): void {
    try {
      this.stepInternal();
    } catch (error) {
      this.fail(error, this.script.commands[this.pc]);
    }
  }

  private stepInternal(): void {
    if (this.pc >= this.script.commands.length) {
      if (this.state !== 'idle' && this.state !== 'waiting') {
        this.endScript();
      }
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
    if (this.pc >= this.script.commands.length && !this.isWaiting()) {
      this.endScript();
    }
  }

  // A command's handler may switch the interpreter into 'waiting' while it runs,
  // so the state must be re-read through a call rather than a narrowed local.
  private isWaiting(): boolean {
    return this.state === 'waiting';
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
    if (this.state === 'idle') return;
    this.state = 'idle';
    this.engine.eventBus.emit('script:end', {});
  }

  // A command failure must never escape step(): the pixi ticker reschedules the
  // next frame only after update() returns normally, so a throw would silently
  // freeze the whole game loop.
  private fail(error: unknown, command?: Command): void {
    const payload: EngineEvents['script:error'] = {
      message: error instanceof Error ? error.message : String(error),
      script: this.scriptId,
      ...(command ? { line: command.line, command: command.type } : {}),
    };
    try {
      this.engine.eventBus.emit('script:error', payload);
    } catch (listenerError) {
      console.error('[VNEngine] script:error listener threw', listenerError);
    }
    this.pc = this.script.commands.length;
    try {
      this.endScript();
    } catch (listenerError) {
      console.error('[VNEngine] script:end listener threw', listenerError);
    }
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
    cleanup?: () => void,
  ): void {
    if (this.pendingWait) {
      throw new Error(
        `Cannot wait for "${String(event)}" while already waiting for ` +
          `"${String(this.pendingWait.event)}".`,
      );
    }
    // The pc has not advanced past the blocking command yet, so it identifies
    // both the command a handler failure is reported against and the pc a save
    // resumes from.
    const blockedPc = this.pc;
    const blockedCommand = this.script.commands[blockedPc];
    const onEvent = (payload: EngineEvents[K]): void => {
      this.pendingWait = null;
      this.state = 'running';
      this.runCleanup(cleanup);
      try {
        handler(payload);
      } catch (error) {
        this.fail(error, blockedCommand);
      }
    };
    this.pendingWait = {
      event,
      cancel: () => {
        this.engine.eventBus.off(event, onEvent);
        this.runCleanup(cleanup);
      },
    };
    this.blockedPc = blockedPc;
    this.state = 'waiting';
    this.engine.eventBus.once(event, onEvent);
  }

  private runCleanup(cleanup?: () => void): void {
    if (!cleanup) return;
    try {
      cleanup();
    } catch (error) {
      console.error('[VNEngine] wait cleanup threw', error);
    }
  }
}

export type { Interpreter };
export default Interpreter;
