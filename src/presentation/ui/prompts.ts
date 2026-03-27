import { confirm, text } from '@clack/prompts';
import clipboard from 'clipboardy';

export async function askTextInput(message: string): Promise<string> {
  const answer = await text({ message });
  if (typeof answer !== 'string') {
    return '';
  }
  return answer.trim();
}

export async function askDangerConfirmation(message: string): Promise<boolean> {
  const result = await confirm({
    message,
    initialValue: false,
  });
  return Boolean(result);
}

export async function copyToClipboard(value: string): Promise<void> {
  await clipboard.write(value);
}
