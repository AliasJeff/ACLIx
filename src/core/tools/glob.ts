import { relative, resolve } from 'node:path';

import fg from 'fast-glob';
import { tool } from 'ai';
import { z } from 'zod';

import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';

const globInputSchema = z.object({
  pattern: z.string().min(1).describe('Glob pattern, e.g. src/**/*.ts'),
  path: z.string().optional().describe('Base directory for search, defaults to current working directory'),
});

const GLOB_IGNORES = ['**/node_modules/**', '**/.git/**'];
const MAX_RESULTS = 100;

export function createGlobTool(defaultCwd: string, callbacks: AgentCallbacks) {
  return tool({
    description:
      'Find files by filename pattern. Ignores node_modules and .git automatically with result truncation.',
    inputSchema: globInputSchema,
    execute: async ({ pattern, path }) => {
      const command = `glob ${pattern}`;
      const reasoning = 'Find files by glob pattern.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('glob', command, reasoning, 'low')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      try {
        const basePath = path ? resolve(defaultCwd, path) : defaultCwd;
        const matches = await fg(pattern, {
          cwd: basePath,
          absolute: true,
          dot: false,
          onlyFiles: false,
          ignore: GLOB_IGNORES,
        });

        if (matches.length === 0) {
          return 'No files matched.';
        }

        const limited = matches.slice(0, MAX_RESULTS);
        const lines = limited.map((filePath) => relative(basePath, filePath));
        if (matches.length > MAX_RESULTS) {
          lines.push('(Results truncated)');
        }
        return lines.join('\n');
      } catch (error: unknown) {
        errorLogger.error({ tool: 'glob', error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
