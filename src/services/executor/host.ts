import { execaCommand } from 'execa';

import { appLogger } from '../logger/index.js';

const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 10_000;
const OUTPUT_HEAD_TAIL = 5_000;

function truncateOutput(output: string): string {
  if (output.length <= OUTPUT_LIMIT) {
    return output;
  }
  const head = output.slice(0, OUTPUT_HEAD_TAIL);
  const tail = output.slice(-OUTPUT_HEAD_TAIL);
  return `${head}\n... [Output truncated due to length] ...\n${tail}`;
}

function formatOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `${stdout}\n${stderr}`;
  }
  return stdout || stderr;
}

export async function runHostCommand(command: string, signal?: AbortSignal): Promise<string> {
  appLogger.info({ scope: 'agent', command }, 'Executing shell command on host');

  const result = await execaCommand(command, {
    shell: true,
    reject: false,
    stdin: 'ignore',
    timeout: COMMAND_TIMEOUT_MS,
    cancelSignal: signal,
  });

  appLogger.info(
    {
      scope: 'agent',
      command,
      timedOut: result.timedOut,
      failed: result.failed,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
    },
    'Host command completed',
  );

  if (result.timedOut || result.isCanceled) {
    return 'Command timed out after 60s. Remember you cannot execute interactive commands or infinite loops.';
  }

  const output = truncateOutput(formatOutput(result.stdout, result.stderr));
  if (result.failed) {
    return output || 'Command failed';
  }
  return output;
}
