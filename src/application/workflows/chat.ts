import { buildSystemPrompt } from '../agent/prompt.js';
import { createShellTool } from '../../domain/tools/shell.js';
import { createRuntimeContext } from '../../domain/context/index.js';
import { logger } from '../../infrastructure/logger/index.js';
import { runHostCommand } from '../../infrastructure/executor/host.js';
import { LLMProvider } from '../../infrastructure/llm/provider.js';
import type { AgentCallbacks } from '../../shared/types.js';

export async function executeChatWorkflow(
  query: string,
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  const ctx = createRuntimeContext();
  const basePrompt = buildSystemPrompt({ cwd: ctx.cwd, os: ctx.platform, shell: ctx.shell });
  const systemPrompt = `${basePrompt}

You are an autonomous AI CLI assistant. You must use the provided shell tool to execute commands and achieve the user's goal step-by-step. If a command fails, observe the error and try a different approach. Do not ask the user to manually run commands; do it yourself via the tool. Once the goal is achieved, provide a natural language summary.`;

  logger.info({ systemPrompt }, 'System prompt');
  logger.info({ query }, 'Query');
  logger.info({ ctx }, 'Context');

  const tools = { shell: createShellTool(runHostCommand, callbacks) };
  const provider = new LLMProvider();
  const text = await provider.executeAgent(query, systemPrompt, tools, signal, callbacks.onStepFinish);

  return { message: text };
}
