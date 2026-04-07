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
  };
}

export async function createRuntimeContext(): Promise<RuntimeContext> {
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(now);

  // TODO: add other user information
  const cwd = process.cwd();
  const longTermMemory = await readLongTermMemory(cwd);
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
