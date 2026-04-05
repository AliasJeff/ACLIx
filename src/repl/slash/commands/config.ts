import type { SlashCommand } from '../types.js';

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Inspect and manage local config',
  async execute(): Promise<'continue'> {
    const { configAction } = await import('../../../cli/commands/config.js');
    configAction();
    return 'continue';
  },
};
