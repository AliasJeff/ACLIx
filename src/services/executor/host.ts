import { execaCommand } from 'execa';

import { appLogger } from '../logger/index.js';

const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 10_000;
const OUTPUT_HEAD_TAIL = 5_000;
const STATE_MARKER = '___ACLI_STATE_MARKER___';

let currentCwd = process.cwd();
let currentEnv = { ...process.env } as Record<string, string>;

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

function extractStateFromStdout(stdout: string): { visibleStdout: string; nextCwd?: string; nextEnv?: Record<string, string> } {
  const marker = STATE_MARKER;
  const first = stdout.indexOf(marker);
  if (first === -1) {
    return { visibleStdout: stdout };
  }

  const second = stdout.indexOf(marker, first + marker.length);
  if (second === -1) {
    return { visibleStdout: stdout };
  }

  const visibleStdout = stdout.slice(0, first).replace(/\n+$/, '');
  const jsonSegment = stdout.slice(first + marker.length, second);

  try {
    const jsonRegex = /\{[\s\S]*\}$/;
    const jsonMatch = jsonRegex.exec(jsonSegment);
    if (!jsonMatch) {
      return { visibleStdout };
    }
    const parsed = JSON.parse(jsonMatch[0]) as { cwd?: unknown; env?: unknown };

    let nextCwd: string | undefined;
    let nextEnv: Record<string, string> | undefined;

    if (typeof parsed.cwd === 'string') {
      nextCwd = parsed.cwd;
    }
    if (parsed.env && typeof parsed.env === 'object') {
      nextEnv = {};
      for (const [key, value] of Object.entries(parsed.env as Record<string, unknown>)) {
        if (typeof value === 'string') {
          nextEnv[key] = value;
        }
      }
    }

    return { visibleStdout, nextCwd, nextEnv };
  } catch {
    return { visibleStdout };
  }
}

export async function runHostCommand(command: string, signal?: AbortSignal): Promise<string> {
  appLogger.info({ scope: 'agent', command }, 'Executing shell command on host');

  const marker = STATE_MARKER;

  const wrappedCommand =
    process.platform === 'win32'
      ? `${command} & set _ACLI_RET=%ERRORLEVEL% & echo. & echo ${marker} & node -e "console.log(JSON.stringify({cwd: process.cwd(), env: process.env}))" & echo ${marker} & exit /b %_ACLI_RET%`
      : `{ ${command} ; } ; _ACLI_RET=$? ; echo -e "\\n${marker}" ; node -e "console.log(JSON.stringify({cwd: process.cwd(), env: process.env}))" ; echo "${marker}" ; exit $_ACLI_RET`;

  const result = await execaCommand(wrappedCommand, {
    shell: process.platform === 'win32' ? true : 'bash',
    reject: false,
    stdin: 'ignore',
    timeout: COMMAND_TIMEOUT_MS,
    cancelSignal: signal,
    cwd: currentCwd,
    env: currentEnv,
  });

  const { visibleStdout, nextCwd, nextEnv } = extractStateFromStdout(result.stdout);
  if (nextCwd) {
    currentCwd = nextCwd;
  }
  if (nextEnv) {
    currentEnv = nextEnv;
  }

  appLogger.info(
    {
      scope: 'agent',
      command,
      wrappedCommand,
      timedOut: result.timedOut,
      failed: result.failed,
      stdoutLength: visibleStdout.length,
      stderrLength: result.stderr.length,
    },
    'Host command completed',
  );

  if (result.timedOut || result.isCanceled) {
    return 'Command timed out after 60s. Remember you cannot execute interactive commands or infinite loops.';
  }

  const output = truncateOutput(formatOutput(visibleStdout, result.stderr));
  if (result.failed) {
    return output || 'Command failed';
  }
  return output;
}
