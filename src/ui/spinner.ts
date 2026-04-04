import ora, { type Ora } from 'ora';

let spinnerInstance: Ora | undefined;

export const spinner = {
  start(text: string): void {
    spinnerInstance?.stop();
    spinnerInstance = ora(text).start();
  },

  stop(): void {
    spinnerInstance?.stop();
    spinnerInstance = undefined;
  },

  succeed(text: string): void {
    if (spinnerInstance) {
      spinnerInstance.succeed(text);
      spinnerInstance = undefined;
      return;
    }

    ora().succeed(text);
  },

  fail(text: string): void {
    if (spinnerInstance) {
      spinnerInstance.fail(text);
      spinnerInstance = undefined;
      return;
    }

    ora().fail(text);
  },
};
