import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerAutoCommand(cli: CAC, logger: Logger): void {
  cli
    .command('auto <goal>', 'Run a task in auto mode')
    .action((goal: string) => {
      logger.info({ goal }, 'auto command is ready');
    });
}
