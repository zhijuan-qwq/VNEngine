import type { CommandRegistry } from '../CommandRegistry';
import type { CommandHandler } from '@/types/script';
import { stateCommands } from './state';
import { presentationCommands } from './presentation';
import { dialogueCommands } from './dialogue';

export function registerBuiltinCommands(registry: CommandRegistry): void {
  const handlers: CommandHandler[] = [
    ...stateCommands,
    ...presentationCommands,
    ...dialogueCommands,
  ];
  for (const handler of handlers) {
    registry.register(handler);
  }
}
