import { tool } from 'ai';
import { z } from 'zod';

import { mergeAgentAndServerRisk, type RiskLevel } from '../security/evaluator.js';
import { errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { logToolEvent, textMeta } from './toolEvent.js';

const riskEnum = z.enum(['low', 'medium', 'high']);

const shellInputSchema = z.object({
  command: z
    .string()
    .describe(
      'The precise shell command to execute. The shell environment is stateful and persistent: cd and export (or equivalent, like set on Windows) will permanently affect the session and be visible to subsequent shell tool calls.',
    ),
  reasoning: z.string().describe('Step-by-step reasoning explaining why this command is needed'),
  risk: riskEnum.describe(
    'Your assessment of this invocation: low = read-only or non-mutating inspection (ls, cat, grep, head, tail, pwd, stat, du without writes, git status/log/diff, etc.); medium = writes installs or network that change state but are not catastrophically destructive; high = deletion of important data, privilege escalation, disk or system-level changes, or piping to dangerous targets.',
  ),
});

export function createShellTool(
  executeCommand: (cmd: string, signal?: AbortSignal) => Promise<string>,
  callbacks: AgentCallbacks,
  isReadOnly?: boolean,
) {
  return tool({
    description:
      'Execute shell commands on the host operating system. The shell environment is stateful and persistent across calls: cd and export (or equivalent, like set on Windows) will permanently affect the session. For every call you must set risk from your own judgment (low / medium / high). Read-only and listing commands are low risk and should use risk=low. Destructive or privileged operations must use medium or high.',
    inputSchema: shellInputSchema,
    execute: async ({ command, reasoning, risk: agentRisk }, { abortSignal }) => {
      logToolEvent('shell', {
        command: textMeta(command),
        agentRisk,
        reasoningLen: reasoning.length,
      });
      const risk: RiskLevel = mergeAgentAndServerRisk(agentRisk, command);
      if (isReadOnly && (risk === 'medium' || risk === 'high')) {
        return 'Execution blocked: Subagent is in read-only mode. Mutating shell commands are strictly forbidden.';
      }
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('shell', command, reasoning, risk)
        : false;
      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }
      try {
        return await executeCommand(command, abortSignal);
      } catch (error: unknown) {
        errorLogger.error({ tool: 'shell', error }, 'Tool execution exception');
        return String(error instanceof Error ? error.message : error);
      }
    },
  });
}
