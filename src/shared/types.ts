import type { GenerateTextOnStepFinishCallback, ToolSet } from 'ai';

export interface CliContext {
  cwd: string;
  args: string[];
}

export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure-openai'
  | 'minimax'
  | 'deepseek';

export interface UserConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentCallbacks {
  onStepFinish?: GenerateTextOnStepFinishCallback<ToolSet>;
  onBeforeExecute?: (
    command: string,
    reasoning: string,
    risk: 'low' | 'medium' | 'high',
  ) => Promise<boolean>;
  onAskUser?: (message: string, isSecret?: boolean) => Promise<string>;
}
