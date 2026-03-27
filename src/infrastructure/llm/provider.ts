import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

import { configManager } from '../config/index.js';
import { DEFAULT_MODEL } from '../../shared/constants.js';
import { LLMError } from '../../shared/errors.js';
import { createDeepSeek } from '@ai-sdk/deepseek';

export class LLMProvider {
  private readonly modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? configManager.get('model') ?? DEFAULT_MODEL;
  }

  streamChat(prompt: string, signal?: AbortSignal) {
    configManager.hasAuth();
    const apiKey = configManager.get('apiKey');
    if (!apiKey) {
      throw new LLMError('Missing API key');
    }

    const providerName = configManager.get('provider') ?? 'openai';
    let model: ReturnType<ReturnType<typeof createOpenAI>>;

    switch (providerName) {
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey });
        model = anthropic(this.modelId);
        break;
      }
      case 'google': {
        const google = createGoogleGenerativeAI({ apiKey });
        model = google(this.modelId);
        break;
      }
      case 'openai': {
        const openai = createOpenAI({ apiKey });
        model = openai(this.modelId);
        break;
      }
      case 'minimax': {
        const minimax = createAnthropic({
          apiKey,
          baseURL: 'https://api.minimaxi.com/anthropic/v1',
        });
        model = minimax(this.modelId);
        break;
      }
      case 'deepseek': {
        const deepseek = createDeepSeek({
          apiKey,
        });
        model = deepseek(this.modelId);
        break;
      }
      default:
        throw new LLMError(`Unsupported provider: ${providerName}`);
    }

    const result = streamText({
      model,
      prompt,
      abortSignal: signal,
    });

    return result.textStream;
  }
}
