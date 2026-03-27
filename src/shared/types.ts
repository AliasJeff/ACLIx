export interface CliContext {
  cwd: string;
  args: string[];
}

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'azure-openai' | 'minimax' | 'deepseek';

export interface UserConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
  temperature?: number;
  maxTokens?: number;
}
