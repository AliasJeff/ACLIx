export interface RuntimeContext {
  cwd: string;
  shell: string;
  platform: NodeJS.Platform;
  timestamp: string;
  currentDate: string;
}

export function createRuntimeContext(): RuntimeContext {
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(now);

  // TODO: add other user information
  return {
    cwd: process.cwd(),
    // TODO: get shell
    shell: process.env.SHELL ?? 'unknown',
    platform: process.platform,
    timestamp: now.toISOString(),
    currentDate,
  };
}
