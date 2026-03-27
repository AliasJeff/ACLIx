import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerOnboardCommand(cli: CAC, logger: Logger): void {
  cli
    .command('onboard', 'Initialize local CLI profile')
    .action(() => {
      logger.info('onboard command is ready');
    });
}
