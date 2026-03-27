export type IntentType = 'qa' | 'task';

export function classifyIntent(input: string): IntentType {
  const normalized = input.toLowerCase();
  if (normalized.startsWith('how ') || normalized.endsWith('?')) {
    return 'qa';
  }
  return 'task';
}
