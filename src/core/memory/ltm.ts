import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { appLogger, errorLogger, logCoreEvent } from '../../services/logger/index.js';
import { retrieveTopK } from './retrieval.js';

const LTM_THRESHOLD = 3000;

interface LongTermMemory {
  userLTM: string | null;
  projectLTM: string | null;
  isTruncated?: boolean;
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

export async function readLongTermMemory(cwd: string, query?: string): Promise<LongTermMemory> {
  logCoreEvent('memory', 'readLongTermMemory', { cwd, queryProvided: Boolean(query?.trim()) });
  const userLtmPath = path.join(os.homedir(), '.aclix', 'ACLI.md');
  const projectLtmPath = path.join(cwd, 'ACLI.md');

  let [userLTM, projectLTM] = await Promise.all([
    readFileSafe(userLtmPath, 'user'),
    readFileSafe(projectLtmPath, 'project'),
  ]);

  const totalLength = (userLTM?.length ?? 0) + (projectLTM?.length ?? 0);
  const normalizedQuery = query?.trim() ?? '';
  const shouldTruncate = totalLength > LTM_THRESHOLD && normalizedQuery.length > 0;

  if (shouldTruncate) {
    if (userLTM) {
      userLTM = retrieveTopK(userLTM, normalizedQuery, 3);
    }
    if (projectLTM) {
      projectLTM = retrieveTopK(projectLTM, normalizedQuery, 3);
    }
    appLogger.info(
      {
        threshold: LTM_THRESHOLD,
        totalLength,
        queryLength: normalizedQuery.length,
      },
      'LTM BM25 truncation triggered for oversized memory',
    );
  }

  return { userLTM, projectLTM, isTruncated: shouldTruncate };
}

