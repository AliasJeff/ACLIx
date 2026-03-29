import pc from 'picocolors';

import { executeChatWorkflow } from '../../application/workflows/chat.js';
import { logger } from '../../infrastructure/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { requireAuth } from '../middlewares/index.js';
import { askDangerConfirmation } from '../ui/prompts.js';
import { spinner } from '../ui/spinner.js';

export async function chatAction(query: string, signal?: AbortSignal): Promise<void> {
  requireAuth();

  const callbacks: AgentCallbacks = {
    onStepFinish: (event) => {
      const { text, toolCalls } = event;
      logger.debug({ text, toolCalls }, 'Step finished');
      if (text) {
        console.info(pc.dim(`\n🧠 Thought: ${text}`));
      }
    },
    onBeforeExecute: async (command, reasoning, risk) => {
      spinner.stop();

      console.info(pc.cyan(`\n💡 Reasoning: `) + pc.dim(reasoning));
      console.info(pc.yellow(`🛠️  Tool [shell]: `) + pc.bold(command));

      const message =
        risk === 'high'
          ? '⚠️ High-risk command detected. Execute?'
          : 'Execute this command?';

      const confirmed = await askDangerConfirmation(message, signal);

      if (confirmed) {
        spinner.start('Executing command...');
      } else {
        spinner.start('Agent is reconsidering...');
      }

      return confirmed;
    },
  };

  spinner.start('Thinking...');
  try {
    const result = await executeChatWorkflow(query, callbacks, signal);
    console.info(pc.green(`\n💬 ${result.message}\n`));
  } catch (error) {
    logger.error({ error }, 'Chat workflow failed');
    throw error;
  } finally {
    spinner.stop();
  }
}
