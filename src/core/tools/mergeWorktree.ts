import { execa } from 'execa';
import { tool } from 'ai';
import { z } from 'zod';

import type { AgentCallbacks } from '../../shared/types.js';
import { errorLogger } from '../../services/logger/index.js';
import { logToolEvent } from './toolEvent.js';

const mergeWorktreeInputSchema = z.object({
  taskId: z.string().min(1).describe('Task ID that maps to branch acli_task_<taskId> and worktree path'),
});

export function createMergeWorktreeTool(ctxCwd: string, callbacks: AgentCallbacks) {
  return tool({
    description:
      "Merge isolated worktree branch back to current branch and clean up sandbox. Intended for Master agent review/integration flow.",
    inputSchema: mergeWorktreeInputSchema,
    execute: async ({ taskId }) => {
      logToolEvent('merge_worktree', { taskId });

      const command = `git merge acli_task_${taskId}`;
      const reasoning = 'Integrate isolated task branch back into main workspace.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('merge_worktree', command, reasoning, 'medium')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      const branchName = `acli_task_${taskId}`;
      const worktreePath = `.aclix/worktrees/${taskId}`;
      try {
        const mergeResult = await execa('git', ['merge', branchName], {
          cwd: ctxCwd,
          reject: false,
        });
        if (mergeResult.exitCode !== 0) {
          return `Merge failed for ${branchName}.\n${mergeResult.stdout || mergeResult.stderr}`;
        }

        const removeResult = await execa('git', ['worktree', 'remove', worktreePath], {
          cwd: ctxCwd,
          reject: false,
        });
        if (removeResult.exitCode !== 0) {
          return `Merged ${branchName}, but worktree cleanup failed.\n${removeResult.stdout || removeResult.stderr}`;
        }

        const deleteBranchResult = await execa('git', ['branch', '-d', branchName], {
          cwd: ctxCwd,
          reject: false,
        });
        if (deleteBranchResult.exitCode !== 0) {
          return `Merged ${branchName}, but branch cleanup failed.\n${deleteBranchResult.stdout || deleteBranchResult.stderr}`;
        }

        return `Merged and cleaned worktree for ${branchName}.`;
      } catch (error: unknown) {
        errorLogger.error({ tool: 'merge_worktree', taskId, error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
