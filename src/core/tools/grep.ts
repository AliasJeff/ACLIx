import { resolve } from 'node:path';

import { execa } from 'execa';
import { tool } from 'ai';
import { z } from 'zod';

import type { AgentCallbacks } from '../../shared/types.js';

const grepInputSchema = z.object({
  pattern: z.string().min(1).describe('Regex pattern for searching file content'),
  path: z.string().optional().describe('Base directory for search, defaults to current working directory'),
});

const MAX_LINES = 200;

function truncateOutput(output: string): string {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return 'No matches found.';
  }
  const limited = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) {
    limited.push('(Results truncated)');
  }
  return limited.join('\n');
}

export function createGrepTool(defaultCwd: string, callbacks: AgentCallbacks) {
  return tool({
    description:
      'Search text inside files safely with ignored heavy directories and bounded output.',
    inputSchema: grepInputSchema,
    execute: async ({ pattern, path }) => {
      const command = `grep ${pattern}`;
      const reasoning = 'Search text content in files.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('grep', command, reasoning, 'low')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      const basePath = path ? resolve(defaultCwd, path) : defaultCwd;
      try {
        const rgResult = await execa(
          'rg',
          ['-n', '--no-heading', '--glob', '!**/node_modules/**', '--glob', '!**/.git/**', pattern, '.'],
          { cwd: basePath, reject: false },
        );
        if (rgResult.exitCode === 0) {
          return truncateOutput(rgResult.stdout);
        }
        if (rgResult.exitCode === 1) {
          return 'No matches found.';
        }
      } catch {
        // fallback to grep below when rg is unavailable
      }

      const grepResult = await execa(
        'grep',
        ['-rn', '--exclude-dir=node_modules', '--exclude-dir=.git', pattern, '.'],
        { cwd: basePath, reject: false },
      );
      if (grepResult.exitCode === 1) {
        return 'No matches found.';
      }
      return truncateOutput(grepResult.stdout || grepResult.stderr);
    },
  });
}
