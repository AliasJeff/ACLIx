import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerConfigCommand(cli: CAC, logger: Logger): void {
  cli.command('config', 'Inspect and manage local config').action(() => {
    logger.info('config command is ready');
  });
}
