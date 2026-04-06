import type { SlashCommand } from '../types.js';
import { resolveCliAbortSignal } from '../../../cli/abort-signal.js';

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Inspect and manage local config',
  async execute(): Promise<'continue'> {
    const { configAction } = await import('../../../cli/commands/config.js');
    await configAction(resolveCliAbortSignal());
    return 'continue';
  },
};
