import pc from 'picocolors';

import { getAclixVersion } from '../../../shared/utils.js';

import type { SlashCommand } from '../types.js';

export const versionCommand: SlashCommand = {
  name: 'version',
  aliases: ['v'],
  description: 'Show ACLIx version',
  execute(): 'continue' {
    const version = getAclixVersion();
    console.info(pc.cyan(pc.bold(`📦 ACLIx v${version}`)));
    return 'continue';
  },
};
