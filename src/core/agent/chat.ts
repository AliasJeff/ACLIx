import type { ModelMessage as CoreMessage } from 'ai';

import { createRuntimeContext } from '../context/index.js';
import type { RuntimeContext } from '../context/index.js';
import { buildAgentSystemPrompt as _buildAgentSystemPrompt } from './prompt.js';
import type { PromptBuilderOptions } from './prompt.js';
import { RuleManager } from '../rules/manager.js';
import { SkillManager } from '../skills/manager.js';
import { SubagentManager } from '../subagents/manager.js';
import { createStandardToolRegistry } from '../tools/registry.js';
import { appLogger } from '../../services/logger/index.js';
import { configManager } from '../../services/config/index.js';
import { LLMProvider } from '../../services/llm/provider.js';
import type { AgentCallbacks } from '../../shared/types.js';

export async function executeChatWorkflow(
  messages: CoreMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
): Promise<ReturnType<LLMProvider['executeAgent']>> {
  const ctx: RuntimeContext = await createRuntimeContext();
  const enableSubagents = configManager.get('enableSubagents') === true;
  await SkillManager.getInstance().scanSkills(ctx.cwd);
  await RuleManager.getInstance().scanRules(ctx.cwd);
  if (enableSubagents) {
    await SubagentManager.getInstance().scanSubagents(ctx.cwd);
  }

  const buildAgentSystemPrompt = _buildAgentSystemPrompt as unknown as (
    runtimeCtx: RuntimeContext,
    options?: PromptBuilderOptions,
  ) => string;

  const systemPrompt = buildAgentSystemPrompt(ctx, { isSubagent: false });

  appLogger.info(
    {
      scope: 'agent',
      cwd: ctx.cwd,
      systemPrompt,
      systemPromptLength: systemPrompt.length,
      messageCount: messages.length,
    },
    'Agent workflow started',
  );

  const toolRegistry = createStandardToolRegistry(ctx, callbacks);
  const provider = new LLMProvider();
  try {
    return provider.executeAgent(
      messages,
      systemPrompt,
      toolRegistry.getTools(),
      signal,
      callbacks.onStepFinish,
    );
  } finally {
    if (enableSubagents) {
      await SubagentManager.getInstance().cleanupDynamicSubagents();
    }
  }
}
