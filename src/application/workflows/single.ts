import { IntentRouter } from '../router/index.js';
import { LLMProvider } from '../../infrastructure/llm/provider.js';
import { logger } from '../../infrastructure/logger/index.js';
import { spinner } from '../../presentation/ui/spinner.js';

export async function executeSingleWorkflow(input: string, signal?: AbortSignal): Promise<void> {
  const router = new IntentRouter();
  const intent = router.route(input);
  logger.info({ query: intent.query }, 'Executing single workflow');

  spinner.start('Thinking...');
  const provider = new LLMProvider();
  logger.debug('Requesting LLM stream...');
  const stream = provider.streamChat(intent.query, signal);

  let isFirstChunk = true;
  try {
    for await (const chunk of stream) {
      if (isFirstChunk) {
        logger.debug('Received first chunk (TTFB metric)');
        spinner.stop();
        isFirstChunk = false;
      }
      process.stdout.write(chunk);
    }
    process.stdout.write('\n');
    logger.info('Workflow stream completed successfully');
  } finally {
    spinner.stop();
  }
}
