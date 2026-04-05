import type { SlashCommand } from '../types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the screen and chat context',
  execute(_args, session): 'continue' {
    session.clear();
    process.stdout.write('\x1b[2J\x1b[H');
    return 'continue';
  },
};
