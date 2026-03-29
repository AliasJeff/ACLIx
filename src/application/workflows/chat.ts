import type { Tool } from 'ai';

import { buildSystemPrompt } from '../agent/prompt.js';
import { createAskUserTool } from '../../domain/tools/ask.js';
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

You are an autonomous AI CLI assistant. Use the shell tool to run commands and reach the user's goal step-by-step. If a command fails, read the error and adjust your plan. Do not tell the user to run commands manually; execute them via the tool. When the goal is done, reply with a clear natural-language summary.

CRITICAL ENVIRONMENT CONSTRAINTS: You are running in a headless, non-interactive shell. Commands that block and wait for user input (like 'mysql -p', 'sudo' without -S, 'vim', 'nano') will HANG FOREVER and timeout. YOU MUST NEVER EXECUTE INTERACTIVE COMMANDS.
If you need a password (e.g., for database connection or sudo), YOU MUST FIRST use the 'ask_user' tool with isSecret=true to get the password from the user. Then, execute the shell command non-interactively by injecting the password via environment variables (e.g., MYSQL_PWD='<pwd>' mysql ...) or stdin piping.

For every shell tool call you must set the risk field yourself:
- low: read-only or safe inspection (listing files, reading content, grep, git status/log/diff, pwd, environment inspection). These may run without a user confirmation prompt.
- medium: mutating but not catastrophic (installs, builds, moves, edits to project files, git commit, network fetches that write data).
- high: destructive, privileged, or system-wide impact (mass delete, chmod on sensitive paths, sudo, disk or service changes).

If you are unsure between medium and high, choose the higher level.`;

  logger.debug({ systemPrompt }, 'System prompt');
  logger.debug({ query }, 'Query');
  logger.debug({ ctx }, 'Context');

  const tools: Record<string, Tool> = {
    shell: createShellTool(runHostCommand, callbacks),
    ask_user: createAskUserTool(callbacks),
  };
  const provider = new LLMProvider();
  const text = await provider.executeAgent(
    query,
    systemPrompt,
    tools,
    signal,
    callbacks.onStepFinish,
  );

  return { message: text };
}
