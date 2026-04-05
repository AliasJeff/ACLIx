import pc from 'picocolors';

import type { SlashCommand } from '../types.js';

function commandLabels(cmd: SlashCommand): string {
  const segments = [`/${cmd.name}`, ...(cmd.aliases ?? []).map((a) => `/${a}`)];
  return segments.join(', ');
}

export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['?'],
  description: 'Show all available REPL commands',
  execute(_args, _session, registry): 'continue' {
    const commands = registry.getCommands().sort((a, b) => a.name.localeCompare(b.name));
    const labelStrings = commands.map(commandLabels);
    const maxLabelWidth = labelStrings.reduce((max, s) => Math.max(max, s.length), 0);

    for (const [i, cmd] of commands.entries()) {
      const label = labelStrings[i] ?? '';
      const padded = label.padEnd(maxLabelWidth);
      console.info(`${pc.cyan(padded)}  ${pc.dim(cmd.description)}`);
    }

    return 'continue';
  },
};
