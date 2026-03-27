export interface ReactStep {
  thought: string;
  action: string;
  observation: string;
}

export function runReactLoop(goal: string): ReactStep[] {
  return [
    {
      thought: `Analyze goal: ${goal}`,
      action: 'No-op placeholder',
      observation: 'React loop scaffold is initialized.',
    },
  ];
}
