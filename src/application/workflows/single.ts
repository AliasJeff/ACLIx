import { IntentRouter } from '../router/index.js';
import { LLMProvider } from '../../infrastructure/llm/provider.js';
import { spinner } from '../../presentation/ui/spinner.js';

export async function executeSingleWorkflow(input: string, signal?: AbortSignal): Promise<void> {
  const router = new IntentRouter();
  const intent = router.route(input);

  spinner.start('Thinking...');
  const provider = new LLMProvider();
  const stream = provider.streamChat(intent.query, signal);

  let isFirstChunk = true;
  try {
    for await (const chunk of stream) {
      if (isFirstChunk) {
        spinner.stop();
        isFirstChunk = false;
      }
      process.stdout.write(chunk);
    }
    process.stdout.write('\n');
  } finally {
    spinner.stop();
  }
}
