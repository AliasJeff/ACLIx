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

export function createAgentCallbacks(signal?: AbortSignal): AgentCallbacks {
  const effectiveSignal = (): AbortSignal => signal ?? resolveCliAbortSignal();

  return {
    onStepFinish: (event) => {
      appLogger.info(
        {
          scope: 'agent',
          reasoningText: event.reasoningText,
          toolCalls: event.toolCalls,
          raw: event,
        },
        'Agent LLM step finished',
      );
    },
    onBeforeExecute: async (
      toolName: string,
      command: string,
      reasoning: string,
      risk: 'low' | 'medium' | 'high',
    ) => {
      const release = await uiMutex.lock();
      setPrompting(true);
      try {
        appLogger.info(
          { scope: 'agent', toolName, command, reasoning, risk },
          'Agent requesting tool execution',
        );

        if (risk === 'low') {
          spinner.stop();
          const prefix = `🛠️  Tool [${toolName}] `;
          const styledPrefix = toolName === 'read_skill' ? pc.magenta(prefix) : pc.dim(prefix);
          console.info(styledPrefix + pc.dim(command));
          appLogger.info(
            { scope: 'user', toolName, command, risk, confirmed: true },
            'User responded to risk confirmation',
          );
          spinner.start(getRandomThinkingLabel());
          return true;
        }

        spinner.stop();

        console.info(pc.cyan(`\n🧠  Reasoning: `) + pc.dim(reasoning));
        const toolPrefix =
          toolName === 'read_skill'
            ? pc.magenta(`🛠️  Tool [${toolName}] `)
            : pc.yellow(`🛠️  Tool [${toolName}] `);
        console.info(toolPrefix + pc.dim(`[${risk}] `) + pc.bold(command));

        const message =
          risk === 'high'
            ? '⚠️ High-risk command detected. Execute?'
            : 'This command may change system or project state. Execute?';

        const confirmed = await askDangerConfirmation(message, effectiveSignal());

        appLogger.info(
          { scope: 'user', toolName, command, risk, confirmed },
          'User responded to risk confirmation',
        );

        if (confirmed) {
          spinner.start('Executing command...');
        } else {
          spinner.start('Agent is reconsidering...');
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
        spinner.stop();

        console.info(pc.cyan('\n🙋 Agent needs your input:'));
        const answer = isSecret
          ? await askPassword(message, '*', effectiveSignal())
          : await askTextInput(message, effectiveSignal());

        appLogger.info(
          {
            scope: 'user',
            message,
            isSecret,
            answer: isSecret ? '[REDACTED]' : answer,
          },
          'User answered prompt',
        );

        spinner.start('Agent is resuming...');
        return answer;
      } finally {
        setPrompting(false);
        release();
      }
    },
  };
}
