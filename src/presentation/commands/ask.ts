import type { CAC } from 'cac';
import type { Logger } from 'pino';

import { executeSingleWorkflow } from '../../application/workflows/single.js';
import { requireAuth } from '../middlewares/index.js';

export async function askAction(input: string, signal?: AbortSignal): Promise<void> {
  requireAuth();
  await executeSingleWorkflow(input, signal);
}

export function registerAskCommand(cli: CAC, logger: Logger): void {
  cli
    .command('ask <question>', 'Ask a direct question')
    .action(async (question: string) => {
      await askAction(question);
      logger.info({ question }, 'ask completed');
    });
}
