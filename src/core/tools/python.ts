import { randomBytes } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { tool } from 'ai';
import { execa } from 'execa';
import { z } from 'zod';

import type { AgentCallbacks } from '../../shared/types.js';

const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 10_000;
const OUTPUT_HEAD_TAIL = 5_000;

const pythonInputSchema = z.object({
  scriptPath: z
    .string()
    .optional()
    .describe('Absolute or relative path to the Python script to execute.'),
  code: z.string().optional().describe('Inline Python code to execute directly.'),
  args: z.array(z.string()).optional().describe('Command line arguments to pass to the script.'),
});

function truncateOutput(output: string): string {
  if (output.length <= OUTPUT_LIMIT) {
    return output;
  }
  const head = output.slice(0, OUTPUT_HEAD_TAIL);
  const tail = output.slice(-OUTPUT_HEAD_TAIL);
  return `${head}\n... [Output truncated due to length] ...\n${tail}`;
}

function formatStdoutStderr(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `${stdout}\n${stderr}`;
  }
  return stdout || stderr;
}

function resolveUserScriptPath(scriptPath: string): string {
  return path.isAbsolute(scriptPath) ? scriptPath : path.resolve(process.cwd(), scriptPath);
}

function isSpawnENOENT(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function formatPythonResult(result: {
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
  exitCode?: number | null;
}): string {
  if (result.timedOut) {
    return 'Python process timed out after 60s.';
  }
  let out = formatStdoutStderr(result.stdout, result.stderr);
  if (result.failed) {
    const codeLabel = result.exitCode == null ? 'unknown' : String(result.exitCode);
    out = out ? `${out}\n(exit code ${codeLabel})` : `Process exited with code ${codeLabel}.`;
  }
  return truncateOutput(out);
}

async function execPythonFile(
  binary: 'python3' | 'python',
  scriptPath: string,
  extraArgs: string[] | undefined,
): Promise<{
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
  exitCode?: number | null;
}> {
  const argv = [scriptPath, ...(extraArgs ?? [])];
  const result = await execa(binary, argv, {
    timeout: COMMAND_TIMEOUT_MS,
    reject: false,
    stdin: 'ignore',
    cwd: process.cwd(),
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    timedOut: result.timedOut,
    exitCode: result.exitCode,
  };
}

async function runPythonWithBinaryFallback(
  scriptPath: string,
  extraArgs: string[] | undefined,
): Promise<string> {
  try {
    const result = await execPythonFile('python3', scriptPath, extraArgs);
    return formatPythonResult(result);
  } catch (error: unknown) {
    if (!isSpawnENOENT(error)) {
      return truncateOutput(`Python execution error: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      const result = await execPythonFile('python', scriptPath, extraArgs);
      return formatPythonResult(result);
    } catch (fallbackError: unknown) {
      if (isSpawnENOENT(fallbackError)) {
        return 'Neither python3 nor python was found on PATH.';
      }
      return truncateOutput(
        `Python execution error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }
  }
}

export function createPythonTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Execute Python 3 on the host: run a script by path or run inline code via a temporary file. Prefer scriptPath for larger programs. Arguments are passed to the script after the script path.',
    inputSchema: pythonInputSchema,
    execute: async ({ scriptPath, code, args }) => {
      const sp = scriptPath?.trim();
      const cd = code?.trim();
      if (!sp && !cd) {
        return 'Error: Provide either scriptPath or code (at least one is required).';
      }

      const command = sp
        ? `python3 ${resolveUserScriptPath(sp)}${args?.length ? ` ${args.join(' ')}` : ''}`
        : `python3 <inline_tmp>.py${args?.length ? ` ${args.join(' ')}` : ''}`;
      const reasoning = sp ? `Run Python script: ${resolveUserScriptPath(sp)}` : 'Execute inline Python code.';

      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('python', command, reasoning, 'medium')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      if (sp) {
        return runPythonWithBinaryFallback(resolveUserScriptPath(sp), args);
      }

      const inlineCode = cd;
      if (!inlineCode) {
        return 'Error: Provide either scriptPath or code (at least one is required).';
      }

      const tmpName = `acli-python-${randomBytes(16).toString('hex')}.py`;
      const tmpPath = path.join(os.tmpdir(), tmpName);
      try {
        await writeFile(tmpPath, inlineCode, 'utf8');
        return await runPythonWithBinaryFallback(tmpPath, args);
      } finally {
        await unlink(tmpPath).catch(() => {
          /* ignore cleanup errors */
        });
      }
    },
  });
}
