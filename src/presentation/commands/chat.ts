import pc from 'picocolors';

import { executeChatWorkflow } from '../../application/workflows/chat.js';
import { logger } from '../../infrastructure/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import type { ModelMessage as CoreMessage } from 'ai';
import { requireAuth } from '../middlewares/index.js';
import { askDangerConfirmation, askPassword, askTextInput } from '../ui/prompts.js';
import { spinner } from '../ui/spinner.js';

export async function chatAction(query: string, signal?: AbortSignal): Promise<void> {
  requireAuth();

  const callbacks: AgentCallbacks = {
    onStepFinish: (event) => {
      const { reasoningText, toolCalls } = event;
      logger.debug({ reasoningText, toolCalls }, 'Step finished');
    },
    onBeforeExecute: async (
      toolName: string,
      command: string,
      reasoning: string,
      risk: 'low' | 'medium' | 'high',
    ) => {
      if (risk === 'low') {
        console.info(pc.dim(`🛠️ Tool [${toolName}] `) + pc.dim(command));
        return true;
      }

      spinner.stop();

      console.info(pc.cyan(`\n💡 Reasoning: `) + pc.dim(reasoning));
      console.info(pc.yellow(`🛠️ Tool [${toolName}] `) + pc.dim(`[${risk}] `) + pc.bold(command));

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

  // TODO: display random thinking content for better user experience
  spinner.start('Thinking...');
  try {
    // TODO: show show totalUsage
    const messages: CoreMessage[] = [{ role: 'user', content: query }];
    const result = await executeChatWorkflow(messages, callbacks, signal);
    console.info(pc.green(`\n💬 ${result.message}\n`));
  } catch (error) {
    logger.error({ error }, 'Chat workflow failed');
    throw error;
  } finally {
    spinner.stop();
  }
}
