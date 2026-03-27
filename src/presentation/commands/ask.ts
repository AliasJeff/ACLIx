import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerAskCommand(cli: CAC, logger: Logger): void {
  cli
    .command('ask <question>', 'Ask a direct question')
    .action((question: string) => {
      logger.info({ question }, 'ask command is ready');
    });
}
