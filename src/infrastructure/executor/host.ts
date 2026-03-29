import { execaCommand } from 'execa';

export async function runHostCommand(command: string): Promise<string> {
  const result = await execaCommand(command, {
    shell: true,
    reject: false,
  });
  if (result.failed) {
    return (
      result.stderr ||
      result.stdout ||
      `Command failed with exit code ${String(result.exitCode)}`
    );
  }
  return result.stdout;
}
