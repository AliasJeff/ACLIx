import ora, { type Ora } from 'ora';

let spinnerInstance: Ora | undefined;
const activeMessages = new Map<string, string>();

function updateSpinner() {
  if (activeMessages.size === 0) {
    spinnerInstance?.stop();
    spinnerInstance = undefined;
    return;
  }

  const combined = Array.from(activeMessages.values()).join(' ｜ ');
  if (spinnerInstance) {
    spinnerInstance.text = combined;
    // If pause() has stopped animation, restart when new text arrives.
    if (!spinnerInstance.isSpinning) {
      spinnerInstance.start();
    }
  } else {
    spinnerInstance = ora(combined).start();
  }
}

export const spinner = {
  get isSpinning(): boolean {
    return !!spinnerInstance?.isSpinning;
  },

  start(text: string, id = 'main'): void {
    activeMessages.set(id, text);
    updateSpinner();
  },

  stop(id?: string): void {
    if (id) {
      activeMessages.delete(id);
      updateSpinner();
      return;
    }
    activeMessages.clear();
    spinnerInstance?.stop();
    spinnerInstance = undefined;
  },

  pause(): void {
    spinnerInstance?.stop();
  },

  succeed(text: string): void {
    activeMessages.clear();
    if (spinnerInstance) {
      spinnerInstance.succeed(text);
      spinnerInstance = undefined;
      return;
    }

    ora().succeed(text);
  },

  fail(text: string): void {
    activeMessages.clear();
    if (spinnerInstance) {
      spinnerInstance.fail(text);
      spinnerInstance = undefined;
      return;
    }

    ora().fail(text);
  },
};
