import { tool } from 'ai';
import { z } from 'zod';

import { getToolOutput } from '../../services/database/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { logToolEvent } from './toolEvent.js';

const readToolOutputInputSchema = z.object({
  outputId: z.string().min(1).describe('Output ID returned by truncated tool output'),
  offsetLine: z.number().int().min(1).default(1).describe('1-based line number to start reading from'),
  limitLines: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(100)
    .describe('Maximum number of lines to return'),
});

export function createReadToolOutputTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Read paginated lines from previously truncated tool output by output ID. Returns line-numbered text slices.',
    inputSchema: readToolOutputInputSchema,
    execute: async ({ outputId, offsetLine, limitLines }) => {
      logToolEvent('read_tool_output', {
        outputId,
        offsetLine,
        limitLines,
      });

      const command = `read_tool_output ${outputId} --offset ${String(offsetLine)} --limit ${String(limitLines)}`;
      const reasoning = 'Read paginated cached tool output to continue analysis.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('read_tool_output', command, reasoning, 'low')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      const content = getToolOutput(outputId);
      if (content === null) {
        return `No stored output found for ID: ${outputId}`;
      }

      const lines = content.split(/\r?\n/);
      const startIndex = offsetLine - 1;
      const endIndex = Math.min(startIndex + limitLines, lines.length);

      if (startIndex >= lines.length) {
        return `Requested offsetLine ${String(offsetLine)} exceeds total lines ${String(lines.length)}.`;
      }

      const result = lines
        .slice(startIndex, endIndex)
        .map((line, index) => `${String(offsetLine + index)}: ${line}`)
        .join('\n');

      return `${result}\n\n[Showing lines ${String(offsetLine)}-${String(endIndex)} of ${String(lines.length)}]`;
    },
  });
}
