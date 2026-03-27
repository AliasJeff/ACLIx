import { execaCommand } from 'execa';

export async function runHostCommand(command: string): Promise<string> {
  const result = await execaCommand(command, {
    shell: true,
    reject: false,
  });
  return result.stdout;
}
