import type { SlashCommand } from '../types.js';

export const exitCommand: SlashCommand = {
  name: 'exit',
  aliases: ['quit'],
  description: 'Exit the REPL session',
  execute(): 'exit' {
    return 'exit';
  },
};
