import pc from 'picocolors';

import { executeChatWorkflow } from '../../core/agent/chat.js';
import { setGenerating } from '../interrupt.js';
import { appLogger, errorLogger } from '../../services/logger/index.js';
import type { ModelMessage as CoreMessage } from 'ai';
import { createAgentCallbacks } from '../../ui/callbacks.js';
import { requireAuth } from '../middlewares/index.js';
import { spinner } from '../../ui/spinner.js';
import { getRandomThinkingLabel } from '../../ui/thinking.js';

export async function chatAction(query: string, signal?: AbortSignal): Promise<void> {
  appLogger.info({ scope: 'user', query }, 'User executed chat command');
  requireAuth();

  const callbacks = createAgentCallbacks(signal);

  spinner.start(getRandomThinkingLabel());
  try {
    setGenerating(true);
    // TODO: show show totalUsage
    const messages: CoreMessage[] = [{ role: 'user', content: query }];
    const result = await executeChatWorkflow(messages, callbacks, signal);
    let isFirstChunk = true;
    for await (const chunk of result.textStream) {
      if (chunk.length > 0) {
        if (spinner.isSpinning) {
          spinner.stop();
          process.stdout.write(pc.green(isFirstChunk ? '\n💬 ' : '\n\n💬 '));
          isFirstChunk = false;
        } else if (isFirstChunk) {
          spinner.stop();
          process.stdout.write(pc.green('\n💬 '));
          isFirstChunk = false;
        }
        process.stdout.write(pc.green(chunk));
      }
    }
    if (isFirstChunk) {
      spinner.stop();
      process.stdout.write(pc.green('\n💬 '));
    }
    process.stdout.write('\n');
    await result.response;
  } catch (error) {
    errorLogger.error({ error }, 'Chat workflow failed');
    throw error;
  } finally {
    setGenerating(false);
    spinner.stop();
  }
}
