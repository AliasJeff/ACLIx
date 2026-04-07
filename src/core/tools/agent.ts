import type { ModelMessage as CoreMessage } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

import type { RuntimeContext } from '../context/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { SubagentManager } from '../subagents/manager.js';
import { createAgentCallbacks } from '../../ui/callbacks.js';
import { createStandardToolRegistry } from './registry.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { LLMProvider } from '../../services/llm/provider.js';
import { AclixError } from '../../shared/errors.js';
import { appLogger } from '../../services/logger/index.js';

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
        );

        // Prevent infinite recursion: subagents cannot spawn subagents.
        subagentRegistry.unregister('agent');

        const messages: CoreMessage[] = [{ role: 'user', content: task }];
        const systemPrompt =
          buildSystemPrompt({ cwd: ctx.cwd, os: ctx.platform, shell: ctx.shell }) +
          '\n\n' +
          subagent.systemPrompt;

        const result = new LLMProvider().executeAgent(
          messages,
          systemPrompt,
          subagentRegistry.getTools(),
          abortSignal,
          subagentCallbacks.onStepFinish,
        );

        const text = await Promise.resolve(result.text);
        return text;
      } finally {
        releaseSlot();
      }
    },
  });
}

