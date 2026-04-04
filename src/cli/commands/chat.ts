import pc from 'picocolors';

import { executeChatWorkflow } from '../../core/agent/chat.js';
import { logger } from '../../services/logger/index.js';
import type { ModelMessage as CoreMessage } from 'ai';
import { createAgentCallbacks } from '../../ui/callbacks.js';
import { requireAuth } from '../middlewares/index.js';
import { spinner } from '../../ui/spinner.js';

export async function chatAction(query: string, signal?: AbortSignal): Promise<void> {
  requireAuth();

  const callbacks = createAgentCallbacks(signal);

  // TODO: display random thinking content for better user experience
  spinner.start('Thinking...');
  try {
    // TODO: show show totalUsage
    const messages: CoreMessage[] = [{ role: 'user', content: query }];
    const result = executeChatWorkflow(messages, callbacks, signal);
    let isFirstChunk = true;
    for await (const chunk of result.textStream) {
      if (isFirstChunk && chunk.length > 0) {
        spinner.stop();
        process.stdout.write(pc.green('\n💬 '));
        isFirstChunk = false;
      }
      process.stdout.write(pc.green(chunk));
    }
    if (isFirstChunk) {
      spinner.stop();
      process.stdout.write(pc.green('\n💬 '));
    }
    process.stdout.write('\n');
    await result.response;
  } catch (error) {
    logger.error({ error }, 'Chat workflow failed');
    throw error;
  } finally {
    spinner.stop();
  }
}
