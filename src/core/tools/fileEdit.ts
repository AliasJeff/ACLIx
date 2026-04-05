import { readFile, writeFile } from 'node:fs/promises';

import { tool } from 'ai';
import { z } from 'zod';

import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';

const fileEditInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative file path to edit'),
  oldString: z
    .string()
    .min(1)
    .describe('Exact old content to replace, including whitespaces and indentation'),
  newString: z.string().describe('New content to replace oldString'),
  replaceAll: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all matches when true; otherwise require unique match'),
});

function countOccurrences(content: string, target: string): number {
  let count = 0;
  let startIndex = 0;
  let foundIndex = content.indexOf(target, startIndex);
  while (foundIndex !== -1) {
    count += 1;
    startIndex = foundIndex + target.length;
    foundIndex = content.indexOf(target, startIndex);
  }
  return count;
}

export function createFileEditTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Modify an existing file using exact string match replacement. Safer than rewriting whole files.',
    inputSchema: fileEditInputSchema,
    execute: async ({ filePath, oldString, newString, replaceAll }) => {
      const command = `file_edit ${filePath}`;
      const reasoning = 'Edit existing file by exact oldString replacement.';
      const risk = 'medium' as const;
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('file_edit', command, reasoning, risk)
        : false;

      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }

      try {
        const content = await readFile(filePath, 'utf8');
        if (!content.includes(oldString)) {
          return 'Error: oldString not found. Please ensure exact match including whitespaces and indentation. Use file_read to check the exact content.';
        }

        const occurrences = countOccurrences(content, oldString);
        if (occurrences > 1 && !replaceAll) {
          return 'Error: oldString is not unique (found multiple matches). Please provide more surrounding context (include nearby lines) so the match is unique, or set replaceAll=true if intentional.';
        }

        const updatedContent = replaceAll
          ? content.replaceAll(oldString, newString)
          : content.replace(oldString, newString);
        await writeFile(filePath, updatedContent, 'utf8');
        return 'File edited successfully';
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_edit', error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
