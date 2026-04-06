import readline from 'node:readline';

import pc from 'picocolors';

export let abortController = new AbortController();
export let isGenerating = false;
export let isPrompting = false;
export let lastSigintAt = 0;

export function getAbortSignal(): AbortSignal {
  return abortController.signal;
}

export function renewAbortController(): void {
  abortController = new AbortController();
}

export function setGenerating(val: boolean): void {
  isGenerating = val;
  updateTerminalMode();
}

export function setPrompting(val: boolean): void {
  isPrompting = val;
  updateTerminalMode();
}

function updateTerminalMode(): void {
  if (!process.stdin.isTTY) return;
  if (isGenerating && !isPrompting) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  } else {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

export function handleSigint(): void {
  const now = Date.now();
  if (now - lastSigintAt < 2000 && lastSigintAt > 0) {
    process.stdout.write('\x1B[?25h\n');
    process.exit(130);
  }
  lastSigintAt = now;
  console.error(pc.dim('\nPress Ctrl+C again to exit'));
}

export function setupKeyboardInterrupts(): void {
  if (!process.stdin.isTTY) return;
  readline.emitKeypressEvents(process.stdin);

  process.stdin.on('keypress', (_, key: { ctrl?: boolean; name?: string }) => {
    if (isPrompting) return;
    if (!isGenerating) return;

    if (key.ctrl && key.name === 'c') {
      handleSigint();
      return;
    }

    if (key.name === 'escape') {
      if (!abortController.signal.aborted) {
        abortController.abort();
        console.error(pc.yellow('\n[Interrupted] Generation cancelled by ESC.'));
        renewAbortController();
      }
    }
  });
}
