'use client';

import { useCallback, useSyncExternalStore } from 'react';

function walletKey(address: string | undefined): string {
  return (address ?? 'anon').toLowerCase();
}

const enabledByWallet = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const l of listeners) l();
}

/**
 * Per-wallet toggle for voice commands, in-memory only (resets to off on full page load).
 * All callers for the same wallet share one value via useSyncExternalStore.
 */
export function useSpeechEnabled(address: string | undefined) {
  const key = walletKey(address);

  const enabled = useSyncExternalStore(
    subscribe,
    () => enabledByWallet.get(key) ?? false,
    () => false,
  );

  const setEnabled = useCallback(
    (value: boolean) => {
      if (value) enabledByWallet.set(key, true);
      else enabledByWallet.delete(key);
      emit();
    },
    [key],
  );

  return { enabled, setEnabled };
}
