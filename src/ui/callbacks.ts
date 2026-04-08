import pc from 'picocolors';

import { resolveCliAbortSignal } from '../cli/abort-signal.js';
import { setPrompting } from '../cli/interrupt.js';
import { appLogger } from '../services/logger/index.js';
import type { AgentCallbacks } from '../shared/types.js';
import { askDangerConfirmation, askPassword, askTextInput } from './prompts.js';
import { spinner } from './spinner.js';
import { getRandomThinkingLabel } from './thinking.js';

class AsyncMutex {
  private promise = Promise.resolve();

  async lock(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.promise;
    this.promise = current.then(() => next);
    return current.then(() => release);
  }
}

const uiMutex = new AsyncMutex();

export function createAgentCallbacks(
  signal?: AbortSignal,
  options?: { isSubagent?: boolean; agentName?: string },
): AgentCallbacks {
  const effectiveSignal = (): AbortSignal => signal ?? resolveCliAbortSignal();
  const subagentName = options?.agentName ?? 'unknown';
  const subagentPrefix = options?.isSubagent === true ? `[Subagent: ${subagentName}] ` : '';
  const spinnerId = options?.isSubagent ? subagentName : 'main';

  return {
    onStepFinish: (event) => {
      if (options?.isSubagent) {
        appLogger.debug(
          {
            scope: 'agent',
            reasoningText: event.reasoningText,
            toolCalls: event.toolCalls,
            raw: event,
          },
          'Subagent LLM step finished',
        );
        spinner.start(`[Subagent: ${subagentName}] thinking...`, subagentName);
        return;
      }
      appLogger.info(
        {
          scope: 'agent',
          reasoningText: event.reasoningText,
          toolCalls: event.toolCalls,
          raw: event,
        },
        'Agent LLM step finished',
      );
      if (event.toolCalls.length > 0) {
        spinner.start('Analyzing tool results...', spinnerId);
      }
    },
    onBeforeExecute: async (
      toolName: string,
      command: string,
      reasoning: string,
      risk: 'low' | 'medium' | 'high',
    ) => {
      if (options?.isSubagent === true && risk === 'low') {
        appLogger.info(
          { scope: 'agent', toolName, command, reasoning, risk, subagent: options.agentName },
          'Subagent silently approved low-risk tool execution',
        );
        spinner.start(`[Subagent: ${subagentName}] is using tool: ${toolName}...`, subagentName);
        return true;
      }

      const release = await uiMutex.lock();
      setPrompting(true);
      try {
        appLogger.info(
          { scope: 'agent', toolName, command, reasoning, risk },
          'Agent requesting tool execution',
        );

        if (risk === 'low') {
          spinner.pause();
          const prefix = `🛠️  ${subagentPrefix}Tool [${toolName}] `;
          const styledPrefix = toolName === 'read_skill' ? pc.magenta(prefix) : pc.dim(prefix);
          console.info(styledPrefix + pc.dim(command));
          appLogger.info(
            { scope: 'user', toolName, command, risk, confirmed: true },
            'User responded to risk confirmation',
          );
          spinner.start(getRandomThinkingLabel(), spinnerId);
          return true;
        }

        spinner.pause();

        console.info(pc.cyan(`\n🧠 Reasoning: `) + pc.dim(reasoning));
        const toolPrefix =
          toolName === 'read_skill'
            ? pc.magenta(`🛠️  ${subagentPrefix}Tool [${toolName}] `)
            : pc.yellow(`🛠️  ${subagentPrefix}Tool [${toolName}] `);
        console.info(toolPrefix + pc.dim(`[${risk}] `) + pc.bold(command));

        const message =
          subagentPrefix +
          (risk === 'high'
            ? '⚠️ High-risk command detected. Execute?'
            : 'This command may change system or project state. Execute?');

        const confirmed = await askDangerConfirmation(message, effectiveSignal());

        appLogger.info(
          { scope: 'user', toolName, command, risk, confirmed },
          'User responded to risk confirmation',
        );

        if (confirmed) {
          spinner.start('Executing command...', spinnerId);
        } else {
          spinner.start('Agent is reconsidering...', spinnerId);
        }

        return confirmed;
      } finally {
        setPrompting(false);
        release();
      }
    },
    onAskUser: async (message: string, isSecret?: boolean) => {
      const release = await uiMutex.lock();
      setPrompting(true);
      try {
        spinner.pause();

        console.info(pc.cyan('\n🙋 Agent needs your input:'));
        const effectiveMessage = subagentPrefix + message;
        const answer = isSecret
          ? await askPassword(effectiveMessage, '*', effectiveSignal())
          : await askTextInput(effectiveMessage, effectiveSignal());

        appLogger.info(
          {
            scope: 'user',
            message: effectiveMessage,
            isSecret,
            answer: isSecret ? '[REDACTED]' : answer,
          },
          'User answered prompt',
        );

        spinner.start('Agent is resuming...', spinnerId);
        return answer;
      } finally {
        setPrompting(false);
        release();
      }
    },
  };
}
