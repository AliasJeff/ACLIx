import { readFile } from 'node:fs/promises';

import { tool } from 'ai';
import { z } from 'zod';

import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { fingerprint } from '../memory/index.js';
import { fileBasename, logToolEvent } from './toolEvent.js';

const fileReadInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative file path to read'),
  offset: z.number().int().min(1).optional().default(1).describe('1-based start line number'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(1000)
    .describe('Maximum number of lines to read'),
});

export function createFileReadTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Read file content safely with line numbers. Use offset and limit for large files. Never use shell cat/head/tail/less for file reading.',
    inputSchema: fileReadInputSchema,
    execute: async ({ filePath, offset, limit }) => {
      logToolEvent('file_read', { fileBase: fileBasename(filePath), offset, limit });
      const command = `file_read ${filePath}`;
      const reasoning = 'Read file content.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('file_read', command, reasoning, 'low')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      try {
        const content = await readFile(filePath, 'utf8');
        const fileHash = fingerprint(content);
        const lines = content.split(/\r?\n/);
        const startIndex = Math.max(0, offset - 1);
        const selectedLines = lines.slice(startIndex, startIndex + limit);
        const withLineNumbers = selectedLines.map((line, index) => {
          const lineNumber = String(startIndex + index + 1);
          return `${lineNumber} | ${line}`;
        });
        const isTruncated = startIndex + limit < lines.length;
        if (isTruncated) {
          withLineNumbers.push('... [Truncated, use offset and limit to read more] ...');
        }
        return `<untrusted_data>\n[FileHash: ${fileHash}]\n${withLineNumbers.join('\n')}\n</untrusted_data>`;
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_read', error }, 'Tool execution exception');
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return `<untrusted_data>\nFile not found\n</untrusted_data>`;
        }
        return `<untrusted_data>\n${String(error instanceof Error ? error.message : error)}\n</untrusted_data>`;
      }
    },
  });
}
