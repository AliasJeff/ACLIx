import pc from 'picocolors';

import type { SessionManager } from './session.js';

export class SlashCommandRegistry {
  async handle(
    input: string,
    session: SessionManager,
  ): Promise<'continue' | 'exit' | 'unhandled'> {
    if (!input.startsWith('/')) {
      return 'unhandled';
    }

    if (input === '/exit' || input === '/quit') {
      return 'exit';
    }

    if (input === '/clear') {
      session.clear();
      process.stdout.write('\x1b[2J\x1b[H');
      return 'continue';
    }

    if (input === '/config') {
      const { configAction } = await import('../cli/commands/config.js');
      configAction();
      return 'continue';
    }

    console.info(pc.dim(`Unknown command: ${input}`));
    return 'continue';
  }
}
