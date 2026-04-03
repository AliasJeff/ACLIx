import { createInterface } from 'node:readline/promises';

import pc from 'picocolors';
import type { ModelMessage as CoreMessage } from 'ai';

import { executeChatWorkflow } from '../../application/workflows/chat.js';
import { clearSession, loadSession, saveSession } from '../../infrastructure/database/index.js';
import { logger } from '../../infrastructure/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { getAbortSignal, setGenerating } from '../../index.js';
import { requireAuth } from '../middlewares/index.js';
import { askDangerConfirmation, askPassword, askTextInput } from '../ui/prompts.js';
import { spinner } from '../ui/spinner.js';

function isAbortLike(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.cause instanceof Error && error.cause.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.message.toLowerCase().includes('abort')) {
    return true;
  }
  return false;
}

export async function replAction(): Promise<void> {
  requireAuth();

  const memory: CoreMessage[] = [];
  const cwd = process.cwd();
  const restored = loadSession(cwd);
  if (restored.length > 0) {
    memory.push(...restored);
    console.info(pc.dim('Restored previous session for this directory.'));
  }

  const callbacks: AgentCallbacks = {
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
      if (risk === 'low') {
        console.info(pc.dim(`🛠️ Tool [${toolName}] `) + pc.dim(command));
        return true;
      }

      spinner.stop();

      console.info(pc.cyan(`\n💡 Reasoning: `) + pc.dim(reasoning));
      console.info(pc.yellow(`🛠️ Tool [${toolName}] `) + pc.dim(`[${risk}] `) + pc.bold(command));

      const message =
        risk === 'high'
          ? '⚠️ High-risk command detected. Execute?'
          : 'This command may change system or project state. Execute?';

      const confirmed = await askDangerConfirmation(message, getAbortSignal());

      if (confirmed) {
        spinner.start('Executing command...');
      } else {
        spinner.start('Agent is reconsidering...');
      }

      return confirmed;
    },
    onAskUser: async (message: string, isSecret?: boolean) => {
      spinner.stop();

      console.info(pc.cyan('\n🙋 Agent needs your input:'));
      const answer = isSecret
        ? await askPassword(message, '*', getAbortSignal())
        : await askTextInput(message, getAbortSignal());

      spinner.start('Agent is resuming...');
      return answer;
    },
  };

  console.info(pc.green('欢迎使用 ACLIx REPL。输入问题开始对话；使用 /exit 退出，/clear 清屏并清空上下文。'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (!getAbortSignal().aborted) {
      const prompt = pc.bold(pc.green('acli ❯ '));

      let input: string;
      try {
        input = (await rl.question(prompt, { signal: getAbortSignal() })).trim();
      } catch (error) {
        if (getAbortSignal().aborted) {
          break;
        }
        throw error;
      }

      if (!input) {
        continue;
      }

      if (input.startsWith('/')) {
        if (input === '/exit' || input === '/quit') {
          break;
        }
        if (input === '/clear') {
          memory.length = 0;
          clearSession(process.cwd());
          process.stdout.write('\x1b[2J\x1b[H');
          continue;
        }
        if (input === '/config') {
          const { configAction } = await import('./config.js');
          configAction();
          continue;
        }

        console.info(pc.dim(`Unknown command: ${input}`));
        continue;
      }

      memory.push({ role: 'user', content: input });

      // ⚠️ Prevent stdin contention with @clack/prompts used by tools.
      rl.pause();
      setGenerating(true);
      try {
        spinner.start('Thinking...');
        const result = await executeChatWorkflow(memory, callbacks, getAbortSignal());
        memory.push(...result.newMessages);
        queueMicrotask(() => {
          try {
            saveSession(process.cwd(), memory);
          } catch (error) {
            logger.debug({ error }, 'Failed to save session');
          }
        });
        console.info(pc.green(`\n💬 ${result.message}\n`));
      } catch (error) {
        memory.pop();
        if (isAbortLike(error)) {
          console.info(pc.dim('Agent stopped by user.'));
        } else {
          logger.error({ error }, 'REPL chat workflow failed');
          console.error(error);
        }
      } finally {
        setGenerating(false);
        rl.resume();
        spinner.stop();
      }
    }
  } finally {
    spinner.stop();
    rl.close();
  }
}

