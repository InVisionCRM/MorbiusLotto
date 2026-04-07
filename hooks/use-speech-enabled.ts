'use client';

import { useCallback, useEffect, useState } from 'react';

function storageKey(address: string | undefined): string {
  return `speech_enabled:${(address ?? 'anon').toLowerCase()}`;
}

/** Per-wallet localStorage toggle for voice commands. Off by default. */
export function useSpeechEnabled(address: string | undefined) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(address));
      setEnabledState(raw === 'true');
    } catch {
      setEnabledState(false);
    }
  }, [address]);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(storageKey(address), String(value));
    } catch { /* ignore */ }
  }, [address]);

  return { enabled, setEnabled };
}
