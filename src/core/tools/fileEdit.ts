import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { tool } from 'ai';
import { z } from 'zod';

import { saveSnapshot } from '../../services/database/index.js';
import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { fingerprint } from '../memory/index.js';
import { fileBasename, logToolEvent } from './toolEvent.js';

const fileEditInputSchema = z.object({
  filePath: z.string().describe('Absolute or relative file path to edit'),
  oldString: z
    .string()
    .min(1)
    .describe(
      'The exact block of code to replace. Leading/trailing whitespaces and indentation are ignored automatically. Just provide enough consecutive lines to uniquely identify the block.',
    ),
  newString: z.string().describe('New content to replace oldString'),
  expectedHash: z
    .string()
    .describe(
      "The exact FileHash obtained from your most recent file_read call. Use 'NEW_FILE' if creating a brand new file.",
    ),
  replaceAll: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all matches when true; otherwise require unique match'),
});

function fuzzyBlockReplace(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): { success: boolean; content?: string; error?: string } {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';

  const contentLines = content.split(/\r?\n/);
  const oldLinesRaw = oldStr.split(/\r?\n/);
  const newLinesRaw = newStr.split(/\r?\n/);

  // Filter leading/trailing pure empty lines from oldStr (whitespace-only lines).
  let oldStart = 0;
  while (oldStart < oldLinesRaw.length && (oldLinesRaw[oldStart] ?? '').trim() === '') {
    oldStart += 1;
  }
  let oldEnd = oldLinesRaw.length;
  while (oldEnd > oldStart && (oldLinesRaw[oldEnd - 1] ?? '').trim() === '') {
    oldEnd -= 1;
  }
  const oldLines = oldLinesRaw.slice(oldStart, oldEnd);

  if (oldLines.length === 0) {
    return {
      success: false,
      error: 'Error: oldString is empty after ignoring leading/trailing whitespace-only lines.',
    };
  }

  const contentLen = contentLines.length;
  const oldLen = oldLines.length;

  const matches: number[] = [];

  if (contentLen >= oldLen) {
    for (let start = 0; start <= contentLen - oldLen; start += 1) {
      let ok = true;
      for (let j = 0; j < oldLen; j += 1) {
        const cTrim = (contentLines[start + j] ?? '').trim();
        const oTrim = (oldLines[j] ?? '').trim();
        if (cTrim !== oTrim) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matches.push(start);
      }
    }
  }

  if (matches.length > 1 && !replaceAll) {
    return {
      success: false,
      error: 'Error: Found multiple matching blocks. Please provide more surrounding lines in oldString to make it unique.',
    };
  }

  if (matches.length === 0) {
    // Core self-correction: choose the most similar sliding window by number of matched trimmed lines.
    let bestStart = 0;
    let bestScore = -1;
    const windows = contentLen - oldLen;

    if (windows >= 0) {
      for (let start = 0; start <= windows; start += 1) {
        let score = 0;
        for (let j = 0; j < oldLen; j += 1) {
          const cTrim = (contentLines[start + j] ?? '').trim();
          const oTrim = (oldLines[j] ?? '').trim();
          if (cTrim === oTrim) {
            score += 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = start;
        }
      }
    } else {
      // If file is shorter than old block, fall back to showing the whole file.
      bestStart = 0;
      bestScore = 0;
    }

    const startLineNumber = bestStart + 1; // 1-based for user friendliness.
    const displayEnd = windows >= 0 ? bestStart + oldLen : contentLen;
    const bestBlockLines =
      displayEnd > bestStart ? contentLines.slice(bestStart, Math.min(displayEnd, contentLen)) : [];
    const bestBlock = bestBlockLines.join(newline);

    return {
      success: false,
      error: `Error: oldString not found (ignoring whitespaces). Did you mean the block starting at line ${String(
        startLineNumber,
      )}?\n\n${bestBlock}`,
    };
  }

  // Unique match (or replaceAll=true): replace from back to front to avoid index shifting.
  const updatedLines = [...contentLines];

  const sortedStarts = [...matches].sort((a, b) => b - a);
  for (const start of sortedStarts) {
    const firstLine = updatedLines[start] ?? '';
    const baseIndentMatch = /^[ \t]*/.exec(firstLine);
    const baseIndent = baseIndentMatch ? baseIndentMatch[0] : '';

    const replacementLines = newLinesRaw.map((line) => {
      if (line.trim() === '') {
        return '';
      }
      // If LLM didn't provide indentation for this line, try compensating with Base Indent.
      return /^[ \t]/.test(line) ? line : `${baseIndent}${line}`;
    });

    updatedLines.splice(start, oldLen, ...replacementLines);
  }

  return { success: true, content: updatedLines.join('\n') };
}

export function createFileEditTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Modify an existing file using whitespace-agnostic line-block replacement. Safer than rewriting whole files.',
    inputSchema: fileEditInputSchema,
    execute: async ({ filePath, oldString, newString, expectedHash, replaceAll }) => {
      logToolEvent('file_edit', {
        fileBase: fileBasename(filePath),
        oldStringLen: oldString.length,
        newStringLen: newString.length,
        expectedHashLen: expectedHash.length,
        replaceAll,
      });
      try {
        const fileExists = existsSync(filePath);
        const actualHash = fileExists ? fingerprint(await readFile(filePath, 'utf8')) : 'NEW_FILE';
        if (expectedHash !== actualHash) {
          return 'Execution blocked: Optimistic lock failed. The file has been modified externally or you provided a fake hash. You MUST use file_read to get the latest content and FileHash before editing.';
        }
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_edit', filePath, error }, 'Failed to verify optimistic lock');
        return String(error instanceof Error ? error.message : error);
      }

      const command = `file_edit ${filePath}`;
      const reasoning = 'Edit existing file by exact oldString replacement.';
      const isAcliDir = /(?:^|[/\\])\.aclix?(?:[/\\]|$)/.test(filePath);
      const risk = isAcliDir ? 'low' : 'medium';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('file_edit', command, reasoning, risk)
        : false;

      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }

      try {
        if (!existsSync(filePath)) {
          return 'Error: File does not exist.';
        }

        const content = await readFile(filePath, 'utf8');
        const result = fuzzyBlockReplace(content, oldString, newString, replaceAll);
        if (!result.success) {
          return result.error ?? 'Error: oldString not found.';
        }

        // Snapshot should never block or crash the tool.
        try {
          saveSnapshot(process.cwd(), filePath, content);
        } catch (error) {
          errorLogger.error({ tool: 'file_edit', filePath, error }, 'Failed to save snapshot');
        }

        await writeFile(filePath, result.content ?? content, 'utf8');
        return 'File edited successfully';
      } catch (error: unknown) {
        errorLogger.error({ tool: 'file_edit', error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
