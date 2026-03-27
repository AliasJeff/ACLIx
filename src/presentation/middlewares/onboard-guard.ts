export function ensureOnboarded(isOnboarded: boolean): void {
  if (!isOnboarded) {
    throw new Error('You must run `aclix onboard` before using this command.');
  }
}
