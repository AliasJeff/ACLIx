import pc from 'picocolors';

import { resolveCliAbortSignal } from '../cli/abort-signal.js';
import { logger } from '../services/logger/index.js';
import type { AgentCallbacks } from '../shared/types.js';
import { askDangerConfirmation, askPassword, askTextInput } from './prompts.js';
import { spinner } from './spinner.js';

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
      const { reasoningText, toolCalls } = event;
      logger.debug({ reasoningText, toolCalls }, 'Step finished');
    },
    onBeforeExecute: async (
      toolName: string,
      command: string,
      reasoning: string,
      risk: 'low' | 'medium' | 'high',
    ) => {
      const release = await uiMutex.lock();
      try {
        if (risk === 'low') {
          spinner.stop();
          console.info(pc.dim(`🛠️ Tool [${toolName}] `) + pc.dim(command));
          spinner.start('Thinking...');
          return true;
        }

        spinner.stop();

        console.info(pc.cyan(`\n💡 Reasoning: `) + pc.dim(reasoning));
        console.info(pc.yellow(`🛠️ Tool [${toolName}] `) + pc.dim(`[${risk}] `) + pc.bold(command));

        const message =
          risk === 'high'
            ? '⚠️ High-risk command detected. Execute?'
            : 'This command may change system or project state. Execute?';

        const confirmed = await askDangerConfirmation(message, effectiveSignal());

        if (confirmed) {
          spinner.start('Executing command...');
        } else {
          spinner.start('Agent is reconsidering...');
        }

        return confirmed;
      } finally {
        release();
      }
    },
    onAskUser: async (message: string, isSecret?: boolean) => {
      const release = await uiMutex.lock();
      try {
        spinner.stop();

        console.info(pc.cyan('\n🙋 Agent needs your input:'));
        const answer = isSecret
          ? await askPassword(message, '*', effectiveSignal())
          : await askTextInput(message, effectiveSignal());

        spinner.start('Agent is resuming...');
        return answer;
      } finally {
        release();
      }
    },
  };
}
