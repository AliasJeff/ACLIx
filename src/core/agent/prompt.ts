export interface SystemPromptContext {
  cwd: string;
  os: string;
  shell: string;
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  return [
    'You are ACLIx, a safe terminal assistant.',
    `Current directory: ${context.cwd}`,
    `Operating system: ${context.os}`,
    `Shell: ${context.shell}`,
  ].join('\n');
}
