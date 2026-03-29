import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, stepCountIs, streamText } from 'ai';
import type { LanguageModel, Tool as CoreTool } from 'ai';
import type { ZodType } from 'zod';

import { configManager } from '../config/index.js';
import { DEFAULT_MAX_STEPS, DEFAULT_MODEL } from '../../shared/constants.js';
import { LLMError } from '../../shared/errors.js';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { logger } from '../logger/index.js';

export class LLMProvider {
  private readonly modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? configManager.get('model') ?? DEFAULT_MODEL;
  }

  private getModel(): LanguageModel {
    configManager.hasAuth();
    const apiKey = configManager.get('apiKey');
    if (!apiKey) {
      throw new LLMError('Missing API key');
    }

    const providerName = configManager.get('provider') ?? 'openai';

    switch (providerName) {
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey });
        return anthropic(this.modelId);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({ apiKey });
        return google(this.modelId);
      }
      case 'openai': {
        const openai = createOpenAI({ apiKey });
        return openai(this.modelId);
      }
      case 'minimax': {
        const minimax = createAnthropic({
          apiKey,
          baseURL: 'https://api.minimaxi.com/anthropic/v1',
        });
        return minimax(this.modelId);
      }
      case 'deepseek': {
        const deepseek = createDeepSeek({
          apiKey,
        });
        return deepseek(this.modelId);
      }
      default:
        throw new LLMError(`Unsupported provider: ${providerName}`);
    }
  }

  streamChat(prompt: string, signal?: AbortSignal) {
    const model = this.getModel();

    const result = streamText({
      model,
      prompt,
      abortSignal: signal,
    });

    return result.textStream;
  }

  async executeAgent(
    prompt: string,
    systemPrompt: string,
    tools: Record<string, CoreTool>,
    signal?: AbortSignal,
    onStepFinish?: Parameters<typeof generateText>[0]['onStepFinish'],
  ): Promise<string> {
    configManager.hasAuth();
    const result = await generateText({
      model: this.getModel(),
      system: systemPrompt,
      prompt,
      tools,
      stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
      abortSignal: signal,
      onStepFinish,
    });
    logger.debug({ result }, 'executeAgent result');
    return result.text;
  }

  async generateStructured<T>(
    prompt: string,
    systemPrompt: string,
    schema: ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    configManager.hasAuth();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Vercel AI `generateObject` is required for Zod-backed structured output (see task spec).
    const result = await generateObject({
      model: this.getModel(),
      system: systemPrompt,
      prompt,
      schema,
      abortSignal: signal,
    });

    return result.object;
  }
}
