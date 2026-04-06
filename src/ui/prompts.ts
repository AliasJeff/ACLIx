import { cancel, confirm, intro, isCancel, outro, password, select, text } from '@clack/prompts';
import type { Option } from '@clack/prompts';
import clipboard from 'clipboardy';

import { setPrompting } from '../cli/interrupt.js';

function resolvePromptResult<T>(result: T | symbol): T {
  if (isCancel(result)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  return result;
}

export async function askText(
  message: string,
  placeholder?: string,
  signal?: AbortSignal,
): Promise<string> {
  setPrompting(true);
  try {
    const answer = await text({
      message,
      placeholder,
      signal,
    });

    return resolvePromptResult(answer).trim();
  } finally {
    setPrompting(false);
  }
}

export async function askPassword(
  message: string,
  mask = '*',
  signal?: AbortSignal,
): Promise<string> {
  setPrompting(true);
  try {
    const answer = await password({
      message,
      mask,
      signal,
    });

    return resolvePromptResult(answer).trim();
  } finally {
    setPrompting(false);
  }
}

export async function askSelect<T extends string>(
  message: string,
  options: Option<T>[],
  signal?: AbortSignal,
): Promise<T> {
  setPrompting(true);
  try {
    const answer = await select<T>({
      message,
      options,
      signal,
    });

    return resolvePromptResult(answer);
  } finally {
    setPrompting(false);
  }
}

export function showIntro(message: string): void {
  intro(message);
}

export function showOutro(message: string): void {
  outro(message);
}

export async function askDangerConfirmation(
  message: string,
  signal?: AbortSignal,
): Promise<boolean> {
  setPrompting(true);
  try {
    const result = await confirm({
      message,
      initialValue: false,
      signal,
    });

    return resolvePromptResult(result);
  } finally {
    setPrompting(false);
  }
}

export async function askTextInput(message: string, signal?: AbortSignal): Promise<string> {
  return askText(message, undefined, signal);
}

export async function copyToClipboard(value: string): Promise<void> {
  await clipboard.write(value);
}
