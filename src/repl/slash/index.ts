import { clearCommand } from './commands/clear.js';
import { compactCommand } from './commands/compact.js';
import { configCommand } from './commands/config.js';
import { exitCommand } from './commands/exit.js';
import { helpCommand } from './commands/help.js';
import { historyCommand } from './commands/history.js';
import { memoryCommand } from './commands/memory.js';
import { onboardCommand } from './commands/onboard.js';
import { rulesCommand } from './commands/rules.js';
import { skillsCommand } from './commands/skills.js';
import { undoCommand } from './commands/undo.js';
import { versionCommand } from './commands/version.js';
import { SlashCommandRegistry } from './registry.js';

export function createSlashRegistry(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.register(exitCommand);
  registry.register(clearCommand);
  registry.register(configCommand);
  registry.register(versionCommand);
  registry.register(helpCommand);
  registry.register(historyCommand);
  registry.register(memoryCommand);
  registry.register(compactCommand);
  registry.register(skillsCommand);
  registry.register(rulesCommand);
  registry.register(onboardCommand);
  registry.register(undoCommand);
  return registry;
}

export type { SlashCommand, SlashCommandResult } from './types.js';
export { SlashCommandRegistry } from './registry.js';
