import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerUsageCommand(cli: CAC, logger: Logger): void {
  cli.command('usage', 'Show CLI usage and quick tips').action(() => {
    logger.info('usage command is ready');
  });
}
