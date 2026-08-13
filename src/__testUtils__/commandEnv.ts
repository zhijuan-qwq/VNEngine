import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import CommandRegistry from '@/script/CommandRegistry';
import VariableStore from '@/script/VariableStore';
import type { Interpreter } from '@/script/Interpreter';
import { registerBuiltinCommands } from '@/script/commands';
import type { ScriptContext } from '@/types/script';
import type { VNEngine } from '@/types/engine';

export interface CommandWaitState {
  event: string | undefined;
  handler: ((payload?: unknown) => void) | undefined;
}

export interface CommandEnv {
  ctx: ScriptContext;
  bus: EventBus<EngineEvents>;
  store: VariableStore;
  registry: CommandRegistry;
  wait: CommandWaitState;
  jumps: string[];
}

export function makeCommandEnv(): CommandEnv {
  const bus = new EventBus<EngineEvents>();
  const engine = { eventBus: bus } as unknown as VNEngine;
  const store = new VariableStore();
  const registry = new CommandRegistry();
  const wait: CommandWaitState = { event: undefined, handler: undefined };
  const jumps: string[] = [];
  const interpreter = {
    wait: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      wait.event = event;
      wait.handler = handler;
    }),
    jump: vi.fn((label: string) => {
      jumps.push(label);
    }),
  } as unknown as Interpreter;

  registerBuiltinCommands(registry);

  return {
    ctx: { engine, interpreter, store },
    bus,
    store,
    registry,
    wait,
    jumps,
  };
}
