import type { CompleterResult } from 'node:readline';
import { createInterface } from 'node:readline/promises';

import pc from 'picocolors';

import { executeChatWorkflow } from '../core/agent/chat.js';
import { logger } from '../services/logger/index.js';
import { getAbortSignal, setGenerating } from '../index.js';
import { createAgentCallbacks } from '../ui/callbacks.js';
import { spinner } from '../ui/spinner.js';
import type { SessionManager } from './session.js';
import type { SlashCommandRegistry } from './slash/index.js';

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

export class ReplEngine {
  readonly #session: SessionManager;
  readonly #slashRegistry: SlashCommandRegistry;

  constructor(session: SessionManager, slashRegistry: SlashCommandRegistry) {
    this.#session = session;
    this.#slashRegistry = slashRegistry;
  }

  async start(): Promise<void> {
    const callbacks = createAgentCallbacks();

    console.info(
      pc.green(
        'Welcome to ACLIx REPL. Input your question to start the conversation; use /help to show all available commands, /exit to exit.',
      ),
    );

    let promptHistory: string[] = [];

    try {
      while (!getAbortSignal().aborted) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
          history: promptHistory,
          completer: (line: string): CompleterResult => {
            if (line.startsWith('/')) {
              const commands = this.#slashRegistry.getCommandNames();
              const lineLower = line.toLowerCase();
              const hits = commands.filter((c) => c.toLowerCase().startsWith(lineLower));
              return [hits.length > 0 ? hits : commands, line];
            }
            return [[], line];
          },
        });

        const prompt = pc.bold(pc.green('acli ❯ '));

        let input: string;
        try {
          input = (await rl.question(prompt, { signal: getAbortSignal() })).trim();
        } catch (error) {
          if (getAbortSignal().aborted) break;
          throw error;
        } finally {
          promptHistory = (rl as unknown as { history?: string[] }).history ?? promptHistory;
          rl.close();
        }

        if (!input) {
          continue;
        }

        const slashOutcome = await this.#slashRegistry.handle(input, this.#session);
        if (slashOutcome === 'exit') {
          break;
        }
        if (slashOutcome === 'continue') {
          continue;
        }

        this.#session.addMessage({ role: 'user', content: input });

        setGenerating(true);
        try {
          spinner.start('Thinking...');
          const result = await executeChatWorkflow(
            this.#session.getMessages(),
            callbacks,
            getAbortSignal(),
          );
          let isFirstChunk = true;
          for await (const chunk of result.textStream) {
            if (isFirstChunk && chunk.length > 0) {
              spinner.stop();
              process.stdout.write(pc.green('\n💬 '));
              isFirstChunk = false;
            }
            process.stdout.write(pc.green(chunk));
          }
          if (isFirstChunk) {
            spinner.stop();
            process.stdout.write(pc.green('\n💬 '));
          }
          process.stdout.write('\n');
          const { messages } = await result.response;
          this.#session.addMessage(messages);
          this.#session.save();
        } catch (error) {
          this.#session.removeLastMessage();
          if (isAbortLike(error)) {
            console.info(pc.dim('Agent stopped by user.'));
          } else {
            logger.error({ error }, 'REPL chat workflow failed');
            console.error(error);
          }
        } finally {
          setGenerating(false);
          spinner.stop();
        }
      }
    } finally {
      spinner.stop();
    }
  }
}
