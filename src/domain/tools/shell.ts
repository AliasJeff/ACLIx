import { tool } from 'ai';
import { z } from 'zod';

import { evaluateCommandRisk } from '../security/evaluator.js';
import type { AgentCallbacks } from '../../shared/types.js';

const shellInputSchema = z.object({
  command: z.string().describe('The precise shell command to execute'),
  reasoning: z.string().describe('Step-by-step reasoning explaining why this command is needed'),
});

export function createShellTool(
  executeCommand: (cmd: string) => Promise<string>,
  callbacks: AgentCallbacks,
) {
  return tool({
    description:
      'Execute shell commands on the host operating system. Use this to interact with the file system, run scripts, or system utilities.',
    inputSchema: shellInputSchema,
    execute: async ({ command, reasoning }) => {
      const risk = evaluateCommandRisk(command);
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute(command, reasoning, risk)
        : false;
      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }
      try {
        return await executeCommand(command);
      } catch (error: unknown) {
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
