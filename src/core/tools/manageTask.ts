import { tool } from 'ai';
import { z } from 'zod';

import {
  getActiveTaskGraph,
  saveTask,
  type TaskRecord,
  type TaskStatus,
  updateTaskStatus,
} from '../../services/database/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { logToolEvent } from './toolEvent.js';

const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed']);

const manageTaskInputSchema = z.object({
  action: z.enum(['create', 'update', 'list']),
  taskId: z.string().optional(),
  title: z.string().optional(),
  status: taskStatusSchema.optional(),
  dependencies: z.array(z.string()).optional().default([]),
});

function formatTaskGraph(tasks: TaskRecord[]): string {
  if (tasks.length === 0) {
    return 'No active tasks.';
  }

  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const childrenById = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of tasks) {
    indegree.set(task.id, 0);
    childrenById.set(task.id, []);
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependencies) {
      if (!taskMap.has(dependencyId)) {
        continue;
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      const children = childrenById.get(dependencyId);
      if (children) {
        children.push(task.id);
      }
    }
  }

  const roots = tasks
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const visited = new Set<string>();
  const lines: string[] = [];

  const walk = (taskId: string, depth: number) => {
    if (visited.has(taskId)) {
      return;
    }
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) {
      return;
    }
    const prefix = '  '.repeat(depth);
    const deps = task.dependencies.length > 0 ? ` deps=[${task.dependencies.join(', ')}]` : '';
    lines.push(`${prefix}- ${task.id} (${task.status}): ${task.title}${deps}`);

    const children = [...(childrenById.get(taskId) ?? [])].sort((a, b) => a.localeCompare(b));
    for (const childId of children) {
      walk(childId, depth + 1);
    }
  };

  for (const root of roots) {
    walk(root.id, 0);
  }

  for (const task of tasks.sort((a, b) => a.id.localeCompare(b.id))) {
    if (!visited.has(task.id)) {
      walk(task.id, 0);
    }
  }

  return lines.join('\n');
}

export function createManageTaskTool(ctxCwd: string, callbacks: AgentCallbacks) {
  return tool({
    description:
      'Manage persistent DAG task board for complex multi-step execution: create tasks, update task status, and list current task graph.',
    inputSchema: manageTaskInputSchema,
    execute: async ({ action, taskId, title, status, dependencies }) => {
      logToolEvent('manage_task', {
        action,
        taskId,
        hasTitle: Boolean(title),
        status,
        dependenciesCount: dependencies.length,
      });

      const command = `manage_task ${action}`;
      const reasoning = 'Manage persistent task DAG for orchestration.';
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('manage_task', command, reasoning, 'low')
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      if (action === 'create') {
        if (!taskId || !title) {
          return 'Error: action=create requires taskId and title.';
        }
        const nextStatus: TaskStatus = status ?? 'pending';
        saveTask(taskId, ctxCwd, title, nextStatus, dependencies);
        return `Task created: ${taskId} (${nextStatus}).`;
      }

      if (action === 'update') {
        if (!taskId || !status) {
          return 'Error: action=update requires taskId and status.';
        }
        updateTaskStatus(taskId, status);
        return `Task status updated: ${taskId} -> ${status}.`;
      }

      const tasks = getActiveTaskGraph(ctxCwd);
      return `Current task graph:\n${formatTaskGraph(tasks)}`;
    },
  });
}
