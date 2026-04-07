'use client';

import { useCallback, useEffect, useState } from 'react';

const DEFAULT_THRESHOLD = 5000; // 5,000 MORBIUS

function storageKey(address: string | undefined): string {
  return `speech_call_threshold:${(address ?? 'anon').toLowerCase()}`;
}

/**
 * Persists the player's "call confirm threshold" per wallet in localStorage.
 * Calls above this amount trigger a voice confirm dialog; below fire immediately.
 * Returns 0 to mean "always confirm" (threshold never met), Infinity to mean "never confirm".
 */
export function useSpeechCallThreshold(address: string | undefined) {
  const [threshold, setThresholdState] = useState<number>(DEFAULT_THRESHOLD);

  // Load on mount / address change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(address));
      if (raw !== null) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) setThresholdState(parsed);
        else setThresholdState(DEFAULT_THRESHOLD);
      } else {
        setThresholdState(DEFAULT_THRESHOLD);
      }
    } catch {
      setThresholdState(DEFAULT_THRESHOLD);
    }
  }, [address]);

  const setThreshold = useCallback((value: number) => {
    const clamped = Math.max(0, value);
    setThresholdState(clamped);
    try {
      localStorage.setItem(storageKey(address), String(clamped));
    } catch { /* ignore */ }
  }, [address]);

  return { threshold, setThreshold, DEFAULT_THRESHOLD };
}
