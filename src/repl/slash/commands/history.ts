import type { ModelMessage as CoreMessage } from 'ai';
import pc from 'picocolors';

import type { SlashCommand } from '../types.js';

const DISPLAY_MAX = 300;

function parseCount(args: string): number {
  const t = args.trim();
  if (!t) {
    return 5;
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) {
    return 5;
  }
  return n;
}

function truncateForCli(text: string): string {
  if (text.length <= DISPLAY_MAX) {
    return text;
  }
  return `${text.slice(0, DISPLAY_MAX)}…`;
}

function extractDisplayText(message: CoreMessage): string {
  if (message.role === 'system') {
    return typeof message.content === 'string' ? message.content : '[system: structured content]';
  }
  if (message.role === 'user' || message.role === 'assistant') {
    const { content } = message;
    if (typeof content === 'string') {
      return content;
    }
    const chunks: string[] = [];
    for (const part of content) {
      if (part.type === 'text' || part.type === 'reasoning') {
        chunks.push(part.text);
      } else if (part.type === 'tool-call') {
        chunks.push(`[${part.toolName}]`);
      }
    }
    return chunks.length > 0 ? chunks.join(' ') : '[non-text content]';
  }
  return '';
}

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Show recent conversation history (default 5)',
  execute(args, session): 'continue' {
    const n = parseCount(args);
    const all = session.getMessages();
    const slice = all.slice(-n);

    if (slice.length === 0) {
      console.info(pc.dim('No messages in this session.'));
    } else {
      for (const message of slice) {
        if (message.role === 'tool') {
          console.info(pc.dim('[Tool Execution]'));
          continue;
        }

        let label: string;
        if (message.role === 'user') {
          label = pc.green('User');
        } else if (message.role === 'assistant') {
          label = pc.cyan('Assistant');
        } else {
          label = pc.dim('System');
        }

        const body = truncateForCli(extractDisplayText(message));
        console.info(body ? `${label}\n${body}` : label);
      }
    }

    console.info(pc.dim(`🧠 Current Context Tokens: ${String(session.getTokenCount())}`));
    return 'continue';
  },
};
