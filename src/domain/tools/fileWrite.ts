import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { tool } from 'ai';
import { z } from 'zod';

import type { AgentCallbacks } from '../../shared/types.js';

const fileWriteInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative file path to write'),
  content: z.string().describe('Complete file content to write'),
});

export function createFileWriteTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Create or fully overwrite a file. Dangerous operation requiring user authorization before execution.',
    inputSchema: fileWriteInputSchema,
    execute: async ({ filePath, content }) => {
      const command = `file_write ${filePath}`;
      const reasoning = 'Write file content to disk (create or overwrite).';
      const risk = 'medium' as const;
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute(command, reasoning, risk)
        : false;

      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }

      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf8');
        return 'File written successfully';
      } catch (error: unknown) {
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
