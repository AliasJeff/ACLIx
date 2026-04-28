import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { tool } from 'ai';
import { z } from 'zod';

import { saveSnapshot } from '../../services/database/index.js';
import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { fingerprint } from '../memory/index.js';
import { SubagentManager } from '../subagents/manager.js';
import { fileBasename, logToolEvent } from './toolEvent.js';

const fileWriteInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative file path to write'),
  content: z.string().describe('Complete file content to write'),
  expectedHash: z
    .string()
    .describe(
      "The exact FileHash obtained from your most recent file_read call. Use 'NEW_FILE' if creating a brand new file.",
    ),
});

export function createFileWriteTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Create or fully overwrite a file. Dangerous operation requiring user authorization before execution.',
    inputSchema: fileWriteInputSchema,
    execute: async ({ filePath, content, expectedHash }) => {
      logToolEvent('file_write', {
        fileBase: fileBasename(filePath),
        contentLen: content.length,
        expectedHashLen: expectedHash.length,
      });
      try {
        const fileExists = existsSync(filePath);
        const actualHash = fileExists ? fingerprint(await readFile(filePath, 'utf8')) : 'NEW_FILE';
        if (expectedHash !== actualHash) {
          return 'Execution blocked: Optimistic lock failed. The file has been modified externally or you provided a fake hash. You MUST use file_read to get the latest content and FileHash before editing.';
        }
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_write', filePath, error }, 'Failed to verify optimistic lock');
        return String(error instanceof Error ? error.message : error);
      }

      const command = `file_write ${filePath}`;
      const reasoning = 'Write file content to disk (create or overwrite).';
      const isAcliDir = /(?:^|[/\\])\.aclix?(?:[/\\]|$)/.test(filePath);
      const risk = isAcliDir ? 'low' : 'medium';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('file_write', command, reasoning, risk)
        : false;

      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }

      try {
        // Snapshot should never block or crash the tool.
        try {
          const cwd = process.cwd();
          const existed = existsSync(filePath);
          if (existed) {
            const previous = await readFile(filePath, 'utf8');
            saveSnapshot(cwd, filePath, previous);
          } else {
            // New file: mark as new so undo can delete it.
            saveSnapshot(cwd, filePath, null);
          }
        } catch (error) {
          errorLogger.error({ tool: 'file_write', filePath, error }, 'Failed to save snapshot');
        }

        const targetDir = dirname(filePath);
        const isNewDir = !existsSync(targetDir);

        await mkdir(targetDir, { recursive: true });
        await writeFile(filePath, content, 'utf8');

        if (
          isNewDir &&
          /(?:^|[/\\])\.aclix?[/\\]subagents[/\\]auto_[^/\\]+[/\\]SUBAGENT\.md$/.test(filePath)
        ) {
          SubagentManager.getInstance().trackDynamicSubagent(resolve(targetDir));
        }
        return 'File written successfully';
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_write', error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
