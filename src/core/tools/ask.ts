import { tool } from 'ai';
import { z } from 'zod';

import type { AgentCallbacks } from '../../shared/types.js';
import { logToolEvent } from './toolEvent.js';

const askUserInputSchema = z.object({
  message: z.string().describe('The prompt message to show to the user'),
  isSecret: z
    .boolean()
    .optional()
    .describe('Set to true if asking for a password or sensitive credential (input will be masked)'),
});

type AskUserInput = z.infer<typeof askUserInputSchema>;

export function createAskUserTool(callbacks: AgentCallbacks) {
  return tool({
    description:
      'Ask the human user for required information, such as passwords, missing parameters, or explicit confirmations. Use this BEFORE running commands that would otherwise require interactive terminal input.',
    inputSchema: askUserInputSchema,
    execute: async ({ message, isSecret }: AskUserInput): Promise<string> => {
      logToolEvent('ask_user', {
        messageLen: message.length,
        isSecret: isSecret ?? false,
        ...(isSecret ? {} : { messagePrefix: message.slice(0, 80) }),
      });
      if (!callbacks.onAskUser) {
        return 'Error: Cannot ask user in this environment.';
      }
      return await callbacks.onAskUser(message, isSecret);
    },
  });
}
