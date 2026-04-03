import 'dotenv/config';

import { cac } from 'cac';
import pc from 'picocolors';

import { createLogger } from './infrastructure/logger/index.js';
import { AclixError, ConfigError } from './shared/errors.js';
import { chatAction } from './presentation/commands/chat.js';
import { configAction } from './presentation/commands/config.js';
import { onboardAction } from './presentation/commands/onboard.js';
import { spinner } from './presentation/ui/spinner.js';

const cli = cac('acli');
const logger = createLogger();
const abortController = new AbortController();

process.on('exit', () => {
  logger.flush();
});

// TODO: use SSE to stream the response
// FIXME: Ctrl+C doesn't work as expected
let isAborting = false;
process.on('SIGINT', () => {
  spinner.stop();
  process.stdout.write('\x1B[?25h\n');

  if (isAborting) {
    console.error(pc.red('✖ Force fully exited.'));
    process.exit(130);
  }

  isAborting = true;
  console.error(pc.yellow('✖ Cancelling request... (Press Ctrl+C again to force exit)'));
  abortController.abort();

  setTimeout(() => {
    logger.debug('Graceful abort timeout, forcing exit.');
    logger.flush();
    process.exit(130);
  }, 2000).unref();
});

cli.command('onboard', 'Initialize ACLIx configuration').action(async () => {
  await onboardAction(abortController.signal);
});

cli
  .command('chat <query>', 'Chat with AI to analyze intent and execute commands')
  .action(async (query: string) => {
    await chatAction(query, abortController.signal);
  });

cli.command('config', 'Inspect and manage local config').action(() => {
  configAction();
});

// TODO: usage command
// TODO: version command
// TODO: help command

/**
 * NOTE: Commented out for now, use ask command instead.
 */
// cli.command('[...args]', 'Auto-detect intent').action(async (args: string[]) => {
//   await askAction(args.join(' '), abortController.signal);
// });

cli.help();
cli.version('1.0.0');

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error: unknown) {
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    logger.debug('Process cleanly aborted by user');
    logger.flush();
    process.exit(130);
  } else if (error instanceof ConfigError) {
    logger.error({ code: error.code, message: error.message }, 'Configuration error');
    console.error(pc.yellow('Tip: run `acli onboard` to complete setup.'));
    process.exitCode = 1;
  } else if (error instanceof AclixError) {
    logger.error({ code: error.code, message: error.message }, 'ACLIX error');
    process.exitCode = 1;
  } else {
    logger.error({ error }, 'Unexpected error');
    console.error(error);
    process.exitCode = 1;
  }
}
