import type { ModelMessage as CoreMessage } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

import type { RuntimeContext } from '../context/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { SubagentManager } from '../subagents/manager.js';
import { createAgentCallbacks } from '../../ui/callbacks.js';
import { createStandardToolRegistry } from './registry.js';
import { buildAgentSystemPrompt as _buildAgentSystemPrompt } from '../agent/prompt.js';
import type { PromptBuilderOptions } from '../agent/prompt.js';
import { LLMProvider } from '../../services/llm/provider.js';
import { AclixError } from '../../shared/errors.js';
import { appLogger } from '../../services/logger/index.js';
import { logToolEvent } from './toolEvent.js';

const agentInputSchema = z.object({
  task: z.string().describe('Detailed instructions for the subagent to execute'),
  subagentName: z.string().describe('Name of the subagent to spawn'),
});

type AgentToolInput = z.infer<typeof agentInputSchema>;

export function createAgentTool(ctx: RuntimeContext, _mainCallbacks: AgentCallbacks) {
  return tool({
    description:
      'Spawn a specialized background subagent to complete a focused task. Use this for delegation (exploration, planning, or execution) when a separate isolated agent is helpful.',
    inputSchema: agentInputSchema,
    execute: async ({ task, subagentName }: AgentToolInput, { abortSignal }): Promise<string> => {
      if (_mainCallbacks.onBeforeExecute) {
        const approved = await _mainCallbacks.onBeforeExecute(
          'agent',
          `agent ${subagentName}`,
          `Delegating task to subagent ${subagentName}`,
          'low',
        );
        if (!approved) {
          return 'Execution rejected.';
        }
      }

      logToolEvent('agent', { subagentName: subagentName.trim(), taskLen: task.length });
      await SubagentManager.getInstance().scanSubagents(ctx.cwd);

      let subagent;
      try {
        subagent = SubagentManager.getInstance().getSubagent(subagentName);
      } catch {
        return 'Error: Subagent not found.';
      }

      let releaseSlot: (() => void) | undefined;
      try {
        releaseSlot = SubagentManager.getInstance().acquireSlot(subagent.mode);
      } catch (error: unknown) {
        if (error instanceof AclixError) {
          return error.message;
        }
        return String(error instanceof Error ? error.message : error);
      }

      try {
        appLogger.info(
          {
            scope: 'agent',
            tool: 'agent',
            subagentName: subagent.name,
            mode: subagent.mode,
            allowedTools: subagent.allowedTools,
            disallowedTools: subagent.disallowedTools,
          },
          'Spawning subagent',
        );

        const subagentCallbacks = createAgentCallbacks(abortSignal, {
          isSubagent: true,
          agentName: subagent.name,
        });
        const subagentRegistry = createStandardToolRegistry(
          ctx,
          subagentCallbacks,
          subagent.allowedTools,
          subagent.disallowedTools,
          subagent.mode === 'read-only',
        );

        // Prevent infinite recursion: subagents cannot spawn subagents.
        subagentRegistry.unregister('agent');

        const messages: CoreMessage[] = [
          {
            role: 'user',
            content:
              task +
              '\n\nIMPORTANT: Execute the task using tools. Once completed, your final text output MUST contain a comprehensive summary.',
          },
        ];
        const buildAgentSystemPrompt = _buildAgentSystemPrompt as unknown as (
          runtimeCtx: RuntimeContext,
          options?: PromptBuilderOptions,
        ) => string;

        const systemPrompt = buildAgentSystemPrompt(ctx, {
          isSubagent: true,
          subagentMeta: subagent,
        });

        try {
          const provider = new LLMProvider();
          const result = provider.executeAgent(
            messages,
            systemPrompt,
            subagentRegistry.getTools(),
            abortSignal,
            subagentCallbacks.onStepFinish,
          );

          const text = await Promise.resolve(result.text);
          if (text.trim().length === 0) {
            return 'Subagent completed but returned no text summary.';
          }
          return text;
        } catch (error: unknown) {
          appLogger.error({ scope: 'agent', tool: 'agent', error }, 'Subagent execution failed');
          return `Subagent execution failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      } finally {
        releaseSlot();
      }
    },
  });
}

