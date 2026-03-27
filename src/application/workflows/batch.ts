export interface BatchStep {
  id: string;
  command: string;
}

export function runBatchWorkflow(steps: BatchStep[]): number {
  return steps.length;
}
