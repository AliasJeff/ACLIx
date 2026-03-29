import { execaCommand } from 'execa';

export async function runHostCommand(command: string): Promise<string> {
  const result = await execaCommand(command, {
    shell: true,
    reject: false,
    stdin: 'ignore',
    // FIXME: should use PTY to avoid timeout
    timeout: 10_000,
  });

  if (result.timedOut || result.isCanceled) {
    return "Error: Command timed out after 10s. It likely hung waiting for interactive user input. DO NOT use interactive commands. Use the 'ask_user' tool if you need a password or human input.";
  }

  if (result.failed) {
    return result.stderr || result.stdout || 'Command failed';
  }
  return result.stdout;
}
