import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { appLogger, errorLogger } from '../../services/logger/index.js';

interface LongTermMemory {
  userLTM: string | null;
  projectLTM: string | null;
}

async function readFileSafe(filePath: string, label: string): Promise<string | null> {
  try {
    appLogger.debug({ filePath, label }, 'Reading long-term memory file');

    const content = await fs.readFile(filePath, 'utf8');

    return content;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      appLogger.debug({ filePath, label }, 'Long-term memory file not found');

      return null;
    }

    errorLogger.error({ filePath, label, error }, 'Failed to read long-term memory file');

    return null;
  }
}

export async function readLongTermMemory(cwd: string): Promise<LongTermMemory> {
  const userLtmPath = path.join(os.homedir(), '.aclix', 'ACLI.md');
  const projectLtmPath = path.join(cwd, 'ACLI.md');

  const [userLTM, projectLTM] = await Promise.all([
    readFileSafe(userLtmPath, 'user'),
    readFileSafe(projectLtmPath, 'project'),
  ]);

  return { userLTM, projectLTM };
}

