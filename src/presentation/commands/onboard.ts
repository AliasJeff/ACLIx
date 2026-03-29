import type { CAC } from 'cac';
import type { Logger } from 'pino';

import { configManager } from '../../infrastructure/config/index.js';
import type { LLMProvider, UserConfig } from '../../shared/types.js';
import { askPassword, askSelect, showIntro, showOutro } from '../ui/prompts.js';

type SupportedProvider = Extract<
  LLMProvider,
  'openai' | 'anthropic' | 'google' | 'minimax' | 'deepseek'
>;

export async function onboardAction(signal?: AbortSignal): Promise<void> {
  showIntro('Welcome to ACLIx onboarding');

  const providerOptions: {
    value: SupportedProvider;
    label: string;
    hint: string;
  }[] = [
    {
      value: 'openai',
      label: 'OpenAI',
      hint: 'GPT-4o / o3 family',
    },
    {
      value: 'anthropic',
      label: 'Anthropic',
      hint: 'Claude 3.5 / 3.7',
    },
    {
      value: 'google',
      label: 'Google',
      hint: 'Gemini 1.5 / 2.5',
    },
    {
      value: 'minimax',
      label: 'MiniMax',
      hint: 'abab7 / MiniMax-M1 series',
    },
    {
      value: 'deepseek',
      label: 'DeepSeek',
      hint: 'deepseek-chat / deepseek-reasoner',
    },
  ];
  const provider = await askSelect<SupportedProvider>(
    'Choose your LLM provider',
    providerOptions,
    signal,
  );

  const apiKey = await askPassword('Enter your API Key', '*', signal);
  const modelOptionsByProvider: Record<SupportedProvider, { value: string; label: string }[]> = {
    openai: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'o3-mini', label: 'o3-mini' },
    ],
    anthropic: [
      { value: 'claude-3-7-sonnet-latest', label: 'claude-3-7-sonnet-latest' },
      { value: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
    ],
    google: [
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    ],
    minimax: [
      { value: 'abab7-chat-preview', label: 'abab7-chat-preview' },
      { value: 'MiniMax-M1-40k', label: 'MiniMax-M1-40k' },
    ],
    deepseek: [
      { value: 'deepseek-chat', label: 'deepseek-chat' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner' },
    ],
  };
  const model: UserConfig['model'] = await askSelect(
    'Choose your default model',
    modelOptionsByProvider[provider],
    signal,
  );

  configManager.set('provider', provider);
  configManager.set('apiKey', apiKey);
  configManager.set('model', model);

  showOutro(
    'Onboarding completed. Try `acli chat "Create test_agent/ dir and create a txt file with content hello in it"` to test.',
  );
}

export function registerOnboardCommand(cli: CAC, logger: Logger): void {
  cli.command('onboard', 'Initialize local CLI profile').action(async () => {
    await onboardAction();
    logger.info('onboard completed');
  });
}
