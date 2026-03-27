import { ConfigError } from '../../shared/errors.js';

export function ensureOnboarded(isOnboarded: boolean): void {
  if (!isOnboarded) {
    throw new ConfigError('You must run `acli onboard` before using this command.');
  }
}
