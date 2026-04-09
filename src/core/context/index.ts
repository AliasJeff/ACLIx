import { readLongTermMemory } from '../memory/ltm.js';

export interface RuntimeContext {
  cwd: string;
  shell: string;
  platform: NodeJS.Platform;
  timestamp: string;
  currentDate: string;
  longTermMemory: {
    userLTM: string | null;
    projectLTM: string | null;
    isTruncated?: boolean;
  };
}

export async function createRuntimeContext(query?: string): Promise<RuntimeContext> {
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(now);

  // TODO: add other user information
  const cwd = process.cwd();
  const longTermMemory = await readLongTermMemory(cwd, query);
  return {
    cwd,
    // TODO: get shell
    shell: process.env.SHELL ?? 'unknown',
    platform: process.platform,
    timestamp: now.toISOString(),
    currentDate,
    longTermMemory,
  };
}
