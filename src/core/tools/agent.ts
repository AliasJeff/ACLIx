import type { ModelMessage as CoreMessage } from 'ai';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { execa } from 'execa';
import { z } from 'zod';

import type { RuntimeContext } from '../context/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { SubagentManager } from '../subagents/manager.js';
import { createAgentCallbacks } from '../../ui/callbacks.js';
import { createStandardToolRegistry } from './registry.js';
import { buildAgentSystemPrompt } from '../agent/prompt.js';
import { LLMProvider } from '../../services/llm/provider.js';
import { AclixError } from '../../shared/errors.js';
import { readLongTermMemory } from '../memory/ltm.js';
import { appLogger } from '../../services/logger/index.js';
import { spinner } from '../../ui/spinner.js';
import { logToolEvent } from './toolEvent.js';

const agentInputSchema = z.object({
  task: z
    .string()
    .describe(
      'Detailed instructions. CRITICAL: Subagents have NO shared memory. If this task depends on previous results, you MUST embed all necessary data/context (e.g. diffs, structures) directly into this string.',
    ),
  subagentName: z.string().describe('Name of the subagent to spawn'),
  isolationTaskId: z
    .string()
    .optional()
    .describe('Task ID to create an isolated Git Worktree workspace for safe execution'),
});

type AgentToolInput = z.infer<typeof agentInputSchema>;

export function createAgentTool(ctx: RuntimeContext, _mainCallbacks: AgentCallbacks) {
  return tool({
    description:
      'Spawn a specialized background subagent to complete a focused task. Use this for delegation (exploration, planning, or execution) when a separate isolated agent is helpful.',
    inputSchema: agentInputSchema,
    execute: async ({ task, subagentName, isolationTaskId }: AgentToolInput, { abortSignal }): Promise<string> => {
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
      } catch (error: unknown) {
        if (error instanceof AclixError) {
          return error.message;
        }
        return 'Error: Subagent not found.';
      }

      let releaseSlot: (() => void) | undefined;
      let subagentCwd = ctx.cwd;
      let isolatedBranchName: string | null = null;
      if (isolationTaskId) {
        const gitPath = path.join(ctx.cwd, '.git');
        if (existsSync(gitPath)) {
          const worktreesRoot = path.join(ctx.cwd, '.aclix', 'worktrees');
          const worktreeAbsolutePath = path.join(worktreesRoot, isolationTaskId);
          const worktreeRelativePath = path.relative(ctx.cwd, worktreeAbsolutePath);
          const branchName = `acli_task_${isolationTaskId}`;
          try {
            await mkdir(worktreesRoot, { recursive: true });
            const addResult = await execa(
              'git',
              ['worktree', 'add', worktreeRelativePath, '-b', branchName],
              { cwd: ctx.cwd, reject: false },
            );
            if (addResult.exitCode !== 0) {
              return `Failed to create isolated worktree for task ${isolationTaskId}.\n${addResult.stdout || addResult.stderr}`;
            }
            subagentCwd = worktreeAbsolutePath;
            isolatedBranchName = branchName;
          } catch (error: unknown) {
            return `Failed to create isolated worktree for task ${isolationTaskId}: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      }
      try {
        releaseSlot = SubagentManager.getInstance().acquireSlot(subagent.mode, subagentCwd);
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
        const subCtx: RuntimeContext = { ...ctx, cwd: subagentCwd };
        const subagentRegistry = createStandardToolRegistry(
          subCtx,
          subagentCallbacks,
          subagent.allowedTools,
          subagent.disallowedTools,
          subagent.mode === 'read-only',
          true,
        );

        // Prevent infinite recursion: subagents cannot spawn subagents.
        subagentRegistry.unregister('agent');

        const messages: CoreMessage[] = [
          {
            role: 'user',
            content:
              task +
              '\n\nIMPORTANT: Execute the task using tools. Once completed, your final text output MUST be a highly detailed data report or execution summary (including raw data, findings, or code snippets). Do NOT just say "task complete".',
          },
        ];
        const subagentMemory = await readLongTermMemory(ctx.cwd, task);
        const subCtxWithMemory: RuntimeContext = { ...subCtx, longTermMemory: subagentMemory };

        const systemPrompt = buildAgentSystemPrompt(subCtxWithMemory, {
          isSubagent: true,
          subagentMeta: subagent,
        });

        try {
          const provider = new LLMProvider();
          let text: string;
          try {
            const result = provider.executeAgent(
              messages,
              systemPrompt,
              subagentRegistry.getTools(),
              abortSignal,
              subagentCallbacks.onStepFinish,
            );
            text = await Promise.resolve(result.text);
          } finally {
            spinner.stop(subagent.name);
          }

          if (text.trim().length === 0) {
            return 'Subagent completed but returned no text summary.';
          }
          if (isolatedBranchName) {
            return `${text}\n\nChanges are isolated in worktree '${isolatedBranchName}'. Review and use merge_worktree tool to integrate.`;
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
