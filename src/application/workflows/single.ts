export type RunMode = 'manual' | 'auto';

export function runSingleWorkflow(
  goal: string,
  mode: RunMode,
): string {
  return `single workflow initialized: ${mode} -> ${goal}`;
}
