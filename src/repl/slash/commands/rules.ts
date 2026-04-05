import process from 'node:process';

import pc from 'picocolors';

import { RuleManager } from '../../../core/rules/manager.js';

import type { SlashCommand } from '../types.js';

function scopeLabel(scope: string): string {
  return `[${scope}]`;
}

export const rulesCommand: SlashCommand = {
  name: 'rules',
  description: 'List all active global/project rules',
  async execute(): Promise<'continue'> {
    const manager = RuleManager.getInstance();
    await manager.scanRules(process.cwd());
    const rules = manager.getAvailableRules();

    if (rules.length === 0) {
      console.info(pc.dim('No active rules.'));
      return 'continue';
    }

    const nameWidth = Math.max(...rules.map((r) => r.name.length));
    const scopeWidth = Math.max(...rules.map((r) => scopeLabel(r.scope).length));

    console.info(pc.bold('📜 Active Rules:'));
    for (const r of rules) {
      const nameCol = r.name.padEnd(nameWidth);
      const scopeCol = scopeLabel(r.scope).padEnd(scopeWidth);
      console.info(`${pc.cyan(nameCol)}  ${pc.yellow(scopeCol)}  ${pc.dim(r.description)}`);
    }

    return 'continue';
  },
};
