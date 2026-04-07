import pc from 'picocolors';

import { readLongTermMemory } from '../../../core/memory/ltm.js';
import { errorLogger } from '../../../services/logger/index.js';
import type { SlashCommand } from '../types.js';

function yesNo(value: boolean): string {
  return value ? pc.green(pc.bold('YES')) : pc.red(pc.bold('NO'));
}

function formatCount(n: number): string {
  return pc.bold(String(Math.max(0, n)));
}

export const memoryCommand: SlashCommand = {
  name: 'memory',
  aliases: ['mem'],
  description: 'View current hierarchical memory state',
  async execute(_args, session): Promise<'continue'> {
    try {
      const { userLTM, projectLTM } = await readLongTermMemory(session.cwd);

      const messages = session.getMessages();
      const first = messages[0];
      const cmPresent =
        first?.role === 'assistant' &&
        typeof first.content === 'string' &&
        first.content.includes('[Historical Context Summary]');

      const stmCount = messages.length - (cmPresent ? 1 : 0);

      const userLtmPresent = userLTM !== null;
      const projectLtmPresent = projectLTM !== null;

      const userPreview =
        userLTM && userLTM.trim().length > 0 ? pc.dim(`${userLTM.trim().slice(0, 120)}${userLTM.trim().length > 120 ? '…' : ''}`) : pc.dim('(empty)');
      const projectPreview =
        projectLTM && projectLTM.trim().length > 0
          ? pc.dim(`${projectLTM.trim().slice(0, 120)}${projectLTM.trim().length > 120 ? '…' : ''}`)
          : pc.dim('(empty)');

      const title = pc.bold(pc.cyan('Hierarchical Memory Dashboard'));
      const sep = pc.dim('─'.repeat(60));

      console.info(`\n${title}`);
      console.info(sep);
      console.info(`${pc.cyan('User LTM')}           ${yesNo(userLtmPresent)}  ${pc.dim('(~/.aclix/ACLI.md)')}`);
      console.info(`${pc.cyan('Project LTM')}        ${yesNo(projectLtmPresent)}  ${pc.dim('(./ACLI.md)')}`);
      console.info(`${pc.cyan('Compressed Memory')}  ${yesNo(cmPresent)}  ${pc.dim('(historical summary)')}`);
      console.info(`${pc.cyan('Short-Term Memory')}   ${formatCount(stmCount)} ${pc.dim('messages (uncompressed)')}`);
      console.info(sep);

      if (userLtmPresent) {
        console.info(`${pc.cyan('User LTM preview')}    ${userPreview}`);
      }
      if (projectLtmPresent) {
        console.info(`${pc.cyan('Project LTM preview')} ${projectPreview}`);
      }
      console.info('');
    } catch (error) {
      errorLogger.error({ error }, 'Memory dashboard failed');
      console.info(pc.red('Failed to read memory state. See logs for details.'));
    }

    return 'continue';
  },
};

