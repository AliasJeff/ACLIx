import pc from 'picocolors';

import { executeChatWorkflow } from '../../application/workflows/chat.js';
import { logger } from '../../infrastructure/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { requireAuth } from '../middlewares/index.js';
import { askDangerConfirmation, askPassword, askTextInput } from '../ui/prompts.js';
import { spinner } from '../ui/spinner.js';

export async function chatAction(query: string, signal?: AbortSignal): Promise<void> {
  requireAuth();

  const callbacks: AgentCallbacks = {
    onStepFinish: (event) => {
      const { text, toolCalls } = event;
      logger.debug({ text, toolCalls }, 'Step finished');
      if (text) {
        // FIXME: thinking content should be displayed on the top of the output
        console.info(pc.dim(`\n🧠 Thought: ${text}`));
      }
    },
    onBeforeExecute: async (command, reasoning, risk) => {
      spinner.stop();

      console.info(pc.cyan(`\n💡 Reasoning: `) + pc.dim(reasoning));
      console.info(pc.yellow(`🛠️  Tool [shell] `) + pc.dim(`[${risk}] `) + pc.bold(command));

      if (risk === 'low') {
        spinner.start('Executing command...');
        return true;
      }

      const message =
        risk === 'high'
          ? '⚠️ High-risk command detected. Execute?'
          : 'This command may change system or project state. Execute?';

      const confirmed = await askDangerConfirmation(message, signal);

      if (confirmed) {
        spinner.start('Executing command...');
      } else {
        spinner.start('Agent is reconsidering...');
      }

      return confirmed;
    },
    onAskUser: async (message: string, isSecret?: boolean) => {
      spinner.stop();

      console.info(pc.cyan('\n🙋 Agent needs your input:'));
      const answer = isSecret
        ? await askPassword(message, '*', signal)
        : await askTextInput(message, signal);

      spinner.start('Agent is resuming...');
      return answer;
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
