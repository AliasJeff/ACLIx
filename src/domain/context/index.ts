export interface RuntimeContext {
  cwd: string;
  shell: string;
  platform: NodeJS.Platform;
}

export function createRuntimeContext(): RuntimeContext {
  return {
    cwd: process.cwd(),
    shell: process.env.SHELL ?? 'unknown',
    platform: process.platform,
  };
}
