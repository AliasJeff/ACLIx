export const SYSTEM_BLACKLIST = ['rm -rf /', ':(){ :|:& };:'] as const;

export const DEFAULT_MAX_STEPS = 12;
export const DEFAULT_PROVIDER = 'openai' as const;
export const DEFAULT_MODEL = 'gpt-4o-mini';
