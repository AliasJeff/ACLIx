let resolveAbortSignal: (() => AbortSignal) | undefined;

export function initAbortSignalProvider(getSignal: () => AbortSignal): void {
  resolveAbortSignal = getSignal;
}

export function resolveCliAbortSignal(): AbortSignal {
  if (!resolveAbortSignal) {
    throw new Error('CLI abort signal provider not initialized');
  }
  return resolveAbortSignal();
}
