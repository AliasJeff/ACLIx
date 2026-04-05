import 'dotenv/config';

import { cac } from 'cac';
import pc from 'picocolors';

import { initAbortSignalProvider } from './cli/abort-signal.js';
import { chatAction } from './cli/commands/chat.js';
import { appLogger, errorLogger } from './services/logger/index.js';
import { AclixError, ConfigError } from './shared/errors.js';
import { configAction } from './cli/commands/config.js';
import { onboardAction } from './cli/commands/onboard.js';
import { spinner } from './ui/spinner.js';

const cli = cac('acli');

let abortController = new AbortController();
let isGenerating = false;
let lastSigintAt = 0;

export function setGenerating(val: boolean): void {
  isGenerating = val;
}

export function renewAbortController(): void {
  abortController = new AbortController();
}

export function getAbortSignal(): AbortSignal {
  return abortController.signal;
}

initAbortSignalProvider(getAbortSignal);

process.on('exit', () => {
  errorLogger.flush();
});

// TODO: use SSE to stream the response
process.on('SIGINT', () => {
  appLogger.warn({ scope: 'user' }, 'User interrupted process via SIGINT');
  spinner.stop();
  process.stdout.write('\x1B[?25h\n');

  if (isGenerating) {
    abortController.abort();
    console.error(pc.yellow('Generation cancelled.'));
    renewAbortController();
    return;
  }

  const now = Date.now();
  if (now - lastSigintAt < 2000 && lastSigintAt > 0) {
    process.exit(130);
  }

  lastSigintAt = now;
  console.error(pc.dim('再按一次 Ctrl+C 退出'));
});

cli.command('onboard', 'Initialize ACLIx configuration').action(async () => {
  await onboardAction(getAbortSignal());
});

cli
  .command('chat <query>', 'Chat with AI to analyze intent and execute commands')
  .action(async (query: string) => {
    await chatAction(query, getAbortSignal());
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

function isAbortLike(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.cause instanceof Error && error.cause.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.message.toLowerCase().includes('abort')) {
    return true;
  }
  return false;
}

async function bootstrap() {
  try {
    cli.parse(process.argv, { run: false });
    appLogger.info({ scope: 'user', args: cli.args, options: cli.options }, 'CLI Invoked');
    if (!cli.matchedCommandName && cli.args.length === 0) {
      const { replAction } = await import('./cli/commands/repl.js');
      await replAction();
    } else {
      await cli.runMatchedCommand();
    }
  } catch (error: unknown) {
    if (isAbortLike(error)) {
      // FIXME: should first cancel the agent task, then press control+c again to exit
      errorLogger.debug('Process cleanly aborted by user');
      console.error(pc.dim('Cancelled by user. Exiting...'));
      errorLogger.flush();
      process.exit(130);
    } else if (error instanceof ConfigError) {
      errorLogger.error({ code: error.code, message: error.message }, 'Configuration error');
      console.error(pc.yellow('Tip: run `acli onboard` to complete setup.'));
      process.exitCode = 1;
    } else if (error instanceof AclixError) {
      errorLogger.error({ code: error.code, message: error.message }, 'ACLIX error');
      process.exitCode = 1;
    } else {
      errorLogger.error({ error }, 'Fatal unexpected CLI error');
      console.error(error);
      process.exitCode = 1;
    }
  }
}

void bootstrap();
