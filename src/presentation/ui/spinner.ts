import ora, { type Ora } from 'ora';

export class SpinnerManager {
  private spinner: Ora | null = null;

  start(message: string): void {
    this.spinner = ora(message).start();
  }

  succeed(message: string): void {
    this.spinner?.succeed(message);
    this.spinner = null;
  }

  fail(message: string): void {
    this.spinner?.fail(message);
    this.spinner = null;
  }
}
