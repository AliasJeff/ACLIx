import type { CAC } from 'cac';
import type { Logger } from 'pino';

export function registerChatCommand(cli: CAC, logger: Logger): void {
  cli.command('chat', 'Open interactive chat mode').action(() => {
    logger.info('chat command is ready');
  });
}
