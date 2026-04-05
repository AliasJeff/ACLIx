import process from 'node:process';

import pc from 'picocolors';

import { SkillManager } from '../../../core/skills/manager.js';

import type { SlashCommand } from '../types.js';

function scopeLabel(scope: string): string {
  return `[${scope}]`;
}

export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List all available skills',
  async execute(): Promise<'continue'> {
    const manager = SkillManager.getInstance();
    await manager.scanSkills(process.cwd());
    const skills = manager.getAvailableSkills();

    if (skills.length === 0) {
      console.info(pc.dim('No skills available.'));
      return 'continue';
    }

    const nameWidth = Math.max(...skills.map((s) => s.name.length));
    const scopeWidth = Math.max(...skills.map((s) => scopeLabel(s.scope).length));

    console.info(pc.bold('💡  Available Skills:'));
    for (const s of skills) {
      const nameCol = s.name.padEnd(nameWidth);
      const scopeCol = scopeLabel(s.scope).padEnd(scopeWidth);
      console.info(`${pc.cyan(nameCol)}  ${pc.yellow(scopeCol)}  ${pc.dim(s.description)}`);
    }

    return 'continue';
  },
};
