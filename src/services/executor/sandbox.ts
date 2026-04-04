export interface SandboxExecutionResult {
  ok: boolean;
  output: string;
}

export function runSandboxCommand(
  command: string,
): SandboxExecutionResult {
  return {
    ok: true,
    output: `sandbox execution stub: ${command}`,
  };
}
