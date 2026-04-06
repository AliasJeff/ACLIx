import { resolveCliAbortSignal } from '../../../cli/abort-signal.js';
import { onboardAction } from '../../../cli/commands/onboard.js';

import type { SlashCommand } from '../types.js';

export const onboardCommand: SlashCommand = {
  name: 'onboard',
  description: 'Run onboarding to set up your local profile',
  async execute() {
    await onboardAction(resolveCliAbortSignal());
    return 'continue';
  },
};

