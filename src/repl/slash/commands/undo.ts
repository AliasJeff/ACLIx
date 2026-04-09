import { unlink, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import pc from 'picocolors';

import { popLatestSnapshot } from '../../../services/database/index.js';
import type { SlashCommand } from '../types.js';

export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Undo the last file modification',
  async execute(_args, session): Promise<'continue'> {
    const snapshot = popLatestSnapshot(session.cwd);

    if (!snapshot) {
      console.info(pc.dim('No recent file modifications to undo.'));
      return 'continue';
    }

    const filePath = snapshot.file_path;

    if (snapshot.is_new === 1) {
      try {
        await unlink(filePath);
        console.info(`${pc.green('Undone')}: deleted newly created file ${pc.cyan(filePath)}`);
      } catch (error: unknown) {
        // If the file is already gone, treat as success.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          console.info(
            `${pc.green('Undone')}: file already deleted ${pc.cyan(filePath)} ${pc.dim('(noop)')}`,
          );
        } else {
          console.info(
            `${pc.red('Undo failed')}: could not delete ${pc.cyan(filePath)} (${pc.dim(String(
              error instanceof Error ? error.message : error,
            ))})`,
          );
        }
      }

      return 'continue';
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, snapshot.content ?? '', 'utf8');
      console.info(`${pc.green('Undone')}: restored ${pc.cyan(filePath)} ${pc.dim('(content)')}`);
    } catch (error: unknown) {
      console.info(
        `${pc.red('Undo failed')}: could not restore ${pc.cyan(filePath)} (${pc.dim(String(
          error instanceof Error ? error.message : error,
        ))})`,
      );
    }

    return 'continue';
  },
};

