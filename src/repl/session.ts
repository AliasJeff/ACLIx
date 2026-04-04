import type { ModelMessage as CoreMessage } from 'ai';
import pc from 'picocolors';

import { clearSession, loadSession, saveSession } from '../services/database/index.js';
import { logger } from '../services/logger/index.js';

export class SessionManager {
  readonly #cwd: string;
  #messages: CoreMessage[] = [];

  constructor(cwd: string) {
    this.#cwd = cwd;
  }

  init(): void {
    const restored = loadSession(this.#cwd);
    this.#messages = restored.length > 0 ? [...restored] : [];
    if (restored.length > 0) {
      console.info(pc.dim('Restored previous session for this directory.'));
    }
  }

  addMessage(msg: CoreMessage | CoreMessage[]): void {
    if (Array.isArray(msg)) {
      this.#messages.push(...msg);
    } else {
      this.#messages.push(msg);
    }
  }

  getMessages(): CoreMessage[] {
    return this.#messages;
  }

  save(): void {
    queueMicrotask(() => {
      try {
        saveSession(this.#cwd, this.#messages);
      } catch (error) {
        logger.debug({ error }, 'Failed to save session');
      }
    });
  }

  clear(): void {
    this.#messages = [];
    clearSession(this.#cwd);
  }

  removeLastMessage(): void {
    this.#messages.pop();
  }
}
