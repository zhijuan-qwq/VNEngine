import type { CommandHandler, ScriptContext, Command } from '@/types/script';

class CommandRegistry {
  private commands: Map<string, CommandHandler>;

  constructor() {
    this.commands = new Map();
  }

  public register(handler: CommandHandler): void {
    this.commands.set(handler.type, handler);
  }

  public unregister(type: string): void {
    this.commands.delete(type);
  }

  public execute(ctx: ScriptContext, cmd: Command): void {
    const handler = this.commands.get(cmd.type);
    if (!handler) {
      console.warn(`No handler registered for command type: ${cmd.type}`);
      return;
    }
    handler.execute(ctx, cmd.args);
  }
}

export type { CommandRegistry };
export default CommandRegistry;
