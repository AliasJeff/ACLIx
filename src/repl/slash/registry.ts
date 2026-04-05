import pc from 'picocolors';

import type { SessionManager } from '../session.js';
import type { SlashCommand, SlashCommandResult } from './types.js';

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
    for (const alias of command.aliases ?? []) {
      this.commands.set(alias, command);
    }
  }

  getCommands(): SlashCommand[] {
    const seen = new Set<SlashCommand>();
    for (const cmd of this.commands.values()) {
      seen.add(cmd);
    }
    return [...seen];
  }

  getCommandNames(): string[] {
    return [...this.commands.keys()].map((key) => `/${key}`);
  }

  async handle(input: string, session: SessionManager): Promise<SlashCommandResult> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return 'unhandled';
    }

    const withoutSlash = trimmed.slice(1).trimStart();
    if (!withoutSlash) {
      console.info(pc.dim(`Unknown command: ${trimmed}`));
      return 'continue';
    }

    const parts = withoutSlash.split(/\s+/);
    const cmdName = parts[0] ?? '';
    const args = parts.slice(1).join(' ');

    const command = this.commands.get(cmdName);
    if (!command) {
      console.info(pc.dim(`Unknown command: ${trimmed}`));
      return 'continue';
    }

    const result = command.execute(args, session, this);
    return result instanceof Promise ? await result : result;
  }
}
