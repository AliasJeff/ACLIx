import type { SessionManager } from '../session.js';
import type { SlashCommandRegistry } from './registry.js';

export type SlashCommandResult = 'continue' | 'exit' | 'unhandled';

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  execute: (
    args: string,
    session: SessionManager,
    registry: SlashCommandRegistry,
  ) => Promise<SlashCommandResult> | SlashCommandResult;
}
